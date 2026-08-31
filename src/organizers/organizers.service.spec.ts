import { describe, expect, it, vi } from 'vitest';
import { OrganizersService } from './organizers.service.js';

function createMocks() {
  const prisma = {
    tournament: { findMany: vi.fn(async () => []) },
    deck: { count: vi.fn(async () => 0) },
    match: { count: vi.fn(async () => 0) },
  };
  const service = new OrganizersService(prisma as never);
  return { service, prisma };
}

describe('OrganizersService — getDashboard', () => {
  it('returns pending decks and disputed matches count per tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findMany.mockResolvedValue([
      { id: 't-1', name: 'Semanal 1', format: 'SWISS', status: 'IN_PROGRESS', scheduledAt: new Date('2026-01-01') },
      { id: 't-2', name: 'Semanal 2', format: 'SWISS', status: 'DRAFT', scheduledAt: new Date('2026-01-08') },
    ]);
    prisma.deck.count.mockImplementation(async ({ where }: { where: { participant: { tournamentId: string } } }) =>
      where.participant.tournamentId === 't-1' ? 2 : 0,
    );
    prisma.match.count.mockImplementation(async ({ where }: { where: { round: { tournamentId: string } } }) =>
      where.round.tournamentId === 't-1' ? 1 : 0,
    );

    const dashboard = await service.getDashboard('organizer-1');

    expect(dashboard).toEqual([
      {
        id: 't-1',
        name: 'Semanal 1',
        format: 'SWISS',
        status: 'IN_PROGRESS',
        scheduledAt: new Date('2026-01-01'),
        pendingDecksCount: 2,
        disputedMatchesCount: 1,
      },
      {
        id: 't-2',
        name: 'Semanal 2',
        format: 'SWISS',
        status: 'DRAFT',
        scheduledAt: new Date('2026-01-08'),
        pendingDecksCount: 0,
        disputedMatchesCount: 0,
      },
    ]);
  });

  it('only counts decks with PENDING status and matches with DISPUTED status', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findMany.mockResolvedValue([
      { id: 't-1', name: 'Semanal 1', format: 'SWISS', status: 'IN_PROGRESS', scheduledAt: new Date('2026-01-01') },
    ]);

    await service.getDashboard('organizer-1');

    expect(prisma.deck.count).toHaveBeenCalledWith({
      where: { validationStatus: 'PENDING', participant: { tournamentId: 't-1' } },
    });
    expect(prisma.match.count).toHaveBeenCalledWith({
      where: { resultStatus: 'DISPUTED', round: { tournamentId: 't-1' } },
    });
  });

  it('scopes tournaments to the requesting organizer', async () => {
    const { service, prisma } = createMocks();

    await service.getDashboard('organizer-1');

    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: { organizerId: 'organizer-1' },
      orderBy: { scheduledAt: 'asc' },
    });
  });
});
