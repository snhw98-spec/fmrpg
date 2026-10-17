import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawPlayer } from '../domain/raw';
import { simulateBackgroundLeagueTable } from './background';
import { createRng } from './rng';

const dataDir = join(__dirname, '..', '..', 'public', 'data');
const allPlayers = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf-8')) as RawPlayer[];

describe('simulateBackgroundLeagueTable', () => {
  it('produces a complete table for an odd number of clubs', () => {
    const clubIds = ['arsenal', 'chelsea', 'liverpool'];
    const squadByClub = new Map(clubIds.map((id) => [id, allPlayers.filter((p) => p.clubId === id)]));
    const table = simulateBackgroundLeagueTable(clubIds, squadByClub, createRng('bg-seed'));
    expect(table).toHaveLength(3);
    expect(table.every((r) => r.played > 0)).toBe(true);
    expect(table.reduce((a, r) => a + r.won + r.lost + r.drawn, 0)).toBe(table.reduce((a, r) => a + r.played, 0));
  });

  it('handles a single-club "league" without crashing', () => {
    const table = simulateBackgroundLeagueTable(['arsenal'], new Map(), createRng('bg-seed-2'));
    expect(table).toHaveLength(1);
    expect(table[0]?.played).toBe(0);
  });
});
