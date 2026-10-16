import Dexie, { type EntityTable } from 'dexie';
import type { Fixture, TeamTactics } from '../domain/match';
import type { ClubRow, CupRow, KvRow, LeagueRow, PersonRow, PlayerRow, SaveSlot } from '../domain/types';

export interface TacticsRow extends TeamTactics {
  clubId: string;
}

export class GameDatabase extends Dexie {
  leagues!: EntityTable<LeagueRow, 'id'>;
  clubs!: EntityTable<ClubRow, 'id'>;
  players!: EntityTable<PlayerRow, 'id'>;
  people!: EntityTable<PersonRow, 'id'>;
  cups!: EntityTable<CupRow, 'id'>;
  fixtures!: EntityTable<Fixture, 'id'>;
  tactics!: EntityTable<TacticsRow, 'clubId'>;
  kv!: EntityTable<KvRow, 'key'>;
  saves!: EntityTable<SaveSlot, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      leagues: 'id, country, tier, playable',
      clubs: 'id, leagueId, country',
      players: 'id, clubId, nationality, overall',
      people: 'id, role, employerClubId',
      cups: 'id, country',
      fixtures: 'id, leagueId, matchday, homeClubId, awayClubId, date',
      tactics: 'clubId',
      kv: 'key',
      saves: 'id, updatedAt',
    });
  }
}

/** One database per save slot, so slots are fully independent and exportable on their own. */
export function openSaveDatabase(saveId: string): GameDatabase {
  return new GameDatabase(`fmrpg-save-${saveId}`);
}
