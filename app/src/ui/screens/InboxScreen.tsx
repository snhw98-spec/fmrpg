import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { Fixture } from '../../domain/competition';
import { useReadyGame } from '../../state/GameContext';
import { useClub, useManagerClub } from '../../state/hooks';
import { myNextFixture, rolloverToNextSeason } from '../../state/world';
import './PlaceholderScreen.css';

const CUP_NAMES: Record<string, string> = {
  FA_CUP: 'FA Cup',
  EFL_CUP: 'EFL Cup',
  EFL_TROPHY: 'EFL Trophy',
  COPPA_ITALIA: 'Coppa Italia',
  COPA_DEL_REY: 'Copa del Rey',
  DFB_POKAL: 'DFB-Pokal',
  UCL: 'Champions League',
  UEL: 'Europa League',
  UECL: 'Conference League',
};

function describeFixture(f: Fixture): string {
  if (f.kind === 'league') return `Matchday ${f.round}`;
  const name = CUP_NAMES[f.competitionId] ?? f.competitionId;
  if (f.kind === 'europeLeaguePhase') return `${name} — matchday ${f.round}`;
  if (f.kind === 'europeKnockout') return f.round === 1000 ? `${name} — knockout play-off` : `${name} — knockout`;
  if (f.kind === 'playoff') return `${name}`;
  return `${name} — round ${f.round}`;
}

export function InboxScreen({ onPlayFixture }: { onPlayFixture: (fixtureId: string) => void }) {
  const { db, save, refreshSave } = useReadyGame();
  const managerClub = useManagerClub();
  const [rollingOver, setRollingOver] = useState(false);

  const fixture = useLiveQuery(
    () => (save.managerClubId ? myNextFixture(db, save.currentSeason, save.managerClubId) : null),
    [db, save.currentSeason, save.managerClubId],
  );
  const opponentId = fixture
    ? fixture.homeClubId === save.managerClubId
      ? fixture.awayClubId
      : fixture.homeClubId
    : undefined;
  const opponent = useClub(opponentId ?? undefined);

  async function advanceSeason() {
    setRollingOver(true);
    await rolloverToNextSeason(db, save.currentSeason);
    await refreshSave();
    setRollingOver(false);
  }

  return (
    <div className="screen">
      <h1 className="screen-header">Inbox</h1>

      <div className="card">
        <span className="milestone-badge">{managerClub?.name ?? '…'}</span>
        <h2 className="card-title">
          {new Date(save.currentDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        <p className="card-body">Season {save.currentSeason}</p>

        {fixture === undefined && <p className="card-body">Loading…</p>}

        {fixture === null && (
          <>
            <p className="card-body">The season is complete. Check Stats for the final table.</p>
            <button type="button" className="primary-button" style={{ marginTop: 10 }} onClick={() => void advanceSeason()} disabled={rollingOver}>
              {rollingOver ? 'Rolling over…' : 'Advance to next season'}
            </button>
          </>
        )}

        {fixture && (
          <>
            <p className="card-body">
              {describeFixture(fixture)}:{' '}
              {fixture.homeClubId === save.managerClubId ? (
                <>
                  <strong>{managerClub?.shortName}</strong> vs {opponent?.shortName ?? '…'}
                </>
              ) : (
                <>
                  {opponent?.shortName ?? '…'} vs <strong>{managerClub?.shortName}</strong>
                </>
              )}
              {' '}&middot; {fixture.date}
            </p>
            <button type="button" className="primary-button" style={{ marginTop: 10 }} onClick={() => onPlayFixture(fixture.id)}>
              Play match
            </button>
          </>
        )}
      </div>
    </div>
  );
}
