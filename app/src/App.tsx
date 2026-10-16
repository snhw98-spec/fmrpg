import { useState } from 'react';
import { BottomNav, type NavScreen } from './ui/components/BottomNav';
import './ui/components/BottomNav.css';
import { InboxScreen } from './ui/screens/InboxScreen';
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen';

function App() {
  const [screen, setScreen] = useState<NavScreen>('inbox');

  return (
    <>
      {screen === 'inbox' && <InboxScreen />}
      {screen === 'squad' && (
        <PlaceholderScreen
          title="Squad"
          milestone="Milestone 1"
          body="Squad list, player profiles and attributes land with the data import and first playable league."
        />
      )}
      {screen === 'tactics' && (
        <PlaceholderScreen
          title="Tactics"
          milestone="Milestone 1"
          body="Formation, roles and instructions land with the match engine."
        />
      )}
      {screen === 'transfers' && (
        <PlaceholderScreen
          title="Transfers"
          milestone="Milestone 4"
          body="Negotiation, agents and scouting land once the core league and RPG layer are in place."
        />
      )}
      {screen === 'club' && (
        <PlaceholderScreen
          title="Club"
          milestone="Milestone 5"
          body="Board meetings, job security and club finances land with the board & media systems."
        />
      )}
      {screen === 'stats' && (
        <PlaceholderScreen
          title="Stats"
          milestone="Milestone 1"
          body="League tables and season stats land with the first playable league."
        />
      )}
      <BottomNav active={screen} onChange={setScreen} />
    </>
  );
}

export default App;
