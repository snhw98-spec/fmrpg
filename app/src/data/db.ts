import Dexie, { type EntityTable } from 'dexie';
import type { EuropeStateRow, Fixture, KnockoutStateRow, SeasonHistoryRow } from '../domain/competition';
import type { TeamTactics } from '../domain/match';
import type { ClubRow, CupRow, KvRow, LeagueRow, PersonRow, PlayerRow, SaveSlot } from '../domain/types';

export interface TacticsRow extends TeamTactics {
  clubId: string;
}

/** Milestone 1's Fixture shape, kept only so the v1->v2 upgrade can read old rows. */
interface FixtureV1 {
  id: string;
  leagueId: string;
  matchday: number;
  homeClubId: string;
  awayClubId: string;
  date: string;
  result: Fixture['result'];
}

export class GameDatabase extends Dexie {
  leagues!: EntityTable<LeagueRow, 'id'>;
  clubs!: EntityTable<ClubRow, 'id'>;
  players!: EntityTable<PlayerRow, 'id'>;
  people!: EntityTable<PersonRow, 'id'>;
  cups!: EntityTable<CupRow, 'id'>;
  fixtures!: EntityTable<Fixture, 'id'>;
  knockoutStates!: EntityTable<KnockoutStateRow, 'id'>;
  europeStates!: EntityTable<EuropeStateRow, 'id'>;
  seasonHistory!: EntityTable<SeasonHistoryRow, 'season'>;
  tactics!: EntityTable<TacticsRow, 'clubId'>;
  kv!: EntityTable<KvRow, 'key'>;
  saves!: EntityTable<SaveSlot, 'id'>;

  constructor(name: string) {
    super(name);

    // Milestone 1's schema — kept as-is so existing saves can still open and get migrated.
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

    // Milestone 2: multi-competition fixtures (league/cup/playoff/Europe), cup & Europe
    // knockout state, season history, and a strength index for Europe's pot-seeding. Old
    // (Milestone 1, single-league) fixture rows are rewritten into the new shape rather than
    // discarded — DESIGN.md's "never discard the user's save" applies to schema migrations
    // too, not just file I/O.
    this.version(2).stores({
      leagues: 'id, country, tier, playable',
      // leagueId/country dropped: nothing queries clubs by them (clubs are always reached
      // via a league's own clubIds array, or by id) — strength stays, Europe pot-seeding
      // orders by it. players similarly drops nationality/overall (unused) and keeps only
      // clubId, which every squad lookup actually queries by. The players table is the
      // single biggest and most frequently bulk-written table in the game (tens of
      // thousands of rows, rewritten every rollover), so unindexed fields here matter most.
      clubs: 'id, strength',
      players: 'id, clubId',
      people: 'id, role, employerClubId',
      cups: 'id, country',
      // Only `id` (primary key) and the 3 compound indexes below are ever queried — every
      // other field is deliberately NOT indexed. Each index has to be maintained on every
      // write, and a season's fixture set runs into the thousands, so indexing fields no
      // query touches is pure write-amplification for no benefit (confirmed: adding the
      // unused single-field indexes measurably slowed down bulk writes under the headless
      // harness's fake-indexeddb). [season+played] is what lets "what's still due" queries
      // stay a narrow range lookup instead of scanning everything ever played.
      fixtures: 'id, [season+played], [season+kind], [season+competitionId]',
      knockoutStates: 'id, season, competitionId',
      europeStates: 'id, season, competitionId',
      seasonHistory: 'season',
      tactics: 'clubId',
      kv: 'key',
      saves: 'id, updatedAt',
    }).upgrade(async (tx) => {
      const oldFixtures = await tx.table<FixtureV1>('fixtures').toArray();
      if (oldFixtures.length > 0) {
        const migrated: Fixture[] = oldFixtures.map((f) => ({
          id: f.id,
          season: '2026-27',
          kind: 'league',
          competitionId: f.leagueId,
          round: f.matchday,
          homeClubId: f.homeClubId,
          awayClubId: f.awayClubId,
          date: f.date,
          result: f.result,
          played: f.result ? 1 : 0,
        }));
        await tx.table('fixtures').clear();
        await tx.table<Fixture>('fixtures').bulkPut(migrated);
      }
      await tx.table<SaveSlot>('saves').toCollection().modify((save) => {
        if (!save.currentSeason) save.currentSeason = '2026-27';
      });
    });
  }
}

/** One database per save slot, so slots are fully independent and exportable on their own. */
export function openSaveDatabase(saveId: string): GameDatabase {
  return new GameDatabase(`fmrpg-save-${saveId}`);
}
