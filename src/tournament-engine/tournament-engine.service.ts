import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const STARTABLE_STATUSES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];

@Injectable()
export class TournamentEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async start(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (!STARTABLE_STATUSES.includes(tournament.status)) {
      throw new ConflictException('Tournament can only be started from REGISTRATION_OPEN or REGISTRATION_CLOSED');
    }

    const participants = await this.prisma.participant.findMany({
      where: { tournamentId, status: 'REGISTERED' },
      include: { deck: true, user: { select: { nickname: true } } },
    });
    const withoutApprovedDeck = participants.filter((p) => p.deck?.validationStatus !== 'APPROVED');
    if (withoutApprovedDeck.length > 0) {
      throw new BadRequestException({
        message: 'Some participants do not have an approved deck yet',
        pendingParticipants: withoutApprovedDeck.map((p) => p.user.nickname ?? p.id),
      });
    }

    await this.prisma.$transaction([
      this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'IN_PROGRESS' } }),
      this.prisma.round.create({
        data: { tournamentId, number: 1, status: 'IN_PROGRESS', startedAt: new Date() },
      }),
    ]);

    return this.findTournament(tournamentId);
  }

  async advanceRound(tournamentId: string, requester: AuthenticatedUser) {
    const tournament = await this.findTournament(tournamentId);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'IN_PROGRESS') {
      throw new ConflictException('Rounds can only be advanced while the tournament is IN_PROGRESS');
    }

    const currentRound = await this.findCurrentRound(tournamentId);
    // No gate on match confirmation yet — Match doesn't exist until features 008/009 land.
    // 008 will also be responsible for generating the next round's pairings here.
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
