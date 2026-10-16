import { useManagerClub } from '../../state/hooks';
import './PlaceholderScreen.css';

export function ClubScreen({ onOpenEditor }: { onOpenEditor: () => void }) {
  const club = useManagerClub();

  return (
    <div className="screen">
      <h1 className="screen-header">Club</h1>
      <div className="card">
        <span className="milestone-badge">Milestone 5</span>
        <h2 className="card-title">{club?.name ?? 'Your club'}</h2>
        <p className="card-body">
          Board meetings, job security, the sporting director and club finances land with the board & media
          systems.
        </p>
      </div>
      <div className="card">
        <h2 className="card-title">Editor</h2>
        <p className="card-body">
          Fix anything wrong in the imported data — ratings, club finances, league economy multipliers.
        </p>
        <button type="button" className="primary-button" onClick={onOpenEditor}>
          Open editor
        </button>
      </div>
    </div>
  );
}
