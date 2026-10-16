import { useState } from 'react';
import { GameProvider, useGameContext } from './state/GameContext';
import { BottomNav, type NavScreen } from './ui/components/BottomNav';
import './ui/components/BottomNav.css';
import { ClubScreen } from './ui/screens/ClubScreen';
import { EditorScreen } from './ui/screens/EditorScreen';
import { InboxScreen } from './ui/screens/InboxScreen';
import { MatchScreen } from './ui/screens/MatchScreen';
import { NewGameScreen } from './ui/screens/NewGameScreen';
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen';
import './ui/screens/PlaceholderScreen.css';
import { SquadScreen } from './ui/screens/SquadScreen';
import { StatsScreen } from './ui/screens/StatsScreen';
import { TacticsScreen } from './ui/screens/TacticsScreen';

function ReadyApp() {
  const [screen, setScreen] = useState<NavScreen>('inbox');
  const [playingFixtureId, setPlayingFixtureId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (playingFixtureId) {
    return (
      <MatchScreen
        fixtureId={playingFixtureId}
        onDone={() => {
          setPlayingFixtureId(null);
          setScreen('stats');
        }}
      />
    );
  }

  if (editorOpen) {
    return (
      <>
        <EditorScreen />
        <BottomNavBackBar onBack={() => setEditorOpen(false)} />
      </>
    );
  }

  return (
    <>
      {screen === 'inbox' && <InboxScreen onPlayFixture={setPlayingFixtureId} />}
      {screen === 'squad' && <SquadScreen />}
      {screen === 'tactics' && <TacticsScreen />}
      {screen === 'transfers' && (
        <PlaceholderScreen
          title="Transfers"
          milestone="Milestone 4"
          body="Negotiation, agents and scouting land once the core league and RPG layer are in place."
        />
      )}
      {screen === 'club' && <ClubScreen onOpenEditor={() => setEditorOpen(true)} />}
      {screen === 'stats' && <StatsScreen />}
      <BottomNav active={screen} onChange={setScreen} />
    </>
  );
}

function BottomNavBackBar({ onBack }: { onBack: () => void }) {
  return (
    <nav className="bottom-nav">
      <button type="button" className="bottom-nav-item active" onClick={onBack} style={{ flex: 1 }}>
        <span className="bottom-nav-icon" aria-hidden="true">
          &larr;
        </span>
        <span className="bottom-nav-label">Back to Club</span>
      </button>
    </nav>
  );
}

function AppShell() {
  const { phase } = useGameContext();

  if (phase.kind === 'loading') {
    return (
      <div className="screen">
        <p className="card-body">Loading…</p>
      </div>
    );
  }
  if (phase.kind === 'newGame' || phase.kind === 'importing') {
    return <NewGameScreen />;
  }
  return <ReadyApp />;
}

function App() {
  return (
    <GameProvider>
      <AppShell />
    </GameProvider>
  );
}

export default App;
