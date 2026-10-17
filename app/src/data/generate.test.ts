import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../domain/match';
import type { NamePools } from '../domain/raw';
import { pickBestXI } from '../engine/lineup';
import { createRng } from '../engine/rng';
import { generateClub, generateSquad } from './generate';

const dataDir = join(__dirname, '..', '..', 'public', 'data');
const namePools = JSON.parse(readFileSync(join(dataDir, 'name_pools.json'), 'utf-8')) as NamePools;

describe('generateSquad', () => {
  it('produces a squad pickBestXI can build a full 11 from', () => {
    const { players } = generateSquad('gen-club', 'England', 55, namePools, createRng('seed'), -1);
    expect(players.length).toBeGreaterThanOrEqual(17);
    const xi = pickBestXI(players, FORMATIONS['4-3-3']);
    expect(xi).toHaveLength(11);
    expect(xi.filter((s) => s.position === 'GK')).toHaveLength(1);
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
  });
});

describe('generateClub', () => {
  it('produces a club with a plausible name', () => {
    const club = generateClub('gen-club-1', 'ENG4', 'England', 50, namePools, createRng('seed'));
    expect(club.name.length).toBeGreaterThan(2);
    expect(club.generated).toBe(true);
    expect(club.leagueId).toBe('ENG4');
  });
});
