import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const ORGANIZER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };
const ADMIN: AuthenticatedUser = { id: 'admin-1', email: 'admin@a.com', role: 'ADMIN' };

function createMocks() {
  const prisma = {
    tournament: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  };
  const service = new TournamentsService(prisma as never);
  return { service, prisma };
}

function baseTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    name: 'Weekly #1',
    format: 'SWISS',
    roundsCount: 4,
    topCutSize: null,
    scheduledAt: new Date(),
    status: 'DRAFT',
    organizerId: ORGANIZER.id,
    ...overrides,
  };
}

describe('TournamentsService — create', () => {
  it('rejects SWISS without roundsCount', () => {
    const { service } = createMocks();
    expect(() =>
      service.create(ORGANIZER.id, { name: 'x', format: 'SWISS', scheduledAt: new Date().toISOString() } as never),
    ).toThrow(BadRequestException);
  });

  it('rejects SWISS_TOP_CUT without topCutSize', () => {
    const { service } = createMocks();
    expect(() =>
      service.create(ORGANIZER.id, {
        name: 'x',
        format: 'SWISS_TOP_CUT',
        scheduledAt: new Date().toISOString(),
        roundsCount: 4,
      } as never),
    ).toThrow(BadRequestException);
  });

  it('rejects SINGLE_ELIM with roundsCount set', () => {
    const { service } = createMocks();
    expect(() =>
      service.create(ORGANIZER.id, {
        name: 'x',
        format: 'SINGLE_ELIM',
        scheduledAt: new Date().toISOString(),
        roundsCount: 3,
      } as never),
    ).toThrow(BadRequestException);
  });

  it('creates a valid SWISS tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.create.mockResolvedValue(baseTournament());

    await service.create(ORGANIZER.id, {
      name: 'Weekly #1',
      format: 'SWISS',
      scheduledAt: new Date().toISOString(),
      roundsCount: 4,
    } as never);

    expect(prisma.tournament.create).toHaveBeenCalled();
  });
});

describe('TournamentsService — update', () => {
  it('rejects a non-owner, non-admin requester', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());

    await expect(service.update('t-1', OTHER_ORGANIZER, { name: 'New name' } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows an admin to edit someone else’s tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());
    prisma.tournament.update.mockResolvedValue(baseTournament({ name: 'New name' }));

    await expect(service.update('t-1', ADMIN, { name: 'New name' } as never)).resolves.toBeDefined();
  });

  it('rejects editing a tournament that already started', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'IN_PROGRESS' }));

    await expect(service.update('t-1', ORGANIZER, { name: 'New name' } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws NotFoundException for a missing tournament', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', ORGANIZER, {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TournamentsService — remove', () => {
  it('rejects deleting a tournament outside DRAFT', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'REGISTRATION_OPEN' }));

    await expect(service.remove('t-1', ORGANIZER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a DRAFT tournament owned by the requester', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament());
    prisma.tournament.delete.mockResolvedValue(undefined);

    await service.remove('t-1', ORGANIZER);
    expect(prisma.tournament.delete).toHaveBeenCalledWith({ where: { id: 't-1' } });
  });
});

describe('TournamentsService — registration status transitions', () => {
  it('opens registration only from DRAFT', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'REGISTRATION_CLOSED' }));

    await expect(service.openRegistration('t-1', ORGANIZER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('closes registration only from REGISTRATION_OPEN', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'DRAFT' }));

    await expect(service.closeRegistration('t-1', ORGANIZER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('opens registration from DRAFT successfully', async () => {
    const { service, prisma } = createMocks();
    prisma.tournament.findUnique.mockResolvedValue(baseTournament({ status: 'DRAFT' }));
    prisma.tournament.update.mockResolvedValue(baseTournament({ status: 'REGISTRATION_OPEN' }));

    const result = await service.openRegistration('t-1', ORGANIZER);
    expect(result.status).toBe('REGISTRATION_OPEN');
  });
});
