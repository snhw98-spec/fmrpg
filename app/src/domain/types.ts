// App-level domain types: the Dexie row shapes. For now these extend the raw imported
// shapes with the few fields the game needs that aren't in fm-dataset (see DESIGN.md §3-4).
// Mutable in-game state (form, morale, relationships, promises, ...) lands in milestone 3+;
// this is deliberately the minimal schema milestone 0 needs to scaffold the database.

import type { RawClub, RawCup, RawLeague, RawPlayer } from './raw';

export interface LeagueRow extends RawLeague {
  /** Multiplier applied to wages/values/budgets at display/negotiation time (DESIGN.md §3). Default 1.0. */
  economyMultiplier: number;
}

export type ClubRow = RawClub;

export type PlayerRow = RawPlayer;

export type CupRow = RawCup;

/** Non-player people: managers, staff, board, agents, journalists. Fleshed out in milestone 1-5. */
export type PersonRole =
  | 'manager' | 'assistant' | 'coach' | 'scout' | 'physio'
  | 'chairman' | 'owner' | 'sportingDirector' | 'ceo'
  | 'agent' | 'journalist';

export interface PersonRow {
  id: string;
  role: PersonRole;
  firstName: string;
  lastName: string;
  nationality: string;
  employerClubId?: string;
  generated: true;
}

export interface SaveSlot {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDate: string;
  rngSeed: string;
  managerClubId: string | null;
}

/** Arbitrary JSON blobs that don't need their own table yet (europe.json, manifest, etc). */
export interface KvRow {
  key: string;
  value: unknown;
}
