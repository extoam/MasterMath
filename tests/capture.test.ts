import { describe, expect, it, vi } from 'vitest';
import { StrokeRecorder, type PointerSample } from '../src/ink/capture';

const accepted = ['pen', 'mouse'] as const;

function pen(x: number, y: number, t: number, id = 1): PointerSample {
  return { pointerId: id, pointerType: 'pen', x, y, t, pressure: 0.6 };
}
function touch(x: number, y: number, t: number, id = 2): PointerSample {
  return { pointerId: id, pointerType: 'touch', x, y, t, pressure: 0 };
}

function recorder(onChange?: (s: StrokeRecorder['strokes']) => void) {
  return new StrokeRecorder({ acceptedPointerTypes: accepted, onChange });
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
