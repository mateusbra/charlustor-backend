import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { calculateStandings } from './standings-calculator.js';

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStandings(tournamentId: string) {
    const [participants, matches] = await Promise.all([
      this.prisma.participant.findMany({
        where: { tournamentId },
        include: { user: { select: { nickname: true } } },
      }),
      this.prisma.match.findMany({
        where: { round: { tournamentId }, resultStatus: 'CONFIRMED' },
        select: { participantAId: true, participantBId: true, confirmedScore: true },
      }),
    ]);

    const rows = calculateStandings(
      participants.map((p) => p.id),
      matches.filter((m): m is typeof m & { confirmedScore: string } => m.confirmedScore !== null),
    );

    const nicknameByParticipantId = new Map(participants.map((p) => [p.id, p.user.nickname]));

    return rows.map((row, index) => ({
      position: index + 1,
      participantId: row.participantId,
      nickname: nicknameByParticipantId.get(row.participantId) ?? null,
      points: row.points,
      wins: row.wins,
      losses: row.losses,
      buchholz: row.buchholz,
    }));
  }
}
