import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TournamentEngineService } from './tournament-engine.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Controller('tournaments/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORGANIZER', 'ADMIN')
export class TournamentEngineController {
  constructor(private readonly engineService: TournamentEngineService) {}

  @Post('start')
  start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.start(id, user);
  }

  @Post('advance-round')
  advanceRound(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.advanceRound(id, user);
  }

  @Post('complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.complete(id, user);
  }

  @Get('rounds')
  listRounds(@Param('id') id: string) {
    return this.engineService.listRounds(id);
  }
}
