import type { InkPoint, Stroke } from './types';

/**
 * Pointer samples → strokes. All decisions (which pointer types draw, who owns
 * the gesture in progress, what cancel means, what undo takes back) live in
 * `StrokeRecorder`, which is plain TypeScript and fully unit-tested.
 * `attachPointerCapture` is the thin DOM binding.
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

/** A stroke removed by the rubber, with where it sat so undo can put it back. */
interface Removed {
  index: number;
  stroke: Stroke;
}

/** One undoable action. A rubber gesture is one action however many strokes it took. */
type Action = { kind: 'draw'; at: number } | { kind: 'erase'; at: number; batches: Removed[][] };

export class StrokeRecorder {
  readonly strokes: Stroke[] = [];
  current: Stroke | null = null;
  /** `t` of the first accepted pen-down since the last clear: the retrieval latency marker. */
  firstStrokeAt: number | null = null;
  /** `t` of the most recent draw or erase still in effect, for a page to choose which box to undo. */
  lastActionAt: number | null = null;

  private activePointer: number | null = null;
  private readonly history: Action[] = [];
  /** The erase action being built by the rubber gesture in progress. */
  private erasing: Extract<Action, { kind: 'erase' }> | null = null;
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
    if (!this.owns(s)) return;
    this.activePointer = null;
    if (!this.current) return; // a lift routed here after a rubber gesture: release only
    this.current.push(toPoint(s));
    this.strokes.push(this.current);
    this.current = null;
    this.record({ kind: 'draw', at: s.t });
    this.emit();
  }

  cancel(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.activePointer = null;
    if (!this.current) return;
    this.current = null;
    this.emit();
  }

  clear(): void {
    this.strokes.length = 0;
    this.current = null;
    this.activePointer = null;
    this.firstStrokeAt = null;
    this.history.length = 0;
    this.erasing = null;
    this.lastActionAt = null;
    this.emit();
  }

  /**
   * Take back the last action: a drawn stroke goes, an erased one comes back
   * where it was. The first-stroke time is kept: she did start writing.
   */
  undo(): boolean {
    const action = this.history.pop();
    if (!action) return false;
    if (action.kind === 'draw') {
      this.strokes.pop();
    } else {
      for (let b = action.batches.length - 1; b >= 0; b--) {
        for (const { index, stroke } of action.batches[b]!) this.strokes.splice(index, 0, stroke);
      }
    }
    this.lastActionAt = this.history[this.history.length - 1]?.at ?? null;
    this.emit();
    return true;
  }

  /** Remove every completed stroke that passes within `radius` px of (x, y). Returns how many went. */
  eraseNear(x: number, y: number, radius: number, t = 0): number {
    const removed: Removed[] = [];
    this.strokes.forEach((stroke, index) => {
      if (distanceToStroke(stroke, x, y) <= radius) removed.push({ index, stroke });
    });
    if (removed.length === 0) return 0;
    for (let i = removed.length - 1; i >= 0; i--) this.strokes.splice(removed[i]!.index, 1);
    if (this.erasing) {
      this.erasing.batches.push(removed);
      this.erasing.at = t;
      this.lastActionAt = t;
    } else {
      this.record({ kind: 'erase', at: t, batches: [removed] });
    }
    this.emit();
    return removed.length;
  }

  /** Rubber tool: same pointer rules as drawing, but never starts a stroke or marks the first-stroke time. */
  eraseDown(s: PointerSample): boolean {
    if (!this.opts.acceptedPointerTypes.includes(s.pointerType)) return false;
    if (this.activePointer !== null) return false;
    this.activePointer = s.pointerId;
    this.erasing = { kind: 'erase', at: s.t, batches: [] };
    this.eraseNear(s.x, s.y, this.opts.eraserRadiusPx, s.t);
    return true;
  }

  eraseMove(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.eraseNear(s.x, s.y, this.opts.eraserRadiusPx, s.t);
  }

  eraseUp(s: PointerSample): void {
    if (!this.owns(s)) return;
    this.activePointer = null;
    if (this.erasing && this.erasing.batches.length > 0) this.record(this.erasing);
    this.erasing = null;
  }

  private record(action: Action): void {
    this.history.push(action);
    this.lastActionAt = action.at;
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
  /** Read on every pointer-down: false ignores the gesture (a problem not reached yet). */
  enabled?: () => boolean;
}

/**
 * Bind pointer events on `el` to a recorder. Coordinates are CSS px relative to
 * the element's top-left. The tool in force at pointer-down governs the whole
 * gesture, and only the pointer that started the gesture can move or end it:
 * a palm lifting or being cancelled mid-gesture changes nothing. Returns a
 * detach function.
 */
export function attachPointerCapture(el: HTMLElement, recorder: StrokeRecorder, opts: CaptureOptions = {}): () => void {
  const now = opts.now ?? (() => performance.now());
  let gesture: { tool: Tool; pointerId: number } | null = null;
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
  const mine = (e: PointerEvent) => gesture !== null && e.pointerId === gesture.pointerId;

  const onDown = (e: PointerEvent) => {
    if (gesture !== null) return;
    if (opts.enabled && !opts.enabled()) return;
    const tool = opts.tool?.() ?? 'pen';
    const accepted = tool === 'eraser' ? recorder.eraseDown(sample(e)) : recorder.down(sample(e));
    if (!accepted) return;
    gesture = { tool, pointerId: e.pointerId };
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!mine(e)) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) {
      if (gesture!.tool === 'eraser') recorder.eraseMove(sample(ce));
      else recorder.move(sample(ce));
    }
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => {
    if (!mine(e)) return;
    if (gesture!.tool === 'eraser') recorder.eraseUp(sample(e));
    else recorder.up(sample(e));
    gesture = null;
    e.preventDefault();
  };
  const onCancel = (e: PointerEvent) => {
    if (!mine(e)) return;
    if (gesture!.tool === 'eraser') recorder.eraseUp(sample(e));
    else recorder.cancel(sample(e));
    gesture = null;
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
