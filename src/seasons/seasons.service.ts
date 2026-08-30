import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StandingsService } from '../standings/standings.service.js';
import { calculateTournamentPlacements, type BracketRound } from './season-ranking-calculator.js';
import type { CreateSeasonDto } from './dto/create-season.dto.js';

const ELIMINATION_FORMATS = ['SINGLE_ELIM', 'DOUBLE_ELIM'];

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly standingsService: StandingsService,
  ) {}

  async create(dto: CreateSeasonDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.season.updateMany({ where: { isActive: true }, data: { isActive: false } });
      }
      return tx.season.create({
        data: {
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          isActive: dto.isActive ?? false,
        },
      });
    });
  }

  findActive() {
    return this.prisma.season.findFirst({ where: { isActive: true } });
  }

  async getRanking(seasonId: string) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { seasonId, status: 'COMPLETED' },
    });

    const totals = new Map<string, { userId: string; nickname: string | null; points: number; tournamentsPlayed: number }>();

    for (const tournament of tournaments) {
      const [participants, rounds] = await Promise.all([
        this.prisma.participant.findMany({
          where: { tournamentId: tournament.id },
          include: { user: { select: { id: true, nickname: true } } },
        }),
        this.prisma.round.findMany({
          where: { tournamentId: tournament.id },
          orderBy: { number: 'asc' },
          include: { matches: { select: { participantAId: true, participantBId: true, confirmedScore: true } } },
        }),
      ]);

      const bracketRounds: BracketRound[] = ELIMINATION_FORMATS.includes(tournament.format)
        ? rounds
        : rounds.filter((r) => r.phase === 'TOP_CUT');

      let swissStandingOrder: string[] = [];
      if (bracketRounds.length === 0) {
        const standings = await this.standingsService.getStandings(tournament.id);
        swissStandingOrder = standings.map((row) => row.participantId);
      }

      const placements = calculateTournamentPlacements({
        participantIds: participants.map((p) => p.id),
        swissStandingOrder,
        bracketRounds,
      });

      const userIdByParticipantId = new Map(participants.map((p) => [p.id, p.user]));
      for (const [participantId, points] of placements) {
        const user = userIdByParticipantId.get(participantId);
        if (!user) continue;
        const current = totals.get(user.id) ?? { userId: user.id, nickname: user.nickname, points: 0, tournamentsPlayed: 0 };
        current.points += points;
        current.tournamentsPlayed += 1;
        totals.set(user.id, current);
      }
    }

    return [...totals.values()]
      .sort((a, b) => b.points - a.points || (a.nickname ?? '').localeCompare(b.nickname ?? ''))
      .map((row, index) => ({ position: index + 1, ...row }));
  }
}
