export type BracketMatch = {
  participantAId: string;
  participantBId: string | null;
  confirmedScore: string | null;
};

export type BracketRound = {
  number: number;
  matches: BracketMatch[];
};

export const PLACEMENT_POINTS = {
  FIRST: 10,
  SECOND: 7,
  THIRD_FOURTH: 5,
  FIFTH_EIGHTH: 3,
  OTHER_TOP_CUT: 2,
  PARTICIPATION: 1,
} as const;

function winnerOf(match: BracketMatch): string {
  if (match.participantBId === null) return match.participantAId;
  const [scoreA, scoreB] = (match.confirmedScore ?? '0-0').split('-').map(Number);
  return scoreA >= scoreB ? match.participantAId : match.participantBId;
}

// A bye has no opponent to have lost to.
function loserOf(match: BracketMatch): string | null {
  if (match.participantBId === null) return null;
  const winner = winnerOf(match);
  return winner === match.participantAId ? match.participantBId : match.participantAId;
}

function pointsForStandingRank(rank: number): number {
  if (rank === 1) return PLACEMENT_POINTS.FIRST;
  if (rank === 2) return PLACEMENT_POINTS.SECOND;
  if (rank <= 4) return PLACEMENT_POINTS.THIRD_FOURTH;
  if (rank <= 8) return PLACEMENT_POINTS.FIFTH_EIGHTH;
  return PLACEMENT_POINTS.PARTICIPATION;
}

// Pure — computes each participant's final-placement points for one
// tournament. With no bracket rounds (a plain SWISS tournament), placement
// falls back to Swiss standings order. With bracket rounds (Top Cut, or a
// straight SINGLE_ELIM/DOUBLE_ELIM bracket), placement is derived by walking
// rounds from the final backwards: the final's winner/loser take 1st/2nd,
// the round before that's losers take 3rd-4th, the round before that's
// losers take 5th-8th, and anyone eliminated earlier takes the flat
// "other Top Cut" tier. Anyone who never played a bracket round at all
// (didn't make the cut) takes the "participation" tier.
export function calculateTournamentPlacements(params: {
  participantIds: string[];
  swissStandingOrder: string[];
  bracketRounds: BracketRound[];
}): Map<string, number> {
  const { participantIds, swissStandingOrder, bracketRounds } = params;
  const points = new Map<string, number>();

  if (bracketRounds.length === 0) {
    swissStandingOrder.forEach((participantId, index) => {
      points.set(participantId, pointsForStandingRank(index + 1));
    });
    return points;
  }

  const sorted = [...bracketRounds].sort((a, b) => a.number - b.number);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const distanceFromFinal = sorted.length - 1 - i;
    for (const match of sorted[i].matches) {
      if (distanceFromFinal === 0) {
        points.set(winnerOf(match), PLACEMENT_POINTS.FIRST);
        const loser = loserOf(match);
        if (loser) points.set(loser, PLACEMENT_POINTS.SECOND);
        continue;
      }

      const loser = loserOf(match);
      if (!loser) continue;
      const tierPoints =
        distanceFromFinal === 1
          ? PLACEMENT_POINTS.THIRD_FOURTH
          : distanceFromFinal === 2
            ? PLACEMENT_POINTS.FIFTH_EIGHTH
            : PLACEMENT_POINTS.OTHER_TOP_CUT;
      points.set(loser, tierPoints);
    }
  }

  for (const participantId of participantIds) {
    if (!points.has(participantId)) points.set(participantId, PLACEMENT_POINTS.PARTICIPATION);
  }

  return points;
}
