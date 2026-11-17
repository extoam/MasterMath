import type { Digit, Stroke } from '../ink/types';
import type { SideRecord } from './progress';
import { answerDigits } from './worksheet';

/**
 * A past side re-checked with the current marking (each digit checked against
 * the digit it should be). Written once per side, so the check never repeats.
 * `positions` are the first-pass problems the old marking failed but her ink
 * shows were right; it may be empty.
 */
export interface Remark {
  /** The side's id. */
  id: string;
  at: number;
  positions: number[];
}

/** Reads an answer's boxes knowing the digits they should be; null for a box it cannot read. */
export type ExpectedReader = (boxes: Stroke[][], expected: Digit[]) => Array<Digit | null>;

/**
 * The first-pass problems on `side` marked wrong that read right now. A box
 * without ink stays wrong, and nothing marked right is ever made wrong.
 * `side` must carry its strokes (from `side_ink`).
 */
export function remarkSide(side: SideRecord, read: ExpectedReader): number[] {
  const first = side.rounds[0];
  if (!first) return [];
  const fixed: number[] = [];
  for (const item of first.items) {
    if (item.correct) continue;
    const fact = side.problems[item.position];
    if (!fact) continue;
    const expected = answerDigits(fact.answer);
    if (item.boxes.length !== expected.length || item.boxes.some((b) => b.strokes.length === 0)) continue;
    const boxes = [...item.boxes].sort((a, b) => a.digitIndex - b.digitIndex).map((b) => b.strokes);
    const got = read(boxes, expected);
    if (got.every((d, i) => d === expected[i])) fixed.push(item.position);
  }
  return fixed;
}

/** Sides with the re-checked problems counted as right. Inputs are not changed. */
export function applyRemarks(sides: readonly SideRecord[], remarks: readonly Remark[]): SideRecord[] {
  const byId = new Map(remarks.filter((r) => r.positions.length > 0).map((r) => [r.id, new Set(r.positions)]));
  if (byId.size === 0) return [...sides];
  return sides.map((s) => {
    const fixed = byId.get(s.id);
    const first = s.rounds[0];
    if (!fixed || !first) return s;
    const items = first.items.map((i) => (fixed.has(i.position) && !i.correct ? { ...i, correct: true, given: s.problems[i.position]?.answer ?? i.given } : i));
    return { ...s, rounds: [{ ...first, items }, ...s.rounds.slice(1)], firstPassCorrect: items.filter((i) => i.correct).length };
  });
}

/** Sides with a first-pass mistake that have not been re-checked yet. */
export function needsRemark(sides: readonly SideRecord[], remarks: readonly Remark[], skipWorksheet?: string): SideRecord[] {
  const done = new Set(remarks.map((r) => r.id));
  return sides.filter((s) => !done.has(s.id) && s.worksheetId !== skipWorksheet && (s.rounds[0]?.items ?? []).some((i) => !i.correct));
}
