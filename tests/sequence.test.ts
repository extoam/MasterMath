import { describe, expect, it } from 'vitest';
import { promptSequence } from '../src/ink/sequence';
import { DIGITS } from '../src/ink/types';
import { seeded } from './helpers/shapes';

describe('promptSequence', () => {
  it('asks for every digit k times', () => {
    const seq = promptSequence(3, seeded(7));
    expect(seq).toHaveLength(30);
    for (const d of DIGITS) expect(seq.filter((x) => x === d)).toHaveLength(3);
  });

  it('covers all ten digits within every pass of ten before repeating any', () => {
    const seq = promptSequence(10, seeded(42));
    expect(seq).toHaveLength(100);
    for (let pass = 0; pass < 10; pass++) {
      expect([...seq.slice(pass * 10, pass * 10 + 10)].sort()).toEqual([...DIGITS]);
    }
  });

  it('shuffles: two seeds give different orders', () => {
    expect(promptSequence(3, seeded(1))).not.toEqual(promptSequence(3, seeded(2)));
  });

  it('returns an empty sequence for zero reps', () => {
    expect(promptSequence(0, seeded(1))).toEqual([]);
  });
});
