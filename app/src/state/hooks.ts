import { useLiveQuery } from 'dexie-react-hooks';
import type { Fixture } from '../domain/competition';
import type { ClubRow, LeagueRow, PlayerRow } from '../domain/types';
import { useReadyGame } from './GameContext';

export function useManagerClub(): ClubRow | undefined {
  const { db, save } = useReadyGame();
  return useLiveQuery(() => (save.managerClubId ? db.clubs.get(save.managerClubId) : undefined), [save.managerClubId]);
}

export function useClub(clubId: string | undefined): ClubRow | undefined {
  const { db } = useReadyGame();
  return useLiveQuery(() => (clubId ? db.clubs.get(clubId) : undefined), [clubId]);
}

/** The manager's club's current league — re-derived live, since promotion/relegation can
 * move the club between leagues at rollover. */
export function useManagerLeague(): LeagueRow | undefined {
  const { db } = useReadyGame();
  const managerClub = useManagerClub();
  return useLiveQuery(() => (managerClub ? db.leagues.get(managerClub.leagueId) : undefined), [managerClub?.leagueId]);
}

export function useLeagueFixtures(leagueId: string | undefined, season: string): Fixture[] | undefined {
  const { db } = useReadyGame();
  return useLiveQuery(
    () =>
      leagueId ? db.fixtures.where('[season+competitionId]').equals([season, leagueId]).toArray() : [],
    [leagueId, season],
  );
}

export function useSquad(clubId: string | undefined): PlayerRow[] | undefined {
  const { db } = useReadyGame();
  return useLiveQuery(() => (clubId ? db.players.where('clubId').equals(clubId).toArray() : []), [clubId]);
}

export function useClubsById(clubIds: string[] | undefined): Map<string, ClubRow> | undefined {
  const { db } = useReadyGame();
  const key = clubIds?.join(',') ?? '';
  const clubs = useLiveQuery(() => (clubIds ? db.clubs.bulkGet(clubIds) : []), [key]);
  return clubs ? new Map(clubs.filter((c): c is ClubRow => !!c).map((c) => [c.id, c])) : undefined;
}
