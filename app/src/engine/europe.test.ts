import { describe, expect, it } from 'vitest';
import { buildLeaguePhasePairings } from './europe';
import { createRng } from './rng';

function makePots(potCount: number, potSize: number): string[][] {
  return Array.from({ length: potCount }, (_, p) =>
    Array.from({ length: potSize }, (_, i) => `pot${p}-team${i}`),
  );
}

describe('buildLeaguePhasePairings', () => {
  it('UCL shape: every team plays exactly 2 opponents from each of 4 pots (8 total), no duplicates', () => {
    const pots = makePots(4, 9);
    const allTeams = pots.flat();
    const pairings = buildLeaguePhasePairings(pots, 2, createRng('ucl-seed'));

    const opponentsOf = new Map<string, Set<string>>();
    for (const team of allTeams) opponentsOf.set(team, new Set());

    for (const { homeClubId, awayClubId } of pairings) {
      expect(homeClubId).not.toBe(awayClubId);
      opponentsOf.get(homeClubId)!.add(awayClubId);
      opponentsOf.get(awayClubId)!.add(homeClubId);
    }

    for (const team of allTeams) {
      const opponents = opponentsOf.get(team)!;
      expect(opponents.size).toBe(8); // no duplicate pairings collapsed the count
      for (const potIndex of [0, 1, 2, 3]) {
        const pot = new Set(pots[potIndex]);
        const countInPot = [...opponents].filter((o) => pot.has(o)).length;
        expect(countInPot).toBe(2);
      }
    }

    // Every team's total games (home + away) should be 8.
    const gameCount = new Map<string, number>();
    for (const { homeClubId, awayClubId } of pairings) {
      gameCount.set(homeClubId, (gameCount.get(homeClubId) ?? 0) + 1);
      gameCount.set(awayClubId, (gameCount.get(awayClubId) ?? 0) + 1);
    }
    for (const team of allTeams) expect(gameCount.get(team)).toBe(8);
  });

  it('UECL shape: every team plays exactly 1 opponent from each of 6 pots (6 total)', () => {
    const pots = makePots(6, 6);
    const allTeams = pots.flat();
    const pairings = buildLeaguePhasePairings(pots, 1, createRng('uecl-seed'));

    const opponentsOf = new Map<string, Set<string>>();
    for (const team of allTeams) opponentsOf.set(team, new Set());
    for (const { homeClubId, awayClubId } of pairings) {
      opponentsOf.get(homeClubId)!.add(awayClubId);
      opponentsOf.get(awayClubId)!.add(homeClubId);
    }

    for (const team of allTeams) {
      expect(opponentsOf.get(team)!.size).toBe(6);
    }
  });

  it('keeps home/away roughly balanced per team', () => {
    const pots = makePots(4, 9);
    const pairings = buildLeaguePhasePairings(pots, 2, createRng('balance-seed'));
    const home = new Map<string, number>();
    for (const { homeClubId } of pairings) home.set(homeClubId, (home.get(homeClubId) ?? 0) + 1);
    for (const count of home.values()) {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(6);
    }
  });
});
