import type { PositionCode, RawClub, RawPlayer } from '../domain/raw';
import type { NamePools } from '../domain/raw';
import type { PersonRole, PersonRow } from '../domain/types';
import type { Rng } from '../engine/rng';

const FALLBACK_NAMES = { first: ['Alex', 'Sam', 'Jordan', 'Chris', 'Taylor'], last: ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson'] };

function namesFor(namePools: NamePools, nationality: string): { first: string[]; last: string[] } {
  return namePools[nationality] ?? FALLBACK_NAMES;
}

function clamp20(v: number): number {
  return Math.max(1, Math.min(20, Math.round(v)));
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
  const names = namesFor(namePools, nationality);
  const firstName = rng.pick(names.first);
  const lastName = rng.pick(names.last);
  const age = rng.int(16, 19);
  const birthYear = 2026 - age;
  const isGk = position === 'GK';

  const baseline = Math.max(42, Math.min(68, club.strength - rng.int(8, 22)));
  const overall = clamp20(baseline) <= 1 ? baseline : Math.round(baseline);
  const potential = Math.min(94, overall + rng.int(2, 22));

  const technical = {
    corners: rng.int(4, 11),
    crossing: rng.int(4, 11),
    dribbling: isGk ? rng.int(2, 6) : rng.int(5, 13),
    finishing: isGk ? rng.int(1, 4) : rng.int(5, 13),
    firstTouch: rng.int(5, 12),
    freeKicks: rng.int(3, 10),
    heading: rng.int(5, 12),
    longShots: rng.int(4, 11),
    longThrows: rng.int(3, 10),
    marking: isGk ? rng.int(1, 4) : rng.int(5, 13),
    passing: rng.int(5, 12),
    penalties: rng.int(4, 11),
    tackling: isGk ? rng.int(1, 4) : rng.int(5, 13),
    technique: rng.int(5, 12),
  };
  const mental = {
    aggression: rng.int(6, 14),
    anticipation: rng.int(5, 12),
    bravery: rng.int(6, 14),
    composure: rng.int(5, 11),
    concentration: rng.int(5, 12),
    decisions: rng.int(5, 11),
    determination: rng.int(7, 16),
    flair: rng.int(4, 13),
    leadership: rng.int(3, 10),
    offTheBall: rng.int(5, 12),
    positioning: rng.int(5, 12),
    teamwork: rng.int(6, 14),
    vision: rng.int(5, 12),
    workRate: rng.int(7, 15),
  };
  const physical = {
    acceleration: rng.int(8, 16),
    agility: rng.int(7, 15),
    balance: rng.int(7, 15),
    jumpingReach: rng.int(6, 14),
    naturalFitness: rng.int(10, 17),
    pace: rng.int(8, 16),
    stamina: rng.int(9, 16),
    strength: rng.int(6, 14),
  };
  const goalkeeping = isGk
    ? {
        aerialReach: rng.int(6, 13),
        commandOfArea: rng.int(5, 12),
        communication: rng.int(5, 12),
        eccentricity: rng.int(3, 12),
        handling: rng.int(6, 13),
        kicking: rng.int(6, 13),
        oneOnOnes: rng.int(5, 12),
        reflexes: rng.int(6, 13),
        rushingOut: rng.int(5, 12),
        throwing: rng.int(6, 13),
        punching: rng.int(5, 12),
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
    id: negativeId,
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    commonName: null,
    clubId: club.id,
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
    squadNumber: rng.int(40, 99),
    contract: { expires: '2028-06-30', wageWeeklyEUR: rng.int(800, 4000), joined: '2026-07-01' },
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
