import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, type Role } from '../generated/prisma/client.js';

export type UpdateProfileInput = { nickname?: string; masterDuelFriendCode?: string };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createWithPassword(email: string, passwordHash: string) {
    return this.prisma.user.create({ data: { email, passwordHash } });
  }

  createFromOAuth(email: string, role: Role = 'PLAYER') {
    return this.prisma.user.create({ data: { email, role } });
  }

  updatePasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const data = {
      ...input,
      masterDuelFriendCode: input.masterDuelFriendCode?.replace(/\D/g, ''),
    };
    try {
      return await this.prisma.user.update({ where: { id: userId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Nickname already taken');
      }
      throw error;
    }
  }

  async findPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, nickname: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, nickname: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRole(id: string, role: Role) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash: _passwordHash, ...updated } = await this.prisma.user.update({ where: { id }, data: { role } });
    return updated;
  }
}
