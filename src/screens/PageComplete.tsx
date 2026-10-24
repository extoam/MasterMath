import { useState } from 'react';
import { formatClock } from '../engine/activeClock';
import { correctionRounds, type PageState } from '../engine/worksheet';

interface Props {
  state: PageState;
  activeMs: number;
  onDone: () => void;
}

/** Shown only once the page is clean: rounds taken and time, as plain facts. */
export function PageComplete({ state, activeMs, onDone }: Props) {
  const [showJson, setShowJson] = useState(false);
  const rounds = correctionRounds(state);
  const json = JSON.stringify({ correctionRounds: rounds, activeMs, rounds: state.rounds }, null, 2);
  return (
    <main className="screen stack">
      <h1>Page complete</h1>
      <p data-testid="rounds" style={{ fontSize: 'var(--text-problem)', margin: 0 }}>
        Correction rounds: {rounds}
      </p>
      <p data-testid="time" style={{ fontSize: 'var(--text-problem)', margin: 0 }}>
        Time: {formatClock(activeMs)}
      </p>
      <div className="row">
        <button className="primary" onClick={onDone}>
          Home
        </button>
        <button onClick={() => setShowJson((s) => !s)}>{showJson ? 'Hide details' : 'Show details'}</button>
      </div>
      {showJson && (
        <textarea data-testid="page-json" readOnly value={json} rows={12} style={{ width: '100%', font: '14px monospace' }} />
      )}
    </main>
  );
}
