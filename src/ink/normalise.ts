import type { CloudPoint, PointCloud, Stroke } from './types';

/**
 * $P normalisation: strokes → fixed-size point cloud, scale and position free.
 * Order matters and is the one from the $P paper: resample, scale, translate.
 */

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Total ink length. Segments are measured within a stroke only, never across the gap between strokes. */
export function pathLength(strokes: Stroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) total += dist(stroke[i - 1]!, stroke[i]!);
  }
  return total;
}

/**
 * Resample all strokes to exactly n points spaced evenly along the ink.
 * Interpolation happens only between points of the same stroke, so a point
 * cloud never contains ink that was not drawn. The input is not mutated.
 */
export function resample(strokes: Stroke[], n: number): PointCloud {
  const pts: CloudPoint[] = [];
  strokes.forEach((stroke, strokeId) => {
    for (const p of stroke) pts.push({ x: p.x, y: p.y, strokeId });
  });
  if (pts.length === 0) return [];

  const first = pts[0]!;
  const total = pathLength(strokes);
  if (total === 0) return Array.from({ length: n }, () => ({ ...first }));

  const interval = total / (n - 1);
  let accumulated = 0;
  const out: CloudPoint[] = [{ ...first }];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    if (cur.strokeId !== prev.strokeId) continue;
    const d = dist(prev, cur);
    if (accumulated + d >= interval) {
      const u = (interval - accumulated) / d;
      const q: CloudPoint = {
        x: prev.x + u * (cur.x - prev.x),
        y: prev.y + u * (cur.y - prev.y),
        strokeId: cur.strokeId,
      };
      out.push(q);
      pts.splice(i, 0, q); // continue from q on the next iteration
      accumulated = 0;
    } else {
      accumulated += d;
    }
  }
  const last = pts[pts.length - 1]!;
  while (out.length < n) out.push({ ...last }); // rounding can leave the walk one point short
  return out.length > n ? out.slice(0, n) : out;
}

/** Uniform scale by the longer side of the bounding box, so aspect ratio is preserved (a “1” stays thin). */
export function scale(cloud: PointCloud): PointCloud {
  if (cloud.length === 0) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of cloud) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  if (size === 0) return cloud.map((p) => ({ ...p }));
  return cloud.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, strokeId: p.strokeId }));
}

/** Move the centroid to (0, 0). */
export function translateToOrigin(cloud: PointCloud): PointCloud {
  if (cloud.length === 0) return [];
  let cx = 0, cy = 0;
  for (const p of cloud) {
    cx += p.x;
    cy += p.y;
  }
  cx /= cloud.length;
  cy /= cloud.length;
  return cloud.map((p) => ({ x: p.x - cx, y: p.y - cy, strokeId: p.strokeId }));
}

/** Full $P normalisation pipeline. */
export function toCloud(strokes: Stroke[], n: number): PointCloud {
  return translateToOrigin(scale(resample(strokes, n)));
}

/** Whether the box holds something worth marking. A tap or a tiny mark is not an answer. */
export function hasInk(strokes: Stroke[], minPathLength: number): boolean {
  return strokes.length > 0 && pathLength(strokes) >= minPathLength;
}
