import { useEffect, useMemo, useState } from 'react';
import type { MatchEvent, MatchResult } from '../../domain/match';
import { buildCommentaryContext, describeEvent, isKeyMoment } from '../../engine/commentary';
import {
  advanceDateToMatchday,
  currentMatchday,
  prepareMatch,
  runMatch,
  simulateFixture,
  simulateRestOfMatchday,
  type MatchPreparation,
} from '../../state/actions';
import { useReadyGame } from '../../state/GameContext';
import { useClub } from '../../state/hooks';
import './MatchScreen.css';

type ViewMode = 'instant' | 'key' | 'full';
type Stage = 'loading' | 'firstHalf' | 'played';

const TALK_OPTIONS: { label: string; multiplier: number }[] = [
  { label: 'Calm — steady as we are', multiplier: 1.02 },
  { label: 'Assertive — raise the tempo', multiplier: 1.05 },
  { label: 'Passionate — go out and win it', multiplier: 1.07 },
  { label: 'Say nothing', multiplier: 1.0 },
];

function scoreAt(result: MatchResult, uptoMinute: number): [number, number] {
  let h = 0;
  let a = 0;
  for (const s of result.scorers) {
    if (s.minute > uptoMinute) continue;
    if (s.team === 'home') h++;
    else a++;
  }
  return [h, a];
}

export function MatchScreen({ fixtureId, onDone }: { fixtureId: string; onDone: () => void }) {
  const { db, save, refreshSave } = useReadyGame();
  const [mode, setMode] = useState<ViewMode>('key');
  const [stage, setStage] = useState<Stage>('loading');
  const [prep, setPrep] = useState<MatchPreparation | null>(null);
  const [preview, setPreview] = useState<MatchResult | null>(null);
  const [final, setFinal] = useState<MatchResult | null>(null);
  const [talkChosen, setTalkChosen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const preparation = await prepareMatch(db, fixtureId);
      if (cancelled) return;
      setPrep(preparation);
      if (preparation.fixture.result) {
        setFinal(preparation.fixture.result);
        setStage('played');
        return;
      }
      const previewResult = runMatch(preparation);
      if (cancelled) return;
      setPreview(previewResult);
      setStage('firstHalf');
    })().catch((err: unknown) => console.error('Failed to prepare match', err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, fixtureId]);

  const homeClub = useClub(prep?.fixture.homeClubId);
  const awayClub = useClub(prep?.fixture.awayClubId);

  const commentary = useMemo(() => {
    if (!prep || !homeClub || !awayClub) return null;
    return buildCommentaryContext(homeClub, awayClub, [...prep.homeSquad, ...prep.awaySquad]);
  }, [prep, homeClub, awayClub]);

  const halfTimeMinute = preview?.events.find((e) => e.type === 'halfTime')?.minute ?? 45;

  async function pickTalk(multiplier: number) {
    if (!prep || !db) return;
    setTalkChosen(true);
    const managerSide: 'home' | 'away' = prep.fixture.homeClubId === save.managerClubId ? 'home' : 'away';
    const result = await simulateFixture(db, fixtureId, {
      secondHalfTalk: multiplier === 1 ? undefined : { side: managerSide, multiplier },
    });
    setFinal(result);
    setStage('played');
  }

  async function goInstant() {
    if (!db) return;
    const result = await simulateFixture(db, fixtureId);
    setFinal(result);
    setStage('played');
  }

  async function finish() {
    if (!prep || finishing) return;
    setFinishing(true);
    await simulateRestOfMatchday(db, prep.fixture.matchday, save.managerClubId ?? '');
    const fixtures = await db.fixtures.where('leagueId').equals(prep.fixture.leagueId).toArray();
    const next = currentMatchday(fixtures);
    if (next !== null) await advanceDateToMatchday(db, next);
    await refreshSave();
    onDone();
  }

  if (stage === 'loading' || !prep || !commentary) {
    return (
      <div className="match-screen">
        <div className="match-header">
          <p className="match-status">Loading match…</p>
        </div>
      </div>
    );
  }

  const displayResult = final ?? preview;
  if (!displayResult) return null;

  const [homeNow, awayNow] = stage === 'played' && final ? [final.home.goals, final.away.goals] : scoreAt(displayResult, halfTimeMinute);

  const eventFilter = (e: MatchEvent) => (mode === 'full' ? true : isKeyMoment(e));
  const firstHalfEvents = displayResult.events.filter((e) => e.minute <= halfTimeMinute && eventFilter(e));
  const secondHalfEvents = final ? final.events.filter((e) => e.minute > halfTimeMinute && eventFilter(e)) : [];

  return (
    <div className="match-screen">
      <div className="match-header">
        <div className="match-teams">
          {commentary.homeClub.name} vs {commentary.awayClub.name}
        </div>
        <div className="match-score">
          {homeNow} – {awayNow}
        </div>
        <div className="match-status">
          {stage === 'firstHalf' ? `First half (kick-off)` : 'Full-time'}
        </div>
      </div>

      {stage === 'firstHalf' && !talkChosen && (
        <div className="match-mode-switch">
          {(['instant', 'key', 'full'] as ViewMode[]).map((m) => (
            <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)} type="button">
              {m === 'instant' ? 'Instant' : m === 'key' ? 'Key moments' : 'Full commentary'}
            </button>
          ))}
        </div>
      )}

      {mode === 'instant' && stage === 'firstHalf' && !talkChosen && (
        <div className="match-footer">
          <button className="primary-button" type="button" onClick={goInstant}>
            Simulate match
          </button>
        </div>
      )}

      {mode !== 'instant' && (
        <div className="match-feed">
          {firstHalfEvents.map((e, i) => (
            <div className="match-event-line" key={`fh-${i}`}>
              <span className="match-event-minute">{e.minute}&apos;</span>
              <span>{describeEvent(e, commentary)}</span>
            </div>
          ))}

          {stage === 'firstHalf' && !talkChosen && (
            <div className="halftime-card">
              <h3>Half-time: {homeNow}–{awayNow}</h3>
              <p className="card-body">Say something to the dressing room?</p>
              <div className="talk-options">
                {TALK_OPTIONS.map((opt) => (
                  <button key={opt.label} type="button" onClick={() => void pickTalk(opt.multiplier)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {secondHalfEvents.map((e, i) => (
            <div className="match-event-line" key={`sh-${i}`}>
              <span className="match-event-minute">{e.minute}&apos;</span>
              <span>{describeEvent(e, commentary)}</span>
            </div>
          ))}
        </div>
      )}

      {stage === 'played' && final && (
        <div className="match-footer">
          <table className="boxscore">
            <tbody>
              <tr>
                <td>{final.home.shots}</td>
                <td>Shots</td>
                <td>{final.away.shots}</td>
              </tr>
              <tr>
                <td>{final.home.shotsOnTarget}</td>
                <td>On target</td>
                <td>{final.away.shotsOnTarget}</td>
              </tr>
              <tr>
                <td>{final.home.xg.toFixed(2)}</td>
                <td>xG</td>
                <td>{final.away.xg.toFixed(2)}</td>
              </tr>
              <tr>
                <td>{final.home.possessionPct}%</td>
                <td>Possession</td>
                <td>{final.away.possessionPct}%</td>
              </tr>
            </tbody>
          </table>
          <button className="primary-button" type="button" style={{ marginTop: 12 }} onClick={() => void finish()} disabled={finishing}>
            {finishing ? 'Updating results…' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}
