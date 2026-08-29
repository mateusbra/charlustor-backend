import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { DecksService } from './decks.service.js';
import { DecksController } from './decks.controller.js';
import { DeckRecognitionService } from './deck-recognition.service.js';
import { CardLookupService } from './card-lookup.service.js';

@Module({
  imports: [PassportModule.register({})],
  controllers: [DecksController],
  providers: [DecksService, DeckRecognitionService, CardLookupService],
})
export class DecksModule {}
