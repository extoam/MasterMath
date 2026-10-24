import type { Digit, Stroke } from '../ink/types';

/**
 * Page state machine for a worksheet: write, mark the whole page at once,
 * corrections round for the wrong items, repeat until clean. Pure functions
 * over plain records; the screen owns the recogniser and the clock. Records
 * are append-only: every function returns new objects and never mutates its
 * input.
 */

/** Typographic operators, as the child reads them. */
export type Op = '+' | '−' | '×' | '÷';

export interface Fact {
  op: Op;
  a: number;
  b: number;
  answer: number;
}

/** What one answer box held and how it was read. `trueLabel` is set only by an override. */
export interface BoxReading {
  digitIndex: number;
  read: Digit | null;
  confident: boolean;
  strokes: Stroke[];
  trueLabel: Digit | null;
}

export interface ItemRecord {
  position: number;
  /** 0 = first pass, 1+ = corrections. */
  round: number;
  /** Retrieval latency from the start of the round; null if the item was never touched. */
  firstStrokeMs: number | null;
  submittedMs: number;
  /** The number read from the boxes, or null when any box was not read. */
  given: number | null;
  correct: boolean;
  /** The child said “that’s not what I wrote” and the item was accepted. */
  override: boolean;
  boxes: BoxReading[];
}

export interface RoundRecord {
  round: number;
  items: ItemRecord[];
}

export interface PageState {
  /** Facts by position on the page. */
  facts: readonly Fact[];
  /** The round currently being written. */
  round: number;
  /** Positions still to answer in `round`, in page order. */
  pending: number[];
  /** Marked rounds, oldest first. */
  rounds: RoundRecord[];
}

/** One item's answer at Submit, as read box by box. */
export interface RoundAnswer {
  position: number;
  firstStrokeMs: number | null;
  submittedMs: number;
  boxes: Array<{ read: Digit | null; confident: boolean; strokes: Stroke[] }>;
}

export function answerDigits(answer: number): Digit[] {
  return [...String(answer)].map((c) => Number(c) as Digit);
}

export function digitsToNumber(read: Array<Digit | null>): number | null {
  let n = 0;
  for (const d of read) {
    if (d === null) return null;
    n = n * 10 + d;
  }
  return n;
}

export function formatFact(f: Fact): string {
  return `${f.a} ${f.op} ${f.b} =`;
}

export function startPage(facts: readonly Fact[]): PageState {
  return { facts, round: 0, pending: facts.map((_, i) => i), rounds: [] };
}

/** Mark every pending item at once. `answers` must cover exactly `state.pending`. */
export function markRound(state: PageState, answers: RoundAnswer[]): PageState {
  const byPosition = new Map(answers.map((a) => [a.position, a]));
  const expected = [...state.pending].sort((a, b) => a - b).join(',');
  const got = [...byPosition.keys()].sort((a, b) => a - b).join(',');
  if (answers.length !== byPosition.size || expected !== got) {
    throw new Error(`markRound: answers must cover exactly the pending positions [${expected}], got [${got}]`);
  }

  const items: ItemRecord[] = state.pending.map((position) => {
    const a = byPosition.get(position)!;
    const given = digitsToNumber(a.boxes.map((b) => b.read));
    return {
      position,
      round: state.round,
      firstStrokeMs: a.firstStrokeMs,
      submittedMs: a.submittedMs,
      given,
      correct: given === state.facts[position]!.answer,
      override: false,
      boxes: a.boxes.map((b, digitIndex) => ({
        digitIndex,
        read: b.read,
        confident: b.confident,
        strokes: b.strokes.map((s) => s.map((p) => ({ ...p }))),
        trueLabel: null,
      })),
    };
  });

  const pending = items.filter((i) => !i.correct).map((i) => i.position);
  return {
    facts: state.facts,
    round: pending.length > 0 ? state.round + 1 : state.round,
    pending,
    rounds: [...state.rounds, { round: state.round, items }],
  };
}

/**
 * The escape hatch: accept a marked-wrong item as correct, label its strokes
 * with the expected digits (the retraining set), and take it out of the
 * corrections round.
 */
export function acceptOverride(state: PageState, position: number): PageState {
  const last = state.rounds[state.rounds.length - 1];
  if (!last || !state.pending.includes(position)) {
    throw new Error(`acceptOverride: position ${position} is not pending`);
  }
  const labels = answerDigits(state.facts[position]!.answer);
  const items = last.items.map((item) =>
    item.position !== position
      ? item
      : {
          ...item,
          correct: true,
          override: true,
          boxes: item.boxes.map((b) => ({ ...b, trueLabel: labels[b.digitIndex] ?? null })),
        },
  );
  return {
    facts: state.facts,
    round: state.round,
    pending: state.pending.filter((p) => p !== position),
    rounds: [...state.rounds.slice(0, -1), { round: last.round, items }],
  };
}

export function isClean(state: PageState): boolean {
  return state.rounds.length > 0 && state.pending.length === 0;
}

/** Rounds beyond the first pass. */
export function correctionRounds(state: PageState): number {
  return Math.max(0, state.rounds.length - 1);
}
