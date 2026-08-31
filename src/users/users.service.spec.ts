import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Prisma } from '../generated/prisma/client.js';

function createMocks() {
  const prisma = {
    user: { update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  };
  const service = new UsersService(prisma as never);
  return { service, prisma };
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('UsersService', () => {
  it('rejects updateProfile when the nickname is already taken', async () => {
    const { service, prisma } = createMocks();
    prisma.user.update.mockRejectedValue(uniqueConstraintError());

    await expect(service.updateProfile('user-1', { nickname: 'taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('normalizes the friend code to digits only before saving', async () => {
    const { service, prisma } = createMocks();
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    await service.updateProfile('user-1', { masterDuelFriendCode: '1234 5678-9012' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { masterDuelFriendCode: '123456789012' },
    });
  });

  it('rejects findPublicProfile for a user that does not exist', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findPublicProfile('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only selects id and nickname for the public profile', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', nickname: 'Duelist' });

    await service.findPublicProfile('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, nickname: true },
    });
  });

  it('lists all users without their password hash', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      select: { id: true, email: true, nickname: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('updates a user role', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'PLAYER' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', role: 'ORGANIZER', passwordHash: 'hash' });

    const result = await service.updateRole('user-1', 'ORGANIZER');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { role: 'ORGANIZER' } });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects updateRole for a user that does not exist', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateRole('missing', 'ORGANIZER')).rejects.toBeInstanceOf(NotFoundException);
  });
});
