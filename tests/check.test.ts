import { describe, expect, it } from 'vitest';
import { checkSequence, summarise, type CheckItem } from '../src/ink/check';
import { DIGITS } from '../src/ink/types';
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
