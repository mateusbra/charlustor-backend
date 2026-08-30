import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TournamentsService } from './tournaments.service.js';
import { TournamentsController } from './tournaments.controller.js';
import { SeasonsModule } from '../seasons/seasons.module.js';

@Module({
  imports: [PassportModule.register({}), SeasonsModule],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
