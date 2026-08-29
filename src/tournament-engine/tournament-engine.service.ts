import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SwissPairingService } from '../pairing/swiss-pairing.service.js';
import { BracketPairingService } from '../pairing/bracket-pairing.service.js';
import type { Pairing } from '../pairing/swiss-pairing.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const STARTABLE_STATUSES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
const SWISS_FORMATS = ['SWISS', 'SWISS_TOP_CUT'];

@Injectable()
export class TournamentEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly swissPairingService: SwissPairingService,
    private readonly bracketPairingService: BracketPairingService,
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
          data: pairings.map((p) => ({
            roundId: round.id,
            participantAId: p.participantAId,
            participantBId: p.participantBId,
            // A bye has no opponent to report against — confirm it immediately.
            resultStatus: p.participantBId === null ? 'CONFIRMED' : 'PENDING',
            confirmedScore: p.participantBId === null ? 'BYE' : null,
            confirmedAt: p.participantBId === null ? new Date() : null,
          })),
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

    const unconfirmed = await this.prisma.match.findMany({
      where: { roundId: currentRound.id, resultStatus: { not: 'CONFIRMED' } },
      select: { id: true, resultStatus: true },
    });
    if (unconfirmed.length > 0) {
      throw new ConflictException({
        message: 'All matches in the current round must be confirmed before advancing',
        unconfirmedMatches: unconfirmed,
      });
    }

    // Pairing for round 2+ still isn't generated here — real Swiss pairing
    // needs standings computed from confirmed results (feature 010).
    await this.prisma.$transaction([
      this.prisma.round.update({ where: { id: currentRound.id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      this.prisma.round.create({
        data: { tournamentId, number: currentRound.number + 1, status: 'IN_PROGRESS', startedAt: new Date() },
      }),
    ]);

    return this.findTournament(tournamentId);
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
