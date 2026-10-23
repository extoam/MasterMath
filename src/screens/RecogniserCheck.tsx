import { useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { config } from '../engine/config';
import { checkSequence, summarise, type CheckItem } from '../ink/check';
import { recognise } from '../ink/recogniser';
import type { TemplateStore } from '../ink/templates';
import type { Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from '../ui/AnswerBox';

interface Props {
  store: TemplateStore;
  onBack: () => void;
  onCalibrate: () => void;
}

/**
 * Step 1 acceptance measurement: 100 prompted digits, no per-item feedback,
 * a plain summary at the end. Measures only; never adds templates.
 */
export function RecogniserCheck({ store, onBack, onCalibrate }: Props) {
  const box = useRef<AnswerBoxHandle>(null);
  const [sequence] = useState(() => checkSequence(config.ink.checkItemsPerDigit, Math.random));
  const [items, setItems] = useState<CheckItem[]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const index = items.length;
  const prompt = sequence[index];

  const next = () => {
    const strokes = box.current?.strokes() ?? [];
    if (prompt === undefined || strokes.length === 0) return;
    const r = recognise(strokes, store.candidates(), recogniserOptions);
    setItems((prev) => [...prev, { prompt, read: r?.digit ?? null, confident: r?.confident ?? false }]);
    box.current?.clear();
    setHasInk(false);
  };

  if (prompt === undefined) {
    const summary = summarise(items);
    const json = JSON.stringify({ summary, items }, null, 2);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(json);
        setCopied(true);
      } catch {
        setShowJson(true);
      }
    };
    return (
      <main className="screen stack">
        <h1>Handwriting check</h1>
        <p data-testid="summary" style={{ fontSize: 'var(--text-problem)', margin: 0 }}>
          {summary.correct} of {summary.total} read correctly
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
          <button onClick={onBack}>Back</button>
        </div>
        {showJson && (
          <textarea data-testid="results-json" readOnly value={json} rows={12} style={{ width: '100%', font: '14px monospace' }} />
        )}
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
        <AnswerBox ref={box} onInkChange={(strokes: Stroke[]) => setHasInk(strokes.length > 0)} />
      </div>
      <div className="row">
        <button className="primary" onClick={next} disabled={!hasInk}>
          Next
        </button>
        <button onClick={() => box.current?.clear()} disabled={!hasInk}>
          Clear
        </button>
        <button onClick={onBack}>Back</button>
      </div>
      <p className="muted" data-testid="counter">
        {index + 1} of {sequence.length}
      </p>
    </main>
  );
}
