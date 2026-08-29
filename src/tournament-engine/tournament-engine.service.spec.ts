import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentEngineService } from './tournament-engine.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const OWNER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };

function createMocks() {
  const prisma = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    participant: { findMany: vi.fn() },
    round: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
  const service = new TournamentEngineService(prisma as never);
  return { service, prisma };
}

function baseTournament(overrides: Record<string, unknown> = {}) {
  return { id: 't-1', organizerId: OWNER.id, status: 'REGISTRATION_OPEN', ...overrides };
}

describe('TournamentEngineService — start', () => {
  it('rejects a non-owner, non-admin requester', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());

    await expect(service.start('t-1', OTHER_ORGANIZER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects starting a tournament that is not REGISTRATION_OPEN/CLOSED', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'DRAFT' }));

    await expect(service.start('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects starting when a participant has no approved deck, listing who is pending', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());
    prisma.participant.findMany.mockResolvedValue([
      { id: 'p-1', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'Ready' } },
      { id: 'p-2', deck: { validationStatus: 'PENDING' }, user: { nickname: 'NotReady' } },
      { id: 'p-3', deck: null, user: { nickname: 'NoDeck' } },
    ]);

    await expect(service.start('t-1', OWNER)).rejects.toBeInstanceOf(BadRequestException);
    try {
      await service.start('t-1', OWNER);
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({
        pendingParticipants: ['NotReady', 'NoDeck'],
      });
    }
  });

  it('starts the tournament and creates round 1 when all decks are approved', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());
    prisma.participant.findMany.mockResolvedValue([
      { id: 'p-1', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'Ready' } },
    ]);

    await service.start('t-1', OWNER);

    expect(prisma.tournament.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'IN_PROGRESS' } });
    expect(prisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 1, status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    });
  });

  it('throws NotFoundException for a missing tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(null);

    await expect(service.start('missing', OWNER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TournamentEngineService — advanceRound', () => {
  it('rejects advancing a tournament that is not IN_PROGRESS', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'REGISTRATION_OPEN' }));

    await expect(service.advanceRound('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects advancing when no round is currently in progress', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));
    prisma.round.findFirst.mockResolvedValue(null);

    await expect(service.advanceRound('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('completes the current round and creates the next one', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 1, status: 'IN_PROGRESS' });

    await service.advanceRound('t-1', OWNER);

    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    expect(prisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 2, status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    });
  });
});

describe('TournamentEngineService — complete', () => {
  it('rejects completing a tournament that is not IN_PROGRESS', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'COMPLETED' }));

    await expect(service.complete('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks the tournament (and any in-progress round) as COMPLETED', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1' });

    await service.complete('t-1', OWNER);

    expect(prisma.tournament.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'COMPLETED' } });
    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
  });
});
