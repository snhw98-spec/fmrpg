import type { Rng } from './rng';

export interface EuropePairing {
  homeClubId: string;
  awayClubId: string;
}

/** A simple (no self-loops, no parallel edges) k-regular graph on one pot, via a circulant
 * construction: each node connects to the nodes `distance` steps away in each direction.
 * k=1 needs an even-sized pot (distance = size/2, a perfect matching); k=2 works for any
 * size >= 5 with any distance in [1, floor(size/2)) (excluding exactly size/2, which would
 * collapse the two directions into one neighbour). Milestone 2 only ever calls this with
 * k=1 (UECL, 6-team pots) or k=2 (UCL/UEL, 9-team pots), both satisfied by the pots in
 * europe.json — this isn't a general k-regular-graph solver.
 */
function samePotPairs(pot: string[], perPot: number, rng: Rng): [string, string][] {
  const n = pot.length;
  const pairs: [string, string][] = [];
  if (perPot === 1) {
    if (n % 2 !== 0) throw new Error(`samePotPairs: perPot=1 needs an even pot size, got ${n}`);
    const half = n / 2;
    for (let k = 0; k < half; k++) {
      pairs.push([pot[k] as string, pot[k + half] as string]);
    }
    return pairs;
  }
  if (perPot === 2) {
    const maxDistance = Math.floor(n / 2);
    if (maxDistance < 1 || (n % 2 === 0 && maxDistance === n / 2 && maxDistance < 1)) {
      throw new Error(`samePotPairs: perPot=2 needs a pot size of at least 5, got ${n}`);
    }
    const distance = rng.int(1, Math.max(1, maxDistance - (n % 2 === 0 ? 1 : 0)));
    for (let k = 0; k < n; k++) {
      const other = (k + distance) % n;
      if (other > k) pairs.push([pot[k] as string, pot[other] as string]);
      else pairs.push([pot[other] as string, pot[k] as string]);
    }
    // de-dupe (can happen if n is even and distance*2 === n, guarded against above, but keep it safe)
    const seen = new Set<string>();
    return pairs.filter(([a, b]) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  throw new Error(`samePotPairs: unsupported perPot ${perPot}`);
}

/** A perPot-regular bipartite graph between two equal-size pots, via `perPot` distinct
 * cyclic-shift permutations (each shift is itself a bijection, and distinct shifts can never
 * produce the same pair for the same node, so this can't create duplicate edges). */
function crossPotPairs(potA: string[], potB: string[], perPot: number, rng: Rng): [string, string][] {
  const n = potA.length;
  if (potB.length !== n) throw new Error('crossPotPairs: pots must be equal size');
  const shifts = new Set<number>();
  while (shifts.size < perPot) shifts.add(rng.int(0, n - 1));

  const pairs: [string, string][] = [];
  for (const shift of shifts) {
    for (let k = 0; k < n; k++) {
      pairs.push([potA[k] as string, potB[(k + shift) % n] as string]);
    }
  }
  return pairs;
}

/**
 * Builds the pot-structured league-phase schedule (DESIGN.md §7 / europe.json's "2 from
 * each pot for UCL/UEL, 1 from each of 6 pots for UECL" rule): every team plays `perPot`
 * opponents from every pot, including its own, with a roughly balanced home/away split.
 */
export function buildLeaguePhasePairings(pots: string[][], perPot: number, rng: Rng): EuropePairing[] {
  const undirected: [string, string][] = [];
  for (let i = 0; i < pots.length; i++) {
    for (let j = i; j < pots.length; j++) {
      const potI = pots[i] as string[];
      if (i === j) {
        undirected.push(...samePotPairs(potI, perPot, rng));
      } else {
        undirected.push(...crossPotPairs(potI, pots[j] as string[], perPot, rng));
      }
    }
  }

  // Balance home/away: process edges in random order, give "home" to whichever side has
  // fewer home games so far (tie-break randomly).
  const homeCount = new Map<string, number>();
  const shuffled = [...undirected];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = shuffled[i] as [string, string];
    shuffled[i] = shuffled[j] as [string, string];
    shuffled[j] = tmp;
  }

  return shuffled.map(([a, b]) => {
    const ha = homeCount.get(a) ?? 0;
    const hb = homeCount.get(b) ?? 0;
    const aIsHome = ha === hb ? rng.chance(0.5) : ha < hb;
    if (aIsHome) homeCount.set(a, ha + 1);
    else homeCount.set(b, hb + 1);
    return aIsHome ? { homeClubId: a, awayClubId: b } : { homeClubId: b, awayClubId: a };
  });
}
