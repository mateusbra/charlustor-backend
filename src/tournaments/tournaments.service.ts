import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTournamentDto } from './dto/create-tournament.dto.js';
import type { UpdateTournamentDto } from './dto/update-tournament.dto.js';
import { TournamentFormat } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { SeasonsService } from '../seasons/seasons.service.js';

function assertFormatFields(format: TournamentFormat, roundsCount?: number | null, topCutSize?: number | null) {
  if (format === TournamentFormat.SWISS) {
    if (roundsCount == null) throw new BadRequestException('roundsCount is required for SWISS');
    if (topCutSize != null) throw new BadRequestException('topCutSize is not allowed for SWISS');
    return;
  }
  if (format === TournamentFormat.SWISS_TOP_CUT) {
    if (roundsCount == null) throw new BadRequestException('roundsCount is required for SWISS_TOP_CUT');
    if (topCutSize == null) throw new BadRequestException('topCutSize is required for SWISS_TOP_CUT');
    return;
  }
  // SINGLE_ELIM / DOUBLE_ELIM: bracket size is derived from participant count later on.
  if (roundsCount != null) throw new BadRequestException(`roundsCount is not allowed for ${format}`);
  if (topCutSize != null) throw new BadRequestException(`topCutSize is not allowed for ${format}`);
}

const EDITABLE_STATUSES = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasonsService: SeasonsService,
  ) {}

  findAll() {
    return this.prisma.tournament.findMany({ orderBy: { scheduledAt: 'asc' } });
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  async create(organizerId: string, dto: CreateTournamentDto) {
    assertFormatFields(dto.format, dto.roundsCount, dto.topCutSize);
    // RF6.1 — every tournament created counts toward the season active at creation time.
    const activeSeason = await this.seasonsService.findActive();
    return this.prisma.tournament.create({
      data: {
        name: dto.name,
        format: dto.format,
        scheduledAt: new Date(dto.scheduledAt),
        roundsCount: dto.roundsCount,
        topCutSize: dto.topCutSize,
        organizerId,
        seasonId: activeSeason?.id,
      },
    });
  }

  async update(id: string, requester: AuthenticatedUser, dto: UpdateTournamentDto) {
    const tournament = await this.findOne(id);
    this.assertOwner(tournament, requester);
    if (!EDITABLE_STATUSES.includes(tournament.status)) {
      throw new ConflictException('Tournament can no longer be edited');
    }

    const format = dto.format ?? tournament.format;
    const roundsCount = dto.roundsCount ?? tournament.roundsCount;
    const topCutSize = dto.topCutSize ?? tournament.topCutSize;
    assertFormatFields(format, roundsCount, topCutSize);

    return this.prisma.tournament.update({
      where: { id },
      data: {
        name: dto.name,
        format,
        roundsCount,
        topCutSize,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tournament = await this.findOne(id);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'DRAFT') {
      throw new ConflictException('Only tournaments in DRAFT can be deleted');
    }
    await this.prisma.tournament.delete({ where: { id } });
  }

  async openRegistration(id: string, requester: AuthenticatedUser) {
    const tournament = await this.findOne(id);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'DRAFT') {
      throw new ConflictException('Registration can only be opened from DRAFT');
    }
    return this.prisma.tournament.update({ where: { id }, data: { status: 'REGISTRATION_OPEN' } });
  }

  async closeRegistration(id: string, requester: AuthenticatedUser) {
    const tournament = await this.findOne(id);
    this.assertOwner(tournament, requester);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new ConflictException('Registration can only be closed from REGISTRATION_OPEN');
    }
    return this.prisma.tournament.update({ where: { id }, data: { status: 'REGISTRATION_CLOSED' } });
  }

  private assertOwner(tournament: { organizerId: string }, requester: AuthenticatedUser) {
    if (tournament.organizerId !== requester.id && requester.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this tournament');
    }
  }
}
