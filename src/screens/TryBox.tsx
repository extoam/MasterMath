import { useRef, useState } from 'react';
import { recogniserOptions } from '../app/inkSetup';
import { recognise, type Recognition } from '../ink/recogniser';
import type { TemplateStore } from '../ink/templates';
import { DIGITS, type Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from '../ui/AnswerBox';

interface Props {
  store: TemplateStore;
  onBack: () => void;
}

/** Developer and parent sandbox: one box, live readout of what the recogniser sees. */
export function TryBox({ store, onBack }: Props) {
  const box = useRef<AnswerBoxHandle>(null);
  const [result, setResult] = useState<Recognition | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const counts = store.countPerDigit();

  const handleInk = (strokes: Stroke[]) => {
    setHasInk(strokes.length > 0);
    setResult(recognise(strokes, store.candidates(), recogniserOptions));
  };

  const clear = () => {
    box.current?.clear();
  };

  let readout = 'Nothing yet';
  if (result) {
    readout = result.confident
      ? `Read as ${result.digit} · confident`
      : result.runnerUp === null
        ? `Read as ${result.digit}`
        : `Read as ${result.digit}, could be ${result.runnerUp}`;
  } else if (hasInk) {
    readout = store.candidates().length === 0 ? 'No templates yet' : 'Nothing recognisable yet';
  }

  return (
    <main className="screen stack">
      <h1>Try it</h1>
      <p className="muted">Write one digit in the box. The reading updates when you lift the pen.</p>
      <div className="row">
        <AnswerBox ref={box} onInkChange={handleInk} />
        <div className="stack" style={{ flex: 1 }}>
          <p data-testid="readout" style={{ fontSize: 'var(--text-problem)', margin: 0 }}>{readout}</p>
          {result && (
            <p className="muted" style={{ margin: 0 }}>
              score {result.score.toFixed(2)}
              {result.runnerUpScore !== null && ` · runner-up ${result.runnerUpScore.toFixed(2)}`}
            </p>
          )}
        </div>
      </div>
      <div className="row">
        <button onClick={clear}>Clear</button>
        <button onClick={onBack}>Back</button>
      </div>
      <p className="muted">
        Templates per digit: {DIGITS.map((d) => `${d}:${counts[d]}`).join('  ')}
      </p>
    </main>
  );
}
