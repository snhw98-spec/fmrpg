import { useLiveQuery } from 'dexie-react-hooks';
import type { ClubRow, PlayerRow } from '../domain/types';
import { PLAYABLE_LEAGUE_ID } from './actions';
import { useReadyGame } from './GameContext';

export function useManagerClub(): ClubRow | undefined {
  const { db, save } = useReadyGame();
  return useLiveQuery(() => (save.managerClubId ? db.clubs.get(save.managerClubId) : undefined), [save.managerClubId]);
}

export function useClub(clubId: string | undefined): ClubRow | undefined {
  const { db } = useReadyGame();
  return useLiveQuery(() => (clubId ? db.clubs.get(clubId) : undefined), [clubId]);
}

export function useLeagueFixtures() {
  const { db } = useReadyGame();
  return useLiveQuery(() => db.fixtures.where('leagueId').equals(PLAYABLE_LEAGUE_ID).toArray(), []);
}

export function useSquad(clubId: string | undefined): PlayerRow[] | undefined {
  const { db } = useReadyGame();
  return useLiveQuery(() => (clubId ? db.players.where('clubId').equals(clubId).toArray() : []), [clubId]);
}

export function useClubsById(): Map<string, ClubRow> | undefined {
  const { db } = useReadyGame();
  const clubs = useLiveQuery(() => db.clubs.where('leagueId').equals(PLAYABLE_LEAGUE_ID).toArray(), []);
  return clubs ? new Map(clubs.map((c) => [c.id, c])) : undefined;
}
