import type { PositionCode } from './raw';

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '4-5-1' | '3-5-2' | '5-3-2';

export interface FormationSlot {
  position: PositionCode;
  /** Distinguishes e.g. the two CBs in a back four; purely for display/XI-selection ordering. */
  slot: number;
}

export interface Formation {
  id: FormationId;
  name: string;
  slots: FormationSlot[];
}

export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type PressingIntensity = 'low' | 'medium' | 'high';
export type Tempo = 'slow' | 'normal' | 'fast';
export type Width = 'narrow' | 'normal' | 'wide';

export interface TeamTactics {
  formationId: FormationId;
  mentality: Mentality;
  pressing: PressingIntensity;
  tempo: Tempo;
  width: Width;
}

export const DEFAULT_TACTICS: TeamTactics = {
  formationId: '4-3-3',
  mentality: 'balanced',
  pressing: 'medium',
  tempo: 'normal',
  width: 'normal',
};

export interface SelectedPlayer {
  playerId: number;
  position: PositionCode;
}

export interface MatchEventBase {
  minute: number;
  team: 'home' | 'away';
}

export type MatchEvent =
  | (MatchEventBase & { type: 'kickOff' })
  | (MatchEventBase & {
      type: 'shot';
      playerId: number;
      xg: number;
      outcome: 'goal' | 'saved' | 'offTarget' | 'blocked';
    })
  | (MatchEventBase & { type: 'corner' })
  | (MatchEventBase & {
      type: 'foul';
      playerId: number;
      card: 'none' | 'yellow' | 'red';
    })
  | (MatchEventBase & { type: 'injury'; playerId: number })
  | (MatchEventBase & { type: 'halfTime' })
  | (MatchEventBase & { type: 'fullTime' });

export interface TeamMatchStats {
  goals: number;
  xg: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  possessionPct: number;
}

export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  home: TeamMatchStats;
  away: TeamMatchStats;
  scorers: { minute: number; team: 'home' | 'away'; playerId: number }[];
  events: MatchEvent[];
  /** Set only for knockout fixtures that finished level — who won the shootout. */
  penaltyWinner?: 'home' | 'away';
}

export const FORMATIONS: Record<FormationId, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    name: '4-4-2',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'RB', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'LB', slot: 0 },
      { position: 'RM', slot: 0 },
      { position: 'CM', slot: 0 },
      { position: 'CM', slot: 1 },
      { position: 'LM', slot: 0 },
      { position: 'ST', slot: 0 },
      { position: 'ST', slot: 1 },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    name: '4-3-3',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'RB', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'LB', slot: 0 },
      { position: 'CDM', slot: 0 },
      { position: 'CM', slot: 0 },
      { position: 'CM', slot: 1 },
      { position: 'RW', slot: 0 },
      { position: 'ST', slot: 0 },
      { position: 'LW', slot: 0 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    name: '4-2-3-1',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'RB', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'LB', slot: 0 },
      { position: 'CDM', slot: 0 },
      { position: 'CDM', slot: 1 },
      { position: 'RW', slot: 0 },
      { position: 'CAM', slot: 0 },
      { position: 'LW', slot: 0 },
      { position: 'ST', slot: 0 },
    ],
  },
  '4-5-1': {
    id: '4-5-1',
    name: '4-5-1',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'RB', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'LB', slot: 0 },
      { position: 'RM', slot: 0 },
      { position: 'CM', slot: 0 },
      { position: 'CM', slot: 1 },
      { position: 'LM', slot: 0 },
      { position: 'CAM', slot: 0 },
      { position: 'ST', slot: 0 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    name: '3-5-2',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'CB', slot: 2 },
      { position: 'RM', slot: 0 },
      { position: 'CM', slot: 0 },
      { position: 'CM', slot: 1 },
      { position: 'CDM', slot: 0 },
      { position: 'LM', slot: 0 },
      { position: 'ST', slot: 0 },
      { position: 'ST', slot: 1 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    name: '5-3-2',
    slots: [
      { position: 'GK', slot: 0 },
      { position: 'RB', slot: 0 },
      { position: 'CB', slot: 0 },
      { position: 'CB', slot: 1 },
      { position: 'CB', slot: 2 },
      { position: 'LB', slot: 0 },
      { position: 'CM', slot: 0 },
      { position: 'CM', slot: 1 },
      { position: 'CDM', slot: 0 },
      { position: 'ST', slot: 0 },
      { position: 'ST', slot: 1 },
    ],
  },
};
