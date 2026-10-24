import { describe, expect, it } from 'vitest';
import { ActiveClock } from '../src/engine/activeClock';

const IDLE = 30_000;
const clock = () => new ActiveClock({ idleTimeoutMs: IDLE });

describe('ActiveClock', () => {
  it('reads 0 before it is started', () => {
    expect(clock().activeMs(5_000)).toBe(0);
  });

  it('counts continuous activity in full', () => {
    const c = clock();
    c.start(0);
    for (let t = 1_000; t <= 10_000; t += 1_000) c.touch(t);
    expect(c.activeMs(10_000)).toBe(10_000);
  });

  it('counts at most the idle timeout for a long gap', () => {
    const c = clock();
    c.start(0);
    c.touch(60_000);
    expect(c.activeMs(60_000)).toBe(IDLE);
  });

  it('caps the live tail at the idle timeout', () => {
    const c = clock();
    c.start(0);
    expect(c.activeMs(5_000)).toBe(5_000);
    expect(c.activeMs(45_000)).toBe(IDLE);
  });

  it('resumes counting after an idle gap', () => {
    const c = clock();
    c.start(0);
    c.touch(60_000);
    c.touch(61_000);
    expect(c.activeMs(61_000)).toBe(IDLE + 1_000);
  });

  it('freezes on stop and ignores later touches', () => {
    const c = clock();
    c.start(0);
    c.touch(1_000);
    expect(c.stop(2_000)).toBe(2_000);
    expect(c.activeMs(99_999)).toBe(2_000);
    c.touch(3_000);
    expect(c.activeMs(4_000)).toBe(2_000);
  });

  it('ignores a second start', () => {
    const c = clock();
    c.start(0);
    c.touch(1_000);
    c.start(50_000);
    expect(c.activeMs(1_000)).toBe(1_000);
  });
});
