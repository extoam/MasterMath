import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import type { SideRecord } from '../src/engine/progress';
import {
  composeWorksheet,
  dayIndex,
  dueState,
  outstanding,
  type CorrectionRecord,
  type WorksheetRecord,
} from '../src/engine/schedule';
import type { ItemRecord } from '../src/engine/worksheet';

const day = (d: number, h = 18) => new Date(2026, 9, d, h, 0).getTime();
const item = (position: number, correct: boolean, override = false): ItemRecord => ({
  position, round: 0, firstStrokeMs: 900, submittedMs: 1500, given: null, correct, override, boxes: [],
});

/** A handed-in worksheet with first-pass results: `wrong` maps a side code to its wrong positions. */
function handIn(index: number, submittedAt: number, wrong: Record<string, number[]> = {}) {
  const ws = composeWorksheet([])!;
  const codes = ws.map((s) => s.code);
  const record: WorksheetRecord = { id: `w${index}`, index, sides: ws, submittedAt, activeMs: 0, sideMs: {} };
  const sides: SideRecord[] = ws.map((s, i) => ({
    id: `w${index}:${s.code}`, worksheetId: `w${index}`, code: s.code, sheet: s.sheet, side: s.code.endsWith('a') ? 'a' : 'b',
    layout: s.layout, problems: s.problems,
    rounds: [{ round: 0, items: s.problems.map((_, p) => item(p, !(wrong[s.code] ?? []).includes(p))) }],
    firstPassCorrect: s.problems.length - (wrong[s.code] ?? []).length, total: s.problems.length,
    activeMs: 30_000, startedAt: submittedAt - 60_000, completedAt: submittedAt + i,
  }));
  return { record, sides, codes };
}

describe('dayIndex', () => {
  it('counts local calendar days, not 24-hour spans', () => {
    expect(dayIndex(day(24, 23))).toBe(dayIndex(day(24, 1)));
    expect(dayIndex(day(25, 0))).toBe(dayIndex(day(24, 23)) + 1);
  });
});

describe('composeWorksheet', () => {
  it('starts at B101 and holds one block: 10 sheets, a and b sides', () => {
    const ws = composeWorksheet([])!;
    expect(config.daily.sheets).toBe(10);
    expect(ws).toHaveLength(20);
    expect(ws[0]!.code).toBe('B101a');
    expect(ws[19]!.code).toBe('B110b');
  });

  it('continues with the next block once a worksheet passes, or repeats the block', () => {
    const passed = handIn(1, day(24));
    expect(composeWorksheet(passed.sides)![0]!.code).toBe('B111a');
    const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const failed = handIn(1, day(24), { B101a: ten, B101b: ten, B102a: ten, B102b: ten, B103a: ten }); // 50 of 400 wrong
    expect(composeWorksheet(failed.sides)![0]!.code).toBe('B101a');
  });

  it('spreads review problems across sides instead of the same two everywhere', () => {
    const h = handIn(1, day(24), { B101a: [0, 1], B101b: [0, 1] });
    const next = composeWorksheet(h.sides)!;
    expect(next.length).toBe(20);
  });
});

describe('outstanding', () => {
  it('lists first-pass mistakes per side, minus what corrections fixed', () => {
    const h = handIn(1, day(24), { B101a: [2, 5], B103b: [7] });
    expect(outstanding(h.record, h.sides, [])).toEqual(new Map([['B101a', [2, 5]], ['B103b', [7]]]));
    const c1: CorrectionRecord = { id: 'c1', worksheetId: 'w1', round: 1, submittedAt: day(25), items: [
      { code: 'B101a', item: { ...item(2, true), round: 1 } },
      { code: 'B101a', item: { ...item(5, false), round: 1 } },
      { code: 'B103b', item: { ...item(7, true, true), round: 1 } },
    ] };
    expect(outstanding(h.record, h.sides, [c1])).toEqual(new Map([['B101a', [5]]]));
    const c2: CorrectionRecord = { id: 'c2', worksheetId: 'w1', round: 2, submittedAt: day(25), items: [{ code: 'B101a', item: { ...item(5, true), round: 2 } }] };
    expect(outstanding(h.record, h.sides, [c1, c2]).size).toBe(0);
  });
});

describe('dueState', () => {
  it('offers the first worksheet on the first day', () => {
    expect(dueState([], [], [], day(24))).toMatchObject({ available: 1, canStart: true, correctionsDue: [], waiting: [] });
  });

  it('holds back the next worksheet until tomorrow, and shows corrections only tomorrow', () => {
    const h = handIn(1, day(24), { B101a: [2] });
    expect(dueState([h.record], h.sides, [], day(24, 20))).toMatchObject({ available: 0, canStart: false, correctionsDue: [] });
    expect(dueState([h.record], h.sides, [], day(24, 20)).waiting.map((w) => w.id)).toEqual(['w1']);
    const tomorrow = dueState([h.record], h.sides, [], day(25, 8));
    expect(tomorrow.correctionsDue.map((w) => w.id)).toEqual(['w1']);
    expect(tomorrow.available).toBe(1);
    expect(tomorrow.canStart).toBe(false); // corrections first
  });

  it('lets her start when yesterday’s worksheet was all right', () => {
    const h = handIn(1, day(24));
    expect(dueState([h.record], h.sides, [], day(25, 8))).toMatchObject({ available: 1, canStart: true, correctionsDue: [] });
  });

  it('piles up worksheets for missed days, all doable in one sitting', () => {
    const h = handIn(1, day(20));
    const s = dueState([h.record], h.sides, [], day(24, 8));
    expect(s.available).toBe(4);
    expect(s.canStart).toBe(true);
    const h2 = handIn(2, day(24, 9), { B101a: [1] });
    const s2 = dueState([h.record, h2.record], [...h.sides, ...h2.sides], [], day(24, 10));
    expect(s2.available).toBe(3);
    expect(s2.canStart).toBe(true); // corrections from today wait for tomorrow
    expect(s2.waiting.map((w) => w.id)).toEqual(['w2']);
  });
});
