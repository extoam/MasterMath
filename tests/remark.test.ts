import { describe, expect, it } from 'vitest';
import type { SideRecord } from '../src/engine/progress';
import { applyRemarks, needsRemark, remarkSide, type ExpectedReader } from '../src/engine/remark';
import { outstanding, type WorksheetRecord } from '../src/engine/schedule';
import type { ItemRecord } from '../src/engine/worksheet';
import type { Digit } from '../src/ink/types';

const ink = [[{ x: 0, y: 0, t: 0, pressure: 0.5 }, { x: 10, y: 10, t: 10, pressure: 0.5 }]];
const item = (position: number, correct: boolean, digits: number, withInk = true): ItemRecord => ({
  position, round: 0, firstStrokeMs: 900, submittedMs: 1500, given: correct ? 12 : 17, correct, override: false,
  boxes: Array.from({ length: digits }, (_, d) => ({ digitIndex: d, read: null, confident: false, strokes: withInk ? ink : [], trueLabel: null })),
});

function side(items: ItemRecord[]): SideRecord {
  return {
    id: 's1', worksheetId: 'w1', code: 'B101a', sheet: 101, side: 'a', layout: 'horizontal',
    problems: [{ op: '−', a: 19, b: 7, answer: 12 }, { op: '−', a: 15, b: 6, answer: 9 }, { op: '−', a: 20, b: 8, answer: 12 }],
    rounds: [{ round: 0, items }], firstPassCorrect: items.filter((i) => i.correct).length, total: items.length,
    activeMs: 1000, startedAt: 0, completedAt: 1,
  } as SideRecord;
}

const readsExpected: ExpectedReader = (_b, expected) => expected;
const readsOther: ExpectedReader = (_b, expected) => expected.map((d) => ((d + 1) % 10) as Digit);

describe('remarkSide', () => {
  it('finds problems marked wrong whose ink reads right now', () => {
    const s = side([item(0, false, 2), item(1, true, 1), item(2, false, 2)]);
    expect(remarkSide(s, readsExpected)).toEqual([0, 2]);
  });

  it('keeps a real mistake wrong', () => {
    expect(remarkSide(side([item(0, false, 2)]), readsOther)).toEqual([]);
  });

  it('keeps an unanswered problem wrong', () => {
    expect(remarkSide(side([item(0, false, 2, false)]), readsExpected)).toEqual([]);
  });
});

describe('applyRemarks', () => {
  it('counts re-checked problems as right, so the percentage and corrections follow', () => {
    const s = side([item(0, false, 2), item(1, true, 1), item(2, false, 2)]);
    const [after] = applyRemarks([s], [{ id: 's1', at: 5, positions: [0] }]);
    expect(after!.firstPassCorrect).toBe(2);
    expect(after!.rounds[0]!.items[0]!.correct).toBe(true);
    const ws = { id: 'w1' } as WorksheetRecord;
    expect(outstanding(ws, [after!], [])).toEqual(new Map([['B101a', [2]]]));
    expect(s.firstPassCorrect).toBe(1); // input untouched
  });
});

describe('needsRemark', () => {
  it('picks sides with mistakes that are not re-checked yet, skipping a worksheet being corrected', () => {
    const a = side([item(0, false, 2)]);
    const b = { ...side([item(0, true, 2)]), id: 's2' };
    const c = { ...side([item(0, false, 2)]), id: 's3', worksheetId: 'w2' };
    expect(needsRemark([a, b, c], []).map((s) => s.id)).toEqual(['s1', 's3']);
    expect(needsRemark([a, b, c], [{ id: 's1', at: 1, positions: [] }]).map((s) => s.id)).toEqual(['s3']);
    expect(needsRemark([a, b, c], [], 'w2').map((s) => s.id)).toEqual(['s1']);
  });
});
