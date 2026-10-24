import { describe, expect, it } from 'vitest';
import {
  acceptOverride,
  answerDigits,
  correctionRounds,
  digitsToNumber,
  formatFact,
  isClean,
  markRound,
  startPage,
  type Fact,
  type PageState,
  type RoundAnswer,
} from '../src/engine/worksheet';
import type { Digit, Stroke } from '../src/ink/types';

const facts: Fact[] = [
  [6, 1], [7, 8], [6, 7], [7, 3], [6, 9], [7, 6], [6, 4], [7, 9], [6, 8], [7, 5],
].map(([a, b]) => ({ op: '×', a: a!, b: b!, answer: a! * b! }));

const stroke = (): Stroke => [{ x: 10, y: 10, t: 0, pressure: 0.5 }, { x: 40, y: 80, t: 50, pressure: 0.5 }];

/** A round answer for `position` with the given per-box reads. Defaults to the correct digits. */
function answer(position: number, digits?: Array<Digit | null>, confident = true): RoundAnswer {
  const reads = digits ?? answerDigits(facts[position]!.answer);
  return {
    position,
    firstStrokeMs: 500,
    submittedMs: 4_000,
    boxes: reads.map((read) => ({ read, confident, strokes: [stroke()] })),
  };
}

function firstPass(wrong: Record<number, Array<Digit | null>> = {}): PageState {
  const state = startPage(facts);
  return markRound(
    state,
    state.pending.map((p) => answer(p, wrong[p])),
  );
}

describe('digits', () => {
  it('splits an answer into its digits', () => {
    expect(answerDigits(56)).toEqual([5, 6]);
    expect(answerDigits(6)).toEqual([6]);
    expect(answerDigits(144)).toEqual([1, 4, 4]);
  });

  it('joins box reads into a number, or null when any box was not read', () => {
    expect(digitsToNumber([5, 6])).toBe(56);
    expect(digitsToNumber([5, null])).toBeNull();
    expect(digitsToNumber([1, 0])).toBe(10);
  });

  it('formats a fact with typographic operators', () => {
    expect(formatFact({ op: '×', a: 7, b: 8, answer: 56 })).toBe('7 × 8 =');
  });
});

describe('startPage', () => {
  it('begins the first pass with every position pending', () => {
    const s = startPage(facts);
    expect(s.round).toBe(0);
    expect(s.pending).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.rounds).toEqual([]);
    expect(isClean(s)).toBe(false);
    expect(correctionRounds(s)).toBe(0);
  });
});

describe('markRound', () => {
  it('marks the whole page, keeps the wrong and unread items pending, and opens round 1', () => {
    const s = firstPass({ 3: [2, 2], 5: [5, null], 7: [6, 2] });
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0]!.items).toHaveLength(10);
    const item3 = s.rounds[0]!.items[3]!;
    expect(item3.given).toBe(22);
    expect(item3.correct).toBe(false);
    const item5 = s.rounds[0]!.items[5]!;
    expect(item5.given).toBeNull();
    expect(item5.correct).toBe(false);
    expect(s.rounds[0]!.items[0]).toMatchObject({ position: 0, round: 0, given: 6, correct: true, override: false, firstStrokeMs: 500, submittedMs: 4_000 });
    expect(s.pending).toEqual([3, 5, 7]);
    expect(s.round).toBe(1);
    expect(isClean(s)).toBe(false);
  });

  it('is clean after a first pass with nothing wrong', () => {
    const s = firstPass();
    expect(s.pending).toEqual([]);
    expect(isClean(s)).toBe(true);
    expect(correctionRounds(s)).toBe(0);
  });

  it('runs corrections rounds over only the pending items until clean', () => {
    let s = firstPass({ 3: [2, 2], 5: [5, null], 7: [6, 2] });
    s = markRound(s, [answer(3), answer(5), answer(7, [6, 2])]);
    expect(s.rounds).toHaveLength(2);
    expect(s.rounds[1]!.items).toHaveLength(3);
    expect(s.rounds[1]!.items.map((i) => i.round)).toEqual([1, 1, 1]);
    expect(s.pending).toEqual([7]);
    expect(s.round).toBe(2);
    s = markRound(s, [answer(7)]);
    expect(isClean(s)).toBe(true);
    expect(correctionRounds(s)).toBe(2);
  });

  it('refuses answers that do not cover exactly the pending positions', () => {
    const s = startPage(facts);
    expect(() => markRound(s, s.pending.slice(1).map((p) => answer(p)))).toThrow();
    const s2 = firstPass({ 3: [2, 2] });
    expect(() => markRound(s2, [answer(3), answer(4)])).toThrow();
  });

  it('records the per-box reads and strokes with no true label', () => {
    const s = firstPass({ 3: [2, 2] });
    const boxes = s.rounds[0]!.items[3]!.boxes;
    expect(boxes.map((b) => b.digitIndex)).toEqual([0, 1]);
    expect(boxes.map((b) => b.read)).toEqual([2, 2]);
    expect(boxes.every((b) => b.trueLabel === null)).toBe(true);
    expect(boxes[0]!.strokes).toHaveLength(1);
  });
});

describe('acceptOverride', () => {
  it('accepts the item as correct, labels its strokes with the expected digits, and drops it from pending', () => {
    const s = acceptOverride(firstPass({ 3: [2, 2], 5: [5, null], 7: [6, 2] }), 3);
    const item3 = s.rounds[0]!.items[3]!;
    expect(item3.correct).toBe(true);
    expect(item3.override).toBe(true);
    expect(item3.boxes.map((b) => b.trueLabel)).toEqual(answerDigits(facts[3]!.answer));
    expect(s.pending).toEqual([5, 7]);
    expect(isClean(s)).toBe(false);
  });

  it('makes the page clean when the last pending item is accepted, with no correction round counted', () => {
    const s = acceptOverride(firstPass({ 3: [2, 2] }), 3);
    expect(s.pending).toEqual([]);
    expect(isClean(s)).toBe(true);
    expect(correctionRounds(s)).toBe(0);
  });

  it('refuses a position that is not pending', () => {
    const s = firstPass({ 3: [2, 2] });
    expect(() => acceptOverride(s, 4)).toThrow();
    expect(() => acceptOverride(startPage(facts), 3)).toThrow();
  });
});

describe('records are append-only', () => {
  it('markRound and acceptOverride return new state and leave the input untouched', () => {
    const s0 = startPage(facts);
    const snap0 = JSON.stringify(s0);
    const s1 = markRound(s0, s0.pending.map((p) => answer(p, p === 3 ? [2, 2] : undefined)));
    expect(JSON.stringify(s0)).toBe(snap0);
    expect(s1).not.toBe(s0);
    const snap1 = JSON.stringify(s1);
    const s2 = acceptOverride(s1, 3);
    expect(JSON.stringify(s1)).toBe(snap1);
    expect(s2).not.toBe(s1);
    expect(s2.rounds[0]).not.toBe(s1.rounds[0]);
  });
});
