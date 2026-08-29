import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { ReportScoreDto } from './dto/report-score.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  report(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ReportScoreDto) {
    return this.matchesService.report(id, user, dto.score);
  }

  @Post(':id/resolve')
  @UseGuards(JwtAuthGuard)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ReportScoreDto) {
    return this.matchesService.resolve(id, user, dto.score);
  }
}
