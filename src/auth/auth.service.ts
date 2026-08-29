import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { generateOpaqueToken, hashToken } from './tokens.util.js';
import type { AuthenticatedUser } from './decorators/current-user.decorator.js';

const REFRESH_TOKEN_TTL_MS = parseDuration(process.env.JWT_REFRESH_EXPIRES ?? '30d');
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unitMs;
}

export type TokenPair = { accessToken: string; refreshToken: string; refreshExpiresAt: Date };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('E-mail already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.usersService.createWithPassword(email, passwordHash);
    const authUser = { id: user.id, email: user.email, role: user.role };
    return { user: authUser, tokens: await this.issueTokenPair(authUser) };
  }

  async login(email: string, password: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    const authUser = { id: user.id, email: user.email, role: user.role };
    return { user: authUser, tokens: await this.issueTokenPair(authUser) };
  }

  async validateOAuthLogin(provider: string, providerId: string, email: string): Promise<AuthenticatedUser> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
    if (existingLink) {
      return { id: existingLink.user.id, email: existingLink.user.email, role: existingLink.user.role };
    }

    const existingUser = await this.usersService.findByEmail(email);
    const user = existingUser ?? (await this.usersService.createFromOAuth(email));

    await this.prisma.oAuthAccount.create({ data: { provider, providerId, userId: user.id } });
    return { id: user.id, email: user.email, role: user.role };
  }

  async issueTokenPair(user: AuthenticatedUser): Promise<TokenPair> {
    const jti = randomUUID();
    const accessToken = this.jwtService.sign(
      { sub: user.id, role: user.role },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: (process.env.JWT_ACCESS_EXPIRES ?? '15m') as StringValue,
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES ?? '30d') as StringValue,
      },
    );
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: { id: jti, userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const decoded = this.decodeRefreshToken(rawRefreshToken);
    if (!decoded) return;
    await this.prisma.refreshToken.updateMany({
      where: { id: decoded.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async refresh(rawRefreshToken: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const decoded = this.decodeRefreshToken(rawRefreshToken);
    if (!decoded) throw new UnauthorizedException('Invalid refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: decoded.jti },
      include: { user: true },
    });
    if (!stored || stored.tokenHash !== hashToken(rawRefreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.revokedAt) {
      // Reuse of a rotated-out token is a signal of theft — revoke the whole session family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token already used');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const authUser = { id: stored.user.id, email: stored.user.email, role: stored.user.role };
    return { user: authUser, tokens: await this.issueTokenPair(authUser) };
  }

  private decodeRefreshToken(rawRefreshToken: string): { sub: string; jti: string } | null {
    try {
      return this.jwtService.verify(rawRefreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return null;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) return; // don't leak whether the e-mail has an account

    const secret = generateOpaqueToken();
    const record = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(secret),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${record.id}.${secret}`;
    await this.mailService.sendPasswordReset(email, resetLink);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const [id, secret] = token.split('.');
    if (!id || !secret) throw new UnauthorizedException('Invalid reset token');

    const record = await this.prisma.passwordResetToken.findUnique({ where: { id } });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.tokenHash !== hashToken(secret)
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
