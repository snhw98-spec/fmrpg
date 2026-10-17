import type { NamePools, PositionCode, RawClub, RawPlayer } from '../domain/raw';
import type { ClubRow, PersonRole, PersonRow } from '../domain/types';
import type { Rng } from '../engine/rng';

const FALLBACK_NAMES = { first: ['Alex', 'Sam', 'Jordan', 'Chris', 'Taylor'], last: ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson'] };

function namesFor(namePools: NamePools, nationality: string): { first: string[]; last: string[] } {
  return namePools[nationality] ?? FALLBACK_NAMES;
}

interface GeneratePlayerParams {
  id: number;
  clubId: string;
  position: PositionCode;
  nationality: string;
  namePools: NamePools;
  rng: Rng;
  ageRange: [number, number];
  /** Overall is baseline +/- spread, clamped to [40, 85] — generated players are never world-class. */
  overallBaseline: number;
  overallSpread: number;
  wageRange: [number, number];
  contractYears: number;
}

/** Shared generator for any non-dataset player (youth filler, regenerated pro, cup/relegation
 * filler). Attribute blocks are centered on `overallBaseline` with noise, same approach for
 * every caller — only the age/strength/contract envelope differs. */
function generatePlayer(p: GeneratePlayerParams): RawPlayer {
  const { rng, position, namePools, nationality } = p;
  const names = namesFor(namePools, nationality);
  const firstName = rng.pick(names.first);
  const lastName = rng.pick(names.last);
  const age = rng.int(...p.ageRange);
  const birthYear = 2026 - age;
  const isGk = position === 'GK';

  const overall = Math.max(38, Math.min(85, Math.round(p.overallBaseline + rng.gaussian(0, p.overallSpread))));
  const potential = age <= 23 ? Math.min(94, overall + rng.int(0, 18)) : Math.min(94, overall + rng.int(0, 3));
  const lo = (center: number, spread: number) => Math.max(1, Math.round(center - spread + rng.int(0, spread * 2)));
  const skillCenter = Math.max(3, Math.round((overall - 38) / 3));

  const technical = {
    corners: lo(skillCenter, 4),
    crossing: lo(skillCenter, 4),
    dribbling: isGk ? rng.int(2, 6) : lo(skillCenter, 4),
    finishing: isGk ? rng.int(1, 4) : lo(skillCenter, 4),
    firstTouch: lo(skillCenter, 3),
    freeKicks: lo(skillCenter, 4),
    heading: lo(skillCenter, 4),
    longShots: lo(skillCenter, 4),
    longThrows: lo(skillCenter, 4),
    marking: isGk ? rng.int(1, 4) : lo(skillCenter, 4),
    passing: lo(skillCenter, 3),
    penalties: lo(skillCenter, 4),
    tackling: isGk ? rng.int(1, 4) : lo(skillCenter, 4),
    technique: lo(skillCenter, 3),
  };
  const mental = {
    aggression: rng.int(6, 14),
    anticipation: lo(skillCenter, 3),
    bravery: rng.int(6, 14),
    composure: lo(skillCenter, 3),
    concentration: lo(skillCenter, 3),
    decisions: lo(skillCenter, 3),
    determination: rng.int(7, 16),
    flair: lo(skillCenter, 4),
    leadership: rng.int(3, 12),
    offTheBall: lo(skillCenter, 3),
    positioning: lo(skillCenter, 3),
    teamwork: rng.int(6, 14),
    vision: lo(skillCenter, 3),
    workRate: rng.int(7, 16),
  };
  const physical = {
    acceleration: rng.int(7, 16),
    agility: rng.int(7, 15),
    balance: rng.int(7, 15),
    jumpingReach: rng.int(6, 14),
    naturalFitness: rng.int(10, 17),
    pace: rng.int(7, 16),
    stamina: rng.int(9, 16),
    strength: rng.int(6, 15),
  };
  const goalkeeping = isGk
    ? {
        aerialReach: lo(skillCenter, 3),
        commandOfArea: lo(skillCenter, 3),
        communication: lo(skillCenter, 3),
        eccentricity: rng.int(3, 12),
        handling: lo(skillCenter, 3),
        kicking: lo(skillCenter, 3),
        oneOnOnes: lo(skillCenter, 3),
        reflexes: lo(skillCenter, 3),
        rushingOut: lo(skillCenter, 3),
        throwing: lo(skillCenter, 3),
        punching: lo(skillCenter, 3),
      }
    : {
        aerialReach: rng.int(1, 4),
        commandOfArea: rng.int(1, 4),
        communication: rng.int(1, 5),
        eccentricity: rng.int(1, 5),
        handling: rng.int(1, 4),
        kicking: rng.int(1, 5),
        oneOnOnes: rng.int(1, 4),
        reflexes: rng.int(1, 4),
        rushingOut: rng.int(1, 4),
        throwing: rng.int(1, 5),
        punching: rng.int(1, 4),
      };

  return {
    id: p.id,
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    commonName: null,
    clubId: p.clubId,
    nationality,
    dateOfBirth: `${birthYear}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
    ageAtStart: age,
    heightCm: isGk ? rng.int(183, 198) : rng.int(170, 195),
    weightKg: rng.int(62, 85),
    preferredFoot: rng.chance(0.78) ? 'Right' : 'Left',
    weakFoot: rng.int(1, 3),
    skillMoves: rng.int(1, 3),
    positions: { [position]: 20 },
    overall,
    potential,
    internationalReputation: 1,
    squadNumber: rng.int(1, 99),
    contract: {
      expires: `${2026 + p.contractYears}-06-30`,
      wageWeeklyEUR: rng.int(...p.wageRange),
      joined: '2026-07-01',
    },
    valueEUR: Math.round(overall * 15000 + rng.int(0, 50000)),
    attributes: { technical, mental, physical, goalkeeping },
    hidden: {
      consistency: rng.int(5, 14),
      importantMatches: rng.int(5, 14),
      injuryProneness: rng.int(4, 14),
      versatility: rng.int(4, 12),
      dirtiness: rng.int(3, 12),
      adaptability: rng.int(6, 15),
    },
    personality: {
      professionalism: rng.int(6, 16),
      ambition: rng.int(8, 18),
      loyalty: rng.int(6, 15),
      pressure: rng.int(5, 14),
      temperament: rng.int(6, 15),
      sportsmanship: rng.int(6, 15),
      controversy: rng.int(2, 10),
    },
    traits: [],
    eaRatings: { pace: 50, shooting: 45, passing: 45, dribbling: 45, defending: 45, physicality: 50 },
    derivedFields: ['generated'],
    generated: true,
  };
}

/**
 * Generates a plausible youth/backup player to top up a thin squad (DATA.md gap #1).
 * Attributes are centered below the club's first-team strength with noise, so generated
 * players read as fringe/youth rather than first-team quality. Uses a negative, stable id
 * (clubId + position + index hashed) so generated players never collide with real EA ids.
 */
export function generateYouthPlayer(
  club: RawClub,
  position: PositionCode,
  nationality: string,
  namePools: NamePools,
  rng: Rng,
  negativeId: number,
): RawPlayer {
  const baseline = Math.max(42, Math.min(68, club.strength - rng.int(8, 22)));
  return generatePlayer({
    id: negativeId,
    clubId: club.id,
    position,
    nationality,
    namePools,
    rng,
    ageRange: [16, 19],
    overallBaseline: baseline,
    overallSpread: 4,
    wageRange: [800, 4000],
    contractYears: 2,
  });
}

/**
 * Generates a full-career-age player for a generated club (DATA.md gaps #2/#3: relegation
 * replacements, cup filler, European stand-ins) — lower-league/amateur quality by default.
 */
export function generateProPlayer(
  clubId: string,
  position: PositionCode,
  nationality: string,
  strength: number,
  namePools: NamePools,
  rng: Rng,
  negativeId: number,
): RawPlayer {
  return generatePlayer({
    id: negativeId,
    clubId,
    position,
    nationality,
    namePools,
    rng,
    ageRange: [18, 33],
    overallBaseline: strength,
    overallSpread: 5,
    wageRange: [300, 2500],
    contractYears: rng.int(1, 3),
  });
}

const SQUAD_TEMPLATE: PositionCode[] = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'LB', 'RB',
  'CDM', 'CM', 'CM', 'CAM',
  'LM', 'RM', 'LW', 'RW',
  'ST', 'ST',
];

/** Builds a full squad for a generated club, id-space disjoint from everything else via the
 * caller-supplied starting negative id (decremented per player). */
export function generateSquad(
  clubId: string,
  nationality: string,
  strength: number,
  namePools: NamePools,
  rng: Rng,
  startNegativeId: number,
): { players: RawPlayer[]; nextNegativeId: number } {
  let nextId = startNegativeId;
  const players = SQUAD_TEMPLATE.map((position) => {
    const player = generateProPlayer(clubId, position, nationality, strength, namePools, rng, nextId);
    nextId -= 1;
    return player;
  });
  return { players, nextNegativeId: nextId };
}

const CLUB_NAME_SUFFIXES: Record<string, string[]> = {
  England: ['Town', 'United', 'Athletic', 'Rovers', 'City', 'Wanderers'],
  Italy: ['Calcio', 'FC', 'Calcio 1920', 'Sportiva'],
  Spain: ['CF', 'Deportivo', 'Atlético', 'FC'],
  Germany: ['SV', 'FC', 'Sportfreunde', 'Turnverein'],
};

/** A lightweight generated club (no finances/stadium — DATA.md gaps #2/#3). `strength`
 * should be set relative to the tier it's replacing/filling in for. */
export function generateClub(
  id: string,
  leagueId: string,
  country: string,
  strength: number,
  namePools: NamePools,
  rng: Rng,
): ClubRow {
  const names = namesFor(namePools, country);
  const base = rng.pick(names.last);
  const suffixes = CLUB_NAME_SUFFIXES[country] ?? ['FC'];
  const suffix = rng.pick(suffixes);
  const name = `${base} ${suffix}`;
  return {
    id,
    name,
    shortName: base,
    abbr: base.slice(0, 3).toUpperCase(),
    leagueId,
    country,
    strength,
    reputation: Math.max(1, Math.round(strength / 6)),
    squadSize: SQUAD_TEMPLATE.length,
    generated: true,
    source: { eaName: name },
  };
}

const PERSON_FIRST_PREFIX: Record<PersonRole, string> = {
  manager: 'mgr',
  assistant: 'ast',
  coach: 'coa',
  scout: 'sct',
  physio: 'phy',
  chairman: 'chm',
  owner: 'own',
  sportingDirector: 'sdr',
  ceo: 'ceo',
  agent: 'agt',
  journalist: 'jrn',
};

export function generatePerson(
  role: PersonRole,
  nationality: string,
  namePools: NamePools,
  rng: Rng,
  employerClubId: string | undefined,
  uniqueIndex: number,
): PersonRow {
  const names = namesFor(namePools, nationality);
  return {
    id: `${PERSON_FIRST_PREFIX[role]}-${uniqueIndex}`,
    role,
    firstName: rng.pick(names.first),
    lastName: rng.pick(names.last),
    nationality,
    employerClubId,
    generated: true,
  };
}
