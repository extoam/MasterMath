import { useRef, useState } from 'react';
import { newId, saveTemplate } from '../db/repo';
import { config } from '../engine/config';
import { hasInk } from '../ink/normalise';
import { promptSequence } from '../ink/sequence';
import type { Template, TemplateStore } from '../ink/templates';
import type { Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from '../ui/AnswerBox';

interface Props {
  store: TemplateStore;
  onBack: () => void;
}

/** The calibration game: “teach the app your handwriting”. Each sample is saved before the prompt advances. */
export function Calibrate({ store, onBack }: Props) {
  const box = useRef<AnswerBoxHandle>(null);
  const [sequence] = useState(() => promptSequence(config.ink.calibrationRepsPerDigit, Math.random));
  const [index, setIndex] = useState(0);
  const [inkReady, setInkReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const done = index >= sequence.length;
  const prompt = sequence[index];

  const next = async () => {
    const strokes = box.current?.strokes() ?? [];
    if (prompt === undefined || !hasInk(strokes, config.ink.minInkPathLengthPx) || saving || box.current?.drawing()) return;
    setSaving(true);
    setFailed(false);
    try {
      const template: Template = { id: newId(), digit: prompt, strokes, createdAt: Date.now(), source: 'calibration' };
      await saveTemplate(template);
      store.add(template);
      box.current?.clear();
      setInkReady(false);
      setIndex((i) => i + 1);
    } catch (err) {
      console.error('Could not save template', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <main className="screen stack">
        <h1>Teach the app your handwriting</h1>
        <p data-testid="done">Done. The app knows your handwriting a little better now.</p>
        <button className="primary" onClick={onBack}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="screen stack">
      <h1>Teach the app your handwriting</h1>
      <p>Write this number in the box.</p>
      <div className="row" style={{ gap: 'var(--space-4)' }}>
        <span data-testid="prompt" style={{ fontSize: 'var(--text-prompt)', lineHeight: 1, minWidth: '1em' }}>
          {prompt}
        </span>
        <AnswerBox ref={box} onInkChange={(strokes: Stroke[], isDrawing: boolean) => {
            setInkReady(hasInk(strokes, config.ink.minInkPathLengthPx));
            setDrawing(isDrawing);
          }} disabled={saving} />
      </div>
      <div className="row">
        <button className="primary" onClick={() => void next()} disabled={!inkReady || saving || drawing}>
          Next
        </button>
        <button onClick={() => box.current?.clear()} disabled={!inkReady || saving}>
          Clear
        </button>
        <button onClick={onBack}>Back</button>
      </div>
      <p className="muted" data-testid="counter">
        {index + 1} of {sequence.length}
      </p>
      {failed && <p>That one didn’t save. Try again.</p>}
    </main>
  );
}
