import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';

describe('config.ink', () => {
  it('fixes the answer box at roughly 80 by 100 CSS px', () => {
    expect(config.ink.boxWidthPx).toBe(80);
    expect(config.ink.boxHeightPx).toBe(100);
  });

  it('resamples digits to 32 points for $P', () => {
    expect(config.ink.resamplePoints).toBe(32);
  });

  it('rejects touch pointers so a resting palm does not draw', () => {
    expect(config.ink.acceptedPointerTypes).not.toContain('touch');
    expect(config.ink.acceptedPointerTypes).toContain('pen');
  });
});

describe('config.worksheet', () => {
  it('fixes a page at 10 items and the idle pause at 30 s, per the spec', () => {
    expect(config.worksheet.itemsPerPage).toBe(10);
    expect(config.worksheet.idleTimeoutMs).toBe(30_000);
  });

  it('gives the timer a positive tick', () => {
    expect(config.worksheet.timerTickMs).toBeGreaterThan(0);
  });
});

describe('config.ink rubber', () => {
  it('erases within a positive radius', () => {
    expect(config.ink.eraserRadiusPx).toBeGreaterThan(0);
  });
});
