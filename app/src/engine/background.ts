import { DEFAULT_TACTICS, FORMATIONS } from '../domain/match';
import type { PlayerRow } from '../domain/types';
import { pairKnockoutRound } from './knockout';
import { pickBestXI } from './lineup';
import { simulateMatch } from './matchEngine';
import type { Rng } from './rng';
import { computeTable, type TableRow } from './season';

/**
 * Simulates a season for a league the player never watches (the 38 transfer-pool leagues,
 * plus GER3) without persisting individual matches — DESIGN.md's "full simulation
 * everywhere" at a scale where per-match storage/scheduling would be pure waste. Each
 * "round" randomly pairs clubs (one bye if odd) via the same knockout pairing helper rather
 * than a strict round-robin, which sidesteps the real data's occasional odd-sized or
 * single-club "(partial)" leagues entirely. Not a perfect fixture list — just a plausible
 * final table from the same match engine used everywhere else.
 */
export function simulateBackgroundLeagueTable(
  clubIds: string[],
  squadByClub: Map<string, PlayerRow[]>,
  rng: Rng,
): TableRow[] {
  if (clubIds.length < 2) return clubIds.map((id) => emptyRow(id));

  const xiByClub = new Map(
    clubIds.map((id) => [id, pickBestXI(squadByClub.get(id) ?? [], FORMATIONS['4-4-2'])]),
  );
  const roundsCount = Math.min(40, Math.max(2, 2 * (clubIds.length - 1)));

  const inMemoryFixtures: { homeClubId: string; awayClubId: string; result: ReturnType<typeof simulateMatch> }[] = [];

  for (let round = 0; round < roundsCount; round++) {
    const pairs = pairKnockoutRound(clubIds, rng);
    for (const { homeClubId, awayClubId } of pairs) {
      if (!awayClubId) continue;
      const homeSquad = squadByClub.get(homeClubId) ?? [];
      const awaySquad = squadByClub.get(awayClubId) ?? [];
      const result = simulateMatch(
        homeClubId,
        awayClubId,
        homeSquad,
        awaySquad,
        xiByClub.get(homeClubId) ?? [],
        xiByClub.get(awayClubId) ?? [],
        DEFAULT_TACTICS,
        DEFAULT_TACTICS,
        rng,
        { detailed: false },
      );
      inMemoryFixtures.push({ homeClubId, awayClubId, result });
    }
  }

  return computeTable(clubIds, inMemoryFixtures);
}

function emptyRow(clubId: string): TableRow {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
}
