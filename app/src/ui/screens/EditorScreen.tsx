import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ClubRow, PlayerRow } from '../../domain/types';
import { useReadyGame } from '../../state/GameContext';
import './EditorScreen.css';
import './PlaceholderScreen.css';

type EditorTab = 'leagues' | 'clubs' | 'players';

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="editor-field">
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function LeagueEditor({ leagueId, onBack }: { leagueId: string; onBack: () => void }) {
  const { db } = useReadyGame();
  const league = useLiveQuery(() => db.leagues.get(leagueId), [leagueId]);
  const [saved, setSaved] = useState(false);

  if (!league) return null;

  return (
    <div>
      <button type="button" className="editor-back" onClick={onBack}>
        &larr; Leagues
      </button>
      <h2 className="card-title">{league.name}</h2>
      <Field
        label="Economy multiplier (wages/values/budgets are scaled by this at display & negotiation time)"
        value={league.economyMultiplier}
        type="number"
        onChange={(v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) return;
          db.leagues.update(leagueId, { economyMultiplier: n }).then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1200);
          }).catch((err: unknown) => console.error('Failed to save economy multiplier', err));
        }}
      />
      {saved && <span className="editor-saved">Saved</span>}
      <p className="card-body">{league.squadRules}</p>
      <p className="card-body">{league.financialRules}</p>
    </div>
  );
}

function ClubEditor({ clubId, onBack }: { clubId: string; onBack: () => void }) {
  const { db } = useReadyGame();
  const club = useLiveQuery(() => db.clubs.get(clubId), [clubId]);
  const [saved, setSaved] = useState(false);

  if (!club) return null;

  function save(patch: Partial<ClubRow>) {
    db.clubs.update(clubId, patch).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }).catch((err: unknown) => console.error('Failed to save club', err));
  }

  return (
    <div>
      <button type="button" className="editor-back" onClick={onBack}>
        &larr; Clubs
      </button>
      <h2 className="card-title">{club.name}</h2>
      {saved && <span className="editor-saved">Saved</span>}
      <Field label="Name" value={club.name} onChange={(v) => save({ name: v })} />
      <Field label="Short name" value={club.shortName} onChange={(v) => save({ shortName: v })} />
      <Field label="Reputation (1-20)" type="number" value={club.reputation ?? 10} onChange={(v) => save({ reputation: Number(v) })} />
      <Field label="Strength" type="number" value={club.strength} onChange={(v) => save({ strength: Number(v) })} />
      {club.finances && (
        <>
          <Field
            label="Transfer budget (EUR)"
            type="number"
            value={club.finances.transferBudgetEUR}
            onChange={(v) => {
              const finances = club.finances;
              if (finances) save({ finances: { ...finances, transferBudgetEUR: Number(v) } });
            }}
          />
          <Field
            label="Weekly wage budget (EUR)"
            type="number"
            value={club.finances.wageBudgetWeeklyEUR}
            onChange={(v) => {
              const finances = club.finances;
              if (finances) save({ finances: { ...finances, wageBudgetWeeklyEUR: Number(v) } });
            }}
          />
          <Field
            label="Balance (EUR)"
            type="number"
            value={club.finances.balanceEUR}
            onChange={(v) => {
              const finances = club.finances;
              if (finances) save({ finances: { ...finances, balanceEUR: Number(v) } });
            }}
          />
        </>
      )}
    </div>
  );
}

function PlayerEditor({ playerId, onBack }: { playerId: number; onBack: () => void }) {
  const { db } = useReadyGame();
  const player = useLiveQuery(() => db.players.get(playerId), [playerId]);
  const [saved, setSaved] = useState(false);

  if (!player) return null;

  function save(patch: Partial<PlayerRow>) {
    db.players.update(playerId, patch).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }).catch((err: unknown) => console.error('Failed to save player', err));
  }

  return (
    <div>
      <button type="button" className="editor-back" onClick={onBack}>
        &larr; Players
      </button>
      <h2 className="card-title">{player.name}</h2>
      {saved && <span className="editor-saved">Saved</span>}
      <Field label="Name" value={player.name} onChange={(v) => save({ name: v })} />
      <Field label="Club ID" value={player.clubId} onChange={(v) => save({ clubId: v })} />
      <Field label="Nationality" value={player.nationality} onChange={(v) => save({ nationality: v })} />
      <Field label="Overall (1-99)" type="number" value={player.overall} onChange={(v) => save({ overall: Number(v) })} />
      <Field label="Potential (1-99)" type="number" value={player.potential} onChange={(v) => save({ potential: Number(v) })} />
      <Field label="Squad number" type="number" value={player.squadNumber} onChange={(v) => save({ squadNumber: Number(v) })} />
      <Field
        label="Weekly wage (EUR)"
        type="number"
        value={player.contract.wageWeeklyEUR}
        onChange={(v) => save({ contract: { ...player.contract, wageWeeklyEUR: Number(v) } })}
      />
    </div>
  );
}

export function EditorScreen() {
  const { db } = useReadyGame();
  const [tab, setTab] = useState<EditorTab>('leagues');
  const [search, setSearch] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);

  const leagues = useLiveQuery(() => db.leagues.toArray(), []);
  const clubs = useLiveQuery(() => db.clubs.toArray(), []);
  const players = useLiveQuery(
    () =>
      search.length < 2
        ? []
        : db.players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).limit(30).toArray(),
    [search],
  );

  if (tab === 'leagues' && selectedLeague) {
    return (
      <div className="screen">
        <LeagueEditor leagueId={selectedLeague} onBack={() => setSelectedLeague(null)} />
      </div>
    );
  }
  if (tab === 'clubs' && selectedClub) {
    return (
      <div className="screen">
        <ClubEditor clubId={selectedClub} onBack={() => setSelectedClub(null)} />
      </div>
    );
  }
  if (tab === 'players' && selectedPlayer !== null) {
    return (
      <div className="screen">
        <PlayerEditor playerId={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="screen-header">Editor</h1>
      <div className="editor-tabs">
        <button type="button" className={tab === 'leagues' ? 'active' : ''} onClick={() => setTab('leagues')}>
          Leagues
        </button>
        <button type="button" className={tab === 'clubs' ? 'active' : ''} onClick={() => setTab('clubs')}>
          Clubs
        </button>
        <button type="button" className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>
          Players
        </button>
      </div>

      {tab === 'leagues' && (
        <div className="editor-list">
          {leagues?.map((l) => (
            <button key={l.id} type="button" className="editor-row" onClick={() => setSelectedLeague(l.id)}>
              <span className="editor-row-name">{l.name}</span>
              <span className="editor-row-meta">
                {l.country} &middot; x{l.economyMultiplier}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'clubs' && (
        <>
          <input
            className="editor-search"
            placeholder="Search clubs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="editor-list">
            {clubs
              ?.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
              .slice(0, 40)
              .map((c) => (
                <button key={c.id} type="button" className="editor-row" onClick={() => setSelectedClub(c.id)}>
                  <span className="editor-row-name">{c.name}</span>
                  <span className="editor-row-meta">{c.leagueId}</span>
                </button>
              ))}
          </div>
        </>
      )}

      {tab === 'players' && (
        <>
          <input
            className="editor-search"
            placeholder="Search players by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="editor-list">
            {players?.map((p) => (
              <button key={p.id} type="button" className="editor-row" onClick={() => setSelectedPlayer(p.id)}>
                <span className="editor-row-name">{p.name}</span>
                <span className="editor-row-meta">
                  {p.clubId} &middot; {p.overall} OVR
                </span>
              </button>
            ))}
            {search.length >= 2 && players?.length === 0 && <p className="card-body">No players found.</p>}
          </div>
        </>
      )}
    </div>
  );
}
