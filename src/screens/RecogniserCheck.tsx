import { useEffect, useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { latestCheckRun, newId, saveCheckItem } from '../db/repo';
import { config } from '../engine/config';
import { remainingSequence, summarise, type StoredCheckItem } from '../ink/check';
import { hasInk } from '../ink/normalise';
import { recognise } from '../ink/recogniser';
import type { TemplateStore } from '../ink/templates';
import { DIGITS, type Digit, type Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from '../ui/AnswerBox';

interface Props {
  store: TemplateStore;
  onBack: () => void;
  onCalibrate: () => void;
}

interface Run {
  runId: string;
  done: StoredCheckItem[];
  /** Prompts still to ask. Empty means the run is complete. */
  queue: Digit[];
}

const TOTAL = config.ink.checkItemsPerDigit * DIGITS.length;

function freshRun(): Run {
  return { runId: newId(), done: [], queue: remainingSequence([], config.ink.checkItemsPerDigit, Math.random) };
}

/**
 * Step 1 acceptance measurement: 100 prompted digits, no per-item feedback.
 * Every answer is saved as it is given, so the check can be done in chunks
 * across days and resumes where it stopped. Measures only; never adds templates.
 */
export function RecogniserCheck({ store, onBack, onCalibrate }: Props) {
  const box = useRef<AnswerBoxHandle>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<'prompt' | 'results'>('prompt');
  const [inkReady, setInkReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    latestCheckRun()
      .then((latest) => {
        if (cancelled) return;
        if (latest) {
          setRun({
            runId: latest.runId,
            done: latest.items,
            queue: remainingSequence(latest.items, config.ink.checkItemsPerDigit, Math.random),
          });
        } else {
          setRun(freshRun());
        }
      })
      .catch((err: unknown) => {
        console.error('Could not load the earlier check', err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!store.isReady()) {
    return (
      <main className="screen stack">
        <h1>Handwriting check</h1>
        <p data-testid="not-ready">Teach the app each number at least {config.ink.minTemplatesPerDigit} times first.</p>
        <p className="muted">Still needed: {store.missingDigits().join(', ')}</p>
        <div className="row">
          <button className="primary" onClick={onCalibrate}>
            Teach the app your handwriting
          </button>
          <button onClick={onBack}>Back</button>
        </div>
      </main>
    );
  }

  if (loadFailed) {
    return (
      <main className="screen stack">
        <h1>Handwriting check</h1>
        <p>The earlier answers could not be read, so this check would start from the beginning.</p>
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              setLoadFailed(false);
              setRun(freshRun());
            }}
          >
            Start from the beginning
          </button>
          <button onClick={onBack}>Back</button>
        </div>
      </main>
    );
  }

  if (!run) return <main className="screen" />;

  const prompt = run.queue[0];
  const complete = prompt === undefined;

  const next = async () => {
    const strokes = box.current?.strokes() ?? [];
    if (prompt === undefined || !hasInk(strokes, config.ink.minInkPathLengthPx) || saving || box.current?.drawing()) return;
    const r = recognise(strokes, store.candidates(), recogniserOptions);
    const item: StoredCheckItem = {
      id: newId(),
      runId: run.runId,
      index: run.done.length,
      prompt,
      read: r?.digit ?? null,
      confident: r?.confident ?? false,
      score: r?.score ?? null,
      runnerUpScore: r?.runnerUpScore ?? null,
      createdAt: Date.now(),
    };
    setSaving(true);
    setFailed(false);
    try {
      await saveCheckItem(item);
      setRun({ runId: run.runId, done: [...run.done, item], queue: run.queue.slice(1) });
      box.current?.clear();
      setInkReady(false);
    } catch (err) {
      console.error('Could not save the answer', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (complete || view === 'results') {
    return (
      <main className="screen stack">
        <h1>Handwriting check</h1>
        <Results done={run.done} />
        <div className="row">
          {complete ? (
            <button
              className="primary"
              onClick={() => {
                setRun(freshRun());
                setView('prompt');
              }}
            >
              Start a new check
            </button>
          ) : (
            <button className="primary" onClick={() => setView('prompt')}>
              Continue
            </button>
          )}
          <button onClick={onBack}>Back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen stack">
      <h1>Handwriting check</h1>
      <p>Write this number.</p>
      <div className="row" style={{ gap: 'var(--space-4)' }}>
        <span data-testid="prompt" style={{ fontSize: 'var(--text-prompt)', lineHeight: 1, minWidth: '1em' }}>
          {prompt}
        </span>
        <AnswerBox
          ref={box}
          disabled={saving}
          onInkChange={(strokes: Stroke[], isDrawing: boolean) => {
            setInkReady(hasInk(strokes, config.ink.minInkPathLengthPx));
            setDrawing(isDrawing);
          }}
        />
      </div>
      <div className="row">
        <button className="primary" onClick={() => void next()} disabled={!inkReady || saving || drawing}>
          Next
        </button>
        <button onClick={() => box.current?.clear()} disabled={!inkReady || saving}>
          Clear
        </button>
        {run.done.length > 0 && <button onClick={() => setView('results')}>Results so far</button>}
        <button onClick={onBack}>Back</button>
      </div>
      <p className="muted" data-testid="counter">
        {run.done.length + 1} of {TOTAL}
      </p>
      {failed && <p>That one didn’t save. Try again.</p>}
    </main>
  );
}

/** Plain facts about the answers so far, with the raw data available for analysis. */
function Results({ done }: { done: StoredCheckItem[] }) {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const summary = summarise(done);
  const json = JSON.stringify({ summary, items: done }, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setShowJson(true);
    }
  };
  return (
    <>
      <p data-testid="summary" style={{ fontSize: 'var(--text-problem)', margin: 0 }}>
        {summary.correct} of {summary.total} read correctly
      </p>
      <p className="muted" data-testid="progress">
        {done.length} of {TOTAL} done
      </p>
      <p className="muted" data-testid="summary-detail">
        Not read at all: {summary.unread} · Not confident: {summary.notConfident}
      </p>
      {summary.confusions.length > 0 && (
        <ul data-testid="confusions">
          {summary.confusions.map((c) => (
            <li key={`${c.prompt}-${c.read}`}>
              {c.prompt} read as {c.read}: {c.count}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy results'}</button>
        <button onClick={() => setShowJson((s) => !s)}>{showJson ? 'Hide results' : 'Show results'}</button>
      </div>
      {showJson && (
        <textarea data-testid="results-json" readOnly value={json} rows={12} style={{ width: '100%', font: '14px monospace' }} />
      )}
    </>
  );
}
