import { describe, expect, it } from 'vitest';
import { toCloud } from '../src/ink/normalise';
import { cloudDistance, recognise, type Candidate } from '../src/ink/recogniser';
import type { Digit, Stroke } from '../src/ink/types';
import { four, one, seven, three, zero, type ShapeOpts } from './helpers/shapes';

const opts = { n: 32, minPathLength: 8, confidentMarginRatio: 1.2 };

const shapes: Array<[Digit, (o?: ShapeOpts) => Stroke[]]> = [
  [0, zero],
  [1, one],
  [3, three],
  [4, four],
  [7, seven],
];

function candidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const [digit, shape] of shapes) {
    for (const seed of [11, 12, 13]) out.push({ digit, cloud: toCloud(shape({ jitter: 1.5, seed }), opts.n) });
  }
  return out;
}

const cands = candidates();

describe('recognise', () => {
  it.each(shapes)('reads a jittered, shifted, shrunk %i', (digit, shape) => {
    expect(recognise(shape({ dx: 10, s: 0.8, jitter: 2, seed: 99 }), cands, opts)?.digit).toBe(digit);
  });

  it('is invariant to position and size', () => {
    expect(recognise(seven({ dx: 300, dy: 400, s: 2.5 }), cands, opts)?.digit).toBe(7);
  });

  it('returns null for no ink', () => {
    expect(recognise([], cands, opts)).toBeNull();
  });

  it('returns null for a tap rather than a random digit', () => {
    expect(recognise([[{ x: 40, y: 50, t: 0, pressure: 0.5 }]], cands, opts)).toBeNull();
  });

  it('returns null for a tiny accidental mark below the minimum path length', () => {
    const scribble: Stroke = [
      { x: 40, y: 50, t: 0, pressure: 0.5 },
      { x: 42, y: 51, t: 5, pressure: 0.5 },
      { x: 41, y: 52, t: 10, pressure: 0.5 },
    ];
    expect(recognise([scribble], cands, opts)).toBeNull();
  });

  it('returns null when there are no templates', () => {
    expect(recognise(one(), [], opts)).toBeNull();
  });

  it('is never confident when only one digit has templates', () => {
    const only1 = cands.filter((c) => c.digit === 1);
    const r = recognise(one({ jitter: 1, seed: 5 }), only1, opts);
    expect(r?.digit).toBe(1);
    expect(r?.runnerUp).toBeNull();
    expect(r?.confident).toBe(false);
  });

  it('is not confident when the runner-up is as close as the winner', () => {
    const cloud = toCloud(one(), opts.n);
    const r = recognise(one({ jitter: 1, seed: 5 }), [{ digit: 1, cloud }, { digit: 7, cloud }], opts);
    expect(r?.confident).toBe(false);
    expect(r!.runnerUpScore! / r!.score).toBeCloseTo(1, 9);
  });

  it('is confident when the runner-up is well clear', () => {
    const r = recognise(one({ jitter: 1, seed: 5 }), cands, opts);
    expect(r?.digit).toBe(1);
    expect(r?.confident).toBe(true);
  });

  it('reads 100 of 100 synthetic samples correctly', () => {
    let correct = 0;
    let total = 0;
    for (const [digit, shape] of shapes) {
      for (let i = 0; i < 20; i++) {
        total++;
        const sample = shape({ dx: (i % 5) * 3, dy: (i % 4) * 2, s: 0.7 + (i % 6) * 0.08, jitter: 3, seed: 100 + i });
        if (recognise(sample, cands, opts)?.digit === digit) correct++;
      }
    }
    expect(correct).toBe(total);
    expect(total).toBe(100);
  });
});

describe('cloudDistance', () => {
  it('is zero for identical clouds', () => {
    const c = toCloud(three(), opts.n);
    expect(cloudDistance(c, c)).toBeCloseTo(0, 9);
  });

  it('is symmetric', () => {
    const a = toCloud(three(), opts.n);
    const b = toCloud(zero(), opts.n);
    expect(cloudDistance(a, b)).toBeCloseTo(cloudDistance(b, a), 9);
  });
});
