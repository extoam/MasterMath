import type { Stroke } from '../../src/ink/types';

/**
 * Synthetic digit shapes drawn inside an 80 × 100 box. Enough variety to
 * separate 0, 1, 3, 4 and 7; not a stand-in for a real hand.
 */
export interface ShapeOpts {
  dx?: number;
  dy?: number;
  /** Uniform scale factor applied before translation. */
  s?: number;
  /** Max per-point displacement in px, deterministic from `seed`. */
  jitter?: number;
  seed?: number;
}

/** mulberry32: a tiny deterministic PRNG so jitter is reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type XY = [number, number];

function polyline(points: XY[], perSegment: number): XY[] {
  const out: XY[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    for (let k = 0; k < perSegment; k++) {
      const u = k / (perSegment - 1);
      if (i > 1 && k === 0) continue; // shared corner point
      out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]);
    }
  }
  return out;
}

/** Arc in screen coordinates (y down): increasing angle sweeps clockwise on screen. */
function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, k: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < k; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / (k - 1)) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function finish(raw: XY[][], o: ShapeOpts): Stroke[] {
  const { dx = 0, dy = 0, s = 1, jitter = 0, seed = 1 } = o;
  const rnd = seeded(seed);
  let t = 0;
  return raw.map((stroke) =>
    stroke.map(([x, y]) => {
      t += 12;
      return {
        x: dx + s * x + (rnd() * 2 - 1) * jitter,
        y: dy + s * y + (rnd() * 2 - 1) * jitter,
        t,
        pressure: 0.5,
      };
    }),
  );
}

export function one(o: ShapeOpts = {}): Stroke[] {
  return finish([polyline([[40, 15], [40, 85]], 12)], o);
}

export function zero(o: ShapeOpts = {}): Stroke[] {
  return finish([arc(40, 50, 26, 270, 630, 28).map(([x, y]) => [40 + (x - 40) * 0.8, y] as XY)], o);
}

export function seven(o: ShapeOpts = {}): Stroke[] {
  return finish([polyline([[18, 18], [60, 18], [32, 86]], 10)], o);
}

export function four(o: ShapeOpts = {}): Stroke[] {
  return finish([polyline([[48, 15], [20, 60], [62, 60]], 8), polyline([[48, 30], [48, 88]], 8)], o);
}

export function three(o: ShapeOpts = {}): Stroke[] {
  return finish([[...arc(40, 35, 14, 210, 450, 12), ...arc(40, 65, 16, 270, 510, 12)]], o);
}
