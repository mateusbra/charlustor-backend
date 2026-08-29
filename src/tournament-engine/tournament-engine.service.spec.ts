import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentEngineService } from './tournament-engine.service.js';
import { SwissPairingService } from '../pairing/swiss-pairing.service.js';
import { BracketPairingService } from '../pairing/bracket-pairing.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const OWNER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };

function createMocks() {
  const txPrisma = {
    tournament: { update: vi.fn() },
    round: { create: vi.fn(async () => ({ id: 'r-1' })), update: vi.fn() },
    match: { createMany: vi.fn() },
  };
  const prisma = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    participant: { findMany: vi.fn() },
    round: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    match: { createMany: vi.fn(), findMany: vi.fn(async () => []) },
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof txPrisma) => Promise<unknown>)(txPrisma);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  const standingsService = { getStandings: vi.fn(async () => []) };
  const service = new TournamentEngineService(
    prisma as never,
    new SwissPairingService(),
    new BracketPairingService(),
    standingsService as never,
  );
  return { service, prisma, txPrisma, standingsService };
}

function baseTournament(overrides: Record<string, unknown> = {}) {
  return { id: 't-1', organizerId: OWNER.id, status: 'REGISTRATION_OPEN', format: 'SWISS', ...overrides };
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

  it('starts the tournament, creates round 1, and pairs a lone SWISS participant with a bye', async () => {
    const { service, prisma, txPrisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());
    prisma.participant.findMany.mockResolvedValue([
      { id: 'p-1', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'Ready' } },
    ]);

    await service.start('t-1', OWNER);

    expect(txPrisma.tournament.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'IN_PROGRESS' } });
    expect(txPrisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 1, status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    });
    expect(txPrisma.match.createMany).toHaveBeenCalledWith({
      data: [
        {
          roundId: 'r-1',
          position: 0,
          participantAId: 'p-1',
          participantBId: null,
          resultStatus: 'CONFIRMED',
          confirmedScore: 'BYE',
          confirmedAt: expect.any(Date),
        },
      ],
    });
  });

  it('seeds a bracket for a SINGLE_ELIM tournament on start', async () => {
    const { service, prisma, txPrisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ format: 'SINGLE_ELIM' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: 'p-1', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'A' } },
      { id: 'p-2', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'B' } },
      { id: 'p-3', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'C' } },
      { id: 'p-4', deck: { validationStatus: 'APPROVED' }, user: { nickname: 'D' } },
    ]);

    await service.start('t-1', OWNER);

    expect(txPrisma.match.createMany).toHaveBeenCalledWith({
      data: [
        {
          roundId: 'r-1',
          position: 0,
          participantAId: 'p-1',
          participantBId: 'p-4',
          resultStatus: 'PENDING',
          confirmedScore: null,
          confirmedAt: null,
        },
        {
          roundId: 'r-1',
          position: 1,
          participantAId: 'p-2',
          participantBId: 'p-3',
          resultStatus: 'PENDING',
          confirmedScore: null,
          confirmedAt: null,
        },
      ],
    });
  });

  it('throws NotFoundException for a missing tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(null);

    await expect(service.start('missing', OWNER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TournamentEngineService — advanceRound (Swiss)', () => {
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

  it('completes the current round and creates the next one when every match is confirmed', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 1, status: 'IN_PROGRESS', phase: 'SWISS' });
    prisma.match.findMany.mockResolvedValue([]);

    await service.advanceRound('t-1', OWNER);

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { roundId: 'r-1' },
      orderBy: { position: 'asc' },
    });
    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    });
    expect(prisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 2, status: 'IN_PROGRESS', startedAt: expect.any(Date) },
    });
  });

  it('blocks advancing when a match is still PENDING or DISPUTED', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 1, status: 'IN_PROGRESS', phase: 'SWISS' });
    prisma.match.findMany.mockResolvedValue([{ id: 'm-1', resultStatus: 'DISPUTED' }]);

    await expect(service.advanceRound('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.round.update).not.toHaveBeenCalled();
  });
});

describe('TournamentEngineService — advanceRound (bracket progression)', () => {
  it('pairs adjacent winners into the next TOP_CUT round', async () => {
    const { service, prisma, txPrisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS', format: 'SWISS_TOP_CUT' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 3, status: 'IN_PROGRESS', phase: 'TOP_CUT' });
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-1', participantAId: 'p-1', participantBId: 'p-2', confirmedScore: '2-0', resultStatus: 'CONFIRMED' },
      { id: 'm-2', participantAId: 'p-3', participantBId: 'p-4', confirmedScore: '1-2', resultStatus: 'CONFIRMED' },
    ]);

    await service.advanceRound('t-1', OWNER);

    expect(txPrisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 4, status: 'IN_PROGRESS', phase: 'TOP_CUT', startedAt: expect.any(Date) },
    });
    expect(txPrisma.match.createMany).toHaveBeenCalledWith({
      data: [
        {
          roundId: 'r-1',
          position: 0,
          participantAId: 'p-1', // won m-1 (2-0)
          participantBId: 'p-4', // won m-2 (1-2, B wins)
          resultStatus: 'PENDING',
          confirmedScore: null,
          confirmedAt: null,
        },
      ],
    });
  });

  it('treats a bye winner correctly when pairing the next round', async () => {
    const { service, prisma, txPrisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS', format: 'SINGLE_ELIM' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 1, status: 'IN_PROGRESS', phase: 'SWISS' });
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-1', participantAId: 'p-1', participantBId: null, confirmedScore: 'BYE', resultStatus: 'CONFIRMED' },
      { id: 'm-2', participantAId: 'p-2', participantBId: 'p-3', confirmedScore: '2-1', resultStatus: 'CONFIRMED' },
    ]);

    await service.advanceRound('t-1', OWNER);

    expect(txPrisma.match.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ participantAId: 'p-1', participantBId: 'p-2' }),
      ],
    });
  });

  it('completes the tournament once only one winner remains', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS', format: 'SWISS_TOP_CUT' }));
    prisma.round.findFirst.mockResolvedValue({ id: 'r-1', number: 5, status: 'IN_PROGRESS', phase: 'TOP_CUT' });
    prisma.match.findMany.mockResolvedValue([
      { id: 'm-1', participantAId: 'p-1', participantBId: 'p-2', confirmedScore: '2-1', resultStatus: 'CONFIRMED' },
    ]);

    await service.advanceRound('t-1', OWNER);

    expect(prisma.tournament.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'COMPLETED' } });
  });
});

describe('TournamentEngineService — startTopCut', () => {
  function topCutTournament(overrides: Record<string, unknown> = {}) {
    return baseTournament({ format: 'SWISS_TOP_CUT', status: 'IN_PROGRESS', topCutSize: 2, ...overrides });
  }

  it('rejects when the format has no Top Cut', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(topCutTournament({ format: 'SWISS' }));

    await expect(service.startTopCut('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the Swiss phase still has an active round', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(topCutTournament());
    prisma.round.findFirst.mockResolvedValueOnce({ id: 'r-1', phase: 'SWISS', status: 'IN_PROGRESS' });

    await expect(service.startTopCut('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when Top Cut was already started', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(topCutTournament());
    prisma.round.findFirst
      .mockResolvedValueOnce(null) // no active Swiss round
      .mockResolvedValueOnce({ id: 'r-2', phase: 'TOP_CUT' }); // already started

    await expect(service.startTopCut('t-1', OWNER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('seeds the bracket from the top standings, in order', async () => {
    const { service, prisma, txPrisma, standingsService } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(topCutTournament({ topCutSize: 2 }));
    prisma.round.findFirst
      .mockResolvedValueOnce(null) // no active Swiss round
      .mockResolvedValueOnce(null) // no existing Top Cut round
      .mockResolvedValueOnce({ number: 3 }); // last round so far
    standingsService.getStandings.mockResolvedValue([
      { participantId: 'p-2', points: 9 },
      { participantId: 'p-4', points: 6 },
      { participantId: 'p-1', points: 3 },
    ]);

    await service.startTopCut('t-1', OWNER);

    expect(txPrisma.round.create).toHaveBeenCalledWith({
      data: { tournamentId: 't-1', number: 4, status: 'IN_PROGRESS', phase: 'TOP_CUT', startedAt: expect.any(Date) },
    });
    expect(txPrisma.match.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ participantAId: 'p-2', participantBId: 'p-4' })],
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

describe('TournamentEngineService — listRounds', () => {
  it('lists rounds ordered by number with their matches and participant nicknames', () => {
    const { service, prisma } = createMocks();
    prisma.round.findMany.mockResolvedValue([{ id: 'r-1', number: 1, matches: [] }]);

    service.listRounds('t-1');

    expect(prisma.round.findMany).toHaveBeenCalledWith({
      where: { tournamentId: 't-1' },
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
  });
});
