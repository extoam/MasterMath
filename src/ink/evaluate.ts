import { summarise, type CheckSummary } from './check';
import { toCloud } from './normalise';
import { recognise, type Candidate, type RecogniserOptions } from './recogniser';
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
