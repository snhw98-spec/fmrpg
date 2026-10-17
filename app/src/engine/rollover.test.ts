import { describe, expect, it } from 'vitest';
import type { TableRow } from './season';
import { autoPromoted, autoRelegated, fourClubPlayoffSemis, sixClubPlayoffPrelim, twoClubPlayoff } from './rollover';

function makeTable(n: number): TableRow[] {
  return Array.from({ length: n }, (_, i) => ({
    clubId: `club-${i + 1}`,
    played: 38,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: n - i,
  }));
}

describe('rollover position helpers', () => {
  const table = makeTable(24);

  it('autoPromoted takes the top N', () => {
    expect(autoPromoted(table, 2)).toEqual(['club-1', 'club-2']);
  });

  it('autoRelegated takes the bottom N', () => {
    expect(autoRelegated(table, 3)).toEqual(['club-22', 'club-23', 'club-24']);
  });

  it('fourClubPlayoffSemis pairs 3v6 and 4v5', () => {
    expect(fourClubPlayoffSemis([3, 4, 5, 6], table)).toEqual([
      ['club-3', 'club-6'],
      ['club-4', 'club-5'],
    ]);
  });

  it('sixClubPlayoffPrelim gives byes to 3rd/4th and pairs 5v8, 6v7', () => {
    const result = sixClubPlayoffPrelim([3, 4, 5, 6, 7, 8], table);
    expect(result.byes).toEqual(['club-3', 'club-4']);
    expect(result.prelim).toEqual([
      ['club-5', 'club-8'],
      ['club-6', 'club-7'],
    ]);
  });

  it('twoClubPlayoff returns the pair at the given positions', () => {
    expect(twoClubPlayoff([16, 17], table)).toEqual(['club-16', 'club-17']);
  });
});
