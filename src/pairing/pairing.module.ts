import { Module } from '@nestjs/common';
import { SwissPairingService } from './swiss-pairing.service.js';
import { BracketPairingService } from './bracket-pairing.service.js';

@Module({
  providers: [SwissPairingService, BracketPairingService],
  exports: [SwissPairingService, BracketPairingService],
})
export class PairingModule {}
