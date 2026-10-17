import type { MatchResult } from '../domain/match';
import type { Rng } from './rng';

export interface KnockoutPairing {
  homeClubId: string;
  /** null = a bye this round (walkover straight to the next round). */
  awayClubId: string | null;
}

/**
 * Pairs clubs for one knockout round. Seeded-random, not bracket-seeded by strength —
 * Milestone 2 keeps cup/playoff draws unseeded for simplicity (a real seeded draw can come
 * later without changing anything downstream, since the engine only cares about pairings).
 * An odd count gets one bye, picked randomly each round.
 */
export function pairKnockoutRound(clubIds: string[], rng: Rng): KnockoutPairing[] {
  const shuffled = [...clubIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = shuffled[i] as string;
    shuffled[i] = shuffled[j] as string;
    shuffled[j] = tmp;
  }

  const pairs: KnockoutPairing[] = [];
  let i = 0;
  while (i + 1 < shuffled.length) {
    pairs.push({ homeClubId: shuffled[i] as string, awayClubId: shuffled[i + 1] as string });
    i += 2;
  }
  if (i < shuffled.length) {
    pairs.push({ homeClubId: shuffled[i] as string, awayClubId: null });
  }
  return pairs;
}

/** The advancing club from a played knockout fixture (simulateMatch must have been called
 * with { decidesKnockout: true } so a draw carries a penaltyWinner). */
export function knockoutWinnerClubId(result: MatchResult): string {
  if (result.home.goals !== result.away.goals) {
    return result.home.goals > result.away.goals ? result.homeClubId : result.awayClubId;
  }
  return result.penaltyWinner === 'away' ? result.awayClubId : result.homeClubId;
}
