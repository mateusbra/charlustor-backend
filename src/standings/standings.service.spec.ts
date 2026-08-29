import { describe, expect, it, vi } from 'vitest';
import { StandingsService } from './standings.service.js';

function createMocks() {
  const prisma = { participant: { findMany: vi.fn() }, match: { findMany: vi.fn() } };
  const service = new StandingsService(prisma as never);
  return { service, prisma };
}

describe('StandingsService', () => {
  it('joins nicknames and numbers positions in ranked order', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findMany.mockResolvedValue([
      { id: 'p-a', user: { nickname: 'Alice' } },
      { id: 'p-b', user: { nickname: 'Bob' } },
    ]);
    prisma.match.findMany.mockResolvedValue([
      { participantAId: 'p-a', participantBId: 'p-b', confirmedScore: '2-0' },
    ]);

    const standings = await service.getStandings('t-1');

    expect(standings).toEqual([
      { position: 1, participantId: 'p-a', nickname: 'Alice', points: 3, wins: 1, losses: 0, buchholz: 0 },
      { position: 2, participantId: 'p-b', nickname: 'Bob', points: 0, wins: 0, losses: 1, buchholz: 3 },
    ]);
  });

  it('queries only CONFIRMED matches for the tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.match.findMany.mockResolvedValue([]);

    await service.getStandings('t-1');

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { round: { tournamentId: 't-1' }, resultStatus: 'CONFIRMED' },
      select: { participantAId: true, participantBId: true, confirmedScore: true },
    });
  });
});
