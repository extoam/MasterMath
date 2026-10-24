import { shuffled } from './sequence';
import { DIGITS, type Digit } from './types';

/** One prompted digit in the handwriting check and what the recogniser made of it. */
export interface CheckItem {
  prompt: Digit;
  read: Digit | null;
  confident: boolean;
}

/** A check item as persisted: which run, which position, and the raw scores for later analysis. */
export interface StoredCheckItem extends CheckItem {
  id: string;
  runId: string;
  index: number;
  score: number | null;
  runnerUpScore: number | null;
  /** Wall-clock ms (Date.now()). */
  createdAt: number;
}

export interface CheckSummary {
  total: number;
  correct: number;
  accuracyPct: number;
  /** Items the recogniser returned null for. They count as incorrect. */
  unread: number;
  notConfident: number;
  confusions: Array<{ prompt: Digit; read: Digit; count: number }>;
}

export function checkSequence(itemsPerDigit: number, random: () => number): Digit[] {
  return remainingSequence([], itemsPerDigit, random);
}

/**
 * The prompts still needed to reach `itemsPerDigit` of every digit, given what
 * has been answered so far. Each pass covers every still-needed digit once
 * before any repeats, so a run resumed mid-way stays balanced.
 */
export function remainingSequence(done: CheckItem[], itemsPerDigit: number, random: () => number): Digit[] {
  const needed = new Map<Digit, number>(DIGITS.map((d) => [d, itemsPerDigit]));
  for (const item of done) needed.set(item.prompt, Math.max(0, (needed.get(item.prompt) ?? 0) - 1));
  const out: Digit[] = [];
  for (;;) {
    const pass = DIGITS.filter((d) => (needed.get(d) ?? 0) > 0);
    if (pass.length === 0) return out;
    for (const d of shuffled(pass, random)) {
      out.push(d);
      needed.set(d, needed.get(d)! - 1);
    }
  }
}

export function summarise(items: CheckItem[]): CheckSummary {
  const total = items.length;
  let correct = 0;
  let unread = 0;
  let notConfident = 0;
  const confusionCounts = new Map<string, { prompt: Digit; read: Digit; count: number }>();
  for (const item of items) {
    if (!item.confident) notConfident++;
    if (item.read === null) {
      unread++;
      continue;
    }
    if (item.read === item.prompt) {
      correct++;
      continue;
    }
    const key = `${item.prompt}>${item.read}`;
    const entry = confusionCounts.get(key) ?? { prompt: item.prompt, read: item.read, count: 0 };
    entry.count++;
    confusionCounts.set(key, entry);
  }
  const confusions = [...confusionCounts.values()].sort((a, b) => b.count - a.count || a.prompt - b.prompt);
  const accuracyPct = total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
  return { total, correct, accuracyPct, unread, notConfident, confusions };
}
