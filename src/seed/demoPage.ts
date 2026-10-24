import type { Fact } from '../engine/worksheet';

/**
 * Build step 2: one hard-coded page from tables 6 and 7 (level C3 content).
 * Step 3 replaces this with the scheduler's composition.
 */
function mul(a: number, b: number): Fact {
  return { op: '×', a, b, answer: a * b };
}

export const demoPage: readonly Fact[] = [
  mul(6, 1),
  mul(7, 8),
  mul(6, 7),
  mul(7, 3),
  mul(6, 9),
  mul(7, 6),
  mul(6, 4),
  mul(7, 9),
  mul(6, 8),
  mul(7, 5),
];
