import { describe, expect, it } from 'vitest';
import { SideTimer } from '../src/engine/sideTimer';

describe('SideTimer', () => {
  it('gives each side the active time spent on it, however often it is read', () => {
    const t = new SideTimer({}, 'B101a', 0);
    expect(t.snapshot(5_000)).toEqual({ B101a: 5_000 }); // an autosave
    expect(t.snapshot(9_000)).toEqual({ B101a: 9_000 }); // another autosave
    t.switchTo('B101b', 12_000);
    expect(t.snapshot(20_000)).toEqual({ B101a: 12_000, B101b: 8_000 });
  });

  it('adds to time carried over from an earlier visit', () => {
    const t = new SideTimer({ B101a: 60_000 }, 'B101a', 1_000);
    expect(t.snapshot(4_000)).toEqual({ B101a: 63_000 });
  });

  it('returning to a side keeps adding to it', () => {
    const t = new SideTimer({}, 'B101a', 0);
    t.switchTo('B101b', 10_000);
    t.switchTo('B101a', 15_000);
    expect(t.snapshot(18_000)).toEqual({ B101a: 13_000, B101b: 5_000 });
  });
});
