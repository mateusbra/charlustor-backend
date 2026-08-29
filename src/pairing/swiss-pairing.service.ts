import { Injectable } from '@nestjs/common';

export type StandingEntry = { participantId: string; score: number; hadBye: boolean };
export type Pairing = { participantAId: string; participantBId: string | null };

function matchupKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

// Greedy Swiss pairing — not the full Dutch system used in official chess
// tournaments, but sufficient for the scale of a weekly Master Duel event.
@Injectable()
export class SwissPairingService {
  pairRound(standings: StandingEntry[], previousMatchups: ReadonlySet<string> = new Set()): Pairing[] {
    const sorted = [...standings].sort((a, b) => b.score - a.score);

    let pool = sorted;
    let byePlayer: StandingEntry | null = null;
    if (sorted.length % 2 === 1) {
      let byeIndex = -1;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (!sorted[i].hadBye) {
          byeIndex = i;
          break;
        }
      }
      if (byeIndex === -1) byeIndex = sorted.length - 1;
      byePlayer = sorted[byeIndex];
      pool = sorted.filter((_, i) => i !== byeIndex);
    }

    const used = new Set<string>();
    const pairs: Pairing[] = [];

    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      if (used.has(a.participantId)) continue;

      let opponent: StandingEntry | null = null;
      for (let j = i + 1; j < pool.length; j++) {
        const candidate = pool[j];
        if (used.has(candidate.participantId)) continue;
        if (!previousMatchups.has(matchupKey(a.participantId, candidate.participantId))) {
          opponent = candidate;
          break;
        }
      }
      // No rematch-free opponent left — forced to repeat a matchup.
      if (!opponent) {
        for (let j = i + 1; j < pool.length; j++) {
          const candidate = pool[j];
          if (!used.has(candidate.participantId)) {
            opponent = candidate;
            break;
          }
        }
      }

      if (opponent) {
        used.add(a.participantId);
        used.add(opponent.participantId);
        pairs.push({ participantAId: a.participantId, participantBId: opponent.participantId });
      }
    }

    if (byePlayer) pairs.push({ participantAId: byePlayer.participantId, participantBId: null });

    return pairs;
  }
}
