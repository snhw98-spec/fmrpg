import type { GameDatabase } from '../data/db';
import type { Fixture } from '../domain/competition';
import { DEFAULT_TACTICS, FORMATIONS, type SelectedPlayer, type TeamTactics } from '../domain/match';
import type { MatchResult } from '../domain/match';
import type { PlayerRow } from '../domain/types';
import { pickBestXI } from '../engine/lineup';
import { simulateMatch, type SimulateMatchOptions } from '../engine/matchEngine';
import { createRng, type Rng } from '../engine/rng';

export const SAVE_ID = 'default';

async function tacticsFor(db: GameDatabase, clubId: string): Promise<TeamTactics> {
  const row = await db.tactics.get(clubId);
  return row ?? DEFAULT_TACTICS;
}

export interface MatchPreparation {
  fixture: Fixture;
  homeSquad: PlayerRow[];
  awaySquad: PlayerRow[];
  homeXI: SelectedPlayer[];
  awayXI: SelectedPlayer[];
  homeTactics: TeamTactics;
  awayTactics: TeamTactics;
}

/** Gathers everything simulateMatch needs for a fixture, without running the sim. Exposed
 * so the UI can run its own preview pass (for the half-time reveal) using the exact same
 * inputs the real, db-writing simulation will use. Throws for a bye (no away club) —
 * callers must resolve byes without simulating (see engine/knockout.ts). */
export async function prepareMatch(db: GameDatabase, fixtureId: string): Promise<MatchPreparation> {
  const fixture = await db.fixtures.get(fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId} not found`);
  if (!fixture.awayClubId) throw new Error(`Fixture ${fixtureId} is a bye — nothing to simulate`);
  const awayClubId = fixture.awayClubId;

  const [homeSquad, awaySquad, homeTactics, awayTactics] = await Promise.all([
    db.players.where('clubId').equals(fixture.homeClubId).toArray(),
    db.players.where('clubId').equals(awayClubId).toArray(),
    tacticsFor(db, fixture.homeClubId),
    tacticsFor(db, awayClubId),
  ]);

  return {
    fixture,
    homeSquad,
    awaySquad,
    homeXI: pickBestXI(homeSquad, FORMATIONS[homeTactics.formationId]),
    awayXI: pickBestXI(awaySquad, FORMATIONS[awayTactics.formationId]),
    homeTactics,
    awayTactics,
  };
}

/** The seeded RNG for a fixture — stable across preview and committed simulation, which is
 * what lets the UI show a first-half preview, let the manager choose a team talk, then
 * commit the real result and have the first half match exactly what was shown (see
 * matchEngine's secondHalfTalk doc comment). */
export function matchRng(fixtureId: string): Rng {
  return createRng(`${SAVE_ID}::${fixtureId}`);
}

export function runMatch(prep: MatchPreparation, opts: SimulateMatchOptions = {}): MatchResult {
  const decidesKnockout = prep.fixture.kind !== 'league' ? { decidesKnockout: true } : {};
  return simulateMatch(
    prep.fixture.homeClubId,
    prep.fixture.awayClubId as string,
    prep.homeSquad,
    prep.awaySquad,
    prep.homeXI,
    prep.awayXI,
    prep.homeTactics,
    prep.awayTactics,
    matchRng(prep.fixture.id),
    { ...decidesKnockout, ...opts },
  );
}

/** Simulates one fixture and writes the result; no-ops if already played. */
export async function simulateFixture(
  db: GameDatabase,
  fixtureId: string,
  opts: SimulateMatchOptions = {},
): Promise<MatchResult> {
  const prep = await prepareMatch(db, fixtureId);
  if (prep.fixture.result) return prep.fixture.result;
  const result = runMatch(prep, opts);
  await db.fixtures.update(fixtureId, { result, played: 1 });
  return result;
}

export async function squadFor(db: GameDatabase, clubId: string): Promise<PlayerRow[]> {
  return db.players.where('clubId').equals(clubId).toArray();
}
