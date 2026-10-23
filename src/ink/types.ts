/** One sampled pointer position inside an answer box, in CSS px relative to the box. */
export interface InkPoint {
  x: number;
  y: number;
  /** Timestamp in ms (performance.now() domain). */
  t: number;
  pressure: number;
}

/** A single pen-down to pen-up sequence. */
export type Stroke = InkPoint[];

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const DIGITS: readonly Digit[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** A point in a normalised $P point cloud. strokeId keeps strokes apart during resampling. */
export interface CloudPoint {
  x: number;
  y: number;
  strokeId: number;
}

export type PointCloud = CloudPoint[];
