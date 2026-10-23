import { DIGITS, type Digit } from './types';

/**
 * Prompt order for calibration and the handwriting check: `perDigit` passes
 * over 0–9, each pass shuffled, so every digit appears once before any repeats.
 */
export function promptSequence(perDigit: number, random: () => number): Digit[] {
  const out: Digit[] = [];
  for (let pass = 0; pass < perDigit; pass++) {
    const block = [...DIGITS];
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [block[i], block[j]] = [block[j]!, block[i]!];
    }
    out.push(...block);
  }
  return out;
}
