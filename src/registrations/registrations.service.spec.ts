import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const ORGANIZER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };
const PLAYER_ID = 'player-1';

function createMocks() {
  const prisma = {
    participant: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  };
  const tournamentsService = { findOne: vi.fn() };
  const usersService = { findById: vi.fn() };
  const service = new RegistrationsService(prisma as never, tournamentsService as never, usersService as never);
  return { service, prisma, tournamentsService, usersService };
}

function completeProfile() {
  return { id: PLAYER_ID, nickname: 'Duelist', masterDuelFriendCode: '123456789012' };
}

describe('RegistrationsService — register', () => {
  it('rejects registration when the tournament is not REGISTRATION_OPEN', async () => {
    const { service, tournamentsService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'DRAFT' });

    await expect(service.register('t-1', PLAYER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects registration with an incomplete profile', async () => {
    const { service, tournamentsService, usersService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'REGISTRATION_OPEN' });
    usersService.findById.mockResolvedValue({ id: PLAYER_ID, nickname: null, masterDuelFriendCode: null });

    await expect(service.register('t-1', PLAYER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a duplicate registration', async () => {
    const { service, prisma, tournamentsService, usersService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'REGISTRATION_OPEN' });
    usersService.findById.mockResolvedValue(completeProfile());
    prisma.participant.findUnique.mockResolvedValue({ id: 'p-1', status: 'REGISTERED' });

    await expect(service.register('t-1', PLAYER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects re-registration for a disqualified participant', async () => {
    const { service, prisma, tournamentsService, usersService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'REGISTRATION_OPEN' });
    usersService.findById.mockResolvedValue(completeProfile());
    prisma.participant.findUnique.mockResolvedValue({ id: 'p-1', status: 'DISQUALIFIED' });

    await expect(service.register('t-1', PLAYER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reactivates a withdrawn participant instead of creating a new row', async () => {
    const { service, prisma, tournamentsService, usersService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'REGISTRATION_OPEN' });
    usersService.findById.mockResolvedValue(completeProfile());
    prisma.participant.findUnique.mockResolvedValue({ id: 'p-1', status: 'WITHDRAWN' });
    prisma.participant.update.mockResolvedValue({ id: 'p-1', status: 'REGISTERED' });

    await service.register('t-1', PLAYER_ID);

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { status: 'REGISTERED', registeredAt: expect.any(Date) },
    });
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('creates a new participant when none exists yet', async () => {
    const { service, prisma, tournamentsService, usersService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', status: 'REGISTRATION_OPEN' });
    usersService.findById.mockResolvedValue(completeProfile());
    prisma.participant.findUnique.mockResolvedValue(null);
    prisma.participant.create.mockResolvedValue({ id: 'p-1', status: 'REGISTERED' });

    await service.register('t-1', PLAYER_ID);

    expect(prisma.participant.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', userId: PLAYER_ID },
    });
  });
});

describe('RegistrationsService — withdraw', () => {
  it('rejects withdrawing when not currently registered', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue({ id: 'p-1', status: 'WITHDRAWN' });

    await expect(service.withdraw('t-1', PLAYER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException when there is no participant record', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(null);

    await expect(service.withdraw('t-1', PLAYER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RegistrationsService — remove', () => {
  it('rejects removal by a non-owner, non-admin organizer', async () => {
    const { service, tournamentsService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', organizerId: ORGANIZER.id });

    await expect(service.remove('t-1', PLAYER_ID, OTHER_ORGANIZER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes the participant row when the owner removes them', async () => {
    const { service, prisma, tournamentsService } = createMocks();
    tournamentsService.findOne.mockResolvedValue({ id: 't-1', organizerId: ORGANIZER.id });
    prisma.participant.findUnique.mockResolvedValue({ id: 'p-1' });

    await service.remove('t-1', PLAYER_ID, ORGANIZER);

    expect(prisma.participant.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
  });
});
