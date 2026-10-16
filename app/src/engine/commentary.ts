import type { MatchEvent } from '../domain/match';
import type { ClubRow, PlayerRow } from '../domain/types';

export interface CommentaryContext {
  homeClub: ClubRow;
  awayClub: ClubRow;
  playerName: (id: number) => string;
}

export function buildCommentaryContext(homeClub: ClubRow, awayClub: ClubRow, players: PlayerRow[]): CommentaryContext {
  const byId = new Map(players.map((p) => [p.id, p]));
  return {
    homeClub,
    awayClub,
    playerName: (id) => byId.get(id)?.name ?? 'Unknown player',
  };
}

/** True for events worth showing in "key moments" viewing mode. */
export function isKeyMoment(event: MatchEvent): boolean {
  switch (event.type) {
    case 'shot':
      return event.outcome === 'goal' || event.xg >= 0.25;
    case 'foul':
      return event.card !== 'none';
    case 'injury':
    case 'halfTime':
    case 'fullTime':
    case 'kickOff':
      return true;
    default:
      return false;
  }
}

export function describeEvent(event: MatchEvent, ctx: CommentaryContext): string {
  const clubName = (team: 'home' | 'away') => (team === 'home' ? ctx.homeClub.shortName : ctx.awayClub.shortName);

  switch (event.type) {
    case 'kickOff':
      return `Kick-off: ${ctx.homeClub.name} vs ${ctx.awayClub.name}.`;
    case 'halfTime':
      return 'Half-time.';
    case 'fullTime':
      return 'Full-time.';
    case 'shot': {
      const player = ctx.playerName(event.playerId);
      if (event.outcome === 'goal') return `GOAL! ${player} scores for ${clubName(event.team)}! (xG ${event.xg})`;
      if (event.outcome === 'saved') return `${player} forces a save for ${clubName(event.team)}. (xG ${event.xg})`;
      if (event.outcome === 'blocked') return `${player}'s shot is blocked. (xG ${event.xg})`;
      return `${player} fires wide for ${clubName(event.team)}. (xG ${event.xg})`;
    }
    case 'corner':
      return `Corner to ${clubName(event.team)}.`;
    case 'foul': {
      const player = ctx.playerName(event.playerId);
      if (event.card === 'red') return `RED CARD! ${player} (${clubName(event.team)}) is sent off.`;
      if (event.card === 'yellow') return `Yellow card for ${player} (${clubName(event.team)}).`;
      return `Foul by ${player} (${clubName(event.team)}).`;
    }
    case 'injury':
      return `${ctx.playerName(event.playerId)} (${clubName(event.team)}) goes down injured.`;
    default:
      return '';
  }
}
