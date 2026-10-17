import type { TableRow } from './season';

function clubAt(table: TableRow[], position1Indexed: number): string | undefined {
  return table[position1Indexed - 1]?.clubId;
}

/** Table positions 1..auto (1-indexed), i.e. the automatic promotion/qualification spots. */
export function autoPromoted(table: TableRow[], auto: number | undefined): string[] {
  if (!auto) return [];
  return table.slice(0, auto).map((r) => r.clubId);
}

/** Table positions (teams - auto + 1)..teams, i.e. the automatic relegation spots. */
export function autoRelegated(table: TableRow[], auto: number | undefined): string[] {
  if (!auto) return [];
  return table.slice(table.length - auto).map((r) => r.clubId);
}

/** The standard 4-club promotion playoff shape used by ENG2/ENG3/ENG4/ESP2: seed[0] hosts
 * seed[3], seed[1] hosts seed[2] (so positions [3,4,5,6] pairs as 3v6 and 4v5). */
export function fourClubPlayoffSemis(positions: [number, number, number, number], table: TableRow[]): [string, string][] {
  const [p1, p2, p3, p4] = positions;
  const a = clubAt(table, p1);
  const b = clubAt(table, p2);
  const c = clubAt(table, p3);
  const d = clubAt(table, p4);
  const pairs: [string, string][] = [];
  if (a && d) pairs.push([a, d]);
  if (b && c) pairs.push([b, c]);
  return pairs;
}

/** Serie B's 6-club playoff: positions[0..1] (3rd/4th) get byes to the semis; positions[2..5]
 * (5th-8th) play a preliminary round (5v8, 6v7) for the right to face them. */
export function sixClubPlayoffPrelim(
  positions: [number, number, number, number, number, number],
  table: TableRow[],
): { byes: string[]; prelim: [string, string][] } {
  const [p1, p2, p3, p4, p5, p6] = positions;
  const byes = [clubAt(table, p1), clubAt(table, p2)].filter((x): x is string => !!x);
  const prelim: [string, string][] = [];
  const a = clubAt(table, p3);
  const b = clubAt(table, p6);
  const c = clubAt(table, p4);
  const d = clubAt(table, p5);
  if (a && b) prelim.push([a, b]);
  if (c && d) prelim.push([c, d]);
  return { byes, prelim };
}

/** A 2-club relegation/promotion decider between two specific table positions (used for
 * Serie B's 16th-vs-17th playout, and generically wherever one's needed). Returns
 * [higherSeedClubId, lowerSeedClubId] — caller decides who "wins" by winning the match. */
export function twoClubPlayoff(positions: [number, number], table: TableRow[]): [string, string] | null {
  const a = clubAt(table, positions[0]);
  const b = clubAt(table, positions[1]);
  return a && b ? [a, b] : null;
}
