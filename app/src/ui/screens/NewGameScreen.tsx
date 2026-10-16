import { useEffect, useState } from 'react';
import type { RawClub, RawLeague } from '../../domain/raw';
import { useGameContext } from '../../state/GameContext';
import './NewGameScreen.css';

const PREFERRED_DEFAULT_CLUB = 'arsenal';

export function NewGameScreen() {
  const { phase, beginCareer } = useGameContext();
  const [clubs, setClubs] = useState<RawClub[] | null>(null);
  const [selected, setSelected] = useState<string>(PREFERRED_DEFAULT_CLUB);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const [leagues, allClubs] = await Promise.all([
        fetch('/data/leagues.json').then((r) => r.json() as Promise<RawLeague[]>),
        fetch('/data/clubs.json').then((r) => r.json() as Promise<RawClub[]>),
      ]);
      const league = leagues.find((l) => l.id === 'ENG1');
      const clubIds = new Set(league?.clubIds ?? []);
      const plClubs = allClubs
        .filter((c) => clubIds.has(c.id))
        .sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
      setClubs(plClubs);
      if (!plClubs.some((c) => c.id === PREFERRED_DEFAULT_CLUB) && plClubs[0]) {
        setSelected(plClubs[0].id);
      }
    })().catch((err: unknown) => console.error('Failed to load clubs for new game', err));
  }, []);

  if (phase.kind === 'importing') {
    return (
      <div className="new-game">
        <h1 className="new-game-title">Setting up your world…</h1>
        <p className="importing-stage">{phase.stage}</p>
      </div>
    );
  }

  return (
    <div className="new-game">
      <h1 className="new-game-title">New career</h1>
      <p className="new-game-subtitle">Pick a Premier League club to manage for 2026/27.</p>
      <div className="club-grid">
        {clubs === null && <p className="importing-stage">Loading clubs…</p>}
        {clubs?.map((club) => (
          <button
            key={club.id}
            type="button"
            className={`club-row${club.id === selected ? ' selected' : ''}`}
            onClick={() => setSelected(club.id)}
          >
            <span className="club-row-name">{club.name}</span>
            <span className="club-row-meta">{club.city}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="start-button"
        disabled={!clubs || starting}
        onClick={() => {
          setStarting(true);
          beginCareer(selected).catch((err: unknown) => {
            console.error('Failed to start career', err);
            setStarting(false);
          });
        }}
      >
        {starting ? 'Starting…' : 'Start career'}
      </button>
    </div>
  );
}
