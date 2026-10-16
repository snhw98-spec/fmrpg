import { currentMatchday } from '../../state/actions';
import { useReadyGame } from '../../state/GameContext';
import { useClubsById, useLeagueFixtures, useManagerClub } from '../../state/hooks';
import './PlaceholderScreen.css';

export function InboxScreen({ onPlayFixture }: { onPlayFixture: (fixtureId: string) => void }) {
  const { save } = useReadyGame();
  const managerClub = useManagerClub();
  const fixtures = useLeagueFixtures();
  const clubsById = useClubsById();

  const matchday = fixtures ? currentMatchday(fixtures) : null;
  const myFixture =
    matchday !== null && fixtures
      ? fixtures.find(
          (f) =>
            f.matchday === matchday &&
            (f.homeClubId === save.managerClubId || f.awayClubId === save.managerClubId),
        )
      : undefined;

  const seasonOver = fixtures && fixtures.every((f) => f.result);

  return (
    <div className="screen">
      <h1 className="screen-header">Inbox</h1>

      <div className="card">
        <span className="milestone-badge">{managerClub?.name ?? '…'}</span>
        <h2 className="card-title">{new Date(save.currentDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        {seasonOver && <p className="card-body">The season is complete. Check Stats for the final table.</p>}
        {!seasonOver && !myFixture && <p className="card-body">No fixture scheduled yet — advancing…</p>}
        {!seasonOver && myFixture && clubsById && (
          <>
            <p className="card-body">
              Matchday {myFixture.matchday}:{' '}
              {myFixture.homeClubId === save.managerClubId ? (
                <>
                  <strong>{clubsById.get(myFixture.homeClubId)?.shortName}</strong> vs{' '}
                  {clubsById.get(myFixture.awayClubId)?.shortName}
                </>
              ) : (
                <>
                  {clubsById.get(myFixture.homeClubId)?.shortName} vs{' '}
                  <strong>{clubsById.get(myFixture.awayClubId)?.shortName}</strong>
                </>
              )}
              {' '}&middot; {myFixture.date}
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 10 }}
              onClick={() => onPlayFixture(myFixture.id)}
            >
              Play match
            </button>
          </>
        )}
      </div>
    </div>
  );
}
