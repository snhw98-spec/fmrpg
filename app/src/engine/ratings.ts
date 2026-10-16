import type { SelectedPlayer, TeamTactics } from '../domain/match';
import type { PlayerRow } from '../domain/types';

export interface TeamRatings {
  attack: number;
  midfield: number;
  defense: number;
  gk: number;
  /** 0-1, how much this tactic pushes players forward (used for possession + chance volume). */
  attackingIntent: number;
  /** 0-1, how aggressively this team presses out of possession (affects turnovers/fouls). */
  pressIntent: number;
}

const ATTACK_LINE = new Set(['ST', 'LW', 'RW', 'CAM']);
const MID_LINE = new Set(['CM', 'CDM', 'CAM', 'LM', 'RM', 'LW', 'RW']);
const DEF_LINE = new Set(['CB', 'LB', 'RB', 'CDM']);

function avgAttrs(players: PlayerRow[], category: 'technical' | 'mental' | 'physical', keys: string[]): number {
  if (players.length === 0) return 10;
  let sum = 0;
  let n = 0;
  for (const p of players) {
    for (const k of keys) {
      const v = p.attributes[category][k];
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
  }
  return n === 0 ? 10 : sum / n;
}

function mentalityMultiplier(mentality: TeamTactics['mentality']): { attack: number; defense: number; intent: number } {
  switch (mentality) {
    case 'attacking':
      return { attack: 1.12, defense: 0.92, intent: 0.72 };
    case 'defensive':
      return { attack: 0.88, defense: 1.1, intent: 0.32 };
    default:
      return { attack: 1, defense: 1, intent: 0.5 };
  }
}

function pressingMultiplier(pressing: TeamTactics['pressing']): number {
  return pressing === 'high' ? 0.75 : pressing === 'low' ? 0.3 : 0.5;
}

/** Faster tempo trades a little quality for more attacking volume, and vice versa. */
function tempoAdjust(tempo: TeamTactics['tempo']): { attack: number; intent: number } {
  switch (tempo) {
    case 'fast':
      return { attack: 0.97, intent: 1.12 };
    case 'slow':
      return { attack: 1.04, intent: 0.88 };
    default:
      return { attack: 1, intent: 1 };
  }
}

/** Width trades defensive solidity (space in behind full-backs) for crossing/attack reach. */
function widthAdjust(width: TeamTactics['width']): { attack: number; defense: number } {
  switch (width) {
    case 'wide':
      return { attack: 1.04, defense: 0.97 };
    case 'narrow':
      return { attack: 0.97, defense: 1.03 };
    default:
      return { attack: 1, defense: 1 };
  }
}

export function computeTeamRatings(
  squad: PlayerRow[],
  xi: SelectedPlayer[],
  tactics: TeamTactics,
): TeamRatings {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const starters = xi.map((s) => byId.get(s.playerId)).filter((p): p is PlayerRow => !!p);

  const gkPlayers = starters.filter((p) => Object.prototype.hasOwnProperty.call(p.positions, 'GK'));
  const attackers = starters.filter((p) => xi.find((s) => s.playerId === p.id && ATTACK_LINE.has(s.position)));
  const midfielders = starters.filter((p) => xi.find((s) => s.playerId === p.id && MID_LINE.has(s.position)));
  const defenders = starters.filter((p) => xi.find((s) => s.playerId === p.id && DEF_LINE.has(s.position)));

  const rawAttack = avgAttrs(attackers, 'technical', ['finishing', 'dribbling', 'technique', 'longShots']) * 0.5
    + avgAttrs(attackers, 'mental', ['offTheBall', 'composure', 'vision', 'flair']) * 0.5;
  const rawMidfield = avgAttrs(midfielders, 'technical', ['passing', 'technique', 'crossing']) * 0.5
    + avgAttrs(midfielders, 'mental', ['vision', 'decisions', 'workRate', 'teamwork']) * 0.5;
  const rawDefense = avgAttrs(defenders, 'technical', ['tackling', 'marking']) * 0.5
    + avgAttrs(defenders, 'mental', ['positioning', 'anticipation', 'aggression']) * 0.25
    + avgAttrs(defenders, 'physical', ['strength', 'jumpingReach']) * 0.25;
  const rawGk = gkPlayers.length
    ? gkPlayers.reduce((sum, p) => sum + (p.attributes.goalkeeping.reflexes ?? 10) * 0.4
        + (p.attributes.goalkeeping.handling ?? 10) * 0.3
        + (p.attributes.goalkeeping.oneOnOnes ?? 10) * 0.3, 0) / gkPlayers.length
    : 10;

  const m = mentalityMultiplier(tactics.mentality);
  const t = tempoAdjust(tactics.tempo);
  const w = widthAdjust(tactics.width);

  return {
    attack: rawAttack * m.attack * t.attack * w.attack,
    midfield: rawMidfield,
    defense: rawDefense * m.defense * w.defense,
    gk: rawGk,
    attackingIntent: m.intent * t.intent,
    pressIntent: pressingMultiplier(tactics.pressing),
  };
}
