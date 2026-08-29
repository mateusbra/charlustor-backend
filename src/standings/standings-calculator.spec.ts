import { describe, expect, it } from 'vitest';
import { calculateStandings } from './standings-calculator.js';

describe('calculateStandings', () => {
  it('awards 3 points for a win and 0 for a loss, ranked by points', () => {
    const rows = calculateStandings(
      ['a', 'b', 'c', 'd'],
      [
        { participantAId: 'a', participantBId: 'b', confirmedScore: '2-1' },
        { participantAId: 'c', participantBId: 'd', confirmedScore: '0-2' },
      ],
    );

    const byId = Object.fromEntries(rows.map((r) => [r.participantId, r]));
    expect(byId.a).toMatchObject({ points: 3, wins: 1, losses: 0 });
    expect(byId.b).toMatchObject({ points: 0, wins: 0, losses: 1 });
    expect(byId.d).toMatchObject({ points: 3, wins: 1, losses: 0 });
    expect(byId.c).toMatchObject({ points: 0, wins: 0, losses: 1 });
  });

  it('treats a bye as a win without counting it as a Buchholz opponent', () => {
    const rows = calculateStandings(
      ['a', 'b'],
      [{ participantAId: 'a', participantBId: null, confirmedScore: 'BYE' }],
    );

    const a = rows.find((r) => r.participantId === 'a')!;
    expect(a.points).toBe(3);
    expect(a.wins).toBe(1);
    expect(a.buchholz).toBe(0);
  });

  it('breaks a points tie using Buchholz (sum of opponents’ points)', () => {
    // a beats b (weak opponent, 0 pts); c beats d (strong opponent that also won its other match)
    const rows = calculateStandings(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { participantAId: 'a', participantBId: 'b', confirmedScore: '2-0' },
        { participantAId: 'c', participantBId: 'd', confirmedScore: '2-0' },
        { participantAId: 'c', participantBId: 'e', confirmedScore: '2-1' },
      ],
    );

    // a: 3 pts, 1 win, opponent b has 0 pts -> buchholz 0
    // c: 6 pts, 2 wins, opponents d(0)+e(0) -> buchholz 0 too in this shape, so use a clearer case below.
    const a = rows.find((r) => r.participantId === 'a')!;
    expect(a.points).toBe(3);

    // Two players with equal points (3), different-strength opponents.
    const rows2 = calculateStandings(
      ['p1', 'p2', 'strong', 'weak', 'x'],
      [
        { participantAId: 'p1', participantBId: 'strong', confirmedScore: '2-1' }, // p1 beats a strong opponent
        { participantAId: 'p2', participantBId: 'weak', confirmedScore: '2-0' }, // p2 beats a weak opponent
        { participantAId: 'strong', participantBId: 'x', confirmedScore: '2-0' }, // strong has another win elsewhere
      ],
    );
    const p1 = rows2.find((r) => r.participantId === 'p1')!;
    const p2 = rows2.find((r) => r.participantId === 'p2')!;
    expect(p1.points).toBe(p2.points); // both 3 points
    expect(p1.buchholz).toBeGreaterThan(p2.buchholz); // p1's opponent (strong) has more points than p2's (weak, 0)
    expect(rows2.findIndex((r) => r.participantId === 'p1')).toBeLessThan(
      rows2.findIndex((r) => r.participantId === 'p2'),
    );
  });

  it('gives a participant with no matches 0 points and 0 Buchholz', () => {
    const rows = calculateStandings(['solo'], []);
    expect(rows).toEqual([{ participantId: 'solo', points: 0, wins: 0, losses: 0, buchholz: 0 }]);
  });
});
