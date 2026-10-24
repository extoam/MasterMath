import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import { demoPage } from '../src/seed/demoPage';

describe('demoPage', () => {
  it('holds one full page of multiplication facts', () => {
    expect(demoPage).toHaveLength(config.worksheet.itemsPerPage);
    for (const f of demoPage) expect(f.op).toBe('×');
  });

  it('has the right answer on every fact', () => {
    for (const f of demoPage) expect(f.answer).toBe(f.a * f.b);
  });

  it('mixes one-digit and two-digit answers so box counts vary', () => {
    expect(demoPage.some((f) => f.answer < 10)).toBe(true);
    expect(demoPage.some((f) => f.answer >= 10)).toBe(true);
  });
});
