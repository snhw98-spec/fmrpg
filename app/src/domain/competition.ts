import type { MatchResult } from './match';
import type { TableRow } from '../engine/season';

export type CompetitionKind = 'league' | 'cup' | 'playoff' | 'europeLeaguePhase' | 'europeKnockout' | 'oneOff';

/**
 * A single match, in any competition. Generalizes Milestone 1's league-only Fixture so the
 * same engine/UI code (simulateFixture, MatchScreen, ...) handles league, cup, playoff and
 * European matches uniformly. `competitionId` is a leagueId ('ENG1'), cupId ('FA_CUP'), a
 * europe competition id ('UCL'), a synthetic playoff id (`${leagueId}-promotion-playoff`),
 * or a synthetic one-off id (`COMMUNITY_SHIELD`-style curtain raisers).
 */
export interface Fixture {
  id: string;
  season: string;
  kind: CompetitionKind;
  competitionId: string;
  /** League matchday, cup/playoff round index, or Europe league-phase matchday. */
  round: number;
  roundLabel?: string;
  homeClubId: string;
  /** null = a bye (walkover) in a knockout round. */
  awayClubId: string | null;
  date: string;
  result: MatchResult | null;
  /** Mirrors `result !== null` (a bye counts as played immediately). Indexed redundantly
   * because IndexedDB can't efficiently query "result is null" directly — every write that
   * sets `result` must set this too. See db.ts's `[season+played]` compound index. */
  played: 0 | 1;
}

/** Tracks a knockout competition's progress across rounds within a season. */
export interface KnockoutStateRow {
  id: string;
  season: string;
  competitionId: string;
  /** Clubs still alive, in seed order, used to pair the next round once the current one resolves. */
  remainingClubIds: string[];
  /** Round index of the last round that's been generated (fixtures for it exist). */
  roundsGenerated: number;
  complete: boolean;
  winnerClubId?: string;
}

/** A league-phase-style table (Europe's single 36-team table) — same shape as a league table
 * so the engine/season.ts computeTable logic can be reused unchanged. */
export type { TableRow };

export interface EuropeStateRow {
  id: string;
  season: string;
  competitionId: 'UCL' | 'UEL' | 'UECL';
  /** The 36 clubIds in the league phase, including generated stand-ins for missing real clubs. */
  clubIds: string[];
  leaguePhaseComplete: boolean;
}

export interface SeasonHistoryRow {
  season: string;
  startedAt: string;
  endedAt: string;
  leagueTables: Record<string, TableRow[]>;
  promotedClubIds: Record<string, string[]>;
  relegatedClubIds: Record<string, string[]>;
  cupWinners: Record<string, string>;
  europeWinners: Record<string, string>;
}

/** Lightweight generated club for relegation-replacement / cup-filler / missing-Europe slots.
 * Not a full citizen of the world the way a real dataset club is — no finances/stadium. */
export interface GeneratedClubMeta {
  id: string;
  generated: true;
  reason: 'relegationReplacement' | 'cupFiller' | 'europeStandIn';
}
