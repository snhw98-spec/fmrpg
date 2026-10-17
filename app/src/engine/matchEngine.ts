import type { MatchEvent, MatchResult, SelectedPlayer, TeamMatchStats, TeamTactics } from '../domain/match';
import type { PlayerRow } from '../domain/types';
import type { Rng } from './rng';
import { computeTeamRatings } from './ratings';

/** Tunable constants. The balance harness (engine/balance/harness.ts) exists to tune these. */
export const SIM_CONFIG = {
  homeAdvantage: 1.05,
  homePossessionBoost: 0.02,
  possessionSpread: 0.018,
  baseOpportunityRate: 0.32,
  opportunityAttackExponent: 1.3,
  chanceQuality: {
    // [probability weight, base xG] — weights renormalized after attackFactor skew.
    big: { weight: 0.1, xg: 0.37 },
    good: { weight: 0.26, xg: 0.17 },
    half: { weight: 0.37, xg: 0.08 },
    speculative: { weight: 0.27, xg: 0.035 },
  },
  qualitySkewPerAttackFactor: 0.35,
  finishingMin: 0.72,
  finishingMax: 1.3,
  gkSaveMin: 0.08,
  gkSaveMax: 0.34,
  foulBaseRate: 0.028,
  cardOnFoulRate: 0.1,
  redCardShareOfCards: 0.045,
  injuryBaseRate: 0.0011,
  stoppageFirstHalf: [1, 4] as [number, number],
  stoppageSecondHalf: [2, 6] as [number, number],
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface InternalTeam {
  clubId: string;
  squad: PlayerRow[];
  xi: SelectedPlayer[];
  byId: Map<number, PlayerRow>;
  ratings: ReturnType<typeof computeTeamRatings>;
}

function buildTeam(clubId: string, squad: PlayerRow[], xi: SelectedPlayer[], tactics: TeamTactics): InternalTeam {
  return {
    clubId,
    squad,
    xi,
    byId: new Map(squad.map((p) => [p.id, p])),
    ratings: computeTeamRatings(squad, xi, tactics),
  };
}

function pickShooter(team: InternalTeam, rng: Rng): PlayerRow | null {
  const weighted: { player: PlayerRow; weight: number }[] = [];
  for (const sel of team.xi) {
    const player = team.byId.get(sel.playerId);
    if (!player) continue;
    const weight =
      sel.position === 'ST' ? 5
      : sel.position === 'LW' || sel.position === 'RW' || sel.position === 'CAM' ? 3
      : sel.position === 'CM' || sel.position === 'LM' || sel.position === 'RM' ? 1.2
      : sel.position === 'CDM' ? 0.4
      : sel.position === 'GK' ? 0
      : 0.3;
    if (weight > 0) weighted.push({ player, weight });
  }
  if (weighted.length === 0) return null;
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rng.next() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.player;
  }
  return weighted[weighted.length - 1]?.player ?? null;
}

function pickDefender(team: InternalTeam, rng: Rng): PlayerRow | null {
  const defenders = team.xi.filter((s) =>
    ['CB', 'LB', 'RB', 'CDM'].includes(s.position),
  );
  if (defenders.length === 0) return null;
  const sel = rng.pick(defenders);
  return team.byId.get(sel.playerId) ?? null;
}

function newStats(): TeamMatchStats {
  return {
    goals: 0,
    xg: 0,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    possessionPct: 0,
  };
}

export interface SimulateMatchOptions {
  /** When false, events array is still produced but callers may discard it for perf (fast-sim tier). */
  detailed?: boolean;
  /**
   * Milestone-1 stub for half-time team talks (full personality-driven version lands in
   * Milestone 3): a flat multiplier applied to one side's attack+defense for minute >
   * half-time. Doesn't change the number/order of RNG draws, so re-running the same seed
   * with a talk applied reproduces an identical first half and only changes the second —
   * which is what lets the UI reveal the match in two halves with a real decision between
   * them, despite the engine computing a match in one synchronous pass.
   */
  secondHalfTalk?: { side: 'home' | 'away'; multiplier: number };
  /** Cup/playoff/knockout fixtures: resolve a drawn scoreline via penalties rather than
   * leaving it as a draw (Milestone 2 simplifies extra time away — straight to penalties). */
  decidesKnockout?: boolean;
}

export function simulateMatch(
  homeClubId: string,
  awayClubId: string,
  homeSquad: PlayerRow[],
  awaySquad: PlayerRow[],
  homeXI: SelectedPlayer[],
  awayXI: SelectedPlayer[],
  homeTactics: TeamTactics,
  awayTactics: TeamTactics,
  rng: Rng,
  opts: SimulateMatchOptions = {},
): MatchResult {
  const home = buildTeam(homeClubId, homeSquad, homeXI, homeTactics);
  const away = buildTeam(awayClubId, awaySquad, awayXI, awayTactics);

  // Home advantage nudges both strength and possession.
  const homeAttackBase = home.ratings.attack * SIM_CONFIG.homeAdvantage;
  const homeDefenseBase = home.ratings.defense * SIM_CONFIG.homeAdvantage;
  const awayAttackBase = away.ratings.attack;
  const awayDefenseBase = away.ratings.defense;

  const midfieldDiff = home.ratings.midfield - away.ratings.midfield;
  const possessionHome = clamp(
    0.5 + midfieldDiff * SIM_CONFIG.possessionSpread + SIM_CONFIG.homePossessionBoost,
    0.3,
    0.7,
  );

  const homeStats = newStats();
  const awayStats = newStats();
  const events: MatchEvent[] = [{ minute: 0, team: 'home', type: 'kickOff' }];
  const scorers: MatchResult['scorers'] = [];

  const stoppage1 = rng.int(...SIM_CONFIG.stoppageFirstHalf);
  const stoppage2 = rng.int(...SIM_CONFIG.stoppageSecondHalf);
  const halfTimeAt = 45 + stoppage1;
  const totalMinutes = 90 + stoppage1 + stoppage2;

  let possessionTicksHome = 0;

  for (let minute = 1; minute <= totalMinutes; minute++) {
    const talk = opts.secondHalfTalk;
    const talkMult = (side: 'home' | 'away'): number =>
      talk && talk.side === side && minute > halfTimeAt ? talk.multiplier : 1;
    const homeAttack = homeAttackBase * talkMult('home');
    const homeDefense = homeDefenseBase * talkMult('home');
    const awayAttack = awayAttackBase * talkMult('away');
    const awayDefense = awayDefenseBase * talkMult('away');

    const attackingHome = rng.chance(possessionHome);
    if (attackingHome) possessionTicksHome++;

    const [attacker, defender, attackerStats, defenderStats, attackRating, defenseRating] = attackingHome
      ? [home, away, homeStats, awayStats, homeAttack, awayDefense]
      : [away, home, awayStats, homeStats, awayAttack, homeDefense];
    const team: 'home' | 'away' = attackingHome ? 'home' : 'away';
    const gkRating = attackingHome ? away.ratings.gk : home.ratings.gk;

    const attackFactor = Math.pow(
      Math.max(0.2, attackRating / Math.max(4, defenseRating)),
      SIM_CONFIG.opportunityAttackExponent,
    );
    // A higher-pressing defense disrupts buildup before it reaches a chance.
    const pressDampening = 1 - 0.18 * defender.ratings.pressIntent;
    const opportunityP = clamp(
      SIM_CONFIG.baseOpportunityRate * attackFactor * (0.75 + 0.5 * attacker.ratings.attackingIntent) * pressDampening,
      0.015,
      0.5,
    );

    if (rng.chance(opportunityP)) {
      const skew = clamp((attackFactor - 1) * SIM_CONFIG.qualitySkewPerAttackFactor, -0.3, 0.6);
      const q = SIM_CONFIG.chanceQuality;
      const weights: [keyof typeof q, number][] = [
        ['big', q.big.weight * (1 + skew)],
        ['good', q.good.weight * (1 + skew * 0.6)],
        ['half', q.half.weight],
        ['speculative', q.speculative.weight * (1 - skew * 0.4)],
      ];
      const total = weights.reduce((s, [, w]) => s + Math.max(0.01, w), 0);
      let r = rng.next() * total;
      let tier: keyof typeof q = 'speculative';
      for (const [t, w] of weights) {
        r -= Math.max(0.01, w);
        if (r <= 0) {
          tier = t;
          break;
        }
      }

      const baseXg = clamp(rng.gaussian(q[tier].xg, q[tier].xg * 0.3), 0.01, 0.9);

      const shooter = pickShooter(attacker, rng);
      const finishing = shooter?.attributes.technical.finishing ?? 10;
      const composure = shooter?.attributes.mental.composure ?? 10;
      const finishingMultiplier = clamp(
        SIM_CONFIG.finishingMin + ((finishing + composure) / 2 / 20) * (SIM_CONFIG.finishingMax - SIM_CONFIG.finishingMin),
        SIM_CONFIG.finishingMin,
        SIM_CONFIG.finishingMax,
      );
      const gkSaveFactor = clamp(
        SIM_CONFIG.gkSaveMin + (gkRating / 20) * (SIM_CONFIG.gkSaveMax - SIM_CONFIG.gkSaveMin),
        SIM_CONFIG.gkSaveMin,
        SIM_CONFIG.gkSaveMax,
      );
      const goalProbability = clamp(baseXg * finishingMultiplier * (1 - gkSaveFactor), 0.01, 0.92);

      attackerStats.shots++;
      attackerStats.xg += baseXg;

      const roll = rng.next();
      let outcome: 'goal' | 'saved' | 'offTarget' | 'blocked';
      if (roll < goalProbability) {
        outcome = 'goal';
        attackerStats.goals++;
        attackerStats.shotsOnTarget++;
        if (shooter) scorers.push({ minute, team, playerId: shooter.id });
      } else {
        // Allocate the remaining probability mass by chance tier: better chances are more
        // often saved/blocked (on target); speculative efforts more often fly wide.
        const onTargetChance = tier === 'big' || tier === 'good' ? 0.75 : tier === 'half' ? 0.55 : 0.3;
        if (rng.chance(onTargetChance)) {
          attackerStats.shotsOnTarget++;
          outcome = rng.chance(0.5) ? 'saved' : 'blocked';
          if (outcome === 'saved') defenderStats.corners += rng.chance(0.35) ? 1 : 0;
        } else {
          outcome = rng.chance(0.4) ? 'blocked' : 'offTarget';
          if (outcome === 'blocked') attackerStats.corners += rng.chance(0.4) ? 1 : 0;
        }
      }

      if (opts.detailed !== false) {
        events.push({
          minute,
          team,
          type: 'shot',
          playerId: shooter?.id ?? 0,
          xg: Number(baseXg.toFixed(3)),
          outcome,
        });
      }
    }

    // Fouls: the defending side commits them while trying to stop the attacker. A higher
    // pressing intensity means more committed challenges, and therefore more fouls.
    const foulRate = SIM_CONFIG.foulBaseRate * (0.7 + 0.6 * defender.ratings.pressIntent);
    if (rng.chance(foulRate)) {
      const fouler = pickDefender(defender, rng);
      defenderStats.fouls++;
      let card: 'none' | 'yellow' | 'red' = 'none';
      const dirtiness = fouler?.hidden.dirtiness ?? 8;
      const cardChance = SIM_CONFIG.cardOnFoulRate * (0.5 + dirtiness / 20);
      if (rng.chance(cardChance)) {
        card = rng.chance(SIM_CONFIG.redCardShareOfCards) ? 'red' : 'yellow';
        if (card === 'yellow') defenderStats.yellowCards++;
        else defenderStats.redCards++;
      }
      if (opts.detailed !== false) {
        events.push({
          minute,
          team: defender === home ? 'home' : 'away',
          type: 'foul',
          playerId: fouler?.id ?? 0,
          card,
        });
      }
    }

    // Injuries: rare, scaled by the individual's injury proneness. Skipped for a side with
    // no named XI (a background-league club with an unusably thin dataset squad).
    for (const [side, squadTeam] of [['home', home] as const, ['away', away] as const]) {
      if (squadTeam.xi.length === 0) continue;
      const candidate = rng.pick(squadTeam.xi);
      const player = squadTeam.byId.get(candidate.playerId);
      const proneness = player?.hidden.injuryProneness ?? 10;
      if (rng.chance(SIM_CONFIG.injuryBaseRate * (proneness / 10)) && opts.detailed !== false) {
        events.push({ minute, team: side, type: 'injury', playerId: player?.id ?? 0 });
      }
    }

    if (minute === halfTimeAt) {
      events.push({ minute, team: 'home', type: 'halfTime' });
    }
  }

  events.push({ minute: totalMinutes, team: 'home', type: 'fullTime' });

  homeStats.possessionPct = Math.round((possessionTicksHome / totalMinutes) * 100);
  awayStats.possessionPct = 100 - homeStats.possessionPct;
  homeStats.xg = Number(homeStats.xg.toFixed(2));
  awayStats.xg = Number(awayStats.xg.toFixed(2));

  let penaltyWinner: 'home' | 'away' | undefined;
  if (opts.decidesKnockout && homeStats.goals === awayStats.goals) {
    penaltyWinner = resolveShootout(home, away, rng);
  }

  return {
    homeClubId,
    awayClubId,
    home: homeStats,
    away: awayStats,
    scorers,
    events,
    ...(penaltyWinner ? { penaltyWinner } : {}),
  };
}

/** Simplified shootout: a weighted coin flip on each side's average composure + goalkeeper
 * shot-stopping, rather than simulating individual kicks. */
function resolveShootout(home: InternalTeam, away: InternalTeam, rng: Rng): 'home' | 'away' {
  const strength = (team: InternalTeam): number => {
    const outfield = team.xi.filter((s) => s.position !== 'GK');
    const composure =
      outfield.reduce((sum, s) => sum + (team.byId.get(s.playerId)?.attributes.mental.composure ?? 10), 0) /
      Math.max(1, outfield.length);
    return composure + team.ratings.gk * 0.5;
  };
  const homeStrength = strength(home);
  const awayStrength = strength(away);
  const pHome = homeStrength / Math.max(1, homeStrength + awayStrength);
  return rng.chance(pHome) ? 'home' : 'away';
}
