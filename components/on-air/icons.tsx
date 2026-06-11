// On Air icon kit — custom SVG marks for every On Air control, in the same
// flat art language as components/feed/zap-menu-art.tsx (simple shapes, round
// strokes, no glyph fonts). Everything draws with currentColor so the buttons'
// active/inactive text tints flow through, exactly like the lucide icons these
// replace. 24×24 grid, stroke 2, designed to read at 16–18px.

type Props = { className?: string }

function Mark({ children, className = '' }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  )
}

/** The meditation mark — a three-petal lotus. The live screen's title icon. */
export function LotusIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <path
        d="M12 3.5c2.3 2.6 3.4 5 3.4 7.2 0 3-1.5 5.2-3.4 6.3-1.9-1.1-3.4-3.3-3.4-6.3 0-2.2 1.1-4.6 3.4-7.2Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <path d="M10.6 16.6C6.6 16 4.1 13.4 3.5 9.2c2.5.4 4.5 1.5 5.9 3.1" />
      <path d="M13.4 16.6c4-.6 6.5-3.2 7.1-7.4-2.5.4-4.5 1.5-5.9 3.1" />
      <path d="M5.3 17.8c1.9 1.8 4.1 2.7 6.7 2.7s4.8-.9 6.7-2.7" />
    </Mark>
  )
}

/** Breathe — the visualizer itself: a ring mid-expansion around a settled center. */
export function BreatheIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <circle cx="12" cy="12" r="9" strokeDasharray="2.4 3.6" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Mark>
  )
}

/** Timer — a quiet stopwatch: face, crown, and a hand a few minutes in. */
export function DialIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <circle cx="12" cy="13.5" r="8" />
      <path d="M10 2.5h4M12 2.5v3" />
      <path d="M12 13.5l3.2-3" />
    </Mark>
  )
}

/** Just log — the brand bolt, hand-drawn (echoes the engraved Zap button). */
export function BoltIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <path
        d="M13.4 2.8 5.8 12.9h4.9l-1.1 8.3 7.6-10.1h-4.9l1.1-8.3Z"
        fill="currentColor"
        fillOpacity="0.18"
      />
    </Mark>
  )
}

/** Sound — a bell, because the cue is a bell (the bell voices), not a speaker. */
export function BellCueIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <path d="M12 4.2c-3.3 0-5.3 2.3-5.3 5.6 0 2.7-.6 4.2-1.7 5.4h14c-1.1-1.2-1.7-2.7-1.7-5.4 0-3.3-2-5.6-5.3-5.6Z" />
      <path d="M10 18.8a2 2 0 0 0 4 0" />
    </Mark>
  )
}

/** Vibration — the phone with a quiver on each side. */
export function VibrationIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <rect x="9" y="4.5" width="6" height="15" rx="2" />
      <path d="M5.5 9.5a4.8 4.8 0 0 1 0 5" />
      <path d="M18.5 14.5a4.8 4.8 0 0 0 0-5" />
    </Mark>
  )
}

/** On air — the broadcast mark: a live dot inside its ripples ( ( • ) ). */
export function OnAirIcon({ className = '' }: Props) {
  return (
    <Mark className={className}>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.2 8.4a5.4 5.4 0 0 0 0 7.2M15.8 8.4a5.4 5.4 0 0 1 0 7.2" />
      <path d="M5 5.4a9.6 9.6 0 0 0 0 13.2M19 5.4a9.6 9.6 0 0 1 0 13.2" opacity="0.55" />
    </Mark>
  )
}
