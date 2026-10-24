import { dayIndex } from './schedule';

/**
 * done: a worksheet was handed in that day (corrections do not count).
 * today: today, not yet done. past / future: everything else. A day without
 * homework is simply plain: no cross, no broken streak.
 */
export type DayStatus = 'done' | 'today' | 'past' | 'future';

export interface DayCell {
  day: number;
  dayIndex: number;
  status: DayStatus;
}

export interface MonthGrid {
  label: string;
  /** Monday-first weeks of seven; null pads the days outside the month. */
  weeks: Array<Array<DayCell | null>>;
  doneCount: number;
}

/** `month` is 0-based, as in Date. `handedInAt`: every worksheet's hand-in time. */
export function monthGrid(year: number, month: number, handedInAt: readonly number[], now: number): MonthGrid {
  const done = new Set(handedInAt.map(dayIndex));
  const today = dayIndex(now);
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells: Array<DayCell | null> = Array.from({ length: lead }, () => null);
  let doneCount = 0;
  for (let d = 1; d <= days; d++) {
    const idx = dayIndex(new Date(year, month, d, 12).getTime());
    const status: DayStatus = done.has(idx) ? 'done' : idx === today ? 'today' : idx < today ? 'past' : 'future';
    if (status === 'done') doneCount++;
    cells.push({ day: d, dayIndex: idx, status });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: MonthGrid['weeks'] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return { label, weeks, doneCount };
}
