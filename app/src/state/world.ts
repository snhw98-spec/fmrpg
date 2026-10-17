import type { GameDatabase } from '../data/db';
import type { ResolvedEuropeEntrants } from '../data/import';
import { generateClub, generateSquad } from '../data/generate';
import type { Fixture } from '../domain/competition';
import type { SeasonHistoryRow } from '../domain/competition';
import { DEFAULT_TACTICS, FORMATIONS, type TeamTactics } from '../domain/match';
import type { NamePools, PositionCode, RawLeague } from '../domain/raw';
import type { ClubRow, PlayerRow, SaveSlot } from '../domain/types';
import { simulateBackgroundLeagueTable } from '../engine/background';
import { knockoutWinnerClubId, pairKnockoutRound } from '../engine/knockout';
import { buildLeaguePhasePairings } from '../engine/europe';
import { pickBestXI } from '../engine/lineup';
import { simulateMatch } from '../engine/matchEngine';
import { createRng, type Rng } from '../engine/rng';
import {
  autoPromoted,
  autoRelegated,
  fourClubPlayoffSemis,
  sixClubPlayoffPrelim,
  twoClubPlayoff,
} from '../engine/rollover';
import { computeTable, generateDoubleRoundRobinFixtures, nextAvailableDate, type TableRow } from '../engine/season';
import { matchRng, prepareMatch, runMatch, SAVE_ID } from './actions';

export const CORE_LEAGUE_IDS = ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ITA1', 'ITA2', 'ESP1', 'ESP2', 'GER1', 'GER2'];
export const FIRST_SEASON = '2026-27';

interface CupConfig {
  id: string;
  country: string;
  leagueIds: string[];
  fillerCount: number;
  fillerStrength: number;
  firstRoundMonthDay: string;
  roundSpacingDays: number;
  includeGer3Top4?: boolean;
}

const CUPS: CupConfig[] = [
  { id: 'FA_CUP', country: 'England', leagueIds: ['ENG1', 'ENG2', 'ENG3', 'ENG4'], fillerCount: 16, fillerStrength: 42, firstRoundMonthDay: '08-30', roundSpacingDays: 21 },
  { id: 'EFL_CUP', country: 'England', leagueIds: ['ENG1', 'ENG2', 'ENG3', 'ENG4'], fillerCount: 0, fillerStrength: 0, firstRoundMonthDay: '08-12', roundSpacingDays: 21 },
  { id: 'EFL_TROPHY', country: 'England', leagueIds: ['ENG3', 'ENG4'], fillerCount: 16, fillerStrength: 38, firstRoundMonthDay: '09-02', roundSpacingDays: 21 },
  { id: 'COPPA_ITALIA', country: 'Italy', leagueIds: ['ITA1', 'ITA2'], fillerCount: 4, fillerStrength: 40, firstRoundMonthDay: '08-10', roundSpacingDays: 21 },
  { id: 'COPA_DEL_REY', country: 'Spain', leagueIds: ['ESP1', 'ESP2'], fillerCount: 10, fillerStrength: 38, firstRoundMonthDay: '10-29', roundSpacingDays: 21 },
  { id: 'DFB_POKAL', country: 'Germany', leagueIds: ['GER1', 'GER2'], fillerCount: 24, fillerStrength: 42, firstRoundMonthDay: '08-14', roundSpacingDays: 21, includeGer3Top4: true },
];

/** 2026/27 real UCL league-phase dates (DATA.md); reused for UEL (same weeks) and, for
 * UECL's 6 matchdays, the first 6 of these 8. Shifted by whole years for later seasons. */
const EUROPE_LEAGUE_PHASE_DATES_2026 = [
  '2026-09-08', '2026-10-13', '2026-10-20', '2026-11-03',
  '2026-11-24', '2026-12-08', '2027-01-19', '2027-01-27',
];

function seasonStartYear(season: string): number {
  return Number(season.slice(0, 4));
}

function shiftYear(isoDate: string, deltaYears: number): string {
  const d = new Date(isoDate);
  d.setFullYear(d.getFullYear() + deltaYears);
  return d.toISOString().slice(0, 10);
}

function dateInSeason(season: string, monthDay: string): Date {
  return new Date(`${seasonStartYear(season)}-${monthDay}`);
}

export function previousSeasonLabel(season: string): string {
  const start = seasonStartYear(season);
  const prevStart = start - 1;
  return `${prevStart}-${String((prevStart + 1) % 100).padStart(2, '0')}`;
}

export function nextSeasonLabel(season: string): string {
  const start = seasonStartYear(season);
  const nextStart = start + 1;
  return `${nextStart}-${String((nextStart + 1) % 100).padStart(2, '0')}`;
}

async function allocatePlayerIds(db: GameDatabase, count: number): Promise<number> {
  if (count === 0) return 0;
  const row = await db.kv.get('nextGeneratedPlayerId');
  const current = (row?.value as number | undefined) ?? -2_000_000;
  await db.kv.put({ key: 'nextGeneratedPlayerId', value: current - count });
  return current;
}

async function getNamePools(db: GameDatabase): Promise<NamePools> {
  const row = await db.kv.get('namePools');
  return (row?.value as NamePools | undefined) ?? {};
}

function pickN<T>(arr: T[], n: number, rng: Rng): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

// ---------------------------------------------------------------------------
// Season setup
// ---------------------------------------------------------------------------

/** Days between matchdays so the full double round robin actually fits the league's real
 * season window (DATA.md's startDate/endDate) — a flat 7-day gap works for a 38-matchday,
 * 20-team league but badly overruns a 46-matchday, 24-team one (ENG2/3/4), leaving it still
 * mid-season when the user's own league has long finished and nothing is left to drive its
 * calendar forward. */
function matchdaySpacingDays(league: RawLeague, matchdayCount: number): number {
  const start = new Date(league.startDate).getTime();
  const end = new Date(league.endDate).getTime();
  const gaps = Math.max(1, matchdayCount - 1);
  const days = Math.floor((end - start) / 86400000 / gaps);
  return Math.max(3, days);
}

async function setupCoreLeagues(db: GameDatabase, season: string, leaguesById: Map<string, RawLeague>): Promise<void> {
  const allTactics = await db.tactics.toArray();
  const hasTactics = new Set(allTactics.map((t) => t.clubId));

  for (const id of CORE_LEAGUE_IDS) {
    const league = leaguesById.get(id);
    if (!league) continue;
    const matchdayCount = (league.clubIds.length - 1) * 2;
    const spacing = matchdaySpacingDays(league, matchdayCount);
    const fixtures = generateDoubleRoundRobinFixtures(id, season, league.clubIds, new Date(league.startDate), spacing);
    await db.fixtures.bulkPut(fixtures);

    const missing = league.clubIds.filter((cid) => !hasTactics.has(cid));
    if (missing.length) {
      await db.tactics.bulkPut(missing.map((clubId) => ({ clubId, ...DEFAULT_TACTICS })));
      for (const cid of missing) hasTactics.add(cid);
    }
  }
}

const CUP_FILLER_SQUAD_SIZE = 17;

async function setupCups(db: GameDatabase, season: string, leaguesById: Map<string, RawLeague>, rng: Rng): Promise<void> {
  const namePools = await getNamePools(db);

  for (const cup of CUPS) {
    const entrants: string[] = [];
    for (const lid of cup.leagueIds) {
      const league = leaguesById.get(lid);
      if (league) entrants.push(...league.clubIds);
    }

    if (cup.includeGer3Top4) {
      const prevHistory = await db.seasonHistory.get(previousSeasonLabel(season));
      const ger3Table = prevHistory?.leagueTables['GER3'];
      if (ger3Table && ger3Table.length >= 4) {
        entrants.push(...ger3Table.slice(0, 4).map((r) => r.clubId));
      } else {
        const ger3 = leaguesById.get('GER3');
        if (ger3) entrants.push(...pickN(ger3.clubIds, 4, rng));
      }
    }

    if (cup.fillerCount > 0) {
      const startId = await allocatePlayerIds(db, cup.fillerCount * CUP_FILLER_SQUAD_SIZE);
      let idCursor = startId;
      const fillerClubs: ClubRow[] = [];
      const fillerPlayers: PlayerRow[] = [];
      for (let i = 0; i < cup.fillerCount; i++) {
        const clubId = `${cup.id}-filler-${season}-${i}`;
        const club = generateClub(clubId, 'CUP_FILLER', cup.country, cup.fillerStrength, namePools, rng);
        fillerClubs.push(club);
        const { players } = generateSquad(clubId, cup.country, cup.fillerStrength, namePools, rng, idCursor);
        idCursor -= players.length;
        fillerPlayers.push(...players);
        entrants.push(clubId);
      }
      await db.clubs.bulkPut(fillerClubs);
      await db.players.bulkPut(fillerPlayers);
    }

    const pairs = pairKnockoutRound(entrants, rng.fork(`${cup.id}-r1`));
    const date = nextAvailableDate(dateInSeason(season, cup.firstRoundMonthDay)).toISOString().slice(0, 10);
    const fixtures: Fixture[] = pairs.map((p, i) => ({
      id: `${cup.id}-${season}-r1-${i}`,
      season,
      kind: 'cup',
      competitionId: cup.id,
      round: 1,
      homeClubId: p.homeClubId,
      awayClubId: p.awayClubId,
      date,
      result: null,
      played: p.awayClubId ? 0 : 1, // a bye has nothing to wait for
    }));
    await db.fixtures.bulkPut(fixtures);
  }
}

interface EuropeQualifiers {
  UCL: string[];
  UEL: string[];
  UECL: string[];
}

async function trackedLeagueQualifiers(db: GameDatabase, prevHistory: SeasonHistoryRow | undefined): Promise<EuropeQualifiers> {
  const out: EuropeQualifiers = { UCL: [], UEL: [], UECL: [] };
  if (!prevHistory) return out;
  const leagues = await db.leagues.toArray();
  for (const league of leagues) {
    if (!league.europe) continue;
    const table = prevHistory.leagueTables[league.id];
    if (!table) continue;
    for (const pos of league.europe.UCL ?? []) {
      const c = table[pos - 1]?.clubId;
      if (c) out.UCL.push(c);
    }
    for (const pos of league.europe.UEL ?? []) {
      const c = table[pos - 1]?.clubId;
      if (c) out.UEL.push(c);
    }
    for (const pos of league.europe.UECL ?? []) {
      const c = table[pos - 1]?.clubId;
      if (c) out.UECL.push(c);
    }
    if (league.europe.cupWinnerUEL) {
      const w = prevHistory.cupWinners[league.europe.cupWinnerUEL];
      if (w && !out.UCL.includes(w) && !out.UEL.includes(w)) out.UEL.push(w);
    }
    if (league.europe.leagueCupWinnerUECL) {
      const w = prevHistory.cupWinners[league.europe.leagueCupWinnerUECL];
      if (w && !out.UCL.includes(w) && !out.UEL.includes(w) && !out.UECL.includes(w)) out.UECL.push(w);
    }
  }
  return out;
}

/** Chunks a flat list of 36 clubIds (strongest first) into pots of equal size. */
function chunkIntoPots(clubIds: string[], potCount: number): string[][] {
  const potSize = clubIds.length / potCount;
  const pots: string[][] = [];
  for (let i = 0; i < potCount; i++) {
    pots.push(clubIds.slice(i * potSize, (i + 1) * potSize));
  }
  return pots;
}

async function buildEuropePots(
  db: GameDatabase,
  season: string,
  compId: 'UCL' | 'UEL' | 'UECL',
  usedThisSeason: Set<string>,
): Promise<string[][]> {
  const potCount = compId === 'UECL' ? 6 : 4;
  const potSize = compId === 'UECL' ? 6 : 9;
  const total = potCount * potSize;

  if (season === FIRST_SEASON) {
    const resolved = (await db.kv.get('europeEntrants'))?.value as ResolvedEuropeEntrants | undefined;
    if (resolved) return resolved[compId];
  }

  const prevHistory = await db.seasonHistory.get(previousSeasonLabel(season));
  const qualifiers = await trackedLeagueQualifiers(db, prevHistory);
  const picked = qualifiers[compId].filter((id) => !usedThisSeason.has(id)).slice(0, total);
  for (const id of picked) usedThisSeason.add(id);

  if (picked.length < total) {
    const allClubs = await db.clubs.orderBy('strength').reverse().toArray();
    for (const club of allClubs) {
      if (picked.length >= total) break;
      if (usedThisSeason.has(club.id)) continue;
      picked.push(club.id);
      usedThisSeason.add(club.id);
    }
  }

  const withStrength = await Promise.all(picked.map(async (id) => ({ id, strength: (await db.clubs.get(id))?.strength ?? 50 })));
  withStrength.sort((a, b) => b.strength - a.strength);
  return chunkIntoPots(withStrength.map((w) => w.id), potCount);
}

async function setupEurope(db: GameDatabase, season: string, rng: Rng): Promise<void> {
  const usedThisSeason = new Set<string>();
  const deltaYears = seasonStartYear(season) - seasonStartYear(FIRST_SEASON);
  const dates = EUROPE_LEAGUE_PHASE_DATES_2026.map((d) => shiftYear(d, deltaYears));

  for (const compId of ['UCL', 'UEL', 'UECL'] as const) {
    const pots = await buildEuropePots(db, season, compId, usedThisSeason);
    const perPot = compId === 'UECL' ? 1 : 2;
    const pairings = buildLeaguePhasePairings(pots, perPot, rng.fork(`${compId}-leaguephase`));
    const matchdayCount = compId === 'UECL' ? 6 : 8;

    // Spread pairings evenly across matchdays, one game per club per matchday.
    const gamesPerTeam = new Map<string, number>();
    const byMatchday: Fixture[][] = Array.from({ length: matchdayCount }, () => []);
    for (const pairing of pairings) {
      let md = 0;
      while (md < matchdayCount && (byMatchday[md] as Fixture[]).some(
        (f) => f.homeClubId === pairing.homeClubId || f.awayClubId === pairing.homeClubId
          || f.homeClubId === pairing.awayClubId || f.awayClubId === pairing.awayClubId,
      )) {
        md++;
      }
      if (md === matchdayCount) md = (gamesPerTeam.get(pairing.homeClubId) ?? 0) % matchdayCount;
      (byMatchday[md] as Fixture[]).push({
        id: `${compId}-${season}-lp${md + 1}-${pairing.homeClubId}-${pairing.awayClubId}`,
        season,
        kind: 'europeLeaguePhase',
        competitionId: compId,
        round: md + 1,
        homeClubId: pairing.homeClubId,
        awayClubId: pairing.awayClubId,
        date: nextAvailableDate(new Date(dates[md] ?? dates[dates.length - 1] as string)).toISOString().slice(0, 10),
        result: null,
        played: 0,
      });
      gamesPerTeam.set(pairing.homeClubId, (gamesPerTeam.get(pairing.homeClubId) ?? 0) + 1);
      gamesPerTeam.set(pairing.awayClubId, (gamesPerTeam.get(pairing.awayClubId) ?? 0) + 1);
    }

    await db.fixtures.bulkPut(byMatchday.flat());
  }
}

async function setupBackgroundLeagues(db: GameDatabase, rng: Rng): Promise<Record<string, TableRow[]>> {
  const leagues = await db.leagues.toArray();
  const backgroundLeagues = leagues.filter((l) => l.id === 'GER3' || l.background === 'transferPool');
  const tables: Record<string, TableRow[]> = {};

  for (const league of backgroundLeagues) {
    const squadByClub = new Map<string, PlayerRow[]>();
    for (const clubId of league.clubIds) {
      squadByClub.set(clubId, await db.players.where('clubId').equals(clubId).toArray());
    }
    tables[league.id] = simulateBackgroundLeagueTable(league.clubIds, squadByClub, rng.fork(`bg-${league.id}`));
  }
  return tables;
}

export async function setupSeason(db: GameDatabase, season: string): Promise<void> {
  const leagues = await db.leagues.toArray();
  const leaguesById = new Map(leagues.map((l) => [l.id, l]));
  const rng = createRng(`world::${season}`);

  await setupCoreLeagues(db, season, leaguesById);
  await setupCups(db, season, leaguesById, rng.fork('cups'));
  await setupEurope(db, season, rng.fork('europe'));

  const backgroundTables = await setupBackgroundLeagues(db, rng.fork('background'));
  await db.kv.put({ key: `backgroundTables-${season}`, value: backgroundTables });
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export async function startNewGame(db: GameDatabase, managerClubId: string): Promise<SaveSlot> {
  await setupSeason(db, FIRST_SEASON);
  const managerClub = await db.clubs.get(managerClubId);
  const league = managerClub ? await db.leagues.get(managerClub.leagueId) : undefined;

  const now = new Date().toISOString();
  const save: SaveSlot = {
    id: SAVE_ID,
    name: 'Career',
    createdAt: now,
    updatedAt: now,
    currentDate: league?.startDate ?? `${FIRST_SEASON.slice(0, 4)}-08-01`,
    currentSeason: FIRST_SEASON,
    rngSeed: SAVE_ID,
    managerClubId,
  };
  await db.saves.put(save);
  return save;
}

// ---------------------------------------------------------------------------
// Calendar advancement
// ---------------------------------------------------------------------------

/**
 * Simulates every given fixture in one batch: squads and tactics for every club involved
 * are fetched once (not once per fixture — a club that plays 40 times in a season doesn't
 * need its squad read 40 times), and every result is written inside a single transaction.
 * This is what keeps a full matchday — or a full season, which the headless harness and
 * rollover both need to do in one go — from paying per-fixture round-trip costs. Byes are
 * skipped (already `played: 1` from creation; see season.ts/knockout.ts).
 */
async function resolveFixturesBatch(db: GameDatabase, fixtures: Fixture[]): Promise<void> {
  const toSimulate = fixtures.filter((f) => !f.result && f.awayClubId);
  if (toSimulate.length === 0) return;

  const clubIdSet = new Set(toSimulate.flatMap((f) => [f.homeClubId, f.awayClubId as string]));
  // A plain full-table scan + in-memory filter, not .where('clubId').anyOf(...): anyOf()
  // against a large key set turned out to be pathologically slow (many seconds for ~100
  // clubs against a ~24k-row table) under fake-indexeddb, the harness's test environment —
  // a straight cursor walk sidesteps whatever's wrong with its anyOf() implementation, and
  // costs the same single full-table read regardless of how many distinct clubs are asked
  // for, which only helps as a league's matchday batches get bigger.
  const [allPlayers, allTactics] = await Promise.all([db.players.toArray(), db.tactics.toArray()]);
  const players = allPlayers.filter((p) => clubIdSet.has(p.clubId));
  const tacticsRows = allTactics.filter((t) => clubIdSet.has(t.clubId));

  const squadByClub = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const list = squadByClub.get(p.clubId);
    if (list) list.push(p);
    else squadByClub.set(p.clubId, [p]);
  }
  const tacticsByClub = new Map(tacticsRows.map((t) => [t.clubId, t as TeamTactics]));
  const tacticsFor = (clubId: string) => tacticsByClub.get(clubId) ?? DEFAULT_TACTICS;

  const updatedFixtures = toSimulate.map((fixture) => {
    const awayClubId = fixture.awayClubId as string;
    const homeSquad = squadByClub.get(fixture.homeClubId) ?? [];
    const awaySquad = squadByClub.get(awayClubId) ?? [];
    const homeTactics = tacticsFor(fixture.homeClubId);
    const awayTactics = tacticsFor(awayClubId);
    const homeXI = pickBestXI(homeSquad, FORMATIONS[homeTactics.formationId]);
    const awayXI = pickBestXI(awaySquad, FORMATIONS[awayTactics.formationId]);
    const opts = fixture.kind === 'league' ? {} : { decidesKnockout: true, detailed: false };
    const result = simulateMatch(
      fixture.homeClubId, awayClubId, homeSquad, awaySquad, homeXI, awayXI,
      homeTactics, awayTactics, matchRng(fixture.id), opts,
    );
    return { ...fixture, result, played: 1 as const };
  });

  // One bulkPut, not N sequential .update() calls: even inside a transaction, ~100+
  // individual awaited updates turned out to dominate the whole batch's cost (several
  // seconds) under fake-indexeddb — bulkPut does the same write as a single operation.
  await db.fixtures.bulkPut(updatedFixtures);
}

function winnerOf(f: Fixture): string | null {
  if (!f.awayClubId) return f.homeClubId;
  if (!f.result) return null;
  return knockoutWinnerClubId(f.result);
}

async function progressKnockoutCompetitions(db: GameDatabase, season: string): Promise<void> {
  // 3 plain .equals() queries, not one .anyOf([...]) — anyOf() against this compound index
  // turned out to have real per-key overhead (see resolveFixturesBatch's note above); with
  // only 3 keys it's cheap insurance rather than the dominant cost anyOf was at ~150+ keys.
  const [cupFixtures, europeKnockoutFixtures, playoffFixtures] = await Promise.all([
    db.fixtures.where('[season+kind]').equals([season, 'cup']).toArray(),
    db.fixtures.where('[season+kind]').equals([season, 'europeKnockout']).toArray(),
    db.fixtures.where('[season+kind]').equals([season, 'playoff']).toArray(),
  ]);
  const knockoutFixtures = [...cupFixtures, ...europeKnockoutFixtures, ...playoffFixtures];
  const byCompetition = new Map<string, Fixture[]>();
  for (const f of knockoutFixtures) {
    const list = byCompetition.get(f.competitionId) ?? [];
    list.push(f);
    byCompetition.set(f.competitionId, list);
  }

  for (const [competitionId, fixtures] of byCompetition) {
    const maxRound = Math.max(...fixtures.map((f) => f.round));
    const currentRoundFixtures = fixtures.filter((f) => f.round === maxRound);
    if (currentRoundFixtures.some((f) => f.awayClubId && !f.result)) continue; // round still in progress

    const winners = currentRoundFixtures.map(winnerOf).filter((w): w is string => !!w);
    if (winners.length !== currentRoundFixtures.length) continue;
    if (winners.length <= 1) {
      if (winners.length === 1) {
        await db.knockoutStates.put({
          id: `${competitionId}-${season}`, season, competitionId,
          remainingClubIds: winners, roundsGenerated: maxRound, complete: true, winnerClubId: winners[0],
        });
      }
      continue;
    }

    const lastDate = currentRoundFixtures[0]?.date ?? new Date().toISOString().slice(0, 10);
    const nextDate = nextAvailableDate(new Date(new Date(lastDate).getTime() + 21 * 86400000)).toISOString().slice(0, 10);
    const rng = createRng(`world::${season}::${competitionId}::round${maxRound + 1}`);
    const pairs = pairKnockoutRound(winners, rng);
    const kind = currentRoundFixtures[0]?.kind ?? 'cup';
    const nextFixtures: Fixture[] = pairs.map((p, i) => ({
      id: `${competitionId}-${season}-r${maxRound + 1}-${i}`,
      season,
      kind,
      competitionId,
      round: maxRound + 1,
      homeClubId: p.homeClubId,
      awayClubId: p.awayClubId,
      date: nextDate,
      result: null,
      played: p.awayClubId ? 0 : 1,
    }));
    await db.fixtures.bulkPut(nextFixtures);
  }
}

async function progressEuropeLeaguePhaseToKnockout(db: GameDatabase, season: string): Promise<void> {
  for (const compId of ['UCL', 'UEL', 'UECL'] as const) {
    const compFixtures = await db.fixtures.where('[season+competitionId]').equals([season, compId]).toArray();
    const existingKnockout = compFixtures.filter((f) => f.kind === 'europeKnockout').length;
    if (existingKnockout > 0) continue;

    const leaguePhase = compFixtures.filter((f) => f.kind === 'europeLeaguePhase');
    if (leaguePhase.length === 0) continue;
    if (leaguePhase.some((f) => !f.result)) continue;

    const clubIds = [...new Set(leaguePhase.flatMap((f) => [f.homeClubId, f.awayClubId as string]))];
    const table = computeTable(clubIds, leaguePhase);
    const byeClubs = table.slice(0, 8).map((r) => r.clubId);
    const playoffClubs = table.slice(8, 24).map((r) => r.clubId);
    if (playoffClubs.length === 0) continue;

    const lastDate = leaguePhase[0]?.date ?? new Date().toISOString().slice(0, 10);
    const rng = createRng(`world::${season}::${compId}::playoff`);
    const pairs = pairKnockoutRound(playoffClubs, rng);
    const date = nextAvailableDate(new Date(new Date(lastDate).getTime() + 28 * 86400000)).toISOString().slice(0, 10);
    const playoffFixtures: Fixture[] = pairs.map((p, i) => ({
      id: `${compId}-${season}-playoff-${i}`,
      season,
      kind: 'europeKnockout',
      competitionId: compId,
      round: 1000, // sentinel "playoff" round, below the Ro16+ rounds which start at 1001
      homeClubId: p.homeClubId,
      awayClubId: p.awayClubId,
      date,
      result: null,
      played: p.awayClubId ? 0 : 1,
    }));
    await db.fixtures.bulkPut(playoffFixtures);

    // Byes go straight into the first knockout-proper round alongside playoff winners once
    // the playoff resolves (handled by progressKnockoutCompetitions, which treats round 1000
    // like any other knockout round — except these clubs have no "round 1000 fixture" to
    // resolve. Store them so the Ro16 pairing can include them once playoffs finish.
    await db.kv.put({ key: `europeByes-${season}-${compId}`, value: byeClubs });
  }
}

/** europeKnockout rounds use the generic progressKnockoutCompetitions path except the very
 * first transition (playoff round 1000 -> Ro16 round 1001), which must merge in the pot-1-8
 * byes stored by progressEuropeLeaguePhaseToKnockout. Handled as a special case here, called
 * right after progressKnockoutCompetitions each tick. */
async function mergeEuropeByesIntoRoundOf16(db: GameDatabase, season: string): Promise<void> {
  for (const compId of ['UCL', 'UEL', 'UECL'] as const) {
    const byesRow = await db.kv.get(`europeByes-${season}-${compId}`);
    if (!byesRow) continue;
    const byes = byesRow.value as string[];

    const compFixtures = await db.fixtures.where('[season+competitionId]').equals([season, compId]).toArray();
    const playoffFixtures = compFixtures.filter((f) => f.kind === 'europeKnockout' && f.round === 1000);
    if (playoffFixtures.length === 0 || playoffFixtures.some((f) => !f.result)) continue;

    const alreadyMerged = compFixtures.some((f) => f.kind === 'europeKnockout' && f.round === 1001);
    if (alreadyMerged) continue;

    const playoffWinners = playoffFixtures.map((f) => knockoutWinnerClubId(f.result!));
    const pool = [...byes, ...playoffWinners];
    const rng = createRng(`world::${season}::${compId}::ro16`);
    const pairs = pairKnockoutRound(pool, rng);
    const lastDate = playoffFixtures[0]?.date ?? new Date().toISOString().slice(0, 10);
    const date = nextAvailableDate(new Date(new Date(lastDate).getTime() + 21 * 86400000)).toISOString().slice(0, 10);
    const fixtures: Fixture[] = pairs.map((p, i) => ({
      id: `${compId}-${season}-r1001-${i}`,
      season,
      kind: 'europeKnockout',
      competitionId: compId,
      round: 1001,
      homeClubId: p.homeClubId,
      awayClubId: p.awayClubId,
      date,
      result: null,
      played: p.awayClubId ? 0 : 1,
    }));
    await db.fixtures.bulkPut(fixtures);
    await db.kv.delete(`europeByes-${season}-${compId}`);
  }
}

/** Simulates every due-or-earlier, not-yet-played fixture across every competition, then
 * progresses any knockout competitions whose round just completed — looping until nothing
 * more is due by `targetDate`. This is the one "advance the world" entry point; the UI only
 * ever needs to call it with the manager's next fixture's date. */
export async function advanceWorldTo(db: GameDatabase, season: string, targetDate: string): Promise<void> {
  for (let guard = 0; guard < 60; guard++) {
    // [season+played] keeps this a narrow lookup into just the still-pending fixtures —
    // shrinking as the season goes — rather than a scan of everything ever played.
    const pending = await db.fixtures.where('[season+played]').equals([season, 0]).toArray();
    const due = pending.filter((f) => f.date <= targetDate);
    if (due.length === 0) break;

    await resolveFixturesBatch(db, due);
    await progressEuropeLeaguePhaseToKnockout(db, season);
    await progressKnockoutCompetitions(db, season);
    await mergeEuropeByesIntoRoundOf16(db, season);
  }
}

/** The manager's club's next unplayed fixture this season, across every competition it's
 * still involved in (league always; cup/Europe only while still alive). */
export async function myNextFixture(db: GameDatabase, season: string, clubId: string): Promise<Fixture | null> {
  const pending = await db.fixtures.where('[season+played]').equals([season, 0]).toArray();
  const fixtures = pending.filter((f) => f.homeClubId === clubId || f.awayClubId === clubId);
  if (fixtures.length === 0) return null;
  fixtures.sort((a, b) => a.date.localeCompare(b.date));
  return fixtures[0] as Fixture;
}

// ---------------------------------------------------------------------------
// Rollover
// ---------------------------------------------------------------------------

const SQUAD_POSITIONS: PositionCode[] = ['CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];

async function playSingleMatch(
  db: GameDatabase,
  season: string,
  tag: string,
  homeClubId: string,
  awayClubId: string,
): Promise<string> {
  const id = `${tag}-${season}-${homeClubId}-${awayClubId}`;
  await db.fixtures.put({ id, season, kind: 'playoff', competitionId: tag, round: 1, homeClubId, awayClubId, date: '2027-06-01', result: null, played: 0 });
  const prep = await prepareMatch(db, id);
  const result = runMatch(prep, { decidesKnockout: true, detailed: false });
  await db.fixtures.update(id, { result, played: 1 });
  return knockoutWinnerClubId(result);
}

interface LeagueMovement {
  promoted: string[];
  relegated: string[];
  /** Freshly generated clubs filling OUT_OF_GAME relegation vacancies — kept separate from
   * `promoted` so they're added to this league's own clubIds, not mistaken for clubs that
   * are leaving it (see rolloverToNextSeason's clubIds-recompute pass). */
  replacements: string[];
}

/** Resolves one league's promotion/relegation, including its playoffs (simulated here via
 * playSingleMatch — Milestone 2 simplifies every playoff tie to a single match, see
 * ROADMAP.md). Cross-league ties (GER1 16th vs GER2 3rd) are resolved once and applied to
 * both leagues by the caller. */
async function resolveLeagueMovement(
  db: GameDatabase,
  season: string,
  league: RawLeague,
  table: TableRow[],
  rng: Rng,
): Promise<LeagueMovement> {
  const promoted = [...autoPromoted(table, league.promotion?.auto)];
  const relegated = [...autoRelegated(table, league.relegation?.auto)];

  const playoff = league.promotion?.playoff;
  if (playoff?.positions && playoff.positions.length === 4) {
    const semis = fourClubPlayoffSemis(playoff.positions as [number, number, number, number], table);
    const finalists: string[] = [];
    for (const [a, b] of semis) {
      finalists.push(await playSingleMatch(db, season, `${league.id}-promo-semi`, a, b));
    }
    if (finalists.length === 2) {
      promoted.push(await playSingleMatch(db, season, `${league.id}-promo-final`, finalists[0] as string, finalists[1] as string));
    } else if (finalists.length === 1) {
      promoted.push(finalists[0] as string);
    }
  } else if (playoff?.positions && playoff.positions.length === 6) {
    const { byes, prelim } = sixClubPlayoffPrelim(playoff.positions as [number, number, number, number, number, number], table);
    const prelimWinners: string[] = [];
    for (const [a, b] of prelim) {
      prelimWinners.push(await playSingleMatch(db, season, `${league.id}-promo-prelim`, a, b));
    }
    const semiPairs: [string, string][] = [];
    if (byes[0] && prelimWinners[1]) semiPairs.push([byes[0], prelimWinners[1]]);
    if (byes[1] && prelimWinners[0]) semiPairs.push([byes[1], prelimWinners[0]]);
    const finalists: string[] = [];
    for (const [a, b] of semiPairs) {
      finalists.push(await playSingleMatch(db, season, `${league.id}-promo-semi`, a, b));
    }
    if (finalists.length === 2) {
      promoted.push(await playSingleMatch(db, season, `${league.id}-promo-final`, finalists[0] as string, finalists[1] as string));
    }
  }

  const playout = league.relegation?.playout;
  if (playout) {
    const pair = twoClubPlayoff(playout.positions, table);
    if (pair) {
      const winner = await playSingleMatch(db, season, `${league.id}-playout`, pair[0], pair[1]);
      const loser = winner === pair[0] ? pair[1] : pair[0];
      relegated.push(loser);
    }
  }

  void rng;
  return { promoted, relegated, replacements: [] };
}

export interface RolloverSummary {
  newSeason: string;
  promoted: Record<string, string[]>;
  relegated: Record<string, string[]>;
}

/** Ages every player by moving ageAtStart/dateOfBirth forward isn't needed (age is derived
 * from dateOfBirth + the save's current date at display time) — but contracts and careers
 * do need a pass: expiring contracts auto-renew (simplification: full negotiation is
 * Milestone 4), and older players retire outright, freeing squad slots. Full youth intake
 * replacing them is Milestone 6. */
async function ageSquads(db: GameDatabase, newSeasonStartDate: string): Promise<void> {
  const allPlayers = await db.players.toArray();
  const updatedPlayers: PlayerRow[] = [];
  const retirementIds: number[] = [];

  for (const player of allPlayers) {
    const age = new Date(newSeasonStartDate).getFullYear() - new Date(player.dateOfBirth).getFullYear();
    const retireChance = age >= 38 ? 0.6 : age >= 35 ? 0.22 : age >= 33 ? 0.06 : 0;
    if (retireChance > 0) {
      const roll = createRng(`retire::${player.id}::${newSeasonStartDate}`).next();
      if (roll < retireChance) {
        retirementIds.push(player.id);
        continue;
      }
    }
    if (player.contract.expires <= newSeasonStartDate) {
      const rng = createRng(`renew::${player.id}::${newSeasonStartDate}`);
      updatedPlayers.push({
        ...player,
        contract: {
          ...player.contract,
          expires: `${Number(newSeasonStartDate.slice(0, 4)) + rng.int(1, 3)}-06-30`,
          wageWeeklyEUR: Math.round(player.contract.wageWeeklyEUR * (1 + rng.int(-5, 15) / 100)),
        },
      });
    }
  }

  if (retirementIds.length) await db.players.bulkDelete(retirementIds);
  if (updatedPlayers.length) await db.players.bulkPut(updatedPlayers);
}

/** Clubs relegated to a tier the dataset doesn't model (DATA.md gap #2) leave the game;
 * fresh lightweight clubs are generated to fill the vacancy from below, per DESIGN.md §2. */
async function replaceOutOfGameExits(
  db: GameDatabase,
  season: string,
  leagueId: string,
  outCount: number,
  rng: Rng,
): Promise<string[]> {
  if (outCount <= 0) return [];
  const league = await db.leagues.get(leagueId);
  const namePools = await getNamePools(db);
  const country = league?.country ?? 'England';
  // A freshly-promoted non-league/regional side: weaker than this tier's average, scaled
  // down a little further for lower tiers (tier 4 clubs replacing relegations are weaker
  // than tier 2 clubs doing the same).
  const strength = Math.max(30, 50 - (league?.tier ?? 3) * 3);
  const newClubIds: string[] = [];

  for (let i = 0; i < outCount; i++) {
    const clubId = `${leagueId}-promoted-${season}-${i}`;
    const club = generateClub(clubId, leagueId, country, strength, namePools, rng);
    await db.clubs.put(club);
    const startId = await allocatePlayerIds(db, SQUAD_POSITIONS.length + 2);
    const { players } = generateSquad(clubId, country, strength, namePools, rng, startId);
    await db.players.bulkPut(players);
    newClubIds.push(clubId);
  }
  return newClubIds;
}

/** Ends `currentSeason`, applies promotion/relegation across every tracked league, archives
 * the season, and sets up the new one. The one orchestration function that ties the whole
 * Milestone 2 world together. */
export async function rolloverToNextSeason(db: GameDatabase, currentSeason: string): Promise<RolloverSummary> {
  const rng = createRng(`rollover::${currentSeason}`);
  const leagues = await db.leagues.toArray();
  const leaguesById = new Map(leagues.map((l) => [l.id, l]));

  // The manager's own league finishing (what the Inbox uses to offer "advance to next
  // season") does NOT mean every league has — Serie A's real calendar runs a week past the
  // Premier League's, and Europe's final later still. Force everything caught up to a date
  // safely after the last plausible fixture (UCL's final is in early June) before computing
  // any table, or a late-finishing league's table would be wrong/incomplete here.
  await advanceWorldTo(db, currentSeason, `${seasonStartYear(currentSeason) + 1}-06-20`);

  const leagueTables: Record<string, TableRow[]> = {};
  for (const id of CORE_LEAGUE_IDS) {
    const league = leaguesById.get(id);
    if (!league) continue;
    const fixtures = await db.fixtures.where('[season+competitionId]').equals([currentSeason, id]).toArray();
    leagueTables[id] = computeTable(league.clubIds, fixtures);
  }
  const backgroundTablesRow = await db.kv.get(`backgroundTables-${currentSeason}`);
  const backgroundTables = (backgroundTablesRow?.value as Record<string, TableRow[]> | undefined) ?? {};
  Object.assign(leagueTables, backgroundTables);

  const movements: Record<string, LeagueMovement> = {};
  for (const id of CORE_LEAGUE_IDS) {
    const league = leaguesById.get(id);
    const table = leagueTables[id];
    if (!league || !table || table.length === 0) continue;
    movements[id] = await resolveLeagueMovement(db, currentSeason, league, table, rng.fork(id));
  }

  // GER1<->GER2 playoff is one tie shared by both leagues' rule objects — resolve once.
  const ger1 = leaguesById.get('GER1');
  const ger2Table = leagueTables['GER2'];
  const ger1Table = leagueTables['GER1'];
  if (ger1?.relegation?.playoff?.position !== undefined && ger1Table && ger2Table) {
    const ger1Pos = ger1.relegation.playoff.position;
    const ger2ThirdId = ger2Table[2]?.clubId;
    const ger1BottomId = ger1Table[ger1Pos - 1]?.clubId;
    if (ger2ThirdId && ger1BottomId) {
      const winner = await playSingleMatch(db, currentSeason, 'GER-playoff', ger1BottomId, ger2ThirdId);
      if (winner === ger2ThirdId) {
        movements['GER2']?.promoted.push(ger2ThirdId);
        movements['GER1']?.relegated.push(ger1BottomId);
      }
    }
  }

  // GER3 is background-simulated (not a "core" league), but it still promotes real clubs
  // into GER2 every season (DATA.md: "Simulate in the background so promotion into the
  // 2. Bundesliga uses real clubs"). Handled separately from the CORE_LEAGUE_IDS loop above
  // since GER3 has no `movements[]` entry of its own — its outgoing clubs land directly in
  // GER2's incoming list, tracked here and folded into the clubIds recompute below.
  const extraIncoming: Record<string, string[]> = {};
  const ger3 = leaguesById.get('GER3');
  const ger3Table = leagueTables['GER3'];
  if (ger3 && ger3Table && ger3Table.length >= 3) {
    const ger3AutoPromoted = autoPromoted(ger3Table, ger3.promotion?.auto);
    for (const clubId of ger3AutoPromoted) {
      await db.clubs.update(clubId, { leagueId: 'GER2' });
    }
    extraIncoming['GER2'] = [...ger3AutoPromoted];

    // GER2's own relegation.playoff names which GER2 position (16th) is at stake; GER3's
    // promotion.playoff names which GER3 position (3rd) it's against — same real-world tie,
    // read from both sides like the GER1/GER2 case above.
    const ger2 = leaguesById.get('GER2');
    const ger2Pos = ger2?.relegation?.playoff?.position;
    const ger3Pos = ger3.promotion?.playoff?.position;
    if (ger2Pos !== undefined && ger3Pos !== undefined && ger2Table) {
      const ger2PlayoffId = ger2Table[ger2Pos - 1]?.clubId;
      const ger3PlayoffId = ger3Table[ger3Pos - 1]?.clubId;
      if (ger2PlayoffId && ger3PlayoffId && !ger3AutoPromoted.includes(ger3PlayoffId)) {
        const winner = await playSingleMatch(db, currentSeason, 'GER2-3-playoff', ger2PlayoffId, ger3PlayoffId);
        if (winner === ger3PlayoffId) {
          await db.clubs.update(ger3PlayoffId, { leagueId: 'GER2' });
          extraIncoming['GER2'] = [...extraIncoming['GER2']!, ger3PlayoffId];
          movements['GER2']?.relegated.push(ger2PlayoffId);
          await db.clubs.update(ger2PlayoffId, { leagueId: 'GER3' });
        }
      }
    }
  }

  // Apply movements: swap clubs between adjacent tiers, replacing OUT_OF_GAME exits.
  const promotedRecord: Record<string, string[]> = {};
  const relegatedRecord: Record<string, string[]> = {};
  for (const id of CORE_LEAGUE_IDS) {
    const league = leaguesById.get(id);
    const movement = movements[id];
    if (!league || !movement) continue;
    promotedRecord[id] = movement.promoted;
    relegatedRecord[id] = movement.relegated;

    for (const clubId of movement.promoted) {
      const destId = league.promotion?.to;
      if (destId) await db.clubs.update(clubId, { leagueId: destId });
    }
    for (const clubId of movement.relegated) {
      const destId = league.relegation?.to;
      if (destId) await db.clubs.update(clubId, { leagueId: destId === 'OUT_OF_GAME' ? 'OUT_OF_GAME' : destId });
    }

    if (league.relegation?.to === 'OUT_OF_GAME') {
      const replacements = await replaceOutOfGameExits(db, currentSeason, id, movement.relegated.length, rng.fork(`${id}-replace`));
      movement.replacements = replacements;
      promotedRecord[id] = [...promotedRecord[id], ...replacements];
    }
  }

  // Recompute each league's clubIds from this season's membership + movements.
  for (const id of CORE_LEAGUE_IDS) {
    const league = leaguesById.get(id);
    const movement = movements[id];
    if (!league || !movement) continue;
    const incoming: string[] = [...movement.replacements, ...(extraIncoming[id] ?? [])];
    for (const otherId of CORE_LEAGUE_IDS) {
      const otherLeague = leaguesById.get(otherId);
      const otherMovement = movements[otherId];
      if (!otherLeague || !otherMovement) continue;
      if (otherLeague.promotion?.to === id) incoming.push(...otherMovement.promoted);
      if (otherLeague.relegation?.to === id) incoming.push(...otherMovement.relegated);
    }
    const staying = league.clubIds.filter((c) => !movement.promoted.includes(c) && !movement.relegated.includes(c));
    const nextClubIds = [...staying, ...incoming];
    await db.leagues.update(id, { clubIds: [...new Set(nextClubIds)] });
  }

  // Cup winners this season, for next season's Europe qualification.
  const cupWinners: Record<string, string> = {};
  for (const cup of CUPS) {
    const state = await db.knockoutStates.get(`${cup.id}-${currentSeason}`);
    if (state?.winnerClubId) cupWinners[cup.id] = state.winnerClubId;
  }
  const europeWinners: Record<string, string> = {};
  for (const compId of ['UCL', 'UEL', 'UECL']) {
    const state = await db.knockoutStates.get(`${compId}-${currentSeason}`);
    if (state?.winnerClubId) europeWinners[compId] = state.winnerClubId;
  }

  const history: SeasonHistoryRow = {
    season: currentSeason,
    startedAt: leaguesById.get('ENG1')?.startDate ?? currentSeason,
    endedAt: new Date().toISOString().slice(0, 10),
    leagueTables,
    promotedClubIds: promotedRecord,
    relegatedClubIds: relegatedRecord,
    cupWinners,
    europeWinners,
  };
  await db.seasonHistory.put(history);

  const newSeasonStartDate = `${seasonStartYear(currentSeason) + 1}-07-01`;
  await ageSquads(db, newSeasonStartDate);

  const newSeason = nextSeasonLabel(currentSeason);
  await setupSeason(db, newSeason);

  return { newSeason, promoted: promotedRecord, relegated: relegatedRecord };
}
