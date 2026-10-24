import { useEffect, useState } from 'react';
import { loadTemplates, resetAllData } from '../db/repo';
import { formatClock } from '../engine/activeClock';
import type { ParentSummary } from '../engine/parent';
import type { Template } from '../ink/templates';
import { DIGITS } from '../ink/types';
import '../ui/Home.css';
import '../ui/Parent.css';

interface Props {
  summary: ParentSummary;
  onClose: () => void;
  /** Development server only: move saved work a day back to try the next-day steps. */
  onDevTomorrow?: () => void;
}

const date = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const STATE_LABEL = { clean: '100%', 'corrections-due': 'Corrections due', 'being-marked': 'Marked tomorrow' } as const;

/** For the parent: where she is, the correction plan, how each block went, what keeps coming back, and how the handwriting reads. */
export function ParentView({ summary: s, onClose, onDevTomorrow }: Props) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    setResetting(true);
    try {
      await resetAllData();
    } finally {
      window.location.reload(); // start as on first opening
    }
  };
  useEffect(() => {
    loadTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);
  const plan = s.worksheets.filter((w) => w.state !== 'clean');
  const overrides = templates?.filter((t) => t.source === 'override').length ?? 0;

  return (
    <main className="home parent" data-testid="parent-view">
      <header className="home-head">
        <div>
          <h1>Parent view</h1>
          <span className="date">Progress and correction plan</span>
        </div>
        <button onClick={onClose} data-testid="parent-close">
          Done
        </button>
      </header>

      <section className="card stats">
        <div>
          <b data-testid="parent-next">{s.nextSheet ?? 'Done'}</b>
          <span>next sheet</span>
        </div>
        <div>
          <b data-testid="parent-worksheets">{s.worksheetsDone}</b>
          <span>worksheets</span>
        </div>
        <div>
          <b data-testid="parent-days">{s.homeworkDaysThisMonth}</b>
          <span>homework days this month</span>
        </div>
        <div>
          <b>{s.blocks.filter((b) => b.attempt > 1).length}</b>
          <span>blocks repeated</span>
        </div>
      </section>

      <section className="card">
        <h3>Correction plan</h3>
        {plan.length === 0 ? (
          <p className="muted" data-testid="parent-plan-empty">
            Nothing to correct. Every handed-in worksheet is 100%.
          </p>
        ) : (
          <ul className="plan" data-testid="parent-plan">
            {plan.map((w) => (
              <li key={w.index}>
                <b>Worksheet {w.index}</b> · {STATE_LABEL[w.state]} · {w.toFix.reduce((n, f) => n + f.count, 0)} to correct
                <span className="muted"> on {w.toFix.map((f) => `${f.code} (${f.count})`).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Worksheets</h3>
        {s.worksheets.length === 0 ? (
          <p className="muted">No worksheet handed in yet.</p>
        ) : (
          <table data-testid="parent-worksheets-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sheets</th>
                <th>Handed in</th>
                <th>Right first time</th>
                <th>Time</th>
                <th>Correction rounds</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {[...s.worksheets].reverse().map((w) => (
                <tr key={w.index}>
                  <td>{w.index}</td>
                  <td>
                    {w.firstSheet}–{w.lastSheet}
                  </td>
                  <td>{date(w.handedInAt)}</td>
                  <td>{w.firstPassPct}%</td>
                  <td>{formatClock(w.activeMs)}</td>
                  <td>{w.correctionRounds}</td>
                  <td>{STATE_LABEL[w.state]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Blocks</h3>
        {s.blocks.length === 0 ? (
          <p className="muted">No block finished yet.</p>
        ) : (
          <table data-testid="parent-blocks-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Try</th>
                <th>Right first time</th>
                <th>Median side</th>
                <th>Target</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {[...s.blocks].reverse().map((b, i) => (
                <tr key={i}>
                  <td>
                    B{b.first} <span className="muted">{b.title}</span>
                  </td>
                  <td>{b.attempt}</td>
                  <td>{b.firstPassPct}%</td>
                  <td>{formatClock(b.medianSideMs)}</td>
                  <td>{formatClock(b.targetSideMs)}</td>
                  <td>{b.passed ? 'Passed' : 'Repeat'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">A block passes at 90% right first time with the median side within half of Kumon’s per-sheet time.</p>
      </section>

      <section className="card">
        <h3>Coming back for practice</h3>
        {s.review.length === 0 ? (
          <p className="muted">Nothing: every problem so far was right and quick.</p>
        ) : (
          <p className="chips" data-testid="parent-review">
            {s.review.slice(0, 24).map((r) => (
              <span key={r} className="fact-chip">
                {r}
              </span>
            ))}
            {s.review.length > 24 && <span className="muted"> and {s.review.length - 24} more</span>}
          </p>
        )}
        <p className="muted small">Problems answered wrong, or right but slowly, until she gets them right and quick twice.</p>
      </section>

      <section className="card">
        <h3>Handwriting</h3>
        {templates === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="digits" data-testid="parent-digits">
              {DIGITS.map((d) => (
                <span key={d}>
                  <b>{d}</b>
                  {templates.filter((t) => t.digit === d).length}
                </span>
              ))}
            </p>
            <p className="muted small" data-testid="parent-overrides">
              Samples per digit. {overrides === 0 ? 'No “not what I wrote” yet.' : `${overrides} learned from “not what I wrote”.`}
            </p>
          </>
        )}
      </section>

      {onDevTomorrow && (
        <section className="card">
          <h3>Testing</h3>
          <p className="muted small">Only on the development server, never in the real app.</p>
          <button data-testid="dev-tomorrow" onClick={onDevTomorrow} style={{ borderStyle: 'dashed', marginTop: 'var(--space-1)' }}>
            Pretend it’s tomorrow
          </button>
        </section>
      )}

      <section className="card">
        <h3>Start again</h3>
        {!confirmReset ? (
          <button className="danger" data-testid="reset" onClick={() => setConfirmReset(true)}>
            Reset all data…
          </button>
        ) : (
          <>
            <p data-testid="reset-warning">
              This deletes every worksheet, correction, handwriting sample and the name on this tablet. It cannot be undone.
            </p>
            <div className="row">
              <button className="danger primary" data-testid="reset-confirm" disabled={resetting} onClick={() => void reset()}>
                Delete everything
              </button>
              <button onClick={() => setConfirmReset(false)} disabled={resetting}>
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
