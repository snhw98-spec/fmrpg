import type { CompetitionKind, Fixture } from '../domain/competition';

/**
 * Standard circle-method round robin. clubIds.length must be even. Returns one round
 * (n-1 matchdays, each club plays once) as [homeIdx, awayIdx] pairs per matchday; the
 * caller mirrors it for the second round with home/away swapped.
 */
function roundRobinPairs(n: number): [number, number][][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  const rounds: [number, number][][] = [];
  const fixed = ids[0] as number;
  let rest = ids.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    const left = [fixed, ...rest.slice(0, rest.length / 2)];
    const right = [...rest.slice(rest.length / 2)].reverse();
    for (let i = 0; i < left.length; i++) {
      const a = left[i] as number;
      const b = right[i] as number;
      // Alternate which side is "home" across rounds so no team gets a long home/away run.
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rest = [rest[rest.length - 1] as number, ...rest.slice(0, rest.length - 1)];
  }
  return rounds;
}

/** 2026/27 FIFA international windows, approximate. League/cup matchdays are pushed past
 * these (DESIGN.md: "International breaks pause league/cup scheduling without pausing the
 * calendar"). */
export const INTERNATIONAL_BREAKS: [string, string][] = [
  ['2026-09-01', '2026-09-09'],
  ['2026-10-05', '2026-10-13'],
  ['2026-11-09', '2026-11-17'],
  ['2027-03-16', '2027-03-24'],
];

function inBreak(dateStr: string, breaks: [string, string][]): boolean {
  return breaks.some(([start, end]) => dateStr >= start && dateStr <= end);
}

/** Nudges a date forward a week at a time until it's clear of every international break. */
export function nextAvailableDate(date: Date, breaks: [string, string][] = INTERNATIONAL_BREAKS): Date {
  const d = new Date(date);
  let guard = 0;
  while (inBreak(d.toISOString().slice(0, 10), breaks) && guard < 10) {
    d.setDate(d.getDate() + 7);
    guard++;
  }
  return d;
}

export function generateDoubleRoundRobinFixtures(
  competitionId: string,
  season: string,
  clubIds: string[],
  startDate: Date,
  daysBetweenMatchdays = 7,
): Fixture[] {
  if (clubIds.length % 2 !== 0) {
    throw new Error(`generateDoubleRoundRobinFixtures: club count must be even, got ${clubIds.length}`);
  }
  const n = clubIds.length;
  const firstLeg = roundRobinPairs(n);
  const secondLeg = firstLeg.map((pairs) => pairs.map(([a, b]) => [b, a] as [number, number]));
  const allRounds = [...firstLeg, ...secondLeg];

  const fixtures: Fixture[] = [];
  let matchday = 1;
  for (const round of allRounds) {
    const raw = new Date(startDate);
    raw.setDate(raw.getDate() + (matchday - 1) * daysBetweenMatchdays);
    const dateStr = nextAvailableDate(raw).toISOString().slice(0, 10);
    for (const [homeIdx, awayIdx] of round) {
      fixtures.push({
        id: `${competitionId}-${season}-md${matchday}-${clubIds[homeIdx]}-${clubIds[awayIdx]}`,
        season,
        kind: 'league',
        competitionId,
        round: matchday,
        homeClubId: clubIds[homeIdx] as string,
        awayClubId: clubIds[awayIdx] as string,
        date: dateStr,
        result: null,
        played: 0,
      });
    }
    matchday++;
  }
  return fixtures;
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function computeTable(clubIds: string[], fixtures: readonly Pick<Fixture, 'homeClubId' | 'awayClubId' | 'result'>[]): TableRow[] {
  const rows = new Map<string, TableRow>(
    clubIds.map((id) => [
      id,
      { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    ]),
  );

  for (const fixture of fixtures) {
    if (!fixture.result || !fixture.awayClubId) continue;
    const home = rows.get(fixture.homeClubId);
    const away = rows.get(fixture.awayClubId);
    if (!home || !away) continue;
    const hg = fixture.result.home.goals;
    const ag = fixture.result.away.goals;

    home.played++;
    away.played++;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (hg < ag) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
  );
}

/** The lowest round (of the given kind) with at least one unplayed fixture in this
 * competition/season, or null if that stage is complete. */
export function currentRound(fixtures: readonly Pick<Fixture, 'round' | 'result'>[]): number | null {
  const unplayed = fixtures.filter((f) => !f.result);
  if (unplayed.length === 0) return null;
  return Math.min(...unplayed.map((f) => f.round));
}

export type { CompetitionKind, Fixture };
