import { describe, expect, it } from 'vitest';
import { parentSummary } from '../src/engine/parent';
import type { SideRecord } from '../src/engine/progress';
import type { CorrectionRecord, WorksheetRecord } from '../src/engine/schedule';
import type { ItemRecord } from '../src/engine/worksheet';

const day = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
const item = (position: number, correct: boolean, ms = 900): ItemRecord => ({ position, round: 0, firstStrokeMs: ms, submittedMs: ms + 500, given: null, correct, override: false, boxes: [] });

function worksheet(id: string, index: number, first: number, at: number, wrong: Record<string, number[]> = {}, sideMs = 60_000) {
  const ws: WorksheetRecord = { id, index, sides: [], submittedAt: at, activeMs: 20 * sideMs, sideMs: {} };
  const sides: SideRecord[] = [];
  for (let s = first; s < first + 10; s++) {
    for (const side of ['a', 'b'] as const) {
      const code = `B${s}${side}`;
      const items = Array.from({ length: 20 }, (_, p) => item(p, !(wrong[code] ?? []).includes(p)));
      sides.push({ id: `${id}:${code}`, worksheetId: id, code, sheet: s, side, layout: 'horizontal',
        problems: items.map((_, p) => ({ op: '−', a: 10 + p + 20 * (s - first) + (side === 'b' ? 200 : 0), b: 3, answer: 7 + p + 20 * (s - first) + (side === 'b' ? 200 : 0) })), rounds: [{ round: 0, items }],
        firstPassCorrect: items.filter((i) => i.correct).length, total: 20, activeMs: sideMs, startedAt: at - 1, completedAt: at + sides.length });
    }
  }
  return { ws, sides };
}

describe('parentSummary', () => {
  it('reports where she is, what is done, and the correction plan', () => {
    const w1 = worksheet('w1', 1, 101, day(20), { B101a: [3], B104b: [0, 1] });
    const w2 = worksheet('w2', 2, 111, day(24, 9), { B111a: [5] });
    const c1: CorrectionRecord = { id: 'c1', worksheetId: 'w1', round: 1, submittedAt: day(21), items: [
      { code: 'B101a', item: { ...item(3, true), round: 1 } }, { code: 'B104b', item: { ...item(0, true), round: 1 } }, { code: 'B104b', item: { ...item(1, false), round: 1 } },
    ] };
    const c2: CorrectionRecord = { id: 'c2', worksheetId: 'w1', round: 2, submittedAt: day(21), items: [{ code: 'B104b', item: { ...item(1, true), round: 2 } }] };
    const s = parentSummary([w1.ws, w2.ws], [...w1.sides, ...w2.sides], [c1, c2], day(24, 20));
    expect(s.nextSheet).toBe('B121a');
    expect(s.worksheetsDone).toBe(2);
    expect(s.homeworkDaysThisMonth).toBe(2);
    expect(s.worksheets.map((w) => [w.index, w.state, w.correctionRounds, w.firstPassPct])).toEqual([
      [1, 'clean', 2, Math.round((397 / 400) * 1000) / 10],
      [2, 'being-marked', 0, Math.round((399 / 400) * 1000) / 10],
    ]);
    expect(s.worksheets[1]!.toFix).toEqual([{ code: 'B111a', count: 1 }]);
  });

  it('summarises each block attempt against Kumon’s target time', () => {
    const w1 = worksheet('w1', 1, 101, day(20), {}, 45_000);
    const s = parentSummary([w1.ws], w1.sides, [], day(24));
    expect(s.blocks[0]).toMatchObject({ first: 101, title: 'Subtraction 1 (Review up to A)', attempt: 1, firstPassPct: 100, medianSideMs: 45_000, targetSideMs: 60_000, passed: true });
  });

  it('marks a repeated block and lists the problems coming back for review', () => {
    const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const w1 = worksheet('w1', 1, 101, day(20), { B101a: ten, B101b: ten, B102a: ten, B102b: ten, B103a: ten });
    const s = parentSummary([w1.ws], w1.sides, [], day(24));
    expect(s.blocks[0]!.passed).toBe(false);
    expect(s.nextSheet).toBe('B101a');
    expect(s.review.length).toBeGreaterThan(0);
    expect(s.review[0]).toMatch(/^\d+ − 3$/);
  });

  it('is empty but sound before any worksheet', () => {
    const s = parentSummary([], [], [], day(24));
    expect(s).toMatchObject({ nextSheet: 'B101a', worksheetsDone: 0, homeworkDaysThisMonth: 0, worksheets: [], blocks: [], review: [] });
  });
});
