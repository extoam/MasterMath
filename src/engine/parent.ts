import { blockFor } from '../curriculum/levelB';
import { config } from './config';
import { dayIndex } from './schedule';
import { nextSide, replay, reviewPool, type ParentDecision, type SideRecord } from './progress';
import { parseSheetCode } from '../curriculum/levelB';
import { applyOverrides, outstanding, type CorrectionRecord, type WorksheetRecord } from './schedule';

export interface WorksheetLine {
  index: number;
  handedInAt: number;
  firstSheet: string;
  lastSheet: string;
  /** Right first time, misreads counted as right, in %. */
  firstPassPct: number;
  activeMs: number;
  /** Rounds of corrections handed in so far. */
  correctionRounds: number;
  state: 'clean' | 'corrections-due' | 'being-marked';
  /** Problems still to correct, per sheet. */
  toFix: Array<{ code: string; count: number }>;
}

export interface BlockLine {
  first: number;
  title: string;
  attempt: number;
  firstPassPct: number;
  medianSideMs: number;
  /** Half of Kumon's upper target per two-sided sheet. */
  targetSideMs: number;
  passed: boolean;
}

/** The block she is in now, against the rule that decides pass or repeat. */
export interface CurrentBlock {
  first: number;
  title: string;
  attempt: number;
  /** Pages handed in on this try, out of the block's 20. */
  pagesDone: number;
  pagesTotal: number;
  firstPassPct: number;
  medianSideMs: number;
  targetSideMs: number;
}

export interface ParentSummary {
  nextSheet: string | null;
  current: CurrentBlock | null;
  /** The pass rule's accuracy, in %. */
  passAccuracyPct: number;
  worksheetsDone: number;
  homeworkDaysThisMonth: number;
  worksheets: WorksheetLine[];
  blocks: BlockLine[];
  /** Problems the app is bringing back, most urgent first: “52 − 27”. */
  review: string[];
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Everything the parent view shows, from the saved records. Pure. */
export function parentSummary(
  worksheets: readonly WorksheetRecord[],
  sides: readonly SideRecord[],
  corrections: readonly CorrectionRecord[],
  now: number,
  decisions: readonly ParentDecision[] = [],
): ParentSummary {
  const judged = applyOverrides(sides, corrections);
  const ordered = [...worksheets].sort((a, b) => a.submittedAt - b.submittedAt);
  const today = dayIndex(now);
  const month = new Date(now).getMonth();
  const year = new Date(now).getFullYear();

  const lines: WorksheetLine[] = ordered.map((ws) => {
    const own = judged.filter((s) => s.worksheetId === ws.id).sort((a, b) => a.completedAt - b.completedAt);
    const open = outstanding(ws, sides, corrections);
    const state: WorksheetLine['state'] = open.size === 0 ? 'clean' : dayIndex(ws.submittedAt) < today ? 'corrections-due' : 'being-marked';
    return {
      index: ws.index,
      handedInAt: ws.submittedAt,
      firstSheet: own[0]?.code ?? '',
      lastSheet: own[own.length - 1]?.code ?? '',
      firstPassPct: pct(own.reduce((n, s) => n + s.firstPassCorrect, 0), own.reduce((n, s) => n + s.total, 0)),
      activeMs: ws.activeMs,
      correctionRounds: corrections.filter((c) => c.worksheetId === ws.id).length,
      state,
      toFix: [...open.entries()].map(([code, ps]) => ({ code, count: ps.length })),
    };
  });

  const blocks: BlockLine[] = replay(judged, decisions).attempts.map((a) => {
    const block = blockFor(a.first);
    return {
      first: a.first,
      title: block.title,
      attempt: a.attempt,
      firstPassPct: pct(a.records.reduce((n, x) => n + x.firstPassCorrect, 0), a.records.reduce((n, x) => n + x.total, 0)),
      medianSideMs: median(a.records.map((x) => x.activeMs)),
      targetSideMs: block.sctMinutes[1] * 60_000 * config.progress.sctSideFraction,
      passed: a.passed,
    };
  });

  const next = nextSide(judged, decisions);
  let current: CurrentBlock | null = null;
  if (next) {
    const block = blockFor(parseSheetCode(next.code).sheet);
    // This try started at the latest of: a parent decision, or the end of the block's previous try.
    const lastDecision = Math.max(0, ...decisions.map((d) => d.at).filter((t) => t <= now));
    const lastEnd = Math.max(0, ...judged.filter((x) => x.sheet === block.last && x.side === 'b').map((x) => x.completedAt));
    const since = Math.max(lastDecision, lastEnd);
    const tryPages = judged.filter((x) => x.sheet >= block.first && x.sheet <= block.last && x.completedAt > since);
    current = {
      first: block.first,
      title: block.title,
      attempt: next.attempt,
      pagesDone: tryPages.length,
      pagesTotal: (block.last - block.first + 1) * 2,
      firstPassPct: pct(tryPages.reduce((n, x) => n + x.firstPassCorrect, 0), tryPages.reduce((n, x) => n + x.total, 0)),
      medianSideMs: median(tryPages.map((x) => x.activeMs)),
      targetSideMs: block.sctMinutes[1] * 60_000 * config.progress.sctSideFraction,
    };
  }
  return {
    nextSheet: next?.code ?? null,
    current,
    passAccuracyPct: Math.round(config.progress.passAccuracy * 100),
    worksheetsDone: ordered.length,
    homeworkDaysThisMonth: new Set(
      ordered.filter((w) => new Date(w.submittedAt).getMonth() === month && new Date(w.submittedAt).getFullYear() === year).map((w) => dayIndex(w.submittedAt)),
    ).size,
    worksheets: lines,
    blocks,
    review: reviewPool(judged).map((r) => `${r.fact.a} ${r.fact.op} ${r.fact.b}`),
  };
}
