import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TournamentsService } from '../tournaments/tournaments.service.js';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly usersService: UsersService,
  ) {}

  async register(tournamentId: string, userId: string) {
    const tournament = await this.tournamentsService.findOne(tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new ConflictException('Registration is not open for this tournament');
    }

    const user = await this.usersService.findById(userId);
    if (!user?.nickname || !user?.masterDuelFriendCode) {
      throw new ForbiddenException('Complete your profile (nickname and friend code) before registering');
    }

    const existing = await this.prisma.participant.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });

    if (!existing) {
      return this.prisma.participant.create({ data: { tournamentId, userId } });
    }
    if (existing.status === 'REGISTERED') {
      throw new ConflictException('Already registered for this tournament');
    }
    if (existing.status === 'DISQUALIFIED') {
      throw new ForbiddenException('You were disqualified from this tournament');
    }
    // WITHDRAWN -> reactivate the same row instead of hitting the unique constraint.
    return this.prisma.participant.update({
      where: { id: existing.id },
      data: { status: 'REGISTERED', registeredAt: new Date() },
    });
  }

  async withdraw(tournamentId: string, userId: string) {
    const participant = await this.findParticipant(tournamentId, userId);
    if (participant.status !== 'REGISTERED') {
      throw new ConflictException('You are not currently registered for this tournament');
    }
    return this.prisma.participant.update({ where: { id: participant.id }, data: { status: 'WITHDRAWN' } });
  }

  listParticipants(tournamentId: string) {
    return this.prisma.participant.findMany({
      where: { tournamentId },
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { registeredAt: 'asc' },
    });
  }

  async remove(tournamentId: string, targetUserId: string, requester: AuthenticatedUser) {
    const tournament = await this.tournamentsService.findOne(tournamentId);
    if (tournament.organizerId !== requester.id && requester.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this tournament');
    }
    const participant = await this.findParticipant(tournamentId, targetUserId);
    await this.prisma.participant.delete({ where: { id: participant.id } });
  }

  private async findParticipant(tournamentId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    return participant;
  }
}
