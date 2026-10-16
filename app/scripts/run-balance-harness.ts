#!/usr/bin/env node
// Headless balance harness (DESIGN.md §5 / §10): simulates N full Premier League seasons
// and checks league-wide stats against real-world benchmark ranges. Run on demand with
// `npm run balance`, not part of the regular test suite.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TACTICS, FORMATIONS } from '../src/domain/match';
import type { RawClub, RawLeague, RawPlayer } from '../src/domain/raw';
import { pickBestXI } from '../src/engine/lineup';
import { simulateMatch } from '../src/engine/matchEngine';
import { createRng } from '../src/engine/rng';
import { computeTable, generateDoubleRoundRobinFixtures } from '../src/engine/season';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');

const SEASONS = Number(process.argv[2] ?? 10);
const LEAGUE_ID = process.argv[3] ?? 'ENG1';

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf-8')) as T;
}

const leagues = load<RawLeague[]>('leagues.json');
const clubs = load<RawClub[]>('clubs.json');
const players = load<RawPlayer[]>('players.json');

const league = leagues.find((l) => l.id === LEAGUE_ID);
if (!league) throw new Error(`League ${LEAGUE_ID} not found`);

const leagueClubs = clubs.filter((c) => c.leagueId === LEAGUE_ID);
const squadByClub = new Map<string, RawPlayer[]>();
for (const club of leagueClubs) {
  squadByClub.set(club.id, players.filter((p) => p.clubId === club.id));
}

for (const club of leagueClubs) {
  const squad = squadByClub.get(club.id) ?? [];
  if (squad.length < 11) {
    console.warn(`WARNING: ${club.name} has only ${squad.length} players in the dataset`);
  }
}

interface SeasonStats {
  totalGoals: number;
  totalMatches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  championPoints: number;
  bottomPoints: number;
  goalBuckets: Record<string, number>;
}

const formation = FORMATIONS[DEFAULT_TACTICS.formationId];
const xiByClub = new Map(
  leagueClubs.map((c) => [c.id, pickBestXI(squadByClub.get(c.id) ?? [], formation)]),
);

const seasonResults: SeasonStats[] = [];

for (let season = 0; season < SEASONS; season++) {
  const seasonSeed = `balance-${LEAGUE_ID}-s${season}`;
  const fixtures = generateDoubleRoundRobinFixtures(LEAGUE_ID, league.clubIds, new Date('2026-08-15'));

  const stats: SeasonStats = {
    totalGoals: 0,
    totalMatches: 0,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    championPoints: 0,
    bottomPoints: 0,
    goalBuckets: {},
  };

  for (const fixture of fixtures) {
    const homeSquad = squadByClub.get(fixture.homeClubId) ?? [];
    const awaySquad = squadByClub.get(fixture.awayClubId) ?? [];
    const homeXI = xiByClub.get(fixture.homeClubId) ?? [];
    const awayXI = xiByClub.get(fixture.awayClubId) ?? [];
    const rng = createRng(`${seasonSeed}::${fixture.id}`);

    const result = simulateMatch(
      fixture.homeClubId,
      fixture.awayClubId,
      homeSquad,
      awaySquad,
      homeXI,
      awayXI,
      DEFAULT_TACTICS,
      DEFAULT_TACTICS,
      rng,
    );
    fixture.result = result;

    const total = result.home.goals + result.away.goals;
    stats.totalGoals += total;
    stats.totalMatches++;
    const bucket = total >= 6 ? '6+' : String(total);
    stats.goalBuckets[bucket] = (stats.goalBuckets[bucket] ?? 0) + 1;
    if (result.home.goals > result.away.goals) stats.homeWins++;
    else if (result.home.goals < result.away.goals) stats.awayWins++;
    else stats.draws++;
  }

  const table = computeTable(league.clubIds, fixtures);
  stats.championPoints = table[0]?.points ?? 0;
  stats.bottomPoints = table[table.length - 1]?.points ?? 0;
  seasonResults.push(stats);
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const goalsPerGame = avg(seasonResults.map((s) => s.totalGoals / s.totalMatches));
const totalMatches = seasonResults.reduce((a, s) => a + s.totalMatches, 0);
const homeWinPct = (100 * seasonResults.reduce((a, s) => a + s.homeWins, 0)) / totalMatches;
const drawPct = (100 * seasonResults.reduce((a, s) => a + s.draws, 0)) / totalMatches;
const awayWinPct = (100 * seasonResults.reduce((a, s) => a + s.awayWins, 0)) / totalMatches;
const championPoints = avg(seasonResults.map((s) => s.championPoints));
const bottomPoints = avg(seasonResults.map((s) => s.bottomPoints));

const bucketTotals: Record<string, number> = {};
for (const s of seasonResults) {
  for (const [k, v] of Object.entries(s.goalBuckets)) {
    bucketTotals[k] = (bucketTotals[k] ?? 0) + v;
  }
}

interface Check {
  label: string;
  value: number;
  min: number;
  max: number;
}

const checks: Check[] = [
  { label: 'Goals per game', value: goalsPerGame, min: 2.5, max: 2.95 },
  { label: 'Home win %', value: homeWinPct, min: 40, max: 48 },
  { label: 'Draw %', value: drawPct, min: 20, max: 28 },
  { label: 'Away win %', value: awayWinPct, min: 27, max: 35 },
  { label: 'Champion points', value: championPoints, min: 75, max: 100 },
  { label: 'Bottom club points', value: bottomPoints, min: 15, max: 36 },
];

console.log(`\nBalance harness — ${LEAGUE_ID}, ${SEASONS} seasons (${totalMatches} matches)\n`);
let allPass = true;
for (const c of checks) {
  const pass = c.value >= c.min && c.value <= c.max;
  allPass &&= pass;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${c.label.padEnd(20)} ${c.value.toFixed(2).padStart(8)}  (target ${c.min}-${c.max})`,
  );
}

console.log('\nScoreline distribution (total goals per match):');
for (const bucket of ['0', '1', '2', '3', '4', '5', '6+']) {
  const n = bucketTotals[bucket] ?? 0;
  const pct = (100 * n) / totalMatches;
  console.log(`  ${bucket.padStart(2)} goals: ${pct.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(pct))}`);
}

console.log(`\n${allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}\n`);
process.exit(allPass ? 0 : 1);
