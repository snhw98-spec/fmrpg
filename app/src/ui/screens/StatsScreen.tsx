import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { computeTable } from '../../engine/season';
import { PLAYABLE_LEAGUE_ID } from '../../state/actions';
import { useReadyGame } from '../../state/GameContext';
import { useClubsById, useLeagueFixtures } from '../../state/hooks';
import './PlaceholderScreen.css';
import './SquadScreen.css';

export function StatsScreen() {
  const { db, save } = useReadyGame();
  const fixtures = useLeagueFixtures();
  const clubsById = useClubsById();

  const table = useMemo(() => {
    if (!fixtures || !clubsById) return [];
    return computeTable([...clubsById.keys()], fixtures);
  }, [fixtures, clubsById]);

  const topScorers = useMemo(() => {
    if (!fixtures) return [];
    const goals = new Map<number, number>();
    for (const f of fixtures) {
      if (!f.result) continue;
      for (const s of f.result.scorers) {
        goals.set(s.playerId, (goals.get(s.playerId) ?? 0) + 1);
      }
    }
    return [...goals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [fixtures]);

  const scorerIds = useMemo(() => topScorers.map(([id]) => id), [topScorers]);
  const scorerNames = useLiveQuery(async () => {
    if (scorerIds.length === 0) return new Map<number, string>();
    const rows = await db.players.bulkGet(scorerIds);
    return new Map(rows.filter((r) => !!r).map((r) => [r.id, r.name]));
  }, [scorerIds]);

  return (
    <div className="screen">
      <h1 className="screen-header">Stats</h1>
      <h2 className="card-title">Premier League table</h2>
      <div className="squad-table-wrap">
        <table className="squad-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Club</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => (
              <tr key={row.clubId} style={row.clubId === save.managerClubId ? { color: 'var(--accent)' } : undefined}>
                <td>{i + 1}</td>
                <td>{clubsById?.get(row.clubId)?.shortName ?? row.clubId}</td>
                <td className="num-cell">{row.played}</td>
                <td className="num-cell">{row.won}</td>
                <td className="num-cell">{row.drawn}</td>
                <td className="num-cell">{row.lost}</td>
                <td className="num-cell">{row.goalDifference}</td>
                <td className="num-cell">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {topScorers.length > 0 && (
        <>
          <h2 className="card-title" style={{ marginTop: 20 }}>
            Top scorers
          </h2>
          <div className="squad-table-wrap">
            <table className="squad-table">
              <tbody>
                {topScorers.map(([playerId, goals]) => (
                  <tr key={playerId}>
                    <td>{scorerNames?.get(playerId) ?? `Player #${playerId}`}</td>
                    <td className="num-cell">{goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export const STATS_LEAGUE_ID = PLAYABLE_LEAGUE_ID;
