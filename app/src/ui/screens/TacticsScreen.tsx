import { useEffect, useState } from 'react';
import { FORMATIONS, type FormationId, type Mentality, type PressingIntensity, type TeamTactics, type Tempo, type Width } from '../../domain/match';
import type { PositionCode } from '../../domain/raw';
import { useReadyGame } from '../../state/GameContext';
import './PlaceholderScreen.css';
import './TacticsScreen.css';

const POSITION_Y: Record<PositionCode, number> = {
  GK: 92, CB: 74, LB: 72, RB: 72, CDM: 58, CM: 46, CAM: 34, LM: 46, RM: 46, LW: 22, RW: 22, ST: 12,
};

function layoutFormation(formationId: FormationId): { position: PositionCode; x: number; y: number }[] {
  const slots = FORMATIONS[formationId].slots;
  const counts = new Map<PositionCode, number>();
  for (const s of slots) counts.set(s.position, (counts.get(s.position) ?? 0) + 1);
  const seen = new Map<PositionCode, number>();

  return slots.map((s) => {
    const total = counts.get(s.position) ?? 1;
    const idx = seen.get(s.position) ?? 0;
    seen.set(s.position, idx + 1);
    const spread = total === 1 ? [50] : Array.from({ length: total }, (_, i) => 15 + (70 * i) / (total - 1));
    return { position: s.position, x: spread[idx] ?? 50, y: POSITION_Y[s.position] };
  });
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tactics-group">
      <div className="tactics-group-label">{label}</div>
      <div className="tactics-options">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`tactics-option${opt === value ? ' active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TacticsScreen() {
  const { db, save } = useReadyGame();
  const [tactics, setTactics] = useState<TeamTactics | null>(null);

  useEffect(() => {
    if (!save.managerClubId) return;
    db.tactics.get(save.managerClubId).then((row) => {
      if (row) setTactics(row);
    }).catch((err: unknown) => console.error('Failed to load tactics', err));
  }, [db, save.managerClubId]);

  function update(patch: Partial<TeamTactics>) {
    if (!tactics || !save.managerClubId) return;
    const next = { ...tactics, ...patch };
    setTactics(next);
    db.tactics.put({ clubId: save.managerClubId, ...next }).catch((err: unknown) => console.error('Failed to save tactics', err));
  }

  if (!tactics) {
    return (
      <div className="screen">
        <h1 className="screen-header">Tactics</h1>
        <p className="card-body">Loading…</p>
      </div>
    );
  }

  const layout = layoutFormation(tactics.formationId);

  return (
    <div className="screen">
      <h1 className="screen-header">Tactics</h1>

      <div className="formation-pitch">
        {layout.map((p, i) => (
          <div key={i} className="formation-dot" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {p.position}
          </div>
        ))}
      </div>

      <OptionGroup
        label="Formation"
        options={Object.keys(FORMATIONS) as FormationId[]}
        value={tactics.formationId}
        onChange={(v) => update({ formationId: v })}
      />
      <OptionGroup
        label="Mentality"
        options={['defensive', 'balanced', 'attacking'] as Mentality[]}
        value={tactics.mentality}
        onChange={(v) => update({ mentality: v })}
      />
      <OptionGroup
        label="Pressing"
        options={['low', 'medium', 'high'] as PressingIntensity[]}
        value={tactics.pressing}
        onChange={(v) => update({ pressing: v })}
      />
      <OptionGroup
        label="Tempo"
        options={['slow', 'normal', 'fast'] as Tempo[]}
        value={tactics.tempo}
        onChange={(v) => update({ tempo: v })}
      />
      <OptionGroup
        label="Width"
        options={['narrow', 'normal', 'wide'] as Width[]}
        value={tactics.width}
        onChange={(v) => update({ width: v })}
      />
    </div>
  );
}
