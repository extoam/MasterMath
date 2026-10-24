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

export type Tool = 'pen' | 'eraser';

export interface RecorderOptions {
  acceptedPointerTypes: readonly string[];
  /** Rubber: a completed stroke within this many px of the pen is removed. */
  eraserRadiusPx: number;
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

  /** Remove the last completed stroke. The first-stroke time is kept: she did start writing. */
  undo(): boolean {
    if (this.strokes.length === 0) return false;
    this.strokes.pop();
    this.emit();
    return true;
  }

  /** Remove every completed stroke that passes within `radius` px of (x, y). Returns how many went. */
  eraseNear(x: number, y: number, radius: number): number {
    const kept = this.strokes.filter((stroke) => distanceToStroke(stroke, x, y) > radius);
    const removed = this.strokes.length - kept.length;
    if (removed > 0) {
      this.strokes.length = 0;
      this.strokes.push(...kept);
      this.emit();
    }
    return removed;
  }

  /** Rubber tool: same pointer rules as drawing, but never starts a stroke or marks the first-stroke time. */
  eraseDown(s: PointerSample): boolean {
    if (!this.opts.acceptedPointerTypes.includes(s.pointerType)) return false;
    if (this.activePointer !== null) return false;
    this.activePointer = s.pointerId;
    this.eraseNear(s.x, s.y, this.opts.eraserRadiusPx);
    return true;
  }

  eraseMove(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.eraseNear(s.x, s.y, this.opts.eraserRadiusPx);
  }

  eraseUp(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.activePointer = null;
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

function distanceToSegment(px: number, py: number, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Shortest distance from (x, y) to any segment of the stroke (a one-point stroke is a point). */
function distanceToStroke(stroke: Stroke, x: number, y: number): number {
  if (stroke.length === 0) return Infinity;
  if (stroke.length === 1) return Math.hypot(x - stroke[0]!.x, y - stroke[0]!.y);
  let min = Infinity;
  for (let i = 1; i < stroke.length; i++) min = Math.min(min, distanceToSegment(x, y, stroke[i - 1]!, stroke[i]!));
  return min;
}

export interface CaptureOptions {
  now?: () => number;
  /** Read on every pointer-down to decide whether the pen draws or erases. */
  tool?: () => Tool;
}

/**
 * Bind pointer events on `el` to a recorder. Coordinates are CSS px relative to
 * the element's top-left. The tool in force at pointer-down governs the whole
 * gesture. Returns a detach function.
 */
export function attachPointerCapture(el: HTMLElement, recorder: StrokeRecorder, opts: CaptureOptions = {}): () => void {
  const now = opts.now ?? (() => performance.now());
  let gesture: Tool | null = null;
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
    if (gesture !== null) return; // one gesture at a time; the recorder rejects the pointer anyway
    const tool = opts.tool?.() ?? 'pen';
    const accepted = tool === 'eraser' ? recorder.eraseDown(sample(e)) : recorder.down(sample(e));
    if (!accepted) return;
    gesture = tool;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (gesture === null) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) {
      if (gesture === 'eraser') recorder.eraseMove(sample(ce));
      else recorder.move(sample(ce));
    }
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => {
    if (gesture === 'eraser') recorder.eraseUp(sample(e));
    else recorder.up(sample(e));
    if (recorder.current === null) gesture = null;
    e.preventDefault();
  };
  const onCancel = (e: PointerEvent) => {
    if (gesture === 'eraser') recorder.eraseUp(sample(e));
    else recorder.cancel(sample(e));
    if (recorder.current === null) gesture = null;
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
