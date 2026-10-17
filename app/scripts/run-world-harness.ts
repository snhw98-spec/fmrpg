#!/usr/bin/env node
// Headless world-lifecycle harness: plays out a full multi-league, multi-competition season
// and rolls it over into a second one, asserting structural correctness throughout. This is
// Milestone 2's equivalent of the balance harness — the system under test (import -> season
// setup -> calendar advance -> rollover) is too slow and too IndexedDB-dependent for a fast
// unit test, so it runs on demand via `npm run test:world`, as a plain script against
// fake-indexeddb (same approach as the balance harness, just with a real Dexie underneath
// instead of pure in-memory structures — see DESIGN.md §10).
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSaveDatabase, type GameDatabase } from '../src/data/db';
import { importWorldIfNeeded } from '../src/data/import';
import { CORE_LEAGUE_IDS, advanceWorldTo, myNextFixture, rolloverToNextSeason, startNewGame } from '../src/state/world';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('/data/')) {
    const filePath = join(dataDir, url.replace('/data/', ''));
    return new Response(readFileSync(filePath, 'utf-8'), { status: 200 });
  }
  return originalFetch(input);
}) as typeof fetch;

const MANAGER_CLUB_ID = 'arsenal';
let passCount = 0;
let failCount = 0;

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    console.log(`PASS  ${label}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    passCount++;
  } catch (err) {
    console.log(`FAIL  ${label}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    console.error(err);
    failCount++;
  }
}

async function freshSave(id: string): Promise<{ db: GameDatabase; save: Awaited<ReturnType<typeof startNewGame>> }> {
  const db = openSaveDatabase(id);
  await db.open();
  await importWorldIfNeeded(db);
  const save = await startNewGame(db, MANAGER_CLUB_ID);
  return { db, save };
}

/** Advances the manager's club through every remaining fixture this season. Returns the
 * number of fixtures played (a sanity signal — a real season is ~55-60 for a top-flight
 * club across league + cups + Europe). */
async function playOutSeason(db: GameDatabase, season: string): Promise<number> {
  let fixture = await myNextFixture(db, season, MANAGER_CLUB_ID);
  let count = 0;
  const guardMax = 80;
  while (fixture && count < guardMax) {
    await advanceWorldTo(db, season, fixture.date);
    const updated = await db.fixtures.get(fixture.id);
    assert.ok(updated?.result, `fixture ${fixture.id} has no result after advancing to its date`);
    fixture = await myNextFixture(db, season, MANAGER_CLUB_ID);
    count++;
  }
  assert.ok(count < guardMax, `hit the ${guardMax}-fixture safety guard — something isn't resolving`);
  assert.strictEqual(fixture, null, 'season ended with a fixture still pending');
  return count;
}

async function main() {
  await check('season setup: every core league, cup and Europe competition scheduled', async () => {
    const { db, save } = await freshSave('world-harness-1');
    assert.strictEqual(save.currentSeason, '2026-27');

    for (const leagueId of CORE_LEAGUE_IDS) {
      const league = await db.leagues.get(leagueId);
      assert.ok(league, `league ${leagueId} missing`);
      const count = await db.fixtures.where('[season+competitionId]').equals(['2026-27', leagueId]).count();
      assert.strictEqual(count, league!.clubIds.length * (league!.clubIds.length - 1), `${leagueId} fixture count`);
    }

    const cupCount = await db.fixtures.where('[season+kind]').equals(['2026-27', 'cup']).count();
    assert.ok(cupCount > 0, 'no cup fixtures generated');

    for (const compId of ['UCL', 'UEL', 'UECL']) {
      const compFixtures = await db.fixtures.where('[season+competitionId]').equals(['2026-27', compId]).toArray();
      const count = compFixtures.filter((f) => f.kind === 'europeLeaguePhase').length;
      assert.ok(count > 0, `${compId} has no league-phase fixtures`);
    }
    db.close();
  });

  await check('plays a full season for the manager\'s club without stalling', async () => {
    const { db, save } = await freshSave('world-harness-2');
    const played = await playOutSeason(db, save.currentSeason);
    console.log(`      (${played} fixtures played for ${MANAGER_CLUB_ID})`);

    // Other leagues' real calendars don't all end on the same date as the manager's own
    // (Serie A's real season runs a week past the Premier League's, for instance) — so
    // "the manager's season is over" catches everything up to roughly that point, not
    // necessarily every last fixture of every league. A late-finishing league's last
    // matchday or two can still be outstanding here; rolloverToNextSeason force-completes
    // everything before computing tables (checked explicitly in the next test). What this
    // check guards against is genuine stalling — a league barely progressing at all.
    for (const leagueId of CORE_LEAGUE_IDS) {
      const leagueFixtures = await db.fixtures.where('[season+competitionId]').equals([save.currentSeason, leagueId]).toArray();
      const resolved = leagueFixtures.filter((f) => f.result).length;
      const pct = resolved / leagueFixtures.length;
      assert.ok(pct > 0.85, `${leagueId} is only ${(pct * 100).toFixed(0)}% resolved at season end — looks stalled`);
    }
    db.close();
  });

  await check('rolls over into a second season with correct promotion/relegation movement', async () => {
    const { db, save } = await freshSave('world-harness-3');
    await playOutSeason(db, save.currentSeason);

    const beforeCounts = new Map<string, number>();
    for (const id of CORE_LEAGUE_IDS) beforeCounts.set(id, (await db.leagues.get(id))!.clubIds.length);

    const summary = await rolloverToNextSeason(db, save.currentSeason);
    assert.strictEqual(summary.newSeason, '2027-28');

    const history = await db.seasonHistory.get('2026-27');
    assert.ok(history, 'no SeasonHistory record written');
    assert.strictEqual(history!.leagueTables['ENG1']?.length, 20, 'ENG1 table should have 20 rows');

    for (const id of CORE_LEAGUE_IDS) {
      const league = await db.leagues.get(id);
      assert.strictEqual(league!.clubIds.length, beforeCounts.get(id), `${id} club count changed across rollover`);
      assert.strictEqual(new Set(league!.clubIds).size, league!.clubIds.length, `${id} has duplicate clubIds`);
    }

    const eng1Table = history!.leagueTables['ENG1']!;
    const relegated = eng1Table.slice(-3).map((r) => r.clubId);
    const newEng1 = await db.leagues.get('ENG1');
    for (const clubId of relegated) {
      assert.ok(!newEng1!.clubIds.includes(clubId), `${clubId} should have been relegated out of ENG1`);
    }

    const newSeasonFixtureCount = await db.fixtures.where('[season+competitionId]').equals(['2027-28', 'ENG1']).count();
    assert.ok(newSeasonFixtureCount > 0, 'new season has no ENG1 fixtures');
    db.close();
  });

  console.log(`\n${failCount === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} (${passCount} passed, ${failCount} failed)\n`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('FATAL', err);
  process.exit(1);
});
