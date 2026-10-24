/**
 * Idle-aware stopwatch for a page or session. Every pointer event is a
 * `touch`; the gap between two touches counts toward active time only up to
 * `idleTimeoutMs`, so a page left open while the child wanders off does not
 * inflate the number. Times are in one domain (performance.now() ms).
 */
export class ActiveClock {
  private readonly idleTimeoutMs: number;
  private accumulated = 0;
  private lastEventAt: number | null = null;
  private stopped = false;

  constructor(opts: { idleTimeoutMs: number }) {
    this.idleTimeoutMs = opts.idleTimeoutMs;
  }

  /** Begin counting at `t`. Later calls are ignored. */
  start(t: number): void {
    if (this.lastEventAt !== null) return;
    this.lastEventAt = t;
  }

  /** A pointer event at `t`. Ignored before start and after stop. */
  touch(t: number): void {
    if (this.lastEventAt === null || this.stopped) return;
    this.accumulated += this.gap(t);
    this.lastEventAt = t;
  }

  /** Active time so far, counting the live tail since the last event up to the idle timeout. */
  activeMs(now: number): number {
    if (this.lastEventAt === null) return 0;
    if (this.stopped) return this.accumulated;
    return this.accumulated + this.gap(now);
  }

  /** Freeze the clock at `t` and return the final active time. Idempotent. */
  stop(t: number): number {
    if (this.lastEventAt === null) return 0;
    if (!this.stopped) {
      this.accumulated += this.gap(t);
      this.lastEventAt = t;
      this.stopped = true;
    }
    return this.accumulated;
  }

  private gap(t: number): number {
    return Math.min(Math.max(0, t - this.lastEventAt!), this.idleTimeoutMs);
  }
}
