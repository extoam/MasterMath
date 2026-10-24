import { LAST_SHEET, blockFor, sheetCode, type Side } from '../curriculum/levelB';
import { config } from './config';
import { factKey, type ReviewItem } from './sheet';
import type { Fact, Layout, RoundRecord } from './worksheet';

/** One completed side, as saved. Append-only: written once when the side comes clean. */
export interface SideRecord {
  id: string;
  code: string;
  sheet: number;
  side: Side;
  layout: Layout;
  /** In answer order, as shown. */
  problems: Fact[];
  /** Round 0 is the first pass; later rounds are corrections. */
  rounds: RoundRecord[];
  firstPassCorrect: number;
  total: number;
  /** Idle-paused time on the side, corrections included. */
  activeMs: number;
  /** Wall-clock ms (Date.now()). */
  startedAt: number;
  completedAt: number;
}

export interface NextSide {
  code: string;
  /** 1 on the first pass through the block, 2 on its first repeat, … */
  attempt: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** A block attempt passes on first-pass accuracy and median side time against Kumon's SCT. */
export function blockPassed(attempt: readonly SideRecord[]): boolean {
  if (attempt.length === 0) return false;
  const block = blockFor(attempt[0]!.sheet);
  const correct = attempt.reduce((n, r) => n + r.firstPassCorrect, 0);
  const total = attempt.reduce((n, r) => n + r.total, 0);
  const sideLimitMs = block.sctMinutes[1] * 60_000 * config.progress.sctSideFraction;
  return correct / total >= config.progress.passAccuracy && median(attempt.map((r) => r.activeMs)) <= sideLimitMs;
}

/**
 * Where she is: replay every saved side in order. After the b side of a
 * block's last sheet the attempt is judged; a pass moves to the next block, a
 * fail repeats the block from its first sheet. Null once Level B is done.
 */
export function nextSide(history: readonly SideRecord[]): NextSide | null {
  const sorted = [...history].sort((a, b) => a.completedAt - b.completedAt);
  let sheet: number = config.progress.startSheet;
  let side: Side = 'a';
  let attempt = 1;
  let attemptRecords: SideRecord[] = [];
  for (const r of sorted) {
    // Only the side she was due on counts: a side saved twice, or out of sequence, is ignored.
    if (r.code !== sheetCode(sheet, side)) continue;
    attemptRecords.push(r);
    if (r.side === 'a') {
      side = 'b';
      continue;
    }
    const block = blockFor(r.sheet);
    if (r.sheet < block.last) {
      sheet = r.sheet + 1;
      side = 'a';
      continue;
    }
    const inBlock = attemptRecords.filter((x) => blockFor(x.sheet) === block);
    if (blockPassed(inBlock)) {
      if (block.last >= LAST_SHEET) return null;
      sheet = block.last + 1;
      attempt = 1;
    } else {
      sheet = block.first;
      attempt += 1;
    }
    side = 'a';
    attemptRecords = [];
  }
  return { code: sheetCode(sheet, side), attempt };
}

/**
 * Problems still to practise: answered wrong, or right but slower than the
 * fluency threshold, and not since answered right and fast
 * `reviewClearStreak` times in a row. Only a problem's first appearance on
 * each side counts; the repeat can be copied from the first. Wrong answers
 * come before slow ones, so a mistake is never crowded out; within each, most
 * recently missed first.
 */
export function reviewPool(history: readonly SideRecord[]): ReviewItem[] {
  const sorted = [...history].sort((a, b) => a.completedAt - b.completedAt);
  const state = new Map<string, { item: ReviewItem; missed: boolean; wrong: boolean; streak: number; lastMiss: number }>();
  for (const r of sorted) {
    const first = r.rounds[0];
    if (!first) continue;
    const seenOnSide = new Set<string>();
    for (const it of first.items) {
      const fact = r.problems[it.position];
      if (!fact) continue;
      const key = factKey(fact);
      if (seenOnSide.has(key)) continue;
      seenOnSide.add(key);
      const fast = it.firstStrokeMs !== null && it.firstStrokeMs <= config.progress.fluencyMs[r.layout];
      const s = state.get(key) ?? { item: { fact, layout: r.layout }, missed: false, wrong: false, streak: 0, lastMiss: 0 };
      if (it.correct && fast) s.streak += 1;
      else {
        s.missed = true;
        s.wrong = !it.correct;
        s.streak = 0;
        s.lastMiss = r.completedAt;
      }
      state.set(key, s);
    }
  }
  return [...state.values()]
    .filter((s) => s.missed && s.streak < config.progress.reviewClearStreak)
    .sort((a, b) => Number(b.wrong) - Number(a.wrong) || b.lastMiss - a.lastMiss)
    .map((s) => s.item);
}

/** Sides completed on the same local calendar day as `now`. */
export function sidesToday(history: readonly SideRecord[], now: number): number {
  const day = new Date(now).toDateString();
  return history.filter((r) => new Date(r.completedAt).toDateString() === day).length;
}
