import { pathLength, toCloud } from './normalise';
import type { Digit, PointCloud, Stroke } from './types';

/**
 * $P Point-Cloud Recognizer (Vatavu, Anthony, Wobbrock 2012), specialised to
 * ten digit classes with user-supplied templates. Scores are cloud distances:
 * lower is better. Swapping this file for a learned model must keep the
 * `recognise` signature so nothing else changes.
 */

export interface Candidate {
  digit: Digit;
  cloud: PointCloud;
}

export interface Recognition {
  digit: Digit;
  /** $P cloud distance of the winning template. Lower is better. */
  score: number;
  /** Best digit other than the winner, if any other digit has templates. */
  runnerUp: Digit | null;
  runnerUpScore: number | null;
  /** runnerUpScore / score reached the configured margin. */
  confident: boolean;
}

export interface RecogniserOptions {
  /** Points per cloud (resample target). */
  n: number;
  /** Ink shorter than this, in CSS px, is treated as nothing written. */
  minPathLength: number;
  /** Required runnerUpScore / score for `confident`. */
  confidentMarginRatio: number;
  /**
   * Weight of the drawing-order distance added to the $P cloud distance. $P
   * alone ignores direction and stroke order, which is what separates some
   * children's 5/6, 2/3 and 4/9. 0 (the default) is plain $P.
   */
  directionWeight?: number;
}

function sq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** One-directional greedy matching from a start index, with the $P linear weighting. */
function directedDistance(from: PointCloud, to: PointCloud, start: number): number {
  const n = from.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = sq(from[i]!, to[j]!);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    matched[best] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * Math.sqrt(bestD);
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/**
 * Point-by-point distance of two clouds in drawing order. `toCloud` keeps the
 * order the points were drawn in, so this compares direction and stroke order.
 */
export function orderedDistance(a: PointCloud, b: PointCloud): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.sqrt(sq(a[i]!, b[i]!));
  return sum;
}

/** Symmetric greedy cloud distance: minimum over start offsets and both directions. */
export function cloudDistance(a: PointCloud, b: PointCloud): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  const step = Math.max(1, Math.floor(Math.pow(n, 0.5)));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    min = Math.min(min, directedDistance(a, b, i), directedDistance(b, a, i));
  }
  return min;
}

/** Best (lowest) distance per digit over the candidates, or null when there is nothing to read. */
export function scoreDigits(strokes: Stroke[], candidates: Candidate[], opts: RecogniserOptions): Map<Digit, number> | null {
  if (strokes.length === 0 || candidates.length === 0) return null;
  if (pathLength(strokes) < opts.minPathLength) return null;
  const cloud = toCloud(strokes, opts.n);
  const w = opts.directionWeight ?? 0;
  const bestPerDigit = new Map<Digit, number>();
  for (const c of candidates) {
    // $P's weights sum to about n/2, so halve the ordered sum to keep the two terms on one scale.
    const d = cloudDistance(cloud, c.cloud) + (w > 0 ? w * 0.5 * orderedDistance(cloud, c.cloud) : 0);
    const prev = bestPerDigit.get(c.digit);
    if (prev === undefined || d < prev) bestPerDigit.set(c.digit, d);
  }
  return bestPerDigit;
}

function fromScores(bestPerDigit: Map<Digit, number>, opts: RecogniserOptions): Recognition {
  const ranked = [...bestPerDigit.entries()].sort((p, q) => p[1] - q[1]);
  const [digit, score] = ranked[0]!;
  const second = ranked[1];
  const runnerUp = second ? second[0] : null;
  const runnerUpScore = second ? second[1] : null;
  const confident =
    runnerUpScore !== null && runnerUpScore > score && runnerUpScore >= score * opts.confidentMarginRatio;
  return { digit, score, runnerUp, runnerUpScore, confident };
}

export function recognise(strokes: Stroke[], candidates: Candidate[], opts: RecogniserOptions): Recognition | null {
  const scores = scoreDigits(strokes, candidates, opts);
  return scores ? fromScores(scores, opts) : null;
}

export interface Verification {
  /** What the ink looks like most, as plain recognition would say. */
  read: Recognition | null;
  /** The expected digit's distance over the best distance: 1 when it is the best match. Infinity when it cannot be scored. */
  ratio: number;
  /** The ink is close enough to the expected digit to count as that digit. */
  accepted: boolean;
}

/**
 * Is this ink the digit we expect? On a worksheet the app knows the answer, so
 * it does not have to read the digit from scratch, only judge whether the ink
 * fits the expected digit about as well as anything else does. That is far
 * more reliable than open recognition: a right answer is accepted when the
 * expected digit is within `acceptRatio` of the best match, while a clearly
 * different digit is still rejected.
 */
export function verifyDigit(
  strokes: Stroke[],
  expected: Digit,
  candidates: Candidate[],
  opts: RecogniserOptions,
  acceptRatio: number,
): Verification {
  const scores = scoreDigits(strokes, candidates, opts);
  if (!scores) return { read: null, ratio: Infinity, accepted: false };
  const read = fromScores(scores, opts);
  const mine = scores.get(expected);
  if (mine === undefined) return { read, ratio: Infinity, accepted: false };
  const ratio = read.score === 0 ? (mine === 0 ? 1 : Infinity) : mine / read.score;
  return { read, ratio, accepted: ratio <= acceptRatio };
}
