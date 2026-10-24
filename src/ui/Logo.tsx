/** The MasterMath mark: the same “+ −” tile as the home-screen icon, drawn inline so it is sharp at any size. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="MasterMath logo">
      <rect width="100" height="100" rx="22" fill="var(--ink)" />
      <g stroke="var(--paper)" strokeWidth="7" strokeLinecap="round">
        <line x1="30" y1="38" x2="54" y2="38" />
        <line x1="42" y1="26" x2="42" y2="50" />
        <line x1="46" y1="66" x2="70" y2="66" />
      </g>
    </svg>
  );
}
