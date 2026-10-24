import { blockFor } from '../curriculum/levelB';
import { config } from './config';
import { dayIndex } from './schedule';
import { nextSide, reviewPool, type SideRecord } from './progress';
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

export interface ParentSummary {
  nextSheet: string | null;
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

  const blocks: BlockLine[] = [];
  const attempts = new Map<number, number>();
  for (const ws of ordered) {
    const own = judged.filter((s) => s.worksheetId === ws.id);
    if (own.length === 0) continue;
    const block = blockFor(own[0]!.sheet);
    const attempt = (attempts.get(block.first) ?? 0) + 1;
    attempts.set(block.first, attempt);
    const targetSideMs = block.sctMinutes[1] * 60_000 * config.progress.sctSideFraction;
    const firstPassPct = pct(own.reduce((n, s) => n + s.firstPassCorrect, 0), own.reduce((n, s) => n + s.total, 0));
    const medianSideMs = median(own.map((s) => s.activeMs));
    blocks.push({
      first: block.first,
      title: block.title,
      attempt,
      firstPassPct,
      medianSideMs,
      targetSideMs,
      passed: firstPassPct / 100 >= config.progress.passAccuracy && medianSideMs <= targetSideMs,
    });
  }

  const next = nextSide(judged);
  return {
    nextSheet: next?.code ?? null,
    worksheetsDone: ordered.length,
    homeworkDaysThisMonth: new Set(
      ordered.filter((w) => new Date(w.submittedAt).getMonth() === month && new Date(w.submittedAt).getFullYear() === year).map((w) => dayIndex(w.submittedAt)),
    ).size,
    worksheets: lines,
    blocks,
    review: reviewPool(judged).map((r) => `${r.fact.a} ${r.fact.op} ${r.fact.b}`),
  };
}
