import { promptSequence } from './sequence';
import type { Digit } from './types';

/** One prompted digit in the handwriting check and what the recogniser made of it. */
export interface CheckItem {
  prompt: Digit;
  read: Digit | null;
  confident: boolean;
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
  return promptSequence(itemsPerDigit, random);
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
