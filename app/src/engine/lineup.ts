import type { Formation, SelectedPlayer } from '../domain/match';
import type { PlayerRow } from '../domain/types';

/** Position codes grouped so we can fall back sensibly when a club has no specialist. */
const POSITION_FAMILY: Record<string, string[]> = {
  GK: ['GK'],
  CB: ['CB', 'CDM'],
  LB: ['LB', 'CB', 'LM'],
  RB: ['RB', 'CB', 'RM'],
  CDM: ['CDM', 'CM', 'CB'],
  CM: ['CM', 'CDM', 'CAM'],
  CAM: ['CAM', 'CM', 'ST'],
  LM: ['LM', 'LW', 'LB', 'CM'],
  RM: ['RM', 'RW', 'RB', 'CM'],
  LW: ['LW', 'LM', 'ST'],
  RW: ['RW', 'RM', 'ST'],
  ST: ['ST', 'CAM', 'LW', 'RW'],
};

function fitScore(player: PlayerRow, position: string): number {
  const familiarity = player.positions[position as keyof typeof player.positions];
  if (familiarity !== undefined) {
    // Natural position (first key) gets a small extra nudge.
    const isNatural = Object.keys(player.positions)[0] === position;
    return player.overall * (0.6 + 0.4 * (familiarity / 20)) + (isNatural ? 2 : 0);
  }
  // Not a listed position at all: usable only as an emergency fallback, heavily penalized.
  return player.overall * 0.25;
}

/**
 * Greedy best-XI selection: for each formation slot (GK first, then by scarcity), pick the
 * best available, not-yet-selected player for that position family. Good enough for M1;
 * individual squad-selection UI can override this later.
 */
export function pickBestXI(squad: PlayerRow[], formation: Formation): SelectedPlayer[] {
  const available = [...squad];
  const selected: SelectedPlayer[] = [];
  const used = new Set<number>();

  // GK slots first (scarcest and most position-locked), then everything else.
  const orderedSlots = [...formation.slots].sort((a, b) =>
    a.position === 'GK' ? -1 : b.position === 'GK' ? 1 : 0,
  );

  for (const slot of orderedSlots) {
    const family = POSITION_FAMILY[slot.position] ?? [slot.position];
    let best: PlayerRow | null = null;
    let bestScore = -Infinity;
    for (const player of available) {
      if (used.has(player.id)) continue;
      // Only consider goalkeepers for GK slots and vice versa.
      const isGk = Object.prototype.hasOwnProperty.call(player.positions, 'GK');
      if (slot.position === 'GK' && !isGk) continue;
      if (slot.position !== 'GK' && isGk && Object.keys(player.positions).length === 1) continue;

      const score = Math.max(...family.map((p) => fitScore(player, p)));
      if (score > bestScore) {
        bestScore = score;
        best = player;
      }
    }
    if (best) {
      used.add(best.id);
      selected.push({ playerId: best.id, position: slot.position });
    }
  }

  return selected;
}
