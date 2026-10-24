/**
 * Splits a worksheet's active time between its sides. Reading it (for an
 * autosave) never loses time: the running side's share is computed, not
 * moved, until she switches side.
 */
export class SideTimer {
  private readonly settled: Record<string, number>;
  private current: string;
  private since: number;

  /** `carried`: time per side from earlier visits. `activeNow`: the active clock's reading now. */
  constructor(carried: Record<string, number>, current: string, activeNow: number) {
    this.settled = { ...carried };
    this.current = current;
    this.since = activeNow;
  }

  switchTo(code: string, activeNow: number): void {
    this.settled[this.current] = (this.settled[this.current] ?? 0) + (activeNow - this.since);
    this.current = code;
    this.since = activeNow;
  }

  snapshot(activeNow: number): Record<string, number> {
    return { ...this.settled, [this.current]: (this.settled[this.current] ?? 0) + (activeNow - this.since) };
  }
}
