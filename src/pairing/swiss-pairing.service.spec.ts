import { describe, expect, it } from 'vitest';
import { SwissPairingService, type StandingEntry } from './swiss-pairing.service.js';

function standing(id: string, score = 0, hadBye = false): StandingEntry {
  return { participantId: id, score, hadBye };
}

describe('SwissPairingService', () => {
  it('pairs everyone with no leftover when the count is even', () => {
    const service = new SwissPairingService();
    const pairs = service.pairRound([standing('a'), standing('b'), standing('c'), standing('d')]);

    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.participantBId !== null)).toBe(true);
    const paired = pairs.flatMap((p) => [p.participantAId, p.participantBId]);
    expect(new Set(paired).size).toBe(4);
  });

  it('gives exactly one bye when the count is odd', () => {
    const service = new SwissPairingService();
    const pairs = service.pairRound([standing('a'), standing('b'), standing('c')]);

    const byes = pairs.filter((p) => p.participantBId === null);
    expect(byes).toHaveLength(1);
  });

  it('does not give the bye to someone who already had one, when an alternative exists', () => {
    const service = new SwissPairingService();
    const pairs = service.pairRound([standing('a', 0, true), standing('b', 0, false), standing('c', 0, false)]);

    const bye = pairs.find((p) => p.participantBId === null);
    expect(bye?.participantAId).not.toBe('a');
  });

  it('avoids repeating a matchup when an alternative opponent is available', () => {
    const service = new SwissPairingService();
    const previous = new Set(['a|b']);
    const pairs = service.pairRound([standing('a'), standing('b'), standing('c'), standing('d')], previous);

    const rematch = pairs.some(
      (p) => (p.participantAId === 'a' && p.participantBId === 'b') || (p.participantAId === 'b' && p.participantBId === 'a'),
    );
    expect(rematch).toBe(false);
  });

  it('forces a rematch only when genuinely unavoidable', () => {
    const service = new SwissPairingService();
    // Only two players — they've already played, but there's no one else to pair them with.
    const previous = new Set(['a|b']);
    const pairs = service.pairRound([standing('a'), standing('b')], previous);

    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0].participantAId, pairs[0].participantBId])).toEqual(new Set(['a', 'b']));
  });

  it('groups by score, pairing higher scores together first', () => {
    const service = new SwissPairingService();
    const pairs = service.pairRound([standing('a', 3), standing('b', 3), standing('c', 0), standing('d', 0)]);

    const topPair = pairs.find((p) => p.participantAId === 'a' || p.participantBId === 'a');
    expect(new Set([topPair?.participantAId, topPair?.participantBId])).toEqual(new Set(['a', 'b']));
  });
});
