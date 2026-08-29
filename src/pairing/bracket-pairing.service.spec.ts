import { describe, expect, it } from 'vitest';
import { BracketPairingService } from './bracket-pairing.service.js';

describe('BracketPairingService', () => {
  it('seeds a power-of-2 bracket (4) as 1v4, 2v3', () => {
    const service = new BracketPairingService();
    const pairs = service.seedFirstRound(['p1', 'p2', 'p3', 'p4']);

    expect(pairs).toEqual([
      { participantAId: 'p1', participantBId: 'p4' },
      { participantAId: 'p2', participantBId: 'p3' },
    ]);
  });

  it('seeds a power-of-2 bracket (8) as 1v8, 4v5, 2v7, 3v6', () => {
    const service = new BracketPairingService();
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const pairs = service.seedFirstRound(ids);

    expect(pairs).toEqual([
      { participantAId: 'p1', participantBId: 'p8' },
      { participantAId: 'p4', participantBId: 'p5' },
      { participantAId: 'p2', participantBId: 'p7' },
      { participantAId: 'p3', participantBId: 'p6' },
    ]);
  });

  it('gives byes to the top seeds when the size is not a power of 2 (5 -> bracket of 8)', () => {
    const service = new BracketPairingService();
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const pairs = service.seedFirstRound(ids);

    const byes = pairs.filter((p) => p.participantBId === null);
    expect(byes).toHaveLength(3);
    // seed 1 (p1) always gets a bye in a non-power-of-2 bracket.
    expect(byes.some((p) => p.participantAId === 'p1')).toBe(true);
  });

  it('handles a single participant without an out-of-bounds bye', () => {
    const service = new BracketPairingService();
    const pairs = service.seedFirstRound(['solo']);

    expect(pairs).toEqual([{ participantAId: 'solo', participantBId: null }]);
  });

  it('returns nothing for an empty participant list', () => {
    const service = new BracketPairingService();
    expect(service.seedFirstRound([])).toEqual([]);
  });
});
