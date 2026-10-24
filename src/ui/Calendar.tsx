import { monthGrid } from '../engine/calendar';
import './Home.css';

interface Props {
  year: number;
  /** 0-based. */
  month: number;
  handedInAt: number[];
  now: number;
  onPrev: () => void;
  onNext: (() => void) | null;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Smile() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--mark-green)" />
      <circle cx="8.5" cy="10" r="1.4" fill="#fff" />
      <circle cx="15.5" cy="10" r="1.4" fill="#fff" />
      <path d="M7.5 14.2c1.1 1.7 2.7 2.6 4.5 2.6s3.4-.9 4.5-2.6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A month of homework: a smile on every day a worksheet was handed in. Missed days stay plain. */
export function Calendar({ year, month, handedInAt, now, onPrev, onNext }: Props) {
  const g = monthGrid(year, month, handedInAt, now);
  return (
    <section className="card calendar" aria-label="Homework calendar">
      <div className="calendar-head">
        <button className="ghost" onClick={onPrev} aria-label="Previous month">
          ‹
        </button>
        <div className="calendar-title">
          <b data-testid="calendar-month">{g.label}</b>
          <span className="muted" data-testid="calendar-count">
            {g.doneCount === 1 ? '1 day of homework' : `${g.doneCount} days of homework`}
          </span>
        </div>
        <button className="ghost" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((w, i) => (
          <span key={`h${i}`} className="weekday">
            {w}
          </span>
        ))}
        {g.weeks.flat().map((c, i) =>
          c ? (
            <span key={i} className="day" data-status={c.status} data-day={c.day} aria-label={`${c.day}${c.status === 'done' ? ', homework done' : ''}`}>
              {c.status === 'done' ? <Smile /> : c.day}
            </span>
          ) : (
            <span key={i} className="day" data-status="blank" />
          ),
        )}
      </div>
    </section>
  );
}
