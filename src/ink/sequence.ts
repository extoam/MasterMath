import { DIGITS, type Digit } from './types';

/** Fisher–Yates shuffle into a new array. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Prompt order for calibration and the handwriting check: `perDigit` passes
 * over 0–9, each pass shuffled, so every digit appears once before any repeats.
 */
export function promptSequence(perDigit: number, random: () => number): Digit[] {
  const out: Digit[] = [];
  for (let pass = 0; pass < perDigit; pass++) out.push(...shuffled(DIGITS, random));
  return out;
}
