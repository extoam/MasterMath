import { describe, expect, it } from 'vitest';
import { config } from '../src/engine/config';
import { fitToRow } from '../src/ui/fit';

describe('fitToRow', () => {
  it('uses the full box size when the rows are tall enough or not measured yet', () => {
    expect(fitToRow('horizontal', null).box).toEqual(config.sheet.horizontalBoxPx);
    expect(fitToRow('horizontal', 200).box).toEqual(config.sheet.horizontalBoxPx);
    expect(fitToRow('column', 400).box).toEqual(config.sheet.columnBoxPx);
  });

  it('shrinks boxes so a short row still holds the problem', () => {
    const h = fitToRow('horizontal', 60).box.h;
    expect(h).toBeLessThanOrEqual(60 - 12);
    const c = fitToRow('column', 120).box.h;
    expect(c * 2.15 + 24).toBeLessThanOrEqual(120 + 1);
  });

  it('never goes below the floor, and keeps the box shape', () => {
    expect(fitToRow('horizontal', 10).box.h).toBe(config.sheet.minBoxPx);
    const { w, h } = fitToRow('column', 100).box;
    expect(Math.abs(w / h - config.sheet.columnBoxPx.w / config.sheet.columnBoxPx.h)).toBeLessThan(0.05);
  });
});
