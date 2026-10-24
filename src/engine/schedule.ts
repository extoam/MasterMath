import { blockFor, parseSheetCode, sheetCode, LAST_SHEET } from '../curriculum/levelB';
import { config } from './config';
import { nextSide, reviewPool, type SideRecord } from './progress';
import { buildSide, type SideContent } from './sheet';
import type { Stroke } from '../ink/types';
import type { ItemRecord } from './worksheet';

/**
 * The daily rhythm, as in Kumon: one worksheet a day, handed in whole, marked
 * overnight, corrected the next day before anything new. Missed days pile up
 * worksheets that can all be done in one sitting; their corrections then
 * appear together the next day.
 */

/** A handed-in worksheet. Append-only. */
export interface WorksheetRecord {
  id: string;
  /** 1 for her first worksheet in the app, 2 for the next, … */
  index: number;
  sides: SideContent[];
  /** Wall-clock ms. Marks become visible from the next calendar day. */
  submittedAt: number;
  /** Idle-paused writing time for the whole worksheet. */
  activeMs: number;
  /** The same, per side code. */
  sideMs: Record<string, number>;
}

/** One round of corrections on a worksheet, marked as soon as it is handed in. Append-only. */
export interface CorrectionRecord {
  id: string;
  worksheetId: string;
  /** 1 for the first correction round, … */
  round: number;
  items: Array<{ code: string; item: ItemRecord }>;
  submittedAt: number;
}

/** Local calendar day number: two times on the same local date share it. */
export function dayIndex(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * The next worksheet: from where she is, one block of sheets, a and b sides,
 * at most `config.daily.sheets` sheets and never past the block's end, so a
 * block is always judged when a worksheet is handed in. Review problems are
 * rotated across the sides. Null when Level B is done.
 */
export function composeWorksheet(history: readonly SideRecord[]): SideContent[] | null {
  const start = nextSide(history);
  if (!start) return null;
  const pool = reviewPool(history);
  const { sheet: first, side } = parseSheetCode(start.code);
  const last = Math.min(blockFor(first).last, first + config.daily.sheets - 1, LAST_SHEET);
  const codes: string[] = [];
  for (let s = first; s <= last; s++) {
    if (!(s === first && side === 'b')) codes.push(sheetCode(s, 'a'));
    codes.push(sheetCode(s, 'b'));
  }
  const per = config.progress.reviewPerSide;
  return codes.map((code, i) => {
    const offset = pool.length === 0 ? 0 : (i * per) % pool.length;
    return buildSide(code, [...pool.slice(offset), ...pool.slice(0, offset)]);
  });
}

/** Positions still wrong on each side of a worksheet, after its correction rounds. Empty means 100%. */
export function outstanding(
  ws: WorksheetRecord,
  sides: readonly SideRecord[],
  corrections: readonly CorrectionRecord[],
): Map<string, number[]> {
  const open = new Map<string, Set<number>>();
  for (const s of sides) {
    if (s.worksheetId !== ws.id) continue;
    const wrong = (s.rounds[0]?.items ?? []).filter((i) => !i.correct).map((i) => i.position);
    if (wrong.length > 0) open.set(s.code, new Set(wrong));
  }
  const rounds = corrections.filter((c) => c.worksheetId === ws.id).sort((a, b) => a.round - b.round);
  for (const c of rounds) {
    for (const { code, item } of c.items) {
      if (item.correct) open.get(code)?.delete(item.position);
    }
  }
  const out = new Map<string, number[]>();
  for (const [code, set] of open) if (set.size > 0) out.set(code, [...set].sort((a, b) => a - b));
  return out;
}

export interface DueState {
  /** Handed in before today and not yet 100%: these come first. */
  correctionsDue: WorksheetRecord[];
  /** Handed in today with mistakes: corrections appear tomorrow. */
  waiting: WorksheetRecord[];
  /** New worksheets she may do (one per calendar day since her first, minus those done). */
  available: number;
  /** A new worksheet may start now. */
  canStart: boolean;
}

export function dueState(
  worksheets: readonly WorksheetRecord[],
  sides: readonly SideRecord[],
  corrections: readonly CorrectionRecord[],
  now: number,
): DueState {
  const today = dayIndex(now);
  const ordered = [...worksheets].sort((a, b) => a.submittedAt - b.submittedAt);
  const open = ordered.filter((w) => outstanding(w, sides, corrections).size > 0);
  const correctionsDue = open.filter((w) => dayIndex(w.submittedAt) < today);
  const waiting = open.filter((w) => dayIndex(w.submittedAt) >= today);
  const unlocked = ordered.length === 0 ? 1 : today - dayIndex(ordered[0]!.submittedAt) + 1;
  const available = Math.max(0, unlocked - ordered.length);
  return { correctionsDue, waiting, available, canStart: available > 0 && correctionsDue.length === 0 };
}

/**
 * The work in progress, saved as she goes so closing the app loses nothing.
 * Mutable: replaced on every save, deleted on hand-in. Ink is kept per side in
 * its own store, so a save writes only the side that changed.
 */
export interface Draft {
  /** Format version; a draft of another version is dropped. */
  v: 1;
  kind: 'writing' | 'correcting';
  worksheetId: string;
  /** Index into `sides` of the side on screen. */
  current: number;
  sides: SideContent[];
  /** Active time per side code so far. */
  sideMs: Record<string, number>;
  /** Wall-clock times each side was opened, for measuring time to first stroke. */
  visits: Record<string, number[]>;
  startedAt: number;
  /** Correcting: problems she said were misread, accepted before re-writing. */
  overrides: Array<{ code: string; position: number }>;
  /** Correcting: the correction round being written (1, 2, …). */
  round: number;
}

export const DRAFT_VERSION = 1;

/** Strokes per answer box of one side in a draft, keyed `${position}:${digit}`. */
export type SideInkDraft = Record<string, Stroke[]>;

/** A draft that no longer matches what is saved: drop it rather than reopen it. */
export function staleDraft(draft: Draft, worksheets: readonly WorksheetRecord[], corrections: readonly CorrectionRecord[]): boolean {
  if (draft.v !== DRAFT_VERSION) return true;
  const ws = worksheets.find((w) => w.id === draft.worksheetId);
  if (draft.kind === 'writing') return ws !== undefined;
  if (!ws) return true;
  return corrections.some((c) => c.worksheetId === draft.worksheetId && c.round >= draft.round);
}

/**
 * First-pass records with every “not what I wrote” counted as right: a misread
 * is not her mistake, for passing a block or for review. Inputs are not changed.
 */
export function applyOverrides(sides: readonly SideRecord[], corrections: readonly CorrectionRecord[]): SideRecord[] {
  const overridden = new Set<string>();
  for (const c of corrections) for (const { code, item } of c.items) if (item.override) overridden.add(`${c.worksheetId}:${code}:${item.position}`);
  if (overridden.size === 0) return [...sides];
  return sides.map((s) => {
    const first = s.rounds[0];
    if (!first || !first.items.some((i) => overridden.has(`${s.worksheetId}:${s.code}:${i.position}`))) return s;
    const items = first.items.map((i) => (overridden.has(`${s.worksheetId}:${s.code}:${i.position}`) ? { ...i, correct: true, override: true } : i));
    return { ...s, rounds: [{ ...first, items }, ...s.rounds.slice(1)], firstPassCorrect: items.filter((i) => i.correct).length };
  });
}
