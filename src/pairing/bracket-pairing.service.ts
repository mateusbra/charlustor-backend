import { Injectable } from '@nestjs/common';
import type { Pairing } from './swiss-pairing.service.js';

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Classic recursive single-elimination seed order: for size 8 this produces
// [1,8,4,5,2,7,3,6], i.e. the standard 1v8/4v5/2v7/3v6 bracket.
function bracketSeedOrder(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const total = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const seed of seeds) next.push(seed, total - seed);
    seeds = next;
  }
  return seeds;
}

@Injectable()
export class BracketPairingService {
  // participantIds must already be in seed order (best seed first); this
  // feature seeds by registration order since there is no ranking yet (013).
  seedFirstRound(participantIds: string[]): Pairing[] {
    if (participantIds.length === 0) return [];
    // A bracket always has at least 2 slots — 1 participant just gets a bye,
    // not a degenerate size-1 "bracket" (which would leave seeded[i+1] out of bounds).
    const bracketSize = Math.max(2, nextPowerOfTwo(participantIds.length));
    const order = bracketSeedOrder(bracketSize);
    const seeded: (string | null)[] = order.map((seedNumber) => participantIds[seedNumber - 1] ?? null);

    const pairs: Pairing[] = [];
    for (let i = 0; i < seeded.length; i += 2) {
      const a = seeded[i];
      const b = seeded[i + 1] ?? null;
      if (a === null && b === null) continue;
      if (a === null) {
        pairs.push({ participantAId: b as string, participantBId: null });
      } else if (b === null) {
        pairs.push({ participantAId: a, participantBId: null });
      } else {
        pairs.push({ participantAId: a, participantBId: b });
      }
    }
    return pairs;
  }
}
