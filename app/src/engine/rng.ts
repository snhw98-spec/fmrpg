// Deterministic seeded RNG (mulberry32 + a string-seed hash). Every random draw in the
// engine goes through an Rng instance so results are reproducible from a seed + inputs,
// per DESIGN.md §1.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p (0-1). */
  chance(p: number): boolean;
  /** Pick a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Standard-normal-ish sample via sum of uniforms (cheap, good enough for attribute noise). */
  gaussian(mean: number, stdDev: number): number;
  /** Fork a derived, independent-looking Rng (e.g. per-match from a season seed). */
  fork(label: string): Rng;
}

function hashStringToUint32(s: string): number {
  // xmur3-ish string hash
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Mulberry32Rng implements Rng {
  private draw: () => number;
  private readonly seedString: string;

  constructor(seedString: string) {
    this.seedString = seedString;
    this.draw = mulberry32(hashStringToUint32(seedString));
  }

  next(): number {
    return this.draw();
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick() on empty array');
    return arr[this.int(0, arr.length - 1)] as T;
  }

  gaussian(mean: number, stdDev: number): number {
    // Box-Muller
    const u1 = Math.max(this.next(), 1e-12);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  fork(label: string): Rng {
    return new Mulberry32Rng(`${this.seedString}::${label}`);
  }
}

export function createRng(seed: string): Rng {
  return new Mulberry32Rng(seed);
}
