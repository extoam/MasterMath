import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import { buildSide, factKey, seededRandom } from '../src/engine/sheet';
import type { Fact } from '../src/engine/worksheet';

const counts = (fs: readonly Fact[]) => {
  const m = new Map<string, number>();
  for (const f of fs) m.set(factKey(f), (m.get(factKey(f)) ?? 0) + 1);
  return m;
};
const noAdjacent = (fs: readonly Fact[]) => fs.every((f, i) => i === 0 || factKey(f) !== factKey(fs[i - 1]!));

describe('seededRandom', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = seededRandom('B131a'), b = seededRandom('B131a'), c = seededRandom('B131b');
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('buildSide', () => {
  it('fills a column side with 10 problems and a horizontal side with 20', () => {
    expect(buildSide('B131a').problems).toHaveLength(config.sheet.columnProblems);
    expect(buildSide('B111a').problems).toHaveLength(config.sheet.horizontalProblems);
    expect(config.sheet.columnProblems).toBe(10);
    expect(config.sheet.horizontalProblems).toBe(20);
    expect(buildSide('B131a')).toMatchObject({ code: 'B131a', sheet: 131, layout: 'column', title: 'Subtraction of 2-Digit Numbers 2' });
  });

  it('shows every problem exactly twice, never back to back', () => {
    for (const code of ['B101a', 'B111b', 'B125a', 'B151b', 'B191a', 'B7a', 'B95b']) {
      const side = buildSide(code);
      expect([...counts(side.problems).values()].every((n) => n === 2)).toBe(true);
      expect(noAdjacent(side.problems)).toBe(true);
    }
  });

  it('never puts a problem beside its twin in the other column, so she recalls instead of copying', () => {
    for (let sheet = 101; sheet <= 200; sheet++) {
      for (const side of ['a', 'b'] as const) {
        const ps = buildSide(`B${sheet}${side}`).problems;
        const half = ps.length / 2;
        for (let i = 0; i < half; i++) expect(factKey(ps[i]!)).not.toBe(factKey(ps[i + half]!));
      }
    }
  });

  it('gives the same side for the same code, so a repeated block repeats its sheets', () => {
    expect(buildSide('B142a').problems).toEqual(buildSide('B142a').problems);
    expect(buildSide('B142a').problems).not.toEqual(buildSide('B142b').problems);
  });

  it('brings review problems of the same layout back twice, keeping the count and no adjacency', () => {
    const review = [
      { fact: { op: '+' as const, a: 47, b: 38, answer: 85 }, layout: 'column' as const },
      { fact: { op: '−' as const, a: 61, b: 29, answer: 32 }, layout: 'column' as const },
      { fact: { op: '+' as const, a: 75, b: 18, answer: 93 }, layout: 'column' as const },
      { fact: { op: '−' as const, a: 14, b: 6, answer: 8 }, layout: 'horizontal' as const },
    ];
    const side = buildSide('B131a', review);
    const c = counts(side.problems);
    expect(side.problems).toHaveLength(10);
    expect(c.get('47+38')).toBe(2);
    expect(c.get('61−29')).toBe(2);
    expect(c.has('75+18')).toBe(false); // at most reviewPerSide
    expect(c.has('14−6')).toBe(false); // wrong layout
    expect(noAdjacent(side.problems)).toBe(true);
    expect(config.progress.reviewPerSide).toBe(2);
  });

  it('does not inject a review problem the side already has', () => {
    const own = buildSide('B131a').problems[0]!;
    const side = buildSide('B131a', [{ fact: own, layout: 'column' }]);
    expect(counts(side.problems).get(factKey(own))).toBe(2);
    expect(side.problems).toEqual(buildSide('B131a').problems);
  });
});
