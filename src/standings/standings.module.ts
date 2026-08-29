import { Module } from '@nestjs/common';
import { StandingsService } from './standings.service.js';
import { StandingsController } from './standings.controller.js';

@Module({
  controllers: [StandingsController],
  providers: [StandingsService],
})
export class StandingsModule {}
