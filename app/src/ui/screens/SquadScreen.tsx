import { useMemo, useState } from 'react';
import { useReadyGame } from '../../state/GameContext';
import { useSquad } from '../../state/hooks';
import './PlaceholderScreen.css';
import './SquadScreen.css';

type SortKey = 'overall' | 'age' | 'name' | 'position';

function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date('2026-07-01');
  let a = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) a--;
  return a;
}

export function SquadScreen() {
  const { save } = useReadyGame();
  const squad = useSquad(save.managerClubId ?? undefined);
  const [sortKey, setSortKey] = useState<SortKey>('overall');

  const sorted = useMemo(() => {
    if (!squad) return [];
    const copy = [...squad];
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'position':
          return Object.keys(a.positions)[0]!.localeCompare(Object.keys(b.positions)[0]!);
        case 'age':
          return age(a.dateOfBirth) - age(b.dateOfBirth);
        default:
          return b.overall - a.overall;
      }
    });
    return copy;
  }, [squad, sortKey]);

  return (
    <div className="screen">
      <h1 className="screen-header">Squad</h1>
      {!squad && <p className="card-body">Loading…</p>}
      {squad && (
        <div className="squad-table-wrap">
          <table className="squad-table">
            <thead>
              <tr>
                <th onClick={() => setSortKey('name')}>Name</th>
                <th onClick={() => setSortKey('position')}>Pos</th>
                <th onClick={() => setSortKey('age')}>Age</th>
                <th onClick={() => setSortKey('overall')}>OVR</th>
                <th>POT</th>
                <th>Nat</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.generated && <span className="generated-tag">YTH</span>}
                  </td>
                  <td>{Object.keys(p.positions)[0]}</td>
                  <td className="num-cell">{age(p.dateOfBirth)}</td>
                  <td className="num-cell">{p.overall}</td>
                  <td className="num-cell">{p.potential}</td>
                  <td>{p.nationality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
