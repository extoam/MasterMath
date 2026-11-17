import { hasInk } from './normalise';
import { verifyDigit, type Candidate, type RecogniserOptions } from './recogniser';
import type { Digit, Stroke } from './types';

export interface BoxRead {
  /** The digit the box counts as: the expected one when the ink fits it, otherwise what the ink looks like most. */
  read: Digit | null;
  confident: boolean;
  strokes: Stroke[];
  /** What plain recognition saw, for measuring and for “Read as …”. */
  rawRead: Digit | null;
  /** Expected digit's distance over the best distance (1 = it was the best match). */
  ratio: number;
}

/**
 * Read one answer, box by box, knowing the digits it should be. Each box is
 * checked against its expected digit (see `verifyDigit`): a right answer is
 * not failed by a close call, and a clearly different digit stays wrong.
 */
export function readAnswer(
  boxes: Stroke[][],
  expected: Digit[],
  candidates: Candidate[],
  opts: RecogniserOptions,
  acceptRatio: number,
): BoxRead[] {
  return boxes.map((strokes, i) => {
    if (!hasInk(strokes, opts.minPathLength)) return { read: null, confident: false, strokes, rawRead: null, ratio: Infinity };
    const v = verifyDigit(strokes, expected[i]!, candidates, opts, acceptRatio);
    const rawRead = v.read?.digit ?? null;
    return { read: v.accepted ? expected[i]! : rawRead, confident: v.read?.confident ?? false, strokes, rawRead, ratio: v.ratio };
  });
}
