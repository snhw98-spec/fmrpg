import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-2');
    expect(a.next()).not.toEqual(b.next());
  });

  it('fork() is deterministic and distinct from the parent', () => {
    const a = createRng('season-1').fork('match-5');
    const b = createRng('season-1').fork('match-5');
    const c = createRng('season-1').fork('match-6');
    expect(a.next()).toEqual(b.next());
    expect(a.next()).not.toEqual(c.next());
  });

  it('int() stays within bounds', () => {
    const rng = createRng('bounds-check');
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});
