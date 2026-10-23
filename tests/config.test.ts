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
