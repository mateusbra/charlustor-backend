import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DecksService } from './decks.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const OWNER: AuthenticatedUser = { id: 'player-1', email: 'p@a.com', role: 'PLAYER' };
const OTHER_PLAYER: AuthenticatedUser = { id: 'player-2', email: 'p2@a.com', role: 'PLAYER' };
const ORGANIZER: AuthenticatedUser = { id: 'org-1', email: 'org@a.com', role: 'ORGANIZER' };
const OTHER_ORGANIZER: AuthenticatedUser = { id: 'org-2', email: 'org2@a.com', role: 'ORGANIZER' };
const ADMIN: AuthenticatedUser = { id: 'admin-1', email: 'admin@a.com', role: 'ADMIN' };

function createMocks() {
  const prisma = {
    participant: { findUnique: vi.fn() },
    deck: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  };
  const recognitionService = { recognizeCards: vi.fn(), isConfigured: vi.fn(() => true) };
  const cardLookupService = { resolve: vi.fn(), isExtraDeckType: vi.fn(() => false) };
  const service = new DecksService(prisma as never, recognitionService as never, cardLookupService as never);
  return { service, prisma, recognitionService, cardLookupService };
}

function participantWithTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 'part-1',
    userId: OWNER.id,
    tournament: { id: 't-1', organizerId: ORGANIZER.id, status: 'REGISTRATION_OPEN' },
    ...overrides,
  };
}

const FILE = { buffer: Buffer.from('fake-image'), mimetype: 'image/png' };

describe('DecksService — submit', () => {
  it('rejects submission for someone else’s participant slot', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());

    await expect(service.submit('part-1', OTHER_PLAYER, { mainExtra: FILE, side: FILE })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects submission when the tournament is not REGISTRATION_OPEN', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(
      participantWithTournament({ tournament: { id: 't-1', organizerId: ORGANIZER.id, status: 'REGISTRATION_CLOSED' } }),
    );

    await expect(service.submit('part-1', OWNER, { mainExtra: FILE, side: FILE })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws NotFoundException for a missing participant', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(null);

    await expect(service.submit('missing', OWNER, { mainExtra: FILE, side: FILE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('splits recognized cards into main/extra by card type and upserts the deck', async () => {
    const { service, prisma, recognitionService, cardLookupService } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());
    recognitionService.recognizeCards
      .mockResolvedValueOnce([{ name: 'Ash Blossom & Joyous Spring', quantity: 3 }, { name: 'Baronne de Fleur', quantity: 1 }])
      .mockResolvedValueOnce([{ name: 'Nibiru, the Primal Being', quantity: 2 }]);
    cardLookupService.resolve
      .mockResolvedValueOnce({ id: 1, name: 'Ash Blossom & Joyous Spring', type: 'Effect Monster' })
      .mockResolvedValueOnce({ id: 2, name: 'Baronne de Fleur', type: 'Link Monster' })
      .mockResolvedValueOnce({ id: 3, name: 'Nibiru, the Primal Being', type: 'Effect Monster' });
    cardLookupService.isExtraDeckType.mockImplementation((type: string) => type === 'Link Monster');
    prisma.deck.upsert.mockResolvedValue({ id: 'deck-1' });

    await service.submit('part-1', OWNER, { mainExtra: FILE, side: FILE });

    const call = prisma.deck.upsert.mock.calls[0][0];
    expect(call.create.decodedCards.main).toEqual([{ id: 1, name: 'Ash Blossom & Joyous Spring', quantity: 3 }]);
    expect(call.create.decodedCards.extra).toEqual([{ id: 2, name: 'Baronne de Fleur', quantity: 1 }]);
    expect(call.create.decodedCards.side).toEqual([{ id: 3, name: 'Nibiru, the Primal Being', quantity: 2 }]);
    expect(call.where).toEqual({ participantId: 'part-1' });
  });
});

describe('DecksService — approve/reject', () => {
  it('rejects approval by a non-owner, non-admin organizer', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());

    await expect(service.approve('part-1', OTHER_ORGANIZER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the owning organizer to approve', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());
    prisma.deck.findUnique.mockResolvedValue({ id: 'deck-1', validationStatus: 'PENDING' });
    prisma.deck.update.mockResolvedValue({ id: 'deck-1', validationStatus: 'APPROVED' });

    const result = await service.approve('part-1', ORGANIZER);
    expect(result.validationStatus).toBe('APPROVED');
  });

  it('rejects approving a participant that never submitted a deck', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());
    prisma.deck.findUnique.mockResolvedValue(null);

    await expect(service.approve('part-1', ORGANIZER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an admin to reject regardless of ownership', async () => {
    const { service, prisma } = createMocks();
    prisma.participant.findUnique.mockResolvedValue(participantWithTournament());
    prisma.deck.findUnique.mockResolvedValue({ id: 'deck-1', validationStatus: 'PENDING' });
    prisma.deck.update.mockResolvedValue({ id: 'deck-1', validationStatus: 'REJECTED' });

    const result = await service.reject('part-1', ADMIN);
    expect(result.validationStatus).toBe('REJECTED');
  });
});
