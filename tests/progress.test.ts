import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import { blockPassed, nextSide, reviewPool, sidesToday, type SideRecord } from '../src/engine/progress';
import type { Fact, ItemRecord } from '../src/engine/worksheet';

let clock = 1_000;
const f = (a: number, b: number, op: '+' | '−' = '−'): Fact => ({ op, a, b, answer: op === '+' ? a + b : a - b });

function item(position: number, correct: boolean, firstStrokeMs = 1_000): ItemRecord {
  return { position, round: 0, firstStrokeMs, submittedMs: firstStrokeMs + 500, given: null, correct, override: false, boxes: [] };
}

/** A completed side. `wrong` positions were wrong on the first pass; `slow` were right but slow. */
function rec(code: string, opts: { problems?: Fact[]; wrong?: number[]; slow?: number[]; activeMs?: number; at?: number } = {}): SideRecord {
  const sheet = Number(code.slice(1, -1));
  const problems = opts.problems ?? Array.from({ length: 10 }, (_, i) => f(50 + i, 20 + i));
  const items = problems.map((_, i) =>
    item(i, !(opts.wrong ?? []).includes(i), (opts.slow ?? []).includes(i) ? config.progress.fluencyMs.column + 1 : 1_000),
  );
  const firstPassCorrect = items.filter((i) => i.correct).length;
  clock += 1_000;
  return {
    id: `${code}-${clock}`,
    code,
    sheet,
    side: code.endsWith('a') ? 'a' : 'b',
    layout: 'column',
    problems,
    rounds: [{ round: 0, items }],
    firstPassCorrect,
    total: problems.length,
    activeMs: opts.activeMs ?? 60_000,
    startedAt: clock - 500,
    completedAt: opts.at ?? clock,
  };
}

/** Both sides of sheets first..last. */
function sheets(first: number, last: number, opts: Parameters<typeof rec>[1] = {}): SideRecord[] {
  const out: SideRecord[] = [];
  for (let s = first; s <= last; s++) out.push(rec(`B${s}a`, opts), rec(`B${s}b`, opts));
  return out;
}

describe('nextSide', () => {
  it('starts at B101a', () => {
    expect(config.progress.startSheet).toBe(101);
    expect(nextSide([])).toEqual({ code: 'B101a', attempt: 1 });
  });

  it('goes a then b then the next sheet', () => {
    expect(nextSide([rec('B101a')])?.code).toBe('B101b');
    expect(nextSide([rec('B101a'), rec('B101b')])?.code).toBe('B102a');
  });

  it('moves to the next block when the block passes', () => {
    expect(nextSide(sheets(101, 110))).toEqual({ code: 'B111a', attempt: 1 });
  });

  it('repeats the block from its first sheet when first-pass accuracy is too low', () => {
    const h = sheets(101, 110, { wrong: [0, 1, 2] });
    expect(nextSide(h)).toEqual({ code: 'B101a', attempt: 2 });
  });

  it('repeats the block when she is too slow, and passes once the repeat is clean and fast', () => {
    const slowMs = (config.progress.sctSideFraction * 2 * 60_000) + 10_000; // block B101–110 SCT is 1–2 min
    const h = sheets(101, 110, { activeMs: slowMs });
    expect(nextSide(h)).toEqual({ code: 'B101a', attempt: 2 });
    expect(nextSide([...h, ...sheets(101, 110)])).toEqual({ code: 'B111a', attempt: 1 });
  });

  it('ignores a side saved twice, so a double-tap cannot change a block result', () => {
    const h = sheets(101, 110, { wrong: [0, 1, 2] });
    const dup = { ...h[h.length - 1]!, id: 'dup', completedAt: h[h.length - 1]!.completedAt + 1 };
    expect(nextSide([...h, dup])).toEqual({ code: 'B101a', attempt: 2 });
    const passed = sheets(101, 110);
    const dup2 = { ...passed[passed.length - 1]!, id: 'dup2', wrong: [], firstPassCorrect: 0, completedAt: passed[passed.length - 1]!.completedAt + 1 };
    expect(nextSide([...passed, dup2])).toEqual({ code: 'B111a', attempt: 1 });
  });

  it('returns null after B200 passes', () => {
    expect(nextSide([...sheets(101, 200)])).toBeNull();
  });
});

describe('blockPassed', () => {
  it('needs both accuracy and time', () => {
    expect(blockPassed(sheets(131, 140))).toBe(true);
    expect(blockPassed(sheets(131, 140, { wrong: [0, 1] }))).toBe(false);
    expect(blockPassed(sheets(131, 140, { activeMs: 10 * 60_000 }))).toBe(false);
  });
});

describe('reviewPool', () => {
  it('holds problems answered wrong or slowly until right and fast twice in a row', () => {
    const p = [f(52, 27), f(63, 18), f(41, 26)];
    const pad = (xs: Fact[]) => [...xs, ...Array.from({ length: 7 }, (_, i) => f(90 - i, 10 + i))];
    const h1 = [rec('B131a', { problems: pad(p), wrong: [0], slow: [1] })];
    expect(reviewPool(h1).map((r) => `${r.fact.a}${r.fact.op}${r.fact.b}`).sort()).toEqual(['52−27', '63−18']);
    const h2 = [...h1, rec('B131b', { problems: pad(p) })];
    expect(reviewPool(h2)).toHaveLength(2);
    const h3 = [...h2, rec('B132a', { problems: pad(p) })];
    expect(reviewPool(h3)).toEqual([]);
  });

  it('puts wrong answers before slow ones, so a mistake is not crowded out', () => {
    const wrongOld = f(52, 27), slowNew = f(63, 18);
    const pad = (xs: Fact[]) => [...xs, ...Array.from({ length: 8 }, (_, i) => f(90 - i, 10 + i))];
    const h = [rec('B131a', { problems: pad([wrongOld, f(11, 1)]), wrong: [0] }), rec('B131b', { problems: pad([slowNew, f(12, 1)]), slow: [0] })];
    expect(reviewPool(h).map((r) => `${r.fact.a}${r.fact.op}${r.fact.b}`)).toEqual(['52−27', '63−18']);
  });

  it('gives column problems more time before they count as slow', () => {
    expect(config.progress.fluencyMs.column).toBeGreaterThan(config.progress.fluencyMs.horizontal);
  });

  it('counts the first appearance on a side only, and carries the layout', () => {
    const p = [f(52, 27), f(52, 27)];
    const h = [rec('B131a', { problems: [...p, ...Array.from({ length: 8 }, (_, i) => f(90 - i, 10 + i))], wrong: [0] })];
    expect(reviewPool(h)).toEqual([{ fact: f(52, 27), layout: 'column' }]);
  });
});

describe('sidesToday', () => {
  it('counts sides completed on the same local day', () => {
    const now = new Date(2026, 9, 24, 18, 0).getTime();
    const yesterday = new Date(2026, 9, 23, 18, 0).getTime();
    const morning = new Date(2026, 9, 24, 7, 0).getTime();
    expect(sidesToday([rec('B101a', { at: yesterday }), rec('B101b', { at: morning }), rec('B102a', { at: now })], now)).toBe(2);
  });
});
