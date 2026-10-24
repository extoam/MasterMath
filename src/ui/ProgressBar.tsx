import './ProgressBar.css';

/** done: every answer written · todo: reachable · locked: an earlier side is unfinished · fix: has problems to correct · clean: nothing to correct. */
export type ChipState = 'done' | 'todo' | 'locked' | 'fix' | 'clean';

export interface ProgressBarProps {
  codes: string[];
  states: ChipState[];
  current: number;
  /** Problems to correct per side, shown on 'fix' chips. */
  counts?: number[];
  onSelect: (index: number) => void;
}

/** One chip per side of the worksheet. Tapping a reachable chip opens that side. */
export function ProgressBar({ codes, states, current, counts, onSelect }: ProgressBarProps) {
  return (
    <nav className="progress-bar" aria-label="Sheets">
      {codes.map((code, i) => {
        const state = states[i]!;
        const blocked = state === 'locked' || state === 'clean';
        return (
          <button
            key={code}
            className="chip"
            data-state={state}
            data-current={i === current}
            disabled={blocked && i !== current}
            onClick={() => onSelect(i)}
            aria-label={`Sheet ${code}${state === 'fix' ? `, ${counts?.[i] ?? ''} to correct` : ''}`}
            aria-current={i === current ? 'page' : undefined}
            data-testid={`chip-${code}`}
          >
            {code.slice(1)}
            {state === 'fix' && counts?.[i] ? <span className="badge">{counts[i]}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
