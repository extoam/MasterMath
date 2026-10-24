import { describe, expect, it, vi } from 'vitest';
import { StrokeRecorder, attachPointerCapture, type PointerSample, type Tool } from '../src/ink/capture';

const accepted = ['pen', 'mouse'] as const;

function pen(x: number, y: number, t: number, id = 1): PointerSample {
  return { pointerId: id, pointerType: 'pen', x, y, t, pressure: 0.6 };
}
function touch(x: number, y: number, t: number, id = 2): PointerSample {
  return { pointerId: id, pointerType: 'touch', x, y, t, pressure: 0 };
}

function recorder(onChange?: (s: StrokeRecorder['strokes']) => void) {
  return new StrokeRecorder({ acceptedPointerTypes: accepted, eraserRadiusPx: 10, onChange });
}

/** A straight stroke from (x0, y0) to (x1, y1) with only its two endpoints sampled. */
function segment(r: StrokeRecorder, x0: number, y0: number, x1: number, y1: number, t = 0) {
  r.down(pen(x0, y0, t));
  r.up(pen(x1, y1, t + 10));
}

describe('StrokeRecorder', () => {
  it('rejects a touch pointer so a resting palm never draws', () => {
    const r = recorder();
    expect(r.down(touch(10, 10, 0))).toBe(false);
    expect(r.current).toBeNull();
    expect(r.firstStrokeAt).toBeNull();
  });

  it('records the time of the first accepted pen-down only once', () => {
    const r = recorder();
    expect(r.down(pen(10, 10, 1000))).toBe(true);
    expect(r.firstStrokeAt).toBe(1000);
    r.up(pen(12, 12, 1050));
    r.down(pen(20, 20, 3000));
    expect(r.firstStrokeAt).toBe(1000);
  });

  it('turns down, move, up into one stroke that carries pressure', () => {
    const r = recorder();
    r.down(pen(10, 10, 0));
    r.move(pen(20, 25, 16));
    r.up(pen(30, 40, 32));
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]).toEqual([
      { x: 10, y: 10, t: 0, pressure: 0.6 },
      { x: 20, y: 25, t: 16, pressure: 0.6 },
      { x: 30, y: 40, t: 32, pressure: 0.6 },
    ]);
    expect(r.current).toBeNull();
  });

  it('ignores a move with no stroke in progress', () => {
    const r = recorder();
    r.move(pen(20, 25, 16));
    expect(r.current).toBeNull();
    expect(r.strokes).toHaveLength(0);
  });

  it('keeps a pen stroke intact when a palm touches down mid-stroke', () => {
    const r = recorder();
    r.down(pen(10, 10, 0));
    r.move(pen(20, 20, 16));
    expect(r.down(touch(60, 90, 20))).toBe(false);
    r.move(touch(62, 92, 24));
    r.move(pen(30, 30, 32));
    r.up(touch(63, 93, 40));
    r.up(pen(40, 40, 48));
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]!.map((p) => p.x)).toEqual([10, 20, 30, 40]);
  });

  it('lets only one pointer own the stroke in progress', () => {
    const r = recorder();
    r.down(pen(10, 10, 0));
    expect(r.down(pen(50, 50, 5, 3))).toBe(false);
    r.move(pen(55, 55, 10, 3));
    r.up(pen(20, 20, 20));
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]!.map((p) => p.x)).toEqual([10, 20]);
  });

  it('keeps points that leave the box, negatives included', () => {
    const r = recorder();
    r.down(pen(5, 5, 0));
    r.move(pen(-12, 130, 16));
    r.up(pen(95, -4, 32));
    expect(r.strokes[0]!.map((p) => [p.x, p.y])).toEqual([
      [5, 5],
      [-12, 130],
      [95, -4],
    ]);
  });

  it('discards the stroke in progress on cancel and keeps earlier strokes', () => {
    const r = recorder();
    r.down(pen(10, 10, 0));
    r.up(pen(20, 20, 16));
    r.down(pen(30, 30, 32));
    r.move(pen(40, 40, 48));
    r.cancel(pen(40, 40, 50));
    expect(r.current).toBeNull();
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]!.map((p) => p.x)).toEqual([10, 20]);
  });

  it('clear empties everything including the first-stroke time', () => {
    const r = recorder();
    r.down(pen(10, 10, 0));
    r.up(pen(20, 20, 16));
    r.down(pen(30, 30, 32));
    r.clear();
    expect(r.strokes).toHaveLength(0);
    expect(r.current).toBeNull();
    expect(r.firstStrokeAt).toBeNull();
  });

  it('reports completed strokes plus the one in progress on every change', () => {
    const onChange = vi.fn();
    const r = recorder(onChange);
    r.down(pen(10, 10, 0));
    expect(onChange).toHaveBeenLastCalledWith([[{ x: 10, y: 10, t: 0, pressure: 0.6 }]]);
    r.move(pen(20, 20, 16));
    expect(onChange.mock.lastCall![0][0]).toHaveLength(2);
    r.up(pen(30, 30, 32));
    expect(onChange.mock.lastCall![0]).toHaveLength(1);
    expect(onChange.mock.lastCall![0][0]).toHaveLength(3);
    r.clear();
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe('StrokeRecorder undo', () => {
  it('removes the last completed stroke and keeps the first-stroke time', () => {
    const r = recorder();
    segment(r, 10, 10, 20, 20, 100);
    segment(r, 30, 30, 40, 40, 200);
    expect(r.undo()).toBe(true);
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]!.map((p) => p.x)).toEqual([10, 20]);
    expect(r.firstStrokeAt).toBe(100);
  });

  it('is a no-op with nothing written', () => {
    const r = recorder();
    expect(r.undo()).toBe(false);
    expect(r.strokes).toHaveLength(0);
  });

  it('reports the change', () => {
    const onChange = vi.fn();
    const r = recorder(onChange);
    segment(r, 10, 10, 20, 20);
    onChange.mockClear();
    r.undo();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('StrokeRecorder rubber', () => {
  it('erases a stroke whose segment passes within the radius even when no sampled point does', () => {
    const r = recorder();
    segment(r, 0, 50, 100, 50);
    expect(r.eraseNear(50, 55, 10)).toBe(1);
    expect(r.strokes).toHaveLength(0);
  });

  it('leaves a stroke that only passes outside the radius', () => {
    const r = recorder();
    segment(r, 0, 50, 100, 50);
    expect(r.eraseNear(50, 70, 10)).toBe(0);
    expect(r.strokes).toHaveLength(1);
  });

  it('removes only the strokes it touches and returns how many', () => {
    const r = recorder();
    segment(r, 0, 10, 100, 10);
    segment(r, 0, 50, 100, 50);
    segment(r, 0, 90, 100, 90);
    expect(r.eraseNear(50, 52, 10)).toBe(1);
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([10, 90]);
  });

  it('never erases for a touch pointer', () => {
    const r = recorder();
    segment(r, 0, 50, 100, 50);
    expect(r.eraseDown(touch(50, 50, 20))).toBe(false);
    r.eraseMove(touch(60, 50, 24));
    expect(r.strokes).toHaveLength(1);
  });

  it('erases along the pen path, ignores a second pointer, and releases on up', () => {
    const r = recorder();
    segment(r, 0, 10, 100, 10);
    segment(r, 0, 50, 100, 50);
    segment(r, 0, 90, 100, 90);
    expect(r.eraseDown(pen(50, 0, 100))).toBe(true);
    r.eraseMove(pen(50, 12, 110));
    r.eraseMove(pen(50, 88, 120, 3)); // another pointer: ignored
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([50, 90]);
    r.eraseUp(pen(50, 12, 130));
    expect(r.eraseDown(pen(50, 90, 200))).toBe(true);
    r.eraseUp(pen(50, 90, 210));
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([50]);
  });

  it('never starts a stroke or sets the first-stroke time', () => {
    const r = recorder();
    r.eraseDown(pen(50, 50, 100));
    r.eraseMove(pen(60, 60, 110));
    r.eraseUp(pen(70, 70, 120));
    expect(r.strokes).toHaveLength(0);
    expect(r.current).toBeNull();
    expect(r.firstStrokeAt).toBeNull();
  });

  it('reports each erase that removed something', () => {
    const onChange = vi.fn();
    const r = recorder(onChange);
    segment(r, 0, 50, 100, 50);
    onChange.mockClear();
    r.eraseDown(pen(50, 0, 100));
    r.eraseMove(pen(50, 52, 110));
    r.eraseMove(pen(50, 60, 120));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('StrokeRecorder undo history', () => {
  it('undo after an erase brings the erased stroke back in its place', () => {
    const r = recorder();
    segment(r, 0, 10, 100, 10, 0);
    segment(r, 0, 50, 100, 50, 100);
    segment(r, 0, 90, 100, 90, 200);
    r.eraseDown(pen(50, 48, 300));
    r.eraseUp(pen(50, 48, 310));
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([10, 90]);
    expect(r.undo()).toBe(true);
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([10, 50, 90]);
    expect(r.undo()).toBe(true);
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([10, 50]);
  });

  it('treats one rubber swipe as one undo step even when it removes several strokes', () => {
    const r = recorder();
    segment(r, 0, 10, 100, 10, 0);
    segment(r, 0, 50, 100, 50, 100);
    segment(r, 0, 90, 100, 90, 200);
    r.eraseDown(pen(50, 8, 300));
    r.eraseMove(pen(50, 50, 310));
    r.eraseMove(pen(50, 90, 320));
    r.eraseUp(pen(50, 90, 330));
    expect(r.strokes).toHaveLength(0);
    expect(r.undo()).toBe(true);
    expect(r.strokes.map((s) => s[0]!.y)).toEqual([10, 50, 90]);
  });

  it('tracks the time of the last action so a page can pick which box to undo', () => {
    const r = recorder();
    expect(r.lastActionAt).toBeNull();
    segment(r, 0, 10, 100, 10, 0);
    expect(r.lastActionAt).toBe(10);
    segment(r, 0, 50, 100, 50, 100);
    expect(r.lastActionAt).toBe(110);
    r.eraseDown(pen(50, 48, 300));
    r.eraseUp(pen(50, 48, 310));
    expect(r.lastActionAt).toBe(300);
    r.undo();
    expect(r.lastActionAt).toBe(110);
    r.undo();
    expect(r.lastActionAt).toBe(10);
    r.undo();
    expect(r.lastActionAt).toBeNull();
  });

  it('forgets the history on clear', () => {
    const r = recorder();
    segment(r, 0, 10, 100, 10, 0);
    r.clear();
    expect(r.undo()).toBe(false);
    expect(r.lastActionAt).toBeNull();
  });

  it('releases the pointer on up even when no stroke is in progress', () => {
    const r = recorder();
    expect(r.eraseDown(pen(50, 50, 0))).toBe(true);
    r.up(pen(50, 50, 10)); // the binding routed the lift to the pen branch
    expect(r.down(pen(10, 10, 20))).toBe(true);
  });
});

/** A stand-in for the canvas: records listeners and lets a test dispatch pointer events. */
function fakeElement() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  return {
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
    dispatch(type: string, e: Record<string, unknown>) {
      for (const fn of listeners.get(type) ?? []) fn({ preventDefault() {}, pressure: 0.5, ...e });
    },
  };
}
const pe = (pointerId: number, pointerType: string, clientX: number, clientY: number, timeStamp: number) => ({
  pointerId,
  pointerType,
  clientX,
  clientY,
  timeStamp,
});

describe('attachPointerCapture with more than one pointer', () => {
  it('keeps a rubber gesture going when a palm lifts mid-swipe, and the box is not left dead', () => {
    const r = recorder();
    segment(r, 0, 50, 100, 50, 0);
    let tool: Tool = 'eraser';
    const el = fakeElement();
    attachPointerCapture(el as unknown as HTMLElement, r, { tool: () => tool });
    el.dispatch('pointerdown', pe(1, 'pen', 50, 0, 100));
    el.dispatch('pointerup', pe(2, 'touch', 70, 90, 110));
    el.dispatch('pointermove', pe(1, 'pen', 50, 52, 120));
    expect(r.strokes).toHaveLength(0);
    el.dispatch('pointerup', pe(1, 'pen', 50, 52, 130));
    tool = 'pen';
    el.dispatch('pointerdown', pe(1, 'pen', 10, 10, 200));
    el.dispatch('pointerup', pe(1, 'pen', 40, 40, 210));
    expect(r.strokes).toHaveLength(1);
  });

  it('keeps a pen stroke going when a palm is cancelled mid-stroke', () => {
    const r = recorder();
    const el = fakeElement();
    attachPointerCapture(el as unknown as HTMLElement, r, { tool: () => 'pen' });
    el.dispatch('pointerdown', pe(1, 'pen', 10, 10, 100));
    el.dispatch('pointercancel', pe(2, 'touch', 70, 90, 110));
    el.dispatch('pointermove', pe(1, 'pen', 20, 20, 120));
    el.dispatch('pointerup', pe(1, 'pen', 30, 30, 130));
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]!.map((p) => p.x)).toEqual([10, 20, 30]);
  });
});

describe('attachPointerCapture enabled gate', () => {
  it('ignores a pen-down while the box is not enabled, and accepts it the moment it is', () => {
    const r = recorder();
    let enabled = false;
    const el = fakeElement();
    attachPointerCapture(el as unknown as HTMLElement, r, { enabled: () => enabled });
    el.dispatch('pointerdown', pe(1, 'pen', 10, 10, 100));
    el.dispatch('pointerup', pe(1, 'pen', 30, 30, 110));
    expect(r.strokes).toHaveLength(0);
    enabled = true;
    el.dispatch('pointerdown', pe(1, 'pen', 10, 10, 200));
    el.dispatch('pointerup', pe(1, 'pen', 30, 30, 210));
    expect(r.strokes).toHaveLength(1);
  });
});

describe('StrokeRecorder load', () => {
  it('restores saved ink so a side looks the same when she comes back to it', () => {
    const onChange = vi.fn();
    const r = recorder(onChange);
    const saved = [[{ x: 1, y: 2, t: 3, pressure: 0.5 }, { x: 4, y: 5, t: 6, pressure: 0.5 }]];
    r.load(saved);
    expect(r.strokes).toEqual(saved);
    expect(r.strokes[0]).not.toBe(saved[0]);
    expect(onChange).toHaveBeenLastCalledWith(saved);
    expect(r.undo()).toBe(false); // restored ink is not an action of this visit
  });
});

describe('attachPointerCapture timestamps', () => {
  it('records wall-clock times, so ink from before a reload compares with ink after it', () => {
    const r = recorder();
    const el = fakeElement();
    attachPointerCapture(el as unknown as HTMLElement, r);
    el.dispatch('pointerdown', pe(1, 'pen', 10, 10, 100));
    el.dispatch('pointerup', pe(1, 'pen', 30, 30, 140));
    expect(r.strokes[0]![0]!.t).toBeCloseTo(performance.timeOrigin + 100, 3);
    expect(r.firstStrokeAt).toBeCloseTo(performance.timeOrigin + 100, 3);
  });
});
