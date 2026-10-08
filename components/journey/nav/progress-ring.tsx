// ProgressRing — one number, drawn as a ring (the course home hero, the dock's Course tab, every
// Library card). A ring is for a single overall figure; per-week rows keep the ProgressTrack bar.
// Presentational + server-friendly (no hooks). Colours are tokens through currentColor.

export function ProgressRing({
  value,
  size = 48,
  stroke = 5,
  label,
  children,
  tone = 'primary',
  className = '',
}: {
  /** 0-100. Clamped. */
  value: number
  size?: number
  stroke?: number
  /** The accessible name, e.g. "40% of the Journey done". */
  label: string
  /** Whatever sits in the middle (a percentage, an icon). */
  children?: React.ReactNode
  /** `current` paints in the parent's text colour, for a ring sitting on a filled (active) tab. */
  tone?: 'primary' | 'current'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span
      role="img"
      aria-label={label}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={tone === 'current' ? 'stroke-current opacity-30' : 'stroke-surface-elevated'} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          // Never fully empty: a sliver at 0% says "this is a gauge" (endowed progress, JOURNEYS-DESIGN §1).
          strokeDashoffset={c - (c * Math.max(pct, 2)) / 100}
          className={tone === 'current' ? 'stroke-current' : pct >= 100 ? 'stroke-success' : 'stroke-primary'}
        />
      </svg>
      {children !== undefined && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  )
}
