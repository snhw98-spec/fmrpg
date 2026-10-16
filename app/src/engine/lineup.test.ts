import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../domain/match';
import type { RawPlayer } from '../domain/raw';
import { pickBestXI } from './lineup';

const dataDir = join(__dirname, '..', '..', 'public', 'data');
const allPlayers = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf-8')) as RawPlayer[];
const arsenalSquad = allPlayers.filter((p) => p.clubId === 'arsenal');

describe('pickBestXI', () => {
  it('selects 11 unique players covering every formation slot for a real squad', () => {
    const xi = pickBestXI(arsenalSquad, FORMATIONS['4-3-3']);
    expect(xi).toHaveLength(11);
    expect(new Set(xi.map((s) => s.playerId)).size).toBe(11);
    expect(xi.filter((s) => s.position === 'GK')).toHaveLength(1);
  });

  it('picks a recognized goalkeeper for the GK slot', () => {
    const xi = pickBestXI(arsenalSquad, FORMATIONS['4-3-3']);
    const gkSelection = xi.find((s) => s.position === 'GK')!;
    const gkPlayer = arsenalSquad.find((p) => p.id === gkSelection.playerId)!;
    expect(Object.prototype.hasOwnProperty.call(gkPlayer.positions, 'GK')).toBe(true);
  });
});
