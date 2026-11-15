// ボタンに使うアイコン。外部の素材は使わず、線で描く。意味は、ボタンの aria-label と title で伝える。
const PATHS = {
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 10v7M14 10v7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  grip: ['M5 7h14', 'M5 12h14', 'M5 17h14'],
} as const;

export function Icon({ name, size = 15 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
