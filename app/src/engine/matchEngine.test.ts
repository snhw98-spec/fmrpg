import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TACTICS, FORMATIONS } from '../domain/match';
import type { RawPlayer } from '../domain/raw';
import { pickBestXI } from './lineup';
import { simulateMatch } from './matchEngine';
import { createRng } from './rng';

const dataDir = join(__dirname, '..', '..', 'public', 'data');
const allPlayers = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf-8')) as RawPlayer[];
const arsenal = allPlayers.filter((p) => p.clubId === 'arsenal');
const chelsea = allPlayers.filter((p) => p.clubId === 'chelsea');

describe('simulateMatch', () => {
  const formation = FORMATIONS['4-3-3'];
  const arsenalXI = pickBestXI(arsenal, formation);
  const chelseaXI = pickBestXI(chelsea, formation);

  it('is deterministic for a given seed', () => {
    const run = () =>
      simulateMatch(
        'arsenal',
        'chelsea',
        arsenal,
        chelsea,
        arsenalXI,
        chelseaXI,
        DEFAULT_TACTICS,
        DEFAULT_TACTICS,
        createRng('fixture-1'),
      );
    const a = run();
    const b = run();
    expect(a.home.goals).toBe(b.home.goals);
    expect(a.away.goals).toBe(b.away.goals);
    expect(a.scorers).toEqual(b.scorers);
  });

  it('produces internally consistent stats', () => {
    const result = simulateMatch(
      'arsenal',
      'chelsea',
      arsenal,
      chelsea,
      arsenalXI,
      chelseaXI,
      DEFAULT_TACTICS,
      DEFAULT_TACTICS,
      createRng('fixture-consistency'),
    );

    expect(result.home.goals).toBe(result.scorers.filter((s) => s.team === 'home').length);
    expect(result.away.goals).toBe(result.scorers.filter((s) => s.team === 'away').length);
    expect(result.home.shots).toBeGreaterThanOrEqual(result.home.shotsOnTarget);
    expect(result.away.shots).toBeGreaterThanOrEqual(result.away.shotsOnTarget);
    expect(result.home.goals).toBeLessThanOrEqual(result.home.shotsOnTarget);
    expect(result.home.possessionPct + result.away.possessionPct).toBe(100);
    expect(result.events[0]?.type).toBe('kickOff');
    expect(result.events[result.events.length - 1]?.type).toBe('fullTime');
  });

  it('keeps the first half identical when a second-half team talk is applied (same seed)', () => {
    const plain = simulateMatch(
      'arsenal', 'chelsea', arsenal, chelsea, arsenalXI, chelseaXI, DEFAULT_TACTICS, DEFAULT_TACTICS,
      createRng('talk-stability'),
    );
    const withTalk = simulateMatch(
      'arsenal', 'chelsea', arsenal, chelsea, arsenalXI, chelseaXI, DEFAULT_TACTICS, DEFAULT_TACTICS,
      createRng('talk-stability'),
      { secondHalfTalk: { side: 'home', multiplier: 1.08 } },
    );

    const halfTimeMinute = plain.events.find((e) => e.type === 'halfTime')?.minute;
    expect(halfTimeMinute).toBeDefined();

    const firstHalfPlain = plain.events.filter((e) => e.minute <= (halfTimeMinute ?? 0));
    const firstHalfWithTalk = withTalk.events.filter((e) => e.minute <= (halfTimeMinute ?? 0));
    expect(firstHalfWithTalk).toEqual(firstHalfPlain);
  });

  it('gives a much stronger side a clear edge in expected goal difference over many matches', () => {
    // Arsenal's full squad vs a weakened Chelsea XI (goalkeepers only) should win heavily.
    const weakChelseaXI = pickBestXI(
      chelsea.filter((p) => Object.prototype.hasOwnProperty.call(p.positions, 'GK') || p.overall < 60),
      formation,
    );

    let totalDiff = 0;
    const N = 15;
    for (let i = 0; i < N; i++) {
      const result = simulateMatch(
        'arsenal',
        'chelsea',
        arsenal,
        chelsea,
        arsenalXI,
        weakChelseaXI,
        DEFAULT_TACTICS,
        DEFAULT_TACTICS,
        createRng(`mismatch-${i}`),
      );
      totalDiff += result.home.goals - result.away.goals;
    }
    expect(totalDiff / N).toBeGreaterThan(1);
  });
});
