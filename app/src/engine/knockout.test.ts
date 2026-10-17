import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { knockoutWinnerClubId, pairKnockoutRound } from './knockout';

describe('pairKnockoutRound', () => {
  it('pairs every club exactly once with no byes for an even count', () => {
    const clubs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const pairs = pairKnockoutRound(clubs, createRng('seed'));
    expect(pairs).toHaveLength(3);
    const used = pairs.flatMap((p) => [p.homeClubId, p.awayClubId]).filter((x): x is string => !!x);
    expect(new Set(used).size).toBe(6);
  });

  it('gives exactly one bye for an odd count', () => {
    const clubs = ['a', 'b', 'c', 'd', 'e'];
    const pairs = pairKnockoutRound(clubs, createRng('seed'));
    const byes = pairs.filter((p) => p.awayClubId === null);
    expect(byes).toHaveLength(1);
    const used = pairs.flatMap((p) => [p.homeClubId, p.awayClubId]).filter((x): x is string => !!x);
    expect(new Set(used).size).toBe(5);
  });
});

describe('knockoutWinnerClubId', () => {
  const base = {
    home: { goals: 0, xg: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, possessionPct: 50 },
    away: { goals: 0, xg: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, possessionPct: 50 },
    scorers: [],
    events: [],
  };

  it('picks the side with more goals', () => {
    const result = { ...base, homeClubId: 'h', awayClubId: 'a', home: { ...base.home, goals: 2 }, away: { ...base.away, goals: 1 } };
    expect(knockoutWinnerClubId(result)).toBe('h');
  });

  it('falls back to penaltyWinner on a draw', () => {
    const result = { ...base, homeClubId: 'h', awayClubId: 'a', penaltyWinner: 'away' as const };
    expect(knockoutWinnerClubId(result)).toBe('a');
  });
});
