import { describe, expect, it } from 'vitest';
import { toCloud } from '../src/ink/normalise';
import { readAnswer } from '../src/ink/readAnswer';
import type { Digit, Stroke } from '../src/ink/types';
import { four, one, seven, zero } from './helpers/shapes';

const opts = { n: 32, minPathLength: 8, confidentMarginRatio: 1.2 };
const cands = (shapes: Array<[Digit, Stroke[]]>) => shapes.map(([digit, s]) => ({ digit, cloud: toCloud(s, 32) }));

describe('readAnswer', () => {
  const c = cands([
    [1, one({ seed: 1 })], [1, one({ jitter: 2, seed: 2 })],
    [0, zero({ seed: 1 })], [0, zero({ jitter: 2, seed: 2 })],
    [7, seven({ seed: 1 })], [4, four({ seed: 1 })],
    [9, four({ jitter: 1.5, seed: 4 })], // her 9 looks a lot like a 4
  ]);

  it('reads a right answer as the expected digits, keeping what plain recognition saw', () => {
    const boxes = [one({ jitter: 2, seed: 7 }), zero({ jitter: 2, seed: 7 })];
    const r = readAnswer(boxes, [1, 0], c, opts, 1.2);
    expect(r.map((b) => b.read)).toEqual([1, 0]);
    expect(r.every((b) => b.rawRead !== undefined && b.ratio >= 1)).toBe(true);
    expect(r[0]!.strokes).toBe(boxes[0]);
  });

  it('accepts the expected digit in a close call with a look-alike', () => {
    const ink = four({ jitter: 1.5, seed: 3 });
    const r = readAnswer([ink], [9], c, opts, 1.5);
    expect(r[0]!.read).toBe(9);
  });

  it('keeps a clearly different digit, so a real mistake is still marked wrong', () => {
    const r = readAnswer([zero({ jitter: 2, seed: 5 })], [7], c, opts, 1.2);
    expect(r[0]!.read).toBe(0);
    expect(r[0]!.rawRead).toBe(0);
  });

  it('reads an empty box as unread', () => {
    const r = readAnswer([[]], [7], c, opts, 1.2);
    expect(r[0]!.read).toBeNull();
    expect(r[0]!.confident).toBe(false);
  });
});
