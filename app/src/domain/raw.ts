// Types mirroring fm-dataset's JSON exactly (see fm-dataset/DATA.md). These are the shapes
// fetched from public/data/*.json on first launch — never hand-edited, only imported.

export interface RawLeague {
  id: string;
  name: string;
  country: string;
  tier: number;
  teams: number;
  rounds: number;
  pointsWin: number;
  tiebreakers: string[];
  promotion: {
    auto?: number;
    to?: string;
    playoff?: { positions: number[]; format: string; places: number };
  } | null;
  relegation: {
    auto?: number;
    to?: string;
    playoff?: unknown;
    playout?: unknown;
    note?: string;
  } | null;
  europe: {
    UCL?: number[];
    UEL?: number[];
    UECL?: number[];
    cupWinnerUEL?: string;
    leagueCupWinnerUECL?: string;
  } | null;
  squadRules: string;
  financialRules: string;
  startDate: string;
  endDate: string;
  winterBreak: [string, string] | null;
  transferWindows: [string, string][];
  playable: boolean;
  background?: 'simulate' | 'transferPool';
  reserveTeamRule?: string;
  source: { eaName: string };
  clubIds: string[];
}

export interface RawClub {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  leagueId: string;
  country: string;
  strength: number;
  reputation?: number;
  squadSize: number;
  city?: string;
  stadium?: { name: string; capacity: number };
  founded?: number;
  nickname?: string;
  colours?: { primary: string; secondary: string };
  metaSource?: string;
  rivals?: string[];
  finances?: {
    derived: boolean;
    ticketPriceAvgEUR: number;
    annualRevenueEUR: number;
    wageBillWeeklyEUR: number;
    wageBudgetWeeklyEUR: number;
    balanceEUR: number;
    transferBudgetEUR: number;
  };
  source: { eaName: string };
}

export type PositionCode =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export interface RawPlayer {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  commonName: string | null;
  clubId: string;
  nationality: string;
  dateOfBirth: string;
  ageAtStart: number;
  heightCm: number;
  weightKg: number;
  preferredFoot: 'Left' | 'Right';
  weakFoot: number;
  skillMoves: number;
  positions: Partial<Record<PositionCode, number>>;
  overall: number;
  potential: number;
  internationalReputation: number;
  squadNumber: number;
  contract: { expires: string; wageWeeklyEUR: number; joined: string };
  valueEUR: number;
  attributes: {
    technical: Record<string, number>;
    mental: Record<string, number>;
    physical: Record<string, number>;
    goalkeeping: Record<string, number>;
  };
  hidden: {
    consistency: number;
    importantMatches: number;
    injuryProneness: number;
    versatility: number;
    dirtiness: number;
    adaptability: number;
  };
  personality: {
    professionalism: number;
    ambition: number;
    loyalty: number;
    pressure: number;
    temperament: number;
    sportsmanship: number;
    controversy: number;
  };
  traits: string[];
  eaRatings: {
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physicality: number;
  };
  derivedFields: string[];
  generated?: boolean;
}

export interface RawCup {
  id: string;
  name: string;
  country: string;
  entrants?: string[];
  format: string;
  europeReward?: string;
}

export interface RawEuropeEntrant {
  name: string;
  country: string;
  clubId?: string;
  inDataset: boolean;
  approxStrength?: number;
}

export interface RawEurope {
  season: string;
  format: Record<string, unknown>;
  source: string;
  UCL: { pots: RawEuropeEntrant[][] };
  UEL: { pots: RawEuropeEntrant[][] };
  UECL: { pots: RawEuropeEntrant[][] };
}

export type NamePools = Record<string, { first: string[]; last: string[] }>;

export interface RawMeta {
  datasetVersion: string;
  season: { label: string; gameStart: string; seasonEnd: string };
  currency: string;
  counts: { players: number; playablePlayers: number; clubs: number; leagues: number };
}
