import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MatchesService } from './matches.service.js';
import { MatchesController } from './matches.controller.js';

@Module({
  imports: [PassportModule.register({})],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
