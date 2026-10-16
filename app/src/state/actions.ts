import type { GameDatabase } from '../data/db';
import { DEFAULT_TACTICS, FORMATIONS, type SelectedPlayer, type TeamTactics } from '../domain/match';
import type { Fixture, MatchResult } from '../domain/match';
import type { PlayerRow, SaveSlot } from '../domain/types';
import { pickBestXI } from '../engine/lineup';
import { simulateMatch, type SimulateMatchOptions } from '../engine/matchEngine';
import { createRng, type Rng } from '../engine/rng';
import { generateDoubleRoundRobinFixtures } from '../engine/season';

export const SAVE_ID = 'default';
export const PLAYABLE_LEAGUE_ID = 'ENG1';

export async function startNewGame(db: GameDatabase, managerClubId: string): Promise<SaveSlot> {
  const league = await db.leagues.get(PLAYABLE_LEAGUE_ID);
  if (!league) throw new Error('Premier League data missing — world import did not complete');

  const startDate = league.startDate;
  const fixtures = generateDoubleRoundRobinFixtures(PLAYABLE_LEAGUE_ID, league.clubIds, new Date(startDate));
  await db.fixtures.bulkPut(fixtures);
  await db.tactics.bulkPut(league.clubIds.map((clubId) => ({ clubId, ...DEFAULT_TACTICS })));

  const now = new Date().toISOString();
  const save: SaveSlot = {
    id: SAVE_ID,
    name: 'Career',
    createdAt: now,
    updatedAt: now,
    currentDate: startDate,
    rngSeed: SAVE_ID,
    managerClubId,
  };
  await db.saves.put(save);
  return save;
}

/** The lowest matchday with at least one unplayed fixture, or null if the season is over. */
export function currentMatchday(fixtures: { matchday: number; result: unknown }[]): number | null {
  const unplayed = fixtures.filter((f) => !f.result);
  if (unplayed.length === 0) return null;
  return Math.min(...unplayed.map((f) => f.matchday));
}

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
 * inputs the real, db-writing simulation will use. */
export async function prepareMatch(db: GameDatabase, fixtureId: string): Promise<MatchPreparation> {
  const fixture = await db.fixtures.get(fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId} not found`);

  const [homeSquad, awaySquad, homeTactics, awayTactics] = await Promise.all([
    db.players.where('clubId').equals(fixture.homeClubId).toArray(),
    db.players.where('clubId').equals(fixture.awayClubId).toArray(),
    tacticsFor(db, fixture.homeClubId),
    tacticsFor(db, fixture.awayClubId),
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
  return simulateMatch(
    prep.fixture.homeClubId,
    prep.fixture.awayClubId,
    prep.homeSquad,
    prep.awaySquad,
    prep.homeXI,
    prep.awayXI,
    prep.homeTactics,
    prep.awayTactics,
    matchRng(prep.fixture.id),
    opts,
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
  await db.fixtures.update(fixtureId, { result });
  return result;
}

export async function squadFor(db: GameDatabase, clubId: string): Promise<PlayerRow[]> {
  return db.players.where('clubId').equals(clubId).toArray();
}

/** Simulates every other fixture in a matchday (i.e. not the manager's club), used right
 * after the manager's own match so the whole league advances together. */
export async function simulateRestOfMatchday(
  db: GameDatabase,
  matchday: number,
  managerClubId: string,
): Promise<void> {
  const fixtures = await db.fixtures.where('matchday').equals(matchday).toArray();
  for (const fixture of fixtures) {
    if (fixture.result) continue;
    if (fixture.homeClubId === managerClubId || fixture.awayClubId === managerClubId) continue;
    await simulateFixture(db, fixture.id);
  }
}

export async function advanceDateToMatchday(db: GameDatabase, matchday: number): Promise<void> {
  const fixtures = await db.fixtures.where('matchday').equals(matchday).toArray();
  const date = fixtures[0]?.date;
  if (!date) return;
  await db.saves.update(SAVE_ID, { currentDate: date, updatedAt: new Date().toISOString() });
}
