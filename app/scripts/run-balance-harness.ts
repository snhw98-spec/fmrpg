#!/usr/bin/env node
// Headless balance harness (DESIGN.md §5 / §10): simulates N full seasons per league and
// checks league-wide stats against real-world benchmark ranges. Run on demand with
// `npm run balance [seasons] [leagueId|all]`, not part of the regular test suite.
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
const LEAGUE_ARG = process.argv[3] ?? 'all';

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf-8')) as T;
}

const leagues = load<RawLeague[]>('leagues.json');
const clubs = load<RawClub[]>('clubs.json');
const players = load<RawPlayer[]>('players.json');

const PLAYABLE_LEAGUE_IDS = ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ITA1', 'ITA2', 'ESP1', 'ESP2', 'GER1', 'GER2'];
const leagueIdsToRun = LEAGUE_ARG === 'all' ? PLAYABLE_LEAGUE_IDS : LEAGUE_ARG.split(',');

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

interface Check {
  label: string;
  value: number;
  min: number;
  max: number;
}

function runLeague(leagueId: string, seasons: number): Check[] | null {
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) {
    console.warn(`League ${leagueId} not found — skipping`);
    return null;
  }

  const leagueClubs = clubs.filter((c) => c.leagueId === leagueId);
  const squadByClub = new Map<string, RawPlayer[]>();
  for (const club of leagueClubs) {
    squadByClub.set(club.id, players.filter((p) => p.clubId === club.id));
  }
  for (const club of leagueClubs) {
    const squad = squadByClub.get(club.id) ?? [];
    if (squad.length < 11) {
      console.warn(`WARNING: ${club.name} (${leagueId}) has only ${squad.length} players in the dataset`);
    }
  }

  const formation = FORMATIONS[DEFAULT_TACTICS.formationId];
  const xiByClub = new Map(leagueClubs.map((c) => [c.id, pickBestXI(squadByClub.get(c.id) ?? [], formation)]));

  const seasonResults: SeasonStats[] = [];

  for (let season = 0; season < seasons; season++) {
    const seasonSeed = `balance-${leagueId}-s${season}`;
    const fixtures = generateDoubleRoundRobinFixtures(leagueId, seasonSeed, league.clubIds, new Date('2026-08-15'));

    const stats: SeasonStats = {
      totalGoals: 0, totalMatches: 0, homeWins: 0, draws: 0, awayWins: 0,
      championPoints: 0, bottomPoints: 0, goalBuckets: {},
    };

    for (const fixture of fixtures) {
      const homeSquad = squadByClub.get(fixture.homeClubId) ?? [];
      const awaySquad = squadByClub.get(fixture.awayClubId as string) ?? [];
      const homeXI = xiByClub.get(fixture.homeClubId) ?? [];
      const awayXI = xiByClub.get(fixture.awayClubId as string) ?? [];
      const rng = createRng(`${seasonSeed}::${fixture.id}`);

      const result = simulateMatch(
        fixture.homeClubId, fixture.awayClubId as string, homeSquad, awaySquad, homeXI, awayXI,
        DEFAULT_TACTICS, DEFAULT_TACTICS, rng,
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

  const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
  const totalMatches = seasonResults.reduce((a, s) => a + s.totalMatches, 0);
  const goalsPerGame = avg(seasonResults.map((s) => s.totalGoals / s.totalMatches));
  const homeWinPct = (100 * seasonResults.reduce((a, s) => a + s.homeWins, 0)) / totalMatches;
  const drawPct = (100 * seasonResults.reduce((a, s) => a + s.draws, 0)) / totalMatches;
  const awayWinPct = (100 * seasonResults.reduce((a, s) => a + s.awayWins, 0)) / totalMatches;
  const championPoints = avg(seasonResults.map((s) => s.championPoints));
  const bottomPoints = avg(seasonResults.map((s) => s.bottomPoints));

  // Deliberately wide ranges — these cover the Premier League through League Two /
  // LaLiga Hypermotion, which have genuinely different scoring/competitiveness profiles.
  // Per-league-tuned bands would be more precise but aren't worth the upkeep for a spot
  // check; the point is "no league has gone statistically haywire."
  return [
    { label: 'Goals per game', value: goalsPerGame, min: 2.2, max: 3.2 },
    { label: 'Home win %', value: homeWinPct, min: 36, max: 50 },
    { label: 'Draw %', value: drawPct, min: 18, max: 30 },
    { label: 'Away win %', value: awayWinPct, min: 24, max: 38 },
    { label: 'Champion points', value: championPoints, min: 65, max: 102 },
    { label: 'Bottom club points', value: bottomPoints, min: 10, max: 40 },
  ];
}

let allPass = true;
for (const leagueId of leagueIdsToRun) {
  const checks = runLeague(leagueId, SEASONS);
  if (!checks) {
    allPass = false;
    continue;
  }
  console.log(`\n${leagueId} — ${SEASONS} seasons`);
  for (const c of checks) {
    const pass = c.value >= c.min && c.value <= c.max;
    allPass &&= pass;
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${c.label.padEnd(20)} ${c.value.toFixed(2).padStart(8)}  (target ${c.min}-${c.max})`);
  }
}

console.log(`\n${allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}\n`);
process.exit(allPass ? 0 : 1);
