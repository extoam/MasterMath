import { describe, expect, it } from 'vitest';
import { checkSequence, remainingSequence, summarise, type CheckItem } from '../src/ink/check';
import { DIGITS, type Digit } from '../src/ink/types';
import { seeded } from './helpers/shapes';

describe('checkSequence', () => {
  it('prompts every digit itemsPerDigit times, 100 items for 10', () => {
    const seq = checkSequence(10, seeded(3));
    expect(seq).toHaveLength(100);
    for (const d of DIGITS) expect(seq.filter((x) => x === d)).toHaveLength(10);
  });
});

describe('summarise', () => {
  it('counts correct, unread and confusions as plain facts', () => {
    const items: CheckItem[] = [];
    for (let i = 0; i < 97; i++) {
      const d = DIGITS[i % 10]!;
      items.push({ prompt: d, read: d, confident: i % 20 !== 0 });
    }
    items.push({ prompt: 7, read: 1, confident: false });
    items.push({ prompt: 7, read: 1, confident: true });
    items.push({ prompt: 2, read: null, confident: false });

    const s = summarise(items);
    expect(s.total).toBe(100);
    expect(s.correct).toBe(97);
    expect(s.accuracyPct).toBe(97);
    expect(s.unread).toBe(1);
    expect(s.notConfident).toBe(7); // 5 of the correct ones + the unconfident 7→1 + the unread
    expect(s.confusions).toEqual([{ prompt: 7, read: 1, count: 2 }]);
  });

  it('sorts confusions by count, most frequent first', () => {
    const items: CheckItem[] = [
      { prompt: 4, read: 9, confident: true },
      { prompt: 7, read: 1, confident: true },
      { prompt: 4, read: 9, confident: true },
    ];
    expect(summarise(items).confusions.map((c) => `${c.prompt}→${c.read}×${c.count}`)).toEqual(['4→9×2', '7→1×1']);
  });

  it('handles an empty run without dividing by zero', () => {
    const s = summarise([]);
    expect(s.total).toBe(0);
    expect(s.accuracyPct).toBe(0);
    expect(s.confusions).toEqual([]);
  });
});

describe('remainingSequence', () => {
  function done(counts: Partial<Record<Digit, number>>): CheckItem[] {
    const items: CheckItem[] = [];
    for (const d of DIGITS) for (let i = 0; i < (counts[d] ?? 0); i++) items.push({ prompt: d, read: d, confident: true });
    return items;
  }

  it('prompts exactly what is still missing per digit', () => {
    const already = done({ 0: 3, 1: 3, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2 });
    const seq = remainingSequence(already, 10, seeded(5));
    expect(seq).toHaveLength(77);
    for (const d of DIGITS) expect(seq.filter((x) => x === d)).toHaveLength(d <= 2 ? 7 : 8);
  });

  it('covers every still-needed digit once before repeating any', () => {
    const already = done({ 0: 10, 1: 9, 2: 9, 3: 10 });
    const seq = remainingSequence(already, 10, seeded(8));
    expect([...seq.slice(0, 8)].sort()).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it('is empty when the run is complete', () => {
    const already = done(Object.fromEntries(DIGITS.map((d) => [d, 10])) as Record<Digit, number>);
    expect(remainingSequence(already, 10, seeded(1))).toEqual([]);
  });

  it('with nothing done equals a fresh check sequence', () => {
    expect(remainingSequence([], 10, seeded(3))).toEqual(checkSequence(10, seeded(3)));
  });
});
