import { blockFor, parseSheetCode } from '../curriculum/levelB';
import { config } from './config';
import type { Fact, Layout } from './worksheet';

/** A problem identity, for repetition and review: '47+38', '61−29'. */
export function factKey(f: Fact): string {
  return `${f.a}${f.op}${f.b}`;
}

/** Deterministic PRNG from a string seed (FNV-1a hash into mulberry32). */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface ReviewItem {
  fact: Fact;
  layout: Layout;
}

export interface SideContent {
  code: string;
  sheet: number;
  title: string;
  layout: Layout;
  /** In answer order: number 1 first. */
  problems: Fact[];
}

/**
 * One side of a Kumon sheet. Half as many distinct problems as places, each
 * shown twice and never back to back (Kumon repetition). The base problems
 * come from the sheet code alone, so repeating a block repeats its sheets;
 * up to `reviewPerSide` review problems of the same layout replace the last
 * distinct ones.
 */
export function buildSide(code: string, review: readonly ReviewItem[] = []): SideContent {
  const { sheet } = parseSheetCode(code);
  const block = blockFor(sheet);
  const random = seededRandom(code);
  const places = block.layout === 'column' ? config.sheet.columnProblems : config.sheet.horizontalProblems;
  const distinctCount = Math.ceil(places / 2);

  const distinct: Fact[] = [];
  const seen = new Set<string>();
  for (let guard = 0; distinct.length < distinctCount && guard < 10_000; guard++) {
    const f = block.generate(random);
    if (!seen.has(factKey(f))) {
      seen.add(factKey(f));
      distinct.push(f);
    }
  }

  const extra = review
    .filter((r) => r.layout === block.layout && !seen.has(factKey(r.fact)))
    .slice(0, config.progress.reviewPerSide);
  extra.forEach((r, i) => {
    distinct[distinct.length - 1 - i] = r.fact;
  });

  const first = shuffle(distinct, random);
  return {
    code,
    sheet,
    title: block.title,
    layout: block.layout,
    problems: [...first, ...secondPass(first, random)].slice(0, places),
  };
}

/**
 * The repeat of `first`, reordered so no problem sits beside its twin (same
 * row, other column: she would copy instead of recall) and the two halves do
 * not meet on the same problem. Seeded retries; rotation by one is the
 * fallback, which satisfies both for three or more problems.
 */
function secondPass(first: Fact[], random: () => number): Fact[] {
  const n = first.length;
  const ok = (second: Fact[]) =>
    second.every((f, i) => n < 2 || factKey(f) !== factKey(first[i]!)) &&
    (n < 2 || factKey(second[0]!) !== factKey(first[n - 1]!));
  for (let attempt = 0; attempt < 100; attempt++) {
    const second = shuffle(first, random);
    if (ok(second)) return second;
  }
  return [...first.slice(1), first[0]!];
}
