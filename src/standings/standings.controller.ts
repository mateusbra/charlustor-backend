import { Controller, Get, Param } from '@nestjs/common';
import { StandingsService } from './standings.service.js';

@Controller('tournaments/:id/standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get()
  getStandings(@Param('id') id: string) {
    return this.standingsService.getStandings(id);
  }
}
