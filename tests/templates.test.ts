import { describe, expect, it } from 'vitest';
import { TemplateStore, type Template } from '../src/ink/templates';
import { DIGITS, type Digit, type Stroke } from '../src/ink/types';

function stroke(len: number): Stroke {
  return [
    { x: 10, y: 10, t: 0, pressure: 0.5 },
    { x: 10 + len, y: 10 + len / 2, t: 20, pressure: 0.5 },
    { x: 10, y: 10 + len, t: 40, pressure: 0.5 },
  ];
}

function template(digit: Digit, createdAt: number, len = 40): Template {
  return { id: `t-${digit}-${createdAt}`, digit, strokes: [stroke(len)], createdAt, source: 'calibration' };
}

function store() {
  return new TemplateStore({ maxPerDigit: 10, minPerDigit: 3, n: 32 });
}

describe('TemplateStore', () => {
  it('keeps only the newest maxPerDigit templates active for a digit', () => {
    const s = store();
    for (let i = 1; i <= 12; i++) s.add(template(7, i * 1000));
    expect(s.countPerDigit()[7]).toBe(10);
    const active = s.active().filter((t) => t.digit === 7);
    expect(active.map((t) => t.createdAt).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => i * 1000));
    expect(s.candidates().filter((c) => c.digit === 7)).toHaveLength(10);
  });

  it('reports which digits are below the minimum until every digit has enough', () => {
    const s = store();
    expect(s.missingDigits()).toEqual([...DIGITS]);
    expect(s.isReady()).toBe(false);
    for (const d of DIGITS) {
      if (d === 9) continue;
      for (let i = 0; i < 3; i++) s.add(template(d, i + 1));
    }
    expect(s.missingDigits()).toEqual([9]);
    expect(s.isReady()).toBe(false);
    for (let i = 0; i < 3; i++) s.add(template(9, i + 1));
    expect(s.missingDigits()).toEqual([]);
    expect(s.isReady()).toBe(true);
  });

  it('precomputes 32-point clouds once and reuses them until something changes', () => {
    const s = store();
    s.add(template(2, 1));
    const first = s.candidates();
    expect(first[0]!.cloud).toHaveLength(32);
    expect(s.candidates()).toBe(first);
    s.add(template(2, 2));
    expect(s.candidates()).not.toBe(first);
    expect(s.candidates()).toHaveLength(2);
  });

  it('load replaces whatever was there before', () => {
    const s = store();
    s.add(template(5, 1));
    s.load([template(1, 1), template(1, 2)]);
    expect(s.countPerDigit()[5]).toBe(0);
    expect(s.countPerDigit()[1]).toBe(2);
  });
});
