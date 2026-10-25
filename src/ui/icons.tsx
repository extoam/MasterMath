/** Toolbar icons: plain line drawings in the ink colour, no library. */
const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function BackIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M9 7H4V2" />
      <path d="M4 7a9 9 0 1 1-1.5 7" />
    </svg>
  );
}

export function RubberIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M14.5 4.5l5 5-9.5 9.5H5l-2-2 11.5-12.5z" />
      <path d="M9 10l5 5" />
      <path d="M10 19h10" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  );
}
