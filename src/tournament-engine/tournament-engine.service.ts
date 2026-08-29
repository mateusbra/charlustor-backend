import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SwissPairingService } from '../pairing/swiss-pairing.service.js';
import { BracketPairingService } from '../pairing/bracket-pairing.service.js';
import type { Pairing } from '../pairing/swiss-pairing.service.js';
import { StandingsService } from '../standings/standings.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const STARTABLE_STATUSES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
const SWISS_FORMATS = ['SWISS', 'SWISS_TOP_CUT'];
const ELIMINATION_FORMATS = ['SINGLE_ELIM', 'DOUBLE_ELIM'];

function matchDataFromPairing(p: Pairing, position: number) {
  return {
    position,
    participantAId: p.participantAId,
    participantBId: p.participantBId,
    // A bye has no opponent to report against — confirm it immediately.
    resultStatus: p.participantBId === null ? ('CONFIRMED' as const) : ('PENDING' as const),
    confirmedScore: p.participantBId === null ? 'BYE' : null,
    confirmedAt: p.participantBId === null ? new Date() : null,
  };
}

@Injectable()
export class TournamentEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly swissPairingService: SwissPairingService,
    private readonly bracketPairingService: BracketPairingService,
    private readonly standingsService: StandingsService,
  ) {}

  async start(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (!STARTABLE_STATUSES.includes(tournament.status)) {
      throw new ConflictException('Tournament can only be started from REGISTRATION_OPEN or REGISTRATION_CLOSED');
    }

    const participants = await this.prisma.participant.findMany({
      where: { tournamentId, status: 'REGISTERED' },
      include: { deck: true, user: { select: { nickname: true } } },
      orderBy: { registeredAt: 'asc' },
    });
    const withoutApprovedDeck = participants.filter((p) => p.deck?.validationStatus !== 'APPROVED');
    if (withoutApprovedDeck.length > 0) {
      throw new BadRequestException({
        message: 'Some participants do not have an approved deck yet',
        pendingParticipants: withoutApprovedDeck.map((p) => p.user.nickname ?? p.id),
      });
    }

    const pairings = this.generateFirstRoundPairings(
      tournament.format,
      participants.map((p) => p.id),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: 'IN_PROGRESS' } });
      const round = await tx.round.create({
        data: { tournamentId, number: 1, status: 'IN_PROGRESS', startedAt: new Date() },
      });
      if (pairings.length > 0) {
        await tx.match.createMany({
          data: pairings.map((p, index) => ({ roundId: round.id, ...matchDataFromPairing(p, index) })),
        });
      }
    });

    return this.findTournament(tournamentId);
  }

  // Round 1 only — pairing for round 2+ needs match results (RF5 / feature 009),
  // which don't exist yet. See plans/completed/008-swiss-pairing-engine.md.
  private generateFirstRoundPairings(format: string, participantIds: string[]): Pairing[] {
    if (SWISS_FORMATS.includes(format)) {
      const standings = participantIds.map((id) => ({ participantId: id, score: 0, hadBye: false }));
      return this.swissPairingService.pairRound(standings);
    }
    return this.bracketPairingService.seedFirstRound(participantIds);
  }

  async advanceRound(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'IN_PROGRESS') {
      throw new ConflictException('Rounds can only be advanced while the tournament is IN_PROGRESS');
    }

    const currentRound = await this.findCurrentRound(tournamentId);

    const matches = await this.prisma.match.findMany({
      where: { roundId: currentRound.id },
      orderBy: { position: 'asc' },
    });
    const unconfirmed = matches.filter((m) => m.resultStatus !== 'CONFIRMED');
    if (unconfirmed.length > 0) {
      throw new ConflictException({
        message: 'All matches in the current round must be confirmed before advancing',
        unconfirmedMatches: unconfirmed.map((m) => ({ id: m.id, resultStatus: m.resultStatus })),
      });
    }

    // Elimination rounds (Top Cut, or a straight SINGLE_ELIM/DOUBLE_ELIM
    // bracket) advance by pairing adjacent winners — that's determinable now.
    // Swiss round 2+ pairing still isn't (needs rematch-avoidance against
    // standings beyond what's implemented — see plans/completed/008).
    if (currentRound.phase === 'TOP_CUT' || ELIMINATION_FORMATS.includes(tournament.format)) {
      const winners = matches.map((m) => this.winnerOf(m));

      if (winners.length <= 1) {
        await this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'COMPLETED' } });
        return this.findTournament(tournamentId);
      }

      const nextPairings: Pairing[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextPairings.push({ participantAId: winners[i], participantBId: winners[i + 1] ?? null });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.round.update({ where: { id: currentRound.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
        const round = await tx.round.create({
          data: {
            tournamentId,
            number: currentRound.number + 1,
            status: 'IN_PROGRESS',
            phase: currentRound.phase,
            startedAt: new Date(),
          },
        });
        await tx.match.createMany({
          data: nextPairings.map((p, index) => ({ roundId: round.id, ...matchDataFromPairing(p, index) })),
        });
      });

      return this.findTournament(tournamentId);
    }

    await this.prisma.$transaction([
      this.prisma.round.update({ where: { id: currentRound.id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      this.prisma.round.create({
        data: { tournamentId, number: currentRound.number + 1, status: 'IN_PROGRESS', startedAt: new Date() },
      }),
    ]);

    return this.findTournament(tournamentId);
  }

  async startTopCut(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (tournament.format !== 'SWISS_TOP_CUT') {
      throw new ConflictException('Top Cut is only available for the SWISS_TOP_CUT format');
    }
    if (tournament.status !== 'IN_PROGRESS') {
      throw new ConflictException('Tournament must be IN_PROGRESS to start the Top Cut');
    }
    if (!tournament.topCutSize) {
      throw new BadRequestException('Tournament has no topCutSize configured');
    }

    const activeSwissRound = await this.prisma.round.findFirst({
      where: { tournamentId, phase: 'SWISS', status: { not: 'COMPLETED' } },
    });
    if (activeSwissRound) {
      throw new ConflictException('The Swiss phase must be completed before starting the Top Cut');
    }

    const existingTopCutRound = await this.prisma.round.findFirst({ where: { tournamentId, phase: 'TOP_CUT' } });
    if (existingTopCutRound) {
      throw new ConflictException('Top Cut has already started for this tournament');
    }

    const standings = await this.standingsService.getStandings(tournamentId);
    const topParticipantIds = standings.slice(0, tournament.topCutSize).map((row) => row.participantId);
    const pairings = this.bracketPairingService.seedFirstRound(topParticipantIds);

    const lastRound = await this.prisma.round.findFirst({ where: { tournamentId }, orderBy: { number: 'desc' } });
    const nextNumber = (lastRound?.number ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      const round = await tx.round.create({
        data: { tournamentId, number: nextNumber, status: 'IN_PROGRESS', phase: 'TOP_CUT', startedAt: new Date() },
      });
      if (pairings.length > 0) {
        await tx.match.createMany({
          data: pairings.map((p, index) => ({ roundId: round.id, ...matchDataFromPairing(p, index) })),
        });
      }
    });

    return this.findTournament(tournamentId);
  }

  private winnerOf(match: { participantAId: string; participantBId: string | null; confirmedScore: string | null }): string {
    if (match.participantBId === null) return match.participantAId;
    const [scoreA, scoreB] = (match.confirmedScore ?? '0-0').split('-').map(Number);
    return scoreA >= scoreB ? match.participantAId : match.participantBId;
  }

  async complete(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'IN_PROGRESS') {
      throw new ConflictException('Only an IN_PROGRESS tournament can be completed');
    }

    const currentRound = await this.prisma.round.findFirst({
      where: { tournamentId, status: 'IN_PROGRESS' },
    });

    await this.prisma.$transaction([
      this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'COMPLETED' } }),
      ...(currentRound
        ? [this.prisma.round.update({ where: { id: currentRound.id }, data: { status: 'COMPLETED', completedAt: new Date() } })]
        : []),
    ]);

    return this.findTournament(tournamentId);
  }

  listRounds(tournamentId: string) {
    return this.prisma.round.findMany({
      where: { tournamentId },
      orderBy: { number: 'asc' },
      include: {
        matches: {
          include: {
            participantA: { include: { user: { select: { id: true, nickname: true } } } },
            participantB: { include: { user: { select: { id: true, nickname: true } } } },
          },
        },
      },
    });
  }

  private async findTournament(id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  private async findCurrentRound(tournamentId: string) {
    const round = await this.prisma.round.findFirst({
      where: { tournamentId, status: 'IN_PROGRESS' },
      orderBy: { number: 'desc' },
    });
    if (!round) throw new ConflictException('No round is currently in progress');
    return round;
  }

  private assertOwner(tournament: { organizerId: string }, requester: AuthenticatedUser) {
    if (tournament.organizerId !== requester.id && requester.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this tournament');
    }
  }
}
