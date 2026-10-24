import { describe, expect, it } from 'vitest';
import { monthGrid } from '../src/engine/calendar';
import { dayIndex } from '../src/engine/schedule';

const at = (y: number, m: number, d: number, h = 18) => new Date(y, m, d, h).getTime();

describe('monthGrid', () => {
  it('lays a month out in Monday-first weeks with blanks around it', () => {
    const g = monthGrid(2026, 9, [], at(2026, 9, 24)); // October 2026 starts on a Thursday
    expect(g.weeks[0]!.slice(0, 3).every((c) => c === null)).toBe(true);
    expect(g.weeks[0]![3]!.day).toBe(1);
    expect(g.weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.label).toBe('October 2026');
  });

  it('smiles on every day a worksheet was handed in, and only those', () => {
    const g = monthGrid(2026, 9, [at(2026, 9, 20, 9), at(2026, 9, 20, 19), at(2026, 9, 22)], at(2026, 9, 24));
    const status = (d: number) => g.weeks.flat().find((c) => c?.day === d)!.status;
    expect(status(20)).toBe('done');
    expect(status(22)).toBe('done');
    expect(status(21)).toBe('past');
    expect(status(24)).toBe('today');
    expect(status(25)).toBe('future');
  });

  it('marks today as done once today’s worksheet is in', () => {
    const g = monthGrid(2026, 9, [at(2026, 9, 24, 8)], at(2026, 9, 24, 20));
    expect(g.weeks.flat().find((c) => c?.day === 24)!.status).toBe('done');
  });

  it('counts the days done in the month', () => {
    expect(monthGrid(2026, 9, [at(2026, 9, 1), at(2026, 9, 2), at(2026, 9, 2, 20), at(2026, 10, 1)], at(2026, 9, 24)).doneCount).toBe(2);
  });

  it('gives each cell its day number for matching', () => {
    const g = monthGrid(2026, 9, [], at(2026, 9, 24));
    expect(g.weeks.flat().find((c) => c?.day === 24)!.dayIndex).toBe(dayIndex(at(2026, 9, 24)));
  });
});
