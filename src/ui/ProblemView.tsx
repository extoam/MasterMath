import { answerDigits, type Fact, type Layout } from '../engine/worksheet';
import type { Tool } from '../ink/capture';
import type { Stroke } from '../ink/types';
import { AnswerBox, type AnswerBoxHandle } from './AnswerBox';
import './Sheet.css';

/** How a marked problem is shown: a circle for wrong, a word for an accepted override, nothing otherwise. */
export type Mark = 'wrong' | 'accepted' | null;

export interface ProblemViewProps {
  /** 1-based number printed beside the problem. */
  number: number;
  fact: Fact;
  layout: Layout;
  box: { w: number; h: number };
  tool: Tool;
  /** Frozen: the marked view. */
  disabled: boolean;
  /** Not reachable yet: an earlier problem still needs an answer. */
  locked: boolean;
  /** The problem she should write next. */
  current: boolean;
  mark: Mark;
  /** What the recogniser read, e.g. “54” or “5?”. */
  readAs: string | null;
  overrideProminent: boolean;
  onOverride: (() => void) | null;
  boxRef: (digitIndex: number, handle: AnswerBoxHandle | null) => void;
  onInkChange: (digitIndex: number, strokes: Stroke[], drawing: boolean, lastActionAt: number | null) => void;
  /** Saved ink per answer digit, shown again when she comes back to the side. */
  ink?: (digitIndex: number) => Stroke[] | undefined;
  /** Grid placement, so a problem keeps its place on the sheet in every round. */
  style?: React.CSSProperties;
}

const digitsOf = (n: number) => String(n).split('');

/** One problem, horizontal (“12 − 7 = □”) or stacked in columns with a rule line, as on Kumon sheets. */
export function ProblemView(props: ProblemViewProps) {
  const { number, fact, layout, box, tool, disabled, locked, current, mark, readAs, overrideProminent, onOverride, boxRef, onInkChange, style, ink } = props;
  const boxes = answerDigits(fact.answer).map((_, i) => (
    <AnswerBox
      key={i}
      ref={(h) => boxRef(i, h)}
      tool={tool}
      initialStrokes={ink?.(i)}
      width={box.w}
      height={box.h}
      disabled={disabled}
      locked={locked}
      onInkChange={(strokes, drawing, at) => onInkChange(i, strokes, drawing, at)}
    />
  ));

  let body;
  if (layout === 'horizontal') {
    body = (
      <>
        <span className="fact">
          {fact.a} {fact.op} {fact.b} =
        </span>
        <div className="answer">{boxes}</div>
      </>
    );
  } else {
    // Right-aligned columns: one cell per place value, each as wide as an answer box.
    const width = Math.max(digitsOf(fact.a).length, digitsOf(fact.b).length, digitsOf(fact.answer).length);
    const cells = (n: number) =>
      [...Array<string>(width - digitsOf(n).length).fill(''), ...digitsOf(n)].map((d, i) => (
        <span key={i} className="cell" style={{ width: box.w }}>
          {d}
        </span>
      ));
    body = (
      <div className="stack-sum" style={{ '--cell-w': `${box.w}px` } as React.CSSProperties}>
        <div className="line">
          <span className="op" />
          {cells(fact.a)}
        </div>
        <div className="line">
          <span className="op">{fact.op}</span>
          {cells(fact.b)}
        </div>
        <div className="rule" />
        <div className="line">
          <span className="op" />
          <div className="answer">{boxes}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="problem" style={style} data-layout={layout} data-number={number} data-mark={mark ?? 'none'} data-locked={locked} data-current={current}>
      <span className="num">({number})</span>
      {body}
      {mark === 'wrong' && onOverride && (
        <button className={`override${overrideProminent ? ' primary' : ''}`} onClick={onOverride} data-testid="override">
          Read as {readAs ?? '?'} · not what I wrote
        </button>
      )}
      {mark === 'accepted' && (
        <span className="override muted" data-testid="accepted">
          Accepted
        </span>
      )}
    </div>
  );
}
