import { describe, expect, it } from 'vitest';
import { LEVEL_B, blockFor, parseSheetCode, sheetCode } from '../src/curriculum/levelB';
import { seeded } from './helpers/shapes';

const sample = (sheet: number, n = 300) => {
  const block = blockFor(sheet);
  const rnd = seeded(sheet);
  return Array.from({ length: n }, () => block.generate(rnd));
};
const ones = (n: number) => n % 10;
const tens = (n: number) => Math.floor(n / 10) % 10;
const hundreds = (n: number) => Math.floor(n / 100) % 10;
const digits = (n: number) => String(n).length;

describe('Level B blocks', () => {
  it('covers sheets 1 to 200 in 20 blocks of 10 with Kumon titles and SCT', () => {
    expect(LEVEL_B).toHaveLength(20);
    LEVEL_B.forEach((b, i) => {
      expect(b.first).toBe(i * 10 + 1);
      expect(b.last).toBe(i * 10 + 10);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.sctMinutes[0]).toBeGreaterThan(0);
      expect(b.sctMinutes[1]).toBeGreaterThanOrEqual(b.sctMinutes[0]);
    });
    expect(blockFor(131).title).toBe('Subtraction of 2-Digit Numbers 2');
    expect(blockFor(200).sctMinutes).toEqual([3, 5]);
  });

  it('every generated problem has the right answer and a non-negative result', () => {
    for (const b of LEVEL_B) {
      for (const p of sample(b.first, 100)) {
        expect(p.answer).toBe(p.op === '+' ? p.a + p.b : p.a - p.b);
        expect(p.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('uses horizontal layout for the review blocks and columns elsewhere', () => {
    expect(blockFor(5).layout).toBe('horizontal');
    expect(blockFor(105).layout).toBe('horizontal');
    expect(blockFor(115).layout).toBe('horizontal');
    expect(blockFor(125).layout).toBe('column');
    expect(blockFor(195).layout).toBe('column');
  });

  it('B101–110 subtracts from numbers up to 12, B111–120 up to 20', () => {
    for (const p of sample(101)) expect(p.op === '−' && p.a <= 12 && p.b >= 1).toBe(true);
    const s = sample(111);
    for (const p of s) expect(p.op === '−' && p.a <= 20 && p.b >= 1).toBe(true);
    expect(s.some((p) => p.a > 12)).toBe(true);
  });

  it('B121–130 is 2-digit minus 1-digit, with and without borrowing', () => {
    const s = sample(121);
    for (const p of s) expect(digits(p.a) === 2 && digits(p.b) === 1 && p.op === '−').toBe(true);
    expect(s.some((p) => ones(p.a) < p.b)).toBe(true);
    expect(s.some((p) => ones(p.a) >= p.b)).toBe(true);
  });

  it('B131–140 is 2-digit minus 2-digit without borrowing', () => {
    for (const p of sample(131)) expect(digits(p.a) === 2 && digits(p.b) === 2 && ones(p.a) >= ones(p.b)).toBe(true);
  });

  it('B141–150 is 2-digit minus 2-digit with borrowing', () => {
    for (const p of sample(141)) expect(digits(p.a) === 2 && digits(p.b) === 2 && ones(p.a) < ones(p.b)).toBe(true);
  });

  it('B151–160 mixes addition and subtraction of 2-digit numbers', () => {
    const s = sample(151);
    expect(s.some((p) => p.op === '+')).toBe(true);
    expect(s.some((p) => p.op === '−')).toBe(true);
    for (const p of s) expect(digits(p.a) === 2 && digits(p.b) === 2).toBe(true);
  });

  it('B161–200 subtracts from 3-digit numbers, B191–200 borrowing across a zero', () => {
    for (const sheet of [161, 171, 181, 191]) for (const p of sample(sheet)) expect(digits(p.a) === 3 && p.op === '−').toBe(true);
    for (const p of sample(181)) expect(digits(p.b)).toBe(3);
    for (const p of sample(191)) expect(tens(p.a) === 0 && ones(p.a) < ones(p.b) && digits(p.b) === 3).toBe(true);
    for (const p of sample(171)) expect(ones(p.a) < ones(p.b) || tens(p.a) < tens(p.b)).toBe(true);
  });

  it('addition blocks follow the carry rules in their titles', () => {
    for (const p of sample(11)) expect(digits(p.a) === 2 && digits(p.b) === 1 && ones(p.a) + p.b < 10).toBe(true);
    for (const p of sample(21)) expect(ones(p.a) + p.b).toBe(10);
    for (const p of sample(31)) expect(ones(p.a) + p.b > 10 && p.answer < 100).toBe(true);
    for (const p of sample(41)) expect(ones(p.a) + ones(p.b) < 10 && tens(p.a) + tens(p.b) < 10).toBe(true);
    for (const p of sample(51)) expect(ones(p.a) + ones(p.b) >= 10 && p.answer < 100).toBe(true);
    for (const p of sample(61)) expect(p.answer >= 100).toBe(true);
    for (const p of sample(81)) expect(digits(p.a) === 3 && digits(p.b) === 3 && p.answer < 1000).toBe(true);
    for (const p of sample(91)) expect(p.answer >= 1000).toBe(true);
    expect(hundreds(sample(71)[0]!.a)).toBeGreaterThan(0);
  });
});

describe('sheet codes', () => {
  it('formats and parses Kumon codes', () => {
    expect(sheetCode(131, 'a')).toBe('B131a');
    expect(sheetCode(7, 'b')).toBe('B7b');
    expect(parseSheetCode('B131a')).toEqual({ sheet: 131, side: 'a' });
    expect(parseSheetCode('B7b')).toEqual({ sheet: 7, side: 'b' });
    expect(() => parseSheetCode('C1a')).toThrow();
    expect(() => parseSheetCode('B201a')).toThrow();
  });
});
