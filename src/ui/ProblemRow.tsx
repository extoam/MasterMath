import { answerDigits, formatFact, type Fact } from '../engine/worksheet';
import type { Tool } from '../ink/capture';
import type { Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from './AnswerBox';
import './Worksheet.css';

/** How a marked item is shown: a circle for wrong, a word for an accepted override, nothing otherwise. */
export type Mark = 'wrong' | 'accepted' | null;

export interface ProblemRowProps {
  position: number;
  fact: Fact;
  tool: Tool;
  disabled: boolean;
  mark: Mark;
  /** What the recogniser read, e.g. “54” or “5?”, shown under a wrong item. */
  readAs: string | null;
  /** True when any box was a close call: the override control is shown as the primary action. */
  overrideProminent: boolean;
  onOverride: (() => void) | null;
  boxRef: (digitIndex: number, handle: AnswerBoxHandle | null) => void;
  onInkChange: (digitIndex: number, strokes: Stroke[], drawing: boolean, lastActionAt: number | null) => void;
}

/** One line of the worksheet: the fact, then one answer box per digit of the answer. */
export function ProblemRow({
  position,
  fact,
  tool,
  disabled,
  mark,
  readAs,
  overrideProminent,
  onOverride,
  boxRef,
  onInkChange,
}: ProblemRowProps) {
  const boxes = answerDigits(fact.answer).length;
  return (
    <div className="problem" data-position={position} data-mark={mark ?? 'none'}>
      <span className="fact">{formatFact(fact)}</span>
      <div className="answer">
        {Array.from({ length: boxes }, (_, i) => (
          <AnswerBox
            key={i}
            ref={(h) => boxRef(i, h)}
            tool={tool}
            disabled={disabled}
            onInkChange={(strokes, drawing, lastActionAt) => onInkChange(i, strokes, drawing, lastActionAt)}
          />
        ))}
      </div>
      {mark === 'wrong' && (
        <div className="problem-note">
          <span className="muted" data-testid="read-as">
            Read as {readAs ?? '?'}
          </span>
          {onOverride && (
            <button className={overrideProminent ? 'primary' : undefined} onClick={onOverride} data-testid="override">
              That’s not what I wrote
            </button>
          )}
        </div>
      )}
      {mark === 'accepted' && (
        <div className="problem-note">
          <span className="muted" data-testid="accepted">
            Accepted
          </span>
        </div>
      )}
    </div>
  );
}
