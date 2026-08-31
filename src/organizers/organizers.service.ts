import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganizersService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizerId: string) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { organizerId },
      orderBy: { scheduledAt: 'asc' },
    });

    return Promise.all(
      tournaments.map(async (tournament) => {
        const [pendingDecksCount, disputedMatchesCount] = await Promise.all([
          this.prisma.deck.count({
            where: { validationStatus: 'PENDING', participant: { tournamentId: tournament.id } },
          }),
          this.prisma.match.count({
            where: { resultStatus: 'DISPUTED', round: { tournamentId: tournament.id } },
          }),
        ]);

        return {
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
          status: tournament.status,
          scheduledAt: tournament.scheduledAt,
          pendingDecksCount,
          disputedMatchesCount,
        };
      }),
    );
  }
}
