import type { NamePools, PositionCode, RawClub, RawCup, RawLeague, RawPlayer } from '../domain/raw';
import type { PersonRow, PlayerRow } from '../domain/types';
import { createRng } from '../engine/rng';
import type { GameDatabase } from './db';
import { generatePerson, generateYouthPlayer } from './generate';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return (await res.json()) as T;
}

const FILLER_OUTFIELD_POSITIONS: PositionCode[] = [
  'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST',
];

export type ImportProgressCallback = (stage: string) => void;

/**
 * First-launch import, DESIGN.md §2. Idempotent: no-ops if the world is already imported
 * into this save's database. Scope for Milestone 1: leagues, clubs, cups and the playable-
 * league player pool (players.json). players_world.json / europe.json (the transfer pool
 * and European entrants) land with Milestone 2's full background world.
 */
export async function importWorldIfNeeded(db: GameDatabase, onProgress?: ImportProgressCallback): Promise<void> {
  const marker = await db.kv.get('worldImported');
  if (marker?.value === true) return;

  onProgress?.('Fetching world data…');
  const [leagues, clubs, players, cups, namePools] = await Promise.all([
    fetchJson<RawLeague[]>('/data/leagues.json'),
    fetchJson<RawClub[]>('/data/clubs.json'),
    fetchJson<RawPlayer[]>('/data/players.json'),
    fetchJson<RawCup[]>('/data/cups.json'),
    fetchJson<NamePools>('/data/name_pools.json'),
  ]);

  onProgress?.('Writing leagues…');
  await db.leagues.bulkPut(leagues.map((l) => ({ ...l, economyMultiplier: 1 })));

  onProgress?.('Writing clubs…');
  await db.clubs.bulkPut(clubs);

  onProgress?.('Writing cups…');
  await db.cups.bulkPut(cups);

  onProgress?.('Topping up thin squads…');
  const rng = createRng('world-import-v1');
  let nextGeneratedId = -1;
  const generatedPlayers: PlayerRow[] = [];
  const playableLeagueIds = new Set(leagues.filter((l) => l.playable).map((l) => l.id));
  const playableClubs = clubs.filter((c) => playableLeagueIds.has(c.leagueId));

  for (const club of playableClubs) {
    const squad = players.filter((p) => p.clubId === club.id);
    const gkCount = squad.filter((p) => Object.prototype.hasOwnProperty.call(p.positions, 'GK')).length;
    const neededGk = Math.max(0, 2 - gkCount);
    const totalNeeded = Math.max(0, 22 - squad.length, neededGk);
    const outfieldNeeded = Math.max(0, totalNeeded - neededGk);

    for (let i = 0; i < neededGk; i++) {
      generatedPlayers.push(
        generateYouthPlayer(club, 'GK', club.country, namePools, rng, nextGeneratedId--),
      );
    }
    for (let i = 0; i < outfieldNeeded; i++) {
      const position = rng.pick(FILLER_OUTFIELD_POSITIONS);
      generatedPlayers.push(
        generateYouthPlayer(club, position, club.country, namePools, rng, nextGeneratedId--),
      );
    }
  }

  onProgress?.('Writing players…');
  await db.players.bulkPut([...players, ...generatedPlayers]);

  onProgress?.('Generating club staff…');
  const people: PersonRow[] = [];
  let personIndex = 0;
  for (const club of playableClubs) {
    people.push(generatePerson('manager', club.country, namePools, rng, club.id, personIndex++));
  }
  await db.people.bulkPut(people);

  await db.kv.put({ key: 'worldImported', value: true });
  await db.kv.put({ key: 'worldImportedAt', value: new Date().toISOString() });
  onProgress?.('Done');
}
