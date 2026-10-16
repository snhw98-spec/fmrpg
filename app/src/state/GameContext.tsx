import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { openSaveDatabase, type GameDatabase } from '../data/db';
import { importWorldIfNeeded } from '../data/import';
import type { SaveSlot } from '../domain/types';
import { SAVE_ID, startNewGame } from './actions';

export type GamePhase =
  | { kind: 'loading' }
  | { kind: 'newGame' }
  | { kind: 'importing'; stage: string }
  | { kind: 'ready'; db: GameDatabase; save: SaveSlot };

interface GameContextValue {
  phase: GamePhase;
  beginCareer: (clubId: string) => Promise<void>;
  refreshSave: () => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<GamePhase>({ kind: 'loading' });
  const db = useMemo(() => openSaveDatabase(SAVE_ID), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await db.open();
      const save = await db.saves.get(SAVE_ID);
      if (cancelled) return;
      setPhase(save ? { kind: 'ready', db, save } : { kind: 'newGame' });
    })().catch((err: unknown) => {
      console.error('Failed to open save database', err);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  async function beginCareer(clubId: string) {
    setPhase({ kind: 'importing', stage: 'Starting…' });
    await importWorldIfNeeded(db, (stage) => setPhase({ kind: 'importing', stage }));
    setPhase({ kind: 'importing', stage: 'Building the fixture list…' });
    const save = await startNewGame(db, clubId);
    setPhase({ kind: 'ready', db, save });
  }

  async function refreshSave() {
    const save = await db.saves.get(SAVE_ID);
    if (save) setPhase({ kind: 'ready', db, save });
  }

  return (
    <GameContext.Provider value={{ phase, beginCareer, refreshSave }}>{children}</GameContext.Provider>
  );
}

export function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within a GameProvider');
  return ctx;
}

/** For screens that only render once the game is ready (App.tsx guards this). */
export function useReadyGame(): { db: GameDatabase; save: SaveSlot; refreshSave: () => Promise<void> } {
  const { phase, refreshSave } = useGameContext();
  if (phase.kind !== 'ready') throw new Error('useReadyGame called before the game was ready');
  return { db: phase.db, save: phase.save, refreshSave };
}
