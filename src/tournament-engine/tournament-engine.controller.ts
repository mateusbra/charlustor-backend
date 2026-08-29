import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TournamentEngineService } from './tournament-engine.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Controller('tournaments/:id')
export class TournamentEngineController {
  constructor(private readonly engineService: TournamentEngineService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.start(id, user);
  }

  @Post('advance-round')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  advanceRound(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.advanceRound(id, user);
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.complete(id, user);
  }

  @Post('start-top-cut')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  startTopCut(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engineService.startTopCut(id, user);
  }

  // Public — players need to see pairings/scores for their own tournament too.
  @Get('rounds')
  listRounds(@Param('id') id: string) {
    return this.engineService.listRounds(id);
  }
}
