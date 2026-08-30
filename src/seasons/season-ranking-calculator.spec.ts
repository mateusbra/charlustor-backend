import { describe, expect, it } from 'vitest';
import { calculateTournamentPlacements, PLACEMENT_POINTS } from './season-ranking-calculator.js';

describe('calculateTournamentPlacements — no bracket (plain SWISS)', () => {
  it('assigns points from Swiss standings order', () => {
    const points = calculateTournamentPlacements({
      participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'],
      swissStandingOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'],
      bracketRounds: [],
    });

    expect(points.get('p1')).toBe(PLACEMENT_POINTS.FIRST);
    expect(points.get('p2')).toBe(PLACEMENT_POINTS.SECOND);
    expect(points.get('p3')).toBe(PLACEMENT_POINTS.THIRD_FOURTH);
    expect(points.get('p4')).toBe(PLACEMENT_POINTS.THIRD_FOURTH);
    expect(points.get('p5')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
    expect(points.get('p8')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
    expect(points.get('p9')).toBe(PLACEMENT_POINTS.PARTICIPATION);
  });
});

describe('calculateTournamentPlacements — bracket (Top Cut / elimination)', () => {
  it('assigns 1st/2nd/3rd-4th/5th-8th tiers by walking the bracket back from the final', () => {
    // 8-player bracket: quarters (r1) -> semis (r2) -> final (r3)
    const bracketRounds = [
      {
        number: 1,
        matches: [
          { participantAId: 'p1', participantBId: 'p8', confirmedScore: '2-0' },
          { participantAId: 'p4', participantBId: 'p5', confirmedScore: '2-1' },
          { participantAId: 'p3', participantBId: 'p6', confirmedScore: '2-0' },
          { participantAId: 'p2', participantBId: 'p7', confirmedScore: '2-1' },
        ],
      },
      {
        number: 2,
        matches: [
          { participantAId: 'p1', participantBId: 'p4', confirmedScore: '2-0' },
          { participantAId: 'p3', participantBId: 'p2', confirmedScore: '1-2' },
        ],
      },
      {
        number: 3,
        matches: [{ participantAId: 'p1', participantBId: 'p2', confirmedScore: '2-1' }],
      },
    ];

    const points = calculateTournamentPlacements({
      participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      swissStandingOrder: [],
      bracketRounds,
    });

    expect(points.get('p1')).toBe(PLACEMENT_POINTS.FIRST);
    expect(points.get('p2')).toBe(PLACEMENT_POINTS.SECOND);
    expect(points.get('p4')).toBe(PLACEMENT_POINTS.THIRD_FOURTH);
    expect(points.get('p3')).toBe(PLACEMENT_POINTS.THIRD_FOURTH);
    expect(points.get('p8')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
    expect(points.get('p5')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
    expect(points.get('p6')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
    expect(points.get('p7')).toBe(PLACEMENT_POINTS.FIFTH_EIGHTH);
  });

  it('gives participants who never entered the bracket the participation tier', () => {
    const bracketRounds = [{ number: 1, matches: [{ participantAId: 'p1', participantBId: 'p2', confirmedScore: '2-0' }] }];

    const points = calculateTournamentPlacements({
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      swissStandingOrder: [],
      bracketRounds,
    });

    expect(points.get('p1')).toBe(PLACEMENT_POINTS.FIRST);
    expect(points.get('p2')).toBe(PLACEMENT_POINTS.SECOND);
    expect(points.get('p3')).toBe(PLACEMENT_POINTS.PARTICIPATION);
    expect(points.get('p4')).toBe(PLACEMENT_POINTS.PARTICIPATION);
  });

  it('assigns the flat "other Top Cut" tier to rounds eliminated before the quarterfinals', () => {
    // 16-player bracket: round of 16 (r1) is 2 rounds before the final (r3 here is semis, r4 final)
    const bracketRounds = [
      {
        number: 1,
        matches: [
          { participantAId: 'p1', participantBId: 'p16', confirmedScore: '2-0' },
          { participantAId: 'p8', participantBId: 'p9', confirmedScore: '2-0' },
          { participantAId: 'p4', participantBId: 'p13', confirmedScore: '2-0' },
          { participantAId: 'p5', participantBId: 'p12', confirmedScore: '2-0' },
          { participantAId: 'p3', participantBId: 'p14', confirmedScore: '2-0' },
          { participantAId: 'p6', participantBId: 'p11', confirmedScore: '2-0' },
          { participantAId: 'p2', participantBId: 'p15', confirmedScore: '2-0' },
          { participantAId: 'p7', participantBId: 'p10', confirmedScore: '2-0' },
        ],
      },
      {
        number: 2,
        matches: [
          { participantAId: 'p1', participantBId: 'p8', confirmedScore: '2-0' },
          { participantAId: 'p4', participantBId: 'p5', confirmedScore: '2-0' },
          { participantAId: 'p3', participantBId: 'p6', confirmedScore: '2-0' },
          { participantAId: 'p2', participantBId: 'p7', confirmedScore: '2-0' },
        ],
      },
      {
        number: 3,
        matches: [
          { participantAId: 'p1', participantBId: 'p4', confirmedScore: '2-0' },
          { participantAId: 'p3', participantBId: 'p2', confirmedScore: '2-0' },
        ],
      },
      {
        number: 4,
        matches: [{ participantAId: 'p1', participantBId: 'p3', confirmedScore: '2-0' }],
      },
    ];

    const points = calculateTournamentPlacements({
      participantIds: Array.from({ length: 16 }, (_, i) => `p${i + 1}`),
      swissStandingOrder: [],
      bracketRounds,
    });

    expect(points.get('p16')).toBe(PLACEMENT_POINTS.OTHER_TOP_CUT);
    expect(points.get('p9')).toBe(PLACEMENT_POINTS.OTHER_TOP_CUT);
  });

  it('does not break on a bye (no loser to score)', () => {
    const bracketRounds = [
      {
        number: 1,
        matches: [
          { participantAId: 'p1', participantBId: null, confirmedScore: 'BYE' },
          { participantAId: 'p2', participantBId: 'p3', confirmedScore: '2-0' },
        ],
      },
      {
        number: 2,
        matches: [{ participantAId: 'p1', participantBId: 'p2', confirmedScore: '2-1' }],
      },
    ];

    const points = calculateTournamentPlacements({
      participantIds: ['p1', 'p2', 'p3'],
      swissStandingOrder: [],
      bracketRounds,
    });

    expect(points.get('p1')).toBe(PLACEMENT_POINTS.FIRST);
    expect(points.get('p2')).toBe(PLACEMENT_POINTS.SECOND);
    expect(points.get('p3')).toBe(PLACEMENT_POINTS.THIRD_FOURTH);
  });
});
