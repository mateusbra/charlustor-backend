import { describe, expect, it, vi } from 'vitest';
import { SeasonsService } from './seasons.service.js';
import { PLACEMENT_POINTS } from './season-ranking-calculator.js';

function createMocks() {
  const txPrisma = { season: { updateMany: vi.fn(), create: vi.fn() } };
  const prisma = {
    season: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    tournament: { findMany: vi.fn(async () => []) },
    participant: { findMany: vi.fn(async () => []) },
    round: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof txPrisma) => Promise<unknown>)(txPrisma);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  const standingsService = { getStandings: vi.fn(async () => []) };
  const service = new SeasonsService(prisma as never, standingsService as never);
  return { service, prisma, txPrisma, standingsService };
}

function participant(id: string, userId: string, nickname: string) {
  return { id, user: { id: userId, nickname } };
}

describe('SeasonsService — create', () => {
  it('deactivates any other active season when creating a new active one', async () => {
    const { service, txPrisma } = createMocks();
    txPrisma.season.create.mockResolvedValue({ id: 's-2', isActive: true });

    await service.create({ name: 'Temporada 2', startDate: '2026-01-01', isActive: true });

    expect(txPrisma.season.updateMany).toHaveBeenCalledWith({ where: { isActive: true }, data: { isActive: false } });
    expect(txPrisma.season.create).toHaveBeenCalled();
  });

  it('does not touch other seasons when creating an inactive one', async () => {
    const { service, txPrisma } = createMocks();
    txPrisma.season.create.mockResolvedValue({ id: 's-3', isActive: false });

    await service.create({ name: 'Rascunho', startDate: '2026-01-01' });

    expect(txPrisma.season.updateMany).not.toHaveBeenCalled();
  });
});

describe('SeasonsService — getRanking', () => {
  it('sums points across multiple COMPLETED tournaments of the same season', async () => {
    const { service, prisma, standingsService } = createMocks();
    prisma.tournament.findMany.mockResolvedValue([
      { id: 't-1', format: 'SWISS' },
      { id: 't-2', format: 'SWISS' },
    ]);
    prisma.participant.findMany.mockImplementation(async ({ where }: { where: { tournamentId: string } }) => {
      if (where.tournamentId === 't-1') return [participant('p1', 'u1', 'Alice'), participant('p2', 'u2', 'Bob')];
      return [participant('p3', 'u1', 'Alice'), participant('p4', 'u2', 'Bob')];
    });
    standingsService.getStandings.mockImplementation(async (tournamentId: string) => {
      if (tournamentId === 't-1') return [{ participantId: 'p1' }, { participantId: 'p2' }];
      return [{ participantId: 'p4' }, { participantId: 'p3' }];
    });

    const ranking = await service.getRanking('season-1');

    // Alice: 1st in t-1 (10) + 2nd in t-2 (7) = 17. Bob: 2nd in t-1 (7) + 1st in t-2 (10) = 17. Tied, alphabetical.
    expect(ranking).toEqual([
      { position: 1, userId: 'u1', nickname: 'Alice', points: PLACEMENT_POINTS.FIRST + PLACEMENT_POINTS.SECOND, tournamentsPlayed: 2 },
      { position: 2, userId: 'u2', nickname: 'Bob', points: PLACEMENT_POINTS.FIRST + PLACEMENT_POINTS.SECOND, tournamentsPlayed: 2 },
    ]);
  });

  it('only queries tournaments that are COMPLETED and belong to the season', async () => {
    const { service, prisma } = createMocks();

    await service.getRanking('season-1');

    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: { seasonId: 'season-1', status: 'COMPLETED' },
    });
  });

  it('uses bracket rounds instead of Swiss standings for a SWISS_TOP_CUT tournament', async () => {
    const { service, prisma, standingsService } = createMocks();
    prisma.tournament.findMany.mockResolvedValue([{ id: 't-1', format: 'SWISS_TOP_CUT' }]);
    prisma.participant.findMany.mockResolvedValue([participant('p1', 'u1', 'Alice'), participant('p2', 'u2', 'Bob')]);
    prisma.round.findMany.mockResolvedValue([
      {
        number: 1,
        phase: 'TOP_CUT',
        matches: [{ participantAId: 'p1', participantBId: 'p2', confirmedScore: '2-0' }],
      },
    ]);

    const ranking = await service.getRanking('season-1');

    expect(standingsService.getStandings).not.toHaveBeenCalled();
    expect(ranking).toEqual([
      { position: 1, userId: 'u1', nickname: 'Alice', points: PLACEMENT_POINTS.FIRST, tournamentsPlayed: 1 },
      { position: 2, userId: 'u2', nickname: 'Bob', points: PLACEMENT_POINTS.SECOND, tournamentsPlayed: 1 },
    ]);
  });
});
