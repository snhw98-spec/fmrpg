import type { NamePools, PositionCode, RawClub, RawCup, RawEurope, RawLeague, RawPlayer } from '../domain/raw';
import type { ClubRow, PersonRow, PlayerRow } from '../domain/types';
import { createRng } from '../engine/rng';
import type { GameDatabase } from './db';
import { generatePerson, generateSquad, generateYouthPlayer } from './generate';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return (await res.json()) as T;
}

const FILLER_OUTFIELD_POSITIONS: PositionCode[] = [
  'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST',
];

export type ImportProgressCallback = (stage: string) => void;

/** Resolved europe.json: every pot slot now has a real clubId (missing entrants were
 * generated at import time), ready for engine/europe.ts's pairing algorithm. */
export interface ResolvedEuropeEntrants {
  UCL: string[][];
  UEL: string[][];
  UECL: string[][];
}

/**
 * First-launch import, DESIGN.md §2. Idempotent: no-ops if the world is already imported
 * into this save's database.
 */
export async function importWorldIfNeeded(db: GameDatabase, onProgress?: ImportProgressCallback): Promise<void> {
  const marker = await db.kv.get('worldImported');
  if (marker?.value === true) return;

  onProgress?.('Fetching world data…');
  const [leagues, clubs, players, playersWorld, cups, namePools, europe] = await Promise.all([
    fetchJson<RawLeague[]>('/data/leagues.json'),
    fetchJson<RawClub[]>('/data/clubs.json'),
    fetchJson<RawPlayer[]>('/data/players.json'),
    fetchJson<RawPlayer[]>('/data/players_world.json'),
    fetchJson<RawCup[]>('/data/cups.json'),
    fetchJson<NamePools>('/data/name_pools.json'),
    fetchJson<RawEurope>('/data/europe.json'),
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

  onProgress?.('Generating stand-ins for European entrants not in the dataset…');
  const generatedEuropeClubs: ClubRow[] = [];
  const resolvedEurope: ResolvedEuropeEntrants = { UCL: [], UEL: [], UECL: [] };
  const knownClubIds = new Set(clubs.map((c) => c.id));
  for (const compId of ['UCL', 'UEL', 'UECL'] as const) {
    for (const pot of europe[compId].pots) {
      const potClubIds: string[] = [];
      for (const entrant of pot) {
        potClubIds.push(entrant.clubId ?? entrant.name);
        if (entrant.inDataset || !entrant.clubId || knownClubIds.has(entrant.clubId)) continue;
        knownClubIds.add(entrant.clubId);
        const strength = entrant.approxStrength ?? 68;
        generatedEuropeClubs.push({
          id: entrant.clubId,
          name: entrant.name,
          shortName: entrant.name,
          abbr: entrant.name.slice(0, 3).toUpperCase(),
          leagueId: 'EUROPE_STANDIN',
          country: entrant.country,
          strength,
          reputation: Math.max(1, Math.round(strength / 6)),
          squadSize: 17,
          generated: true,
          source: { eaName: entrant.name },
        });
        const { players: squad } = generateSquad(entrant.clubId, entrant.country, strength, namePools, rng, nextGeneratedId);
        nextGeneratedId -= squad.length;
        generatedPlayers.push(...squad);
      }
      resolvedEurope[compId].push(potClubIds);
    }
  }

  onProgress?.('Writing players…');
  await db.players.bulkPut([...players, ...playersWorld, ...generatedPlayers]);

  onProgress?.('Writing European stand-in clubs…');
  await db.clubs.bulkPut(generatedEuropeClubs);
  await db.kv.put({ key: 'europeEntrants', value: resolvedEurope });

  onProgress?.('Generating club staff…');
  const people: PersonRow[] = [];
  let personIndex = 0;
  for (const club of playableClubs) {
    people.push(generatePerson('manager', club.country, namePools, rng, club.id, personIndex++));
  }
  await db.people.bulkPut(people);

  // Milestone 2's season setup (cup fillers, future Europe stand-ins) generates players too —
  // hand it a fresh id range well clear of everything generated above.
  await db.kv.put({ key: 'nextGeneratedPlayerId', value: nextGeneratedId - 1000 });
  await db.kv.put({ key: 'namePools', value: namePools });

  await db.kv.put({ key: 'worldImported', value: true });
  await db.kv.put({ key: 'worldImportedAt', value: new Date().toISOString() });
  onProgress?.('Done');
}
