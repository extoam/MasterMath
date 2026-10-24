import { describe, expect, it } from 'vitest';
import { evaluateTemplates } from '../src/ink/evaluate';
import { toCloud } from '../src/ink/normalise';
import { recognise } from '../src/ink/recogniser';
import type { Template } from '../src/ink/templates';
import type { Digit, Stroke } from '../src/ink/types';
import { four, one, seven, three, zero } from './helpers/shapes';

const opts = { n: 32, minPathLength: 8, confidentMarginRatio: 1.2 };
let id = 0;
const t = (digit: Digit, strokes: Stroke[]): Template => ({ id: `t${id++}`, digit, strokes, createdAt: id, source: 'calibration' });

function set(): Template[] {
  const out: Template[] = [];
  for (let seed = 1; seed <= 4; seed++) {
    out.push(t(1, one({ jitter: 2, seed })), t(0, zero({ jitter: 2, seed })), t(7, seven({ jitter: 2, seed })), t(4, four({ jitter: 2, seed })), t(3, three({ jitter: 2, seed })));
  }
  return out;
}

describe('evaluateTemplates (leave-one-out)', () => {
  it('reads each sample against all the others and reports accuracy, per digit and confusions', () => {
    const r = evaluateTemplates(set(), opts);
    expect(r.total).toBe(20);
    expect(r.correct).toBe(20);
    expect(r.perDigit[7]).toEqual({ total: 4, correct: 4 });
    expect(r.confusions).toEqual([]);
  });

  it('counts a confusion when a sample looks like another digit', () => {
    const samples = set();
    samples.push(t(9, seven({ jitter: 2, seed: 9 }))); // a “9” written like a 7
    samples.push(t(9, seven({ jitter: 2, seed: 10 })));
    const r = evaluateTemplates(samples, opts);
    expect(r.confusions.some((c) => c.prompt === 7 || c.prompt === 9)).toBe(true);
    expect(r.correct).toBeLessThan(r.total);
  });
});

describe('direction-aware scoring', () => {
  /** The same path drawn forwards and backwards: identical point clouds, opposite direction. */
  const forward: Stroke[] = [Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 3, y: 20 + Math.sin(i / 3) * 30, t: i, pressure: 0.5 }))];
  const backward: Stroke[] = [[...forward[0]!].reverse().map((p, i) => ({ ...p, t: i }))];

  /** A forward copy with small deterministic wobble, as a real second sample would have. */
  const wobbly: Stroke[] = [forward[0]!.map((p, i) => ({ ...p, x: p.x + ((i * 7) % 5) - 2, y: p.y + ((i * 3) % 5) - 2 }))];
  const candidates = (o: typeof opts) => [
    { digit: 5 as Digit, cloud: toCloud(wobbly, o.n) },
    { digit: 6 as Digit, cloud: toCloud(backward, o.n) },
  ];

  it('is off by default: plain $P reads a path as its reverse when that cloud is closer', () => {
    expect(recognise(forward, candidates(opts), opts)?.digit).toBe(6);
  });

  it('with a direction weight, the drawing direction wins', () => {
    const o = { ...opts, directionWeight: 1 };
    expect(recognise(forward, candidates(o), o)?.digit).toBe(5);
  });

  it('a direction weight of 0 gives exactly the plain $P result', () => {
    const s = set();
    const a = recognise(s[0]!.strokes, [], opts);
    expect(a).toBeNull();
    expect(evaluateTemplates(s, { ...opts, directionWeight: 0 })).toEqual(evaluateTemplates(s, opts));
  });
});
