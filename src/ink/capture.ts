import type { InkPoint, Stroke } from './types';

/**
 * Pointer samples → strokes. All decisions (which pointer types draw, who owns
 * the stroke in progress, what cancel means) live in `StrokeRecorder`, which
 * is plain TypeScript and fully unit-tested. `attachPointerCapture` is the thin
 * DOM binding.
 */

export interface PointerSample {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  t: number;
  pressure: number;
}

export interface RecorderOptions {
  acceptedPointerTypes: readonly string[];
  /** Called after every change with the completed strokes plus the one in progress. */
  onChange?: (strokes: Stroke[]) => void;
}

export class StrokeRecorder {
  readonly strokes: Stroke[] = [];
  current: Stroke | null = null;
  /** `t` of the first accepted pen-down since the last clear: the retrieval latency marker. */
  firstStrokeAt: number | null = null;

  private activePointer: number | null = null;
  private readonly opts: RecorderOptions;

  constructor(opts: RecorderOptions) {
    this.opts = opts;
  }

  /** Completed strokes plus the one in progress, in drawing order. */
  allStrokes(): Stroke[] {
    return this.current ? [...this.strokes, this.current] : [...this.strokes];
  }

  down(s: PointerSample): boolean {
    if (!this.opts.acceptedPointerTypes.includes(s.pointerType)) return false;
    if (this.activePointer !== null) return false;
    this.activePointer = s.pointerId;
    if (this.firstStrokeAt === null) this.firstStrokeAt = s.t;
    this.current = [toPoint(s)];
    this.emit();
    return true;
  }

  move(s: PointerSample): void {
    if (!this.owns(s) || !this.current) return;
    this.current.push(toPoint(s));
    this.emit();
  }

  up(s: PointerSample): void {
    if (!this.owns(s) || !this.current) return;
    this.current.push(toPoint(s));
    this.strokes.push(this.current);
    this.current = null;
    this.activePointer = null;
    this.emit();
  }

  cancel(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.current = null;
    this.activePointer = null;
    this.emit();
  }

  clear(): void {
    this.strokes.length = 0;
    this.current = null;
    this.activePointer = null;
    this.firstStrokeAt = null;
    this.emit();
  }

  private owns(s: PointerSample): boolean {
    return this.activePointer !== null && s.pointerId === this.activePointer;
  }

  private emit(): void {
    this.opts.onChange?.(this.allStrokes());
  }
}

function toPoint(s: PointerSample): InkPoint {
  return { x: s.x, y: s.y, t: s.t, pressure: s.pressure };
}

/**
 * Bind pointer events on `el` to a recorder. Coordinates are CSS px relative to
 * the element's top-left. Returns a detach function.
 */
export function attachPointerCapture(
  el: HTMLElement,
  recorder: StrokeRecorder,
  now: () => number = () => performance.now(),
): () => void {
  const sample = (e: PointerEvent): PointerSample => {
    const rect = el.getBoundingClientRect();
    return {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: e.timeStamp > 0 ? e.timeStamp : now(),
      pressure: e.pressure,
    };
  };

  const onDown = (e: PointerEvent) => {
    if (!recorder.down(sample(e))) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onMove = (e: PointerEvent) => {
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) recorder.move(sample(ce));
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => {
    recorder.up(sample(e));
    e.preventDefault();
  };
  const onCancel = (e: PointerEvent) => {
    recorder.cancel(sample(e));
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
  };
}
