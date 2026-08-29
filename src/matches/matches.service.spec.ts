import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const PLAYER_A: AuthenticatedUser = { id: 'user-a', email: 'a@a.com', role: 'PLAYER' };
const PLAYER_B: AuthenticatedUser = { id: 'user-b', email: 'b@a.com', role: 'PLAYER' };
const OUTSIDER: AuthenticatedUser = { id: 'user-c', email: 'c@a.com', role: 'PLAYER' };
const ORGANIZER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };
const ADMIN: AuthenticatedUser = { id: 'admin-1', email: 'admin@a.com', role: 'ADMIN' };

function createMocks() {
  const prisma = { match: { findUnique: vi.fn(), update: vi.fn() } };
  const service = new MatchesService(prisma as never);
  return { service, prisma };
}

function baseMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    reportedScoreA: null,
    reportedScoreB: null,
    resultStatus: 'PENDING',
    participantA: { id: 'p-a', userId: PLAYER_A.id },
    participantB: { id: 'p-b', userId: PLAYER_B.id },
    ...overrides,
  };
}

describe('MatchesService — report', () => {
  it('rejects a malformed score', async () => {
    const { service } = createMocks();
    await expect(service.report('m-1', PLAYER_A, 'not-a-score')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reporting on a bye match', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(baseMatch({ participantB: null }));

    await expect(service.report('m-1', PLAYER_A, '2-0')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a reporter who is not a participant of the match', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(baseMatch());

    await expect(service.report('m-1', OUTSIDER, '2-0')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores the first report without confirming yet', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(baseMatch());
    prisma.match.update.mockResolvedValue({ ...baseMatch(), reportedScoreA: '2-1' });

    await service.report('m-1', PLAYER_A, '2-1');

    expect(prisma.match.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { reportedScoreA: '2-1' } });
  });

  it('auto-confirms when both reports mirror each other', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(baseMatch({ reportedScoreA: '2-1' }));

    await service.report('m-1', PLAYER_B, '1-2');

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { reportedScoreB: '1-2', resultStatus: 'CONFIRMED', confirmedScore: '2-1', confirmedAt: expect.any(Date) },
    });
  });

  it('marks DISPUTED when reports disagree', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(baseMatch({ reportedScoreA: '2-1' }));

    await service.report('m-1', PLAYER_B, '2-1');

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { reportedScoreB: '2-1', resultStatus: 'DISPUTED' },
    });
  });
});

describe('MatchesService — resolve', () => {
  function matchWithTournament(organizerId: string) {
    return { id: 'm-1', round: { tournament: { organizerId } } };
  }

  it('rejects a resolver who does not own the tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(matchWithTournament(ORGANIZER.id));

    await expect(service.resolve('m-1', OTHER_ORGANIZER, '2-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the owning organizer force-confirm a result, even overriding an existing one', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(matchWithTournament(ORGANIZER.id));
    prisma.match.update.mockResolvedValue({ id: 'm-1', resultStatus: 'CONFIRMED' });

    await service.resolve('m-1', ORGANIZER, '2-1');

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { resultStatus: 'CONFIRMED', confirmedScore: '2-1', resolvedByUserId: ORGANIZER.id, confirmedAt: expect.any(Date) },
    });
  });

  it('lets an admin resolve regardless of ownership', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(matchWithTournament(ORGANIZER.id));
    prisma.match.update.mockResolvedValue({ id: 'm-1', resultStatus: 'CONFIRMED' });

    await expect(service.resolve('m-1', ADMIN, '1-2')).resolves.toBeDefined();
  });

  it('throws NotFoundException for a missing match', async () => {
    const { service, prisma } = createMocks();
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(service.resolve('missing', ORGANIZER, '2-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
