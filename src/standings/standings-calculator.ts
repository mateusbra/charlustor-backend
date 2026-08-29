export type ConfirmedMatch = {
  participantAId: string;
  participantBId: string | null;
  confirmedScore: string;
};

export type StandingsRow = {
  participantId: string;
  points: number;
  wins: number;
  losses: number;
  buchholz: number;
};

const WIN_POINTS = 3;

// Pure — takes confirmed matches only, no I/O. Points: win=3, loss=0 (Master
// Duel is best-of-3, so there's no draw in practice). Byes count as a win but
// aren't a real opponent for Buchholz.
export function calculateStandings(participantIds: string[], matches: ConfirmedMatch[]): StandingsRow[] {
  const points = new Map(participantIds.map((id) => [id, 0]));
  const wins = new Map(participantIds.map((id) => [id, 0]));
  const losses = new Map(participantIds.map((id) => [id, 0]));
  const opponents = new Map<string, string[]>(participantIds.map((id) => [id, []]));

  const addPoints = (id: string, amount: number) => points.set(id, (points.get(id) ?? 0) + amount);
  const addWin = (id: string) => wins.set(id, (wins.get(id) ?? 0) + 1);
  const addLoss = (id: string) => losses.set(id, (losses.get(id) ?? 0) + 1);

  for (const match of matches) {
    if (match.participantBId === null) {
      addPoints(match.participantAId, WIN_POINTS);
      addWin(match.participantAId);
      continue;
    }

    const [scoreA, scoreB] = match.confirmedScore.split('-').map(Number);
    if (scoreA > scoreB) {
      addPoints(match.participantAId, WIN_POINTS);
      addWin(match.participantAId);
      addLoss(match.participantBId);
    } else if (scoreB > scoreA) {
      addPoints(match.participantBId, WIN_POINTS);
      addWin(match.participantBId);
      addLoss(match.participantAId);
    }

    opponents.get(match.participantAId)?.push(match.participantBId);
    opponents.get(match.participantBId)?.push(match.participantAId);
  }

  const rows: StandingsRow[] = participantIds.map((id) => {
    const buchholz = (opponents.get(id) ?? []).reduce((sum, opponentId) => sum + (points.get(opponentId) ?? 0), 0);
    return {
      participantId: id,
      points: points.get(id) ?? 0,
      wins: wins.get(id) ?? 0,
      losses: losses.get(id) ?? 0,
      buchholz,
    };
  });

  rows.sort((a, b) => b.points - a.points || b.buchholz - a.buchholz);
  return rows;
}
