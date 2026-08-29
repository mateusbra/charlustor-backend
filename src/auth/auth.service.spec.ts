import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { hashToken } from './tokens.util.js';

function createMocks() {
  const prisma = {
    user: { update: vi.fn() },
    oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
  const usersService = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    createWithPassword: vi.fn(),
    createFromOAuth: vi.fn(),
  };
  const mailService = { sendPasswordReset: vi.fn() };
  const jwtService = {
    sign: vi.fn(() => 'signed-token'),
    verify: vi.fn(() => ({ sub: 'user-1', jti: 'jti-1' })),
  };

  const service = new AuthService(prisma as never, usersService as never, mailService as never, jwtService as never);
  return { service, prisma, usersService, mailService, jwtService };
}

describe('AuthService', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
  });

  it('fails to register when the e-mail is already taken', async () => {
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue({ id: '1', email: 'a@a.com' });

    await expect(service.register('a@a.com', 'password123')).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails to login with the wrong password', async () => {
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      role: 'PLAYER',
      passwordHash: await (await import('bcryptjs')).hash('correct-password', 12),
    });

    await expect(service.login('a@a.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token on refresh, revoking the old one', async () => {
    const { service, prisma, jwtService } = createMocks();
    const rawToken = 'raw-refresh-token';
    jwtService.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'a@a.com', role: 'PLAYER' },
    });

    await service.refresh(rawToken);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'jti-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rejects a refresh token that was already used, and revokes the whole session', async () => {
    const { service, prisma, jwtService } = createMocks();
    const rawToken = 'raw-refresh-token';
    jwtService.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'a@a.com', role: 'PLAYER' },
    });

    await expect(service.refresh(rawToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('never throws on forgot-password, whether or not the e-mail exists', async () => {
    const { service, usersService } = createMocks();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword('nobody@a.com')).resolves.toBeUndefined();
  });

  it('rejects reset-password with an expired token', async () => {
    const { service, prisma } = createMocks();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      tokenHash: hashToken('secret'),
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.resetPassword('reset-1.secret', 'new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects reset-password with an already-used token', async () => {
    const { service, prisma } = createMocks();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      tokenHash: hashToken('secret'),
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.resetPassword('reset-1.secret', 'new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('resets the password and revokes active sessions on a valid token', async () => {
    const { service, prisma } = createMocks();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      tokenHash: hashToken('secret'),
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.resetPassword('reset-1.secret', 'new-password');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
