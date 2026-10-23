import { toCloud } from './normalise';
import type { Candidate } from './recogniser';
import { DIGITS, type Digit, type PointCloud, type Stroke } from './types';

/** A stored handwriting sample. Raw strokes are kept so the recogniser can be swapped later. */
export interface Template {
  id: string;
  digit: Digit;
  strokes: Stroke[];
  /** Wall-clock ms (Date.now()). Orders samples across sessions. */
  createdAt: number;
  source: 'calibration' | 'override';
}

export interface TemplateStoreOptions {
  /** Newest templates per digit kept in the active matching set. */
  maxPerDigit: number;
  /** Below this many for any digit the store is not ready for recognition. */
  minPerDigit: number;
  /** Resample size for precomputed clouds. */
  n: number;
}

/**
 * The active template set used for matching. Holds every template it is given;
 * `active()` is the newest `maxPerDigit` per digit. Clouds are computed once per
 * template and the candidate list is rebuilt only when the set changes.
 */
export class TemplateStore {
  private all: Template[] = [];
  private readonly clouds = new Map<string, PointCloud>();
  private cache: Candidate[] | null = null;
  private readonly opts: TemplateStoreOptions;

  constructor(opts: TemplateStoreOptions) {
    this.opts = opts;
  }

  load(templates: Template[]): void {
    this.all = [...templates];
    this.clouds.clear();
    this.cache = null;
  }

  add(t: Template): void {
    this.all.push(t);
    this.cache = null;
  }

  active(): Template[] {
    const out: Template[] = [];
    for (const d of DIGITS) {
      out.push(
        ...this.all
          .filter((t) => t.digit === d)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, this.opts.maxPerDigit),
      );
    }
    return out;
  }

  countPerDigit(): Record<Digit, number> {
    const counts = Object.fromEntries(DIGITS.map((d) => [d, 0])) as Record<Digit, number>;
    for (const t of this.active()) counts[t.digit]++;
    return counts;
  }

  missingDigits(): Digit[] {
    const counts = this.countPerDigit();
    return DIGITS.filter((d) => counts[d] < this.opts.minPerDigit);
  }

  isReady(): boolean {
    return this.missingDigits().length === 0;
  }

  candidates(): Candidate[] {
    if (!this.cache) {
      this.cache = this.active().map((t) => ({ digit: t.digit, cloud: this.cloudFor(t) }));
    }
    return this.cache;
  }

  private cloudFor(t: Template): PointCloud {
    let cloud = this.clouds.get(t.id);
    if (!cloud) {
      cloud = toCloud(t.strokes, this.opts.n);
      this.clouds.set(t.id, cloud);
    }
    return cloud;
  }
}
