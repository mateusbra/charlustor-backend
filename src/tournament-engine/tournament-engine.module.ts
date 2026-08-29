import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TournamentEngineService } from './tournament-engine.service.js';
import { TournamentEngineController } from './tournament-engine.controller.js';
import { PairingModule } from '../pairing/pairing.module.js';

@Module({
  imports: [PassportModule.register({}), PairingModule],
  controllers: [TournamentEngineController],
  providers: [TournamentEngineService],
})
export class TournamentEngineModule {}
