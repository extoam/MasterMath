import { describe, expect, it } from 'vitest';
import { hasInk, pathLength, resample, scale, toCloud, translateToOrigin } from '../src/ink/normalise';
import type { PointCloud, Stroke } from '../src/ink/types';

/** A stroke of k evenly spaced points from (x0, y0) to (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number, k: number): Stroke {
  return Array.from({ length: k }, (_, i) => {
    const u = k === 1 ? 0 : i / (k - 1);
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, t: i * 10, pressure: 0.5 };
  });
}

function extent(cloud: PointCloud) {
  const xs = cloud.map((p) => p.x);
  const ys = cloud.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

describe('pathLength', () => {
  it('sums segment lengths within a stroke', () => {
    expect(pathLength([line(0, 0, 100, 0, 3)])).toBeCloseTo(100, 9);
  });

  it('never counts the gap between strokes', () => {
    expect(pathLength([line(0, 0, 100, 0, 3), line(200, 0, 300, 0, 3)])).toBeCloseTo(200, 9);
  });
});

describe('resample', () => {
  it('returns exactly n evenly spaced points along a single stroke', () => {
    const cloud = resample([line(0, 0, 100, 0, 3)], 32);
    expect(cloud).toHaveLength(32);
    expect(cloud[0]!.x).toBeCloseTo(0, 9);
    expect(cloud[31]!.x).toBeCloseTo(100, 6);
    expect(cloud.every((p) => p.strokeId === 0)).toBe(true);
    for (let i = 1; i < cloud.length; i++) {
      expect(cloud[i]!.x - cloud[i - 1]!.x).toBeCloseTo(100 / 31, 3);
    }
  });

  it('does not interpolate across the gap between strokes', () => {
    const cloud = resample([line(0, 0, 100, 0, 3), line(200, 0, 300, 0, 3)], 32);
    expect(cloud).toHaveLength(32);
    expect(cloud.some((p) => p.x > 100 + 1e-6 && p.x < 200 - 1e-6)).toBe(false);
    for (let i = 1; i < cloud.length; i++) {
      expect(cloud[i]!.strokeId).toBeGreaterThanOrEqual(cloud[i - 1]!.strokeId);
    }
  });

  it('returns n copies of a lone point', () => {
    const cloud = resample([line(40, 50, 40, 50, 1)], 32);
    expect(cloud).toHaveLength(32);
    expect(cloud.every((p) => p.x === 40 && p.y === 50)).toBe(true);
  });

  it('does not mutate its input', () => {
    const strokes = [line(0, 0, 100, 0, 3)];
    resample(strokes, 32);
    expect(strokes[0]).toHaveLength(3);
  });
});

describe('scale', () => {
  it('scales uniformly so the longer side becomes 1 and the aspect is kept', () => {
    const cloud: PointCloud = [
      { x: 0, y: 0, strokeId: 0 },
      { x: 50, y: 100, strokeId: 0 },
    ];
    const out = scale(cloud);
    expect(extent(out).h).toBeCloseTo(1, 9);
    expect(extent(out).w).toBeCloseTo(0.5, 9);
  });

  it('leaves a degenerate cloud unchanged rather than producing NaN', () => {
    const cloud: PointCloud = [
      { x: 7, y: 7, strokeId: 0 },
      { x: 7, y: 7, strokeId: 0 },
    ];
    const out = scale(cloud);
    expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('translateToOrigin', () => {
  it('moves the centroid to (0, 0)', () => {
    const out = translateToOrigin([
      { x: 10, y: 20, strokeId: 0 },
      { x: 30, y: 60, strokeId: 0 },
      { x: 50, y: 10, strokeId: 1 },
    ]);
    const cx = out.reduce((s, p) => s + p.x, 0) / out.length;
    const cy = out.reduce((s, p) => s + p.y, 0) / out.length;
    expect(Math.abs(cx)).toBeLessThan(1e-9);
    expect(Math.abs(cy)).toBeLessThan(1e-9);
  });
});

describe('toCloud', () => {
  function lShape(ox: number, oy: number, size: number): Stroke[] {
    return [line(ox, oy, ox, oy + size, 5), line(ox, oy + size, ox + size, oy + size, 5)];
  }

  it('is invariant to position and size', () => {
    const a = toCloud(lShape(0, 0, 40), 32);
    const b = toCloud(lShape(300, 500, 90), 32);
    let total = 0;
    for (let i = 0; i < 32; i++) total += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
    expect(total).toBeLessThan(1e-6);
  });

  it('copes with coordinates outside the box, including negatives', () => {
    const cloud = toCloud([line(-30, -10, 120, 140, 4)], 32);
    expect(cloud).toHaveLength(32);
    expect(cloud.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('hasInk', () => {
  it('is false for no strokes', () => {
    expect(hasInk([], 8)).toBe(false);
  });

  it('is false for a tap, so a resting pen tip does not count as an answer', () => {
    expect(hasInk([[{ x: 40, y: 50, t: 0, pressure: 0.5 }]], 8)).toBe(false);
  });

  it('is false for a mark shorter than the minimum path length', () => {
    expect(hasInk([line(40, 50, 43, 52, 3)], 8)).toBe(false);
  });

  it('is true for a real stroke', () => {
    expect(hasInk([line(40, 15, 40, 85, 5)], 8)).toBe(true);
  });
});
