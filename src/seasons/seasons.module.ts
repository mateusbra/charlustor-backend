import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SeasonsService } from './seasons.service.js';
import { SeasonsController } from './seasons.controller.js';
import { StandingsModule } from '../standings/standings.module.js';

@Module({
  imports: [PassportModule.register({}), StandingsModule],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
