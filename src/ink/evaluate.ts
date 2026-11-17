import { summarise, type CheckSummary } from './check';
import { toCloud } from './normalise';
import { recognise, scoreDigits, type Candidate, type RecogniserOptions } from './recogniser';
import type { Template } from './templates';
import { DIGITS, type Digit } from './types';

export interface Evaluation {
  total: number;
  correct: number;
  accuracyPct: number;
  perDigit: Record<Digit, { total: number; correct: number }>;
  confusions: CheckSummary['confusions'];
}

/**
 * Leave-one-out over her own samples: each template is read against all the
 * others. This measures a recogniser change on her real handwriting without
 * asking her to write anything new.
 */
export function evaluateTemplates(templates: readonly Template[], opts: RecogniserOptions): Evaluation {
  const clouds = templates.map((t): Candidate => ({ digit: t.digit, cloud: toCloud(t.strokes, opts.n) }));
  const items = templates.map((t, i) => {
    const r = recognise(t.strokes, clouds.filter((_, j) => j !== i), opts);
    return { prompt: t.digit, read: r?.digit ?? null, confident: r?.confident ?? false };
  });
  const s = summarise(items);
  const perDigit = Object.fromEntries(DIGITS.map((d) => [d, { total: 0, correct: 0 }])) as Evaluation['perDigit'];
  for (const it of items) {
    perDigit[it.prompt].total++;
    if (it.read === it.prompt) perDigit[it.prompt].correct++;
  }
  for (const d of DIGITS) if (perDigit[d].total === 0) delete (perDigit as Partial<Evaluation['perDigit']>)[d];
  return { total: s.total, correct: s.correct, accuracyPct: s.accuracyPct, perDigit, confusions: s.confusions };
}

export interface VerificationRow {
  acceptRatio: number;
  /** Her samples accepted as their own digit (should be ~100%). */
  rightAccepted: number;
  rightTotal: number;
  rightAcceptedPct: number;
  /** Her samples accepted as some other digit: a wrong answer that would pass (should be ~0%). */
  wrongAccepted: number;
  wrongTotal: number;
  wrongAcceptedPct: number;
  /** The look-alike pairs that pass most: “4 written, 9 expected”. */
  worstPairs: Array<{ written: Digit; expected: Digit; count: number }>;
}

/**
 * How expected-digit checking would treat her own samples, leave-one-out, for
 * several margins: each sample is checked against its own digit (a right
 * answer) and against every other digit (a wrong answer).
 */
export function evaluateVerification(templates: readonly Template[], opts: RecogniserOptions, ratios: readonly number[]): VerificationRow[] {
  const clouds = templates.map((t): Candidate => ({ digit: t.digit, cloud: toCloud(t.strokes, opts.n) }));
  const perSample = templates.map((t, i) => ({ digit: t.digit, scores: scoreDigits(t.strokes, clouds.filter((_, j) => j !== i), opts) }));
  return ratios.map((acceptRatio) => {
    let rightAccepted = 0, rightTotal = 0, wrongAccepted = 0, wrongTotal = 0;
    const pairs = new Map<string, { written: Digit; expected: Digit; count: number }>();
    for (const s of perSample) {
      if (!s.scores) continue;
      const best = Math.min(...s.scores.values());
      for (const [digit, score] of s.scores) {
        const ok = best === 0 ? score === 0 : score / best <= acceptRatio;
        if (digit === s.digit) {
          rightTotal++;
          if (ok) rightAccepted++;
        } else {
          wrongTotal++;
          if (ok) {
            wrongAccepted++;
            const k = `${s.digit}>${digit}`;
            const e = pairs.get(k) ?? { written: s.digit, expected: digit, count: 0 };
            e.count++;
            pairs.set(k, e);
          }
        }
      }
    }
    const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
    return {
      acceptRatio,
      rightAccepted,
      rightTotal,
      rightAcceptedPct: pct(rightAccepted, rightTotal),
      wrongAccepted,
      wrongTotal,
      wrongAcceptedPct: pct(wrongAccepted, wrongTotal),
      worstPairs: [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    };
  });
}
