import { useEffect, useMemo, useState } from 'react';
import type { RawClub, RawLeague } from '../../domain/raw';
import { dataUrl } from '../../data/paths';
import { useGameContext } from '../../state/GameContext';
import './NewGameScreen.css';

const PREFERRED_DEFAULT_LEAGUE = 'ENG1';
const PREFERRED_DEFAULT_CLUB = 'arsenal';
const PLAYABLE_LEAGUE_IDS = ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ITA1', 'ITA2', 'ESP1', 'ESP2', 'GER1', 'GER2'];

export function NewGameScreen() {
  const { phase, beginCareer } = useGameContext();
  const [leagues, setLeagues] = useState<RawLeague[] | null>(null);
  const [allClubs, setAllClubs] = useState<RawClub[] | null>(null);
  const [leagueId, setLeagueId] = useState<string>(PREFERRED_DEFAULT_LEAGUE);
  const [selected, setSelected] = useState<string>(PREFERRED_DEFAULT_CLUB);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const [leaguesData, clubsData] = await Promise.all([
        fetch(dataUrl('leagues.json')).then((r) => r.json() as Promise<RawLeague[]>),
        fetch(dataUrl('clubs.json')).then((r) => r.json() as Promise<RawClub[]>),
      ]);
      setLeagues(leaguesData.filter((l) => PLAYABLE_LEAGUE_IDS.includes(l.id)));
      setAllClubs(clubsData);
    })().catch((err: unknown) => console.error('Failed to load clubs for new game', err));
  }, []);

  const clubsInLeague = useMemo(() => {
    if (!leagues || !allClubs) return [];
    const league = leagues.find((l) => l.id === leagueId);
    const clubIds = new Set(league?.clubIds ?? []);
    return allClubs.filter((c) => clubIds.has(c.id)).sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
  }, [leagues, allClubs, leagueId]);

  useEffect(() => {
    if (clubsInLeague.length === 0) return;
    if (!clubsInLeague.some((c) => c.id === selected)) {
      setSelected(clubsInLeague[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubsInLeague]);

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
      <p className="new-game-subtitle">Pick a club to manage for 2026/27, in any of the 10 playable leagues.</p>

      <div className="league-tabs">
        {leagues?.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`league-tab${l.id === leagueId ? ' selected' : ''}`}
            onClick={() => setLeagueId(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="club-grid">
        {!leagues && <p className="importing-stage">Loading clubs…</p>}
        {clubsInLeague.map((club) => (
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
        disabled={!leagues || starting}
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
