import { describe, expect, it } from 'vitest';
import type { Fixture } from '../domain/competition';
import { computeTable, generateDoubleRoundRobinFixtures } from './season';

describe('generateDoubleRoundRobinFixtures', () => {
  it('gives every club a home and away fixture against every other club', () => {
    const clubIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fixtures = generateDoubleRoundRobinFixtures('TEST', '2026-27', clubIds, new Date('2026-08-01'));

    expect(fixtures).toHaveLength(clubIds.length * (clubIds.length - 1));

    for (const home of clubIds) {
      for (const away of clubIds) {
        if (home === away) continue;
        expect(fixtures.some((f) => f.homeClubId === home && f.awayClubId === away)).toBe(true);
      }
    }

    // Every club plays exactly once per matchday.
    const matchdays = new Set(fixtures.map((f) => f.round));
    for (const md of matchdays) {
      const teamsThisMatchday = fixtures
        .filter((f) => f.round === md)
        .flatMap((f) => [f.homeClubId, f.awayClubId]);
      expect(new Set(teamsThisMatchday).size).toBe(teamsThisMatchday.length);
      expect(teamsThisMatchday).toHaveLength(clubIds.length);
    }
  });

  it('throws on an odd number of clubs', () => {
    expect(() => generateDoubleRoundRobinFixtures('TEST', '2026-27', ['a', 'b', 'c'], new Date())).toThrow();
  });
});

describe('computeTable', () => {
  it('computes points, goal difference and sort order correctly', () => {
    const fixtures: Fixture[] = [
      {
        id: '1',
        season: '2026-27',
        kind: 'league',
        competitionId: 'TEST',
        round: 1,
        homeClubId: 'a',
        awayClubId: 'b',
        date: '2026-08-01',
        played: 1,
        result: {
          homeClubId: 'a',
          awayClubId: 'b',
          home: { goals: 2, xg: 2, shots: 10, shotsOnTarget: 5, corners: 3, fouls: 2, yellowCards: 0, redCards: 0, possessionPct: 55 },
          away: { goals: 0, xg: 1, shots: 8, shotsOnTarget: 2, corners: 2, fouls: 3, yellowCards: 1, redCards: 0, possessionPct: 45 },
          scorers: [],
          events: [],
        },
      },
      {
        id: '2',
        season: '2026-27',
        kind: 'league',
        competitionId: 'TEST',
        round: 2,
        homeClubId: 'b',
        awayClubId: 'a',
        date: '2026-08-08',
        played: 1,
        result: {
          homeClubId: 'b',
          awayClubId: 'a',
          home: { goals: 1, xg: 1, shots: 9, shotsOnTarget: 3, corners: 4, fouls: 1, yellowCards: 0, redCards: 0, possessionPct: 48 },
          away: { goals: 1, xg: 1.2, shots: 11, shotsOnTarget: 4, corners: 5, fouls: 2, yellowCards: 0, redCards: 0, possessionPct: 52 },
          scorers: [],
          events: [],
        },
      },
    ];

    const table = computeTable(['a', 'b'], fixtures);
    const a = table.find((r) => r.clubId === 'a')!;
    const b = table.find((r) => r.clubId === 'b')!;

    expect(a.points).toBe(4);
    expect(a.won).toBe(1);
    expect(a.drawn).toBe(1);
    expect(a.goalDifference).toBe(2);
    expect(b.points).toBe(1);
    expect(b.lost).toBe(1);
    expect(b.drawn).toBe(1);
    expect(table[0]?.clubId).toBe('a');
  });
});
