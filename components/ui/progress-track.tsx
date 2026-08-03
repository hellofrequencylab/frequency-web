// ProgressTrack — the one generic progress bar (DAWN 2026-08-03 §5). The audit
// found ~30 ad-hoc `rounded-full` + inline-width bars across quest/streak/
// journey/vault surfaces and no shared primitive; this is the replacement.
//
// Distinct from Meter on purpose: Meter is the freemium CAP meter and carries
// the 80%/cap color law; ProgressTrack is NEUTRAL progress (a journey, profile
// completeness, a streak toward its next mark) with one fixed tone and no
// thresholds. No percentage text baked in — callers compose their own labels
// (SectionHeader, Counter) beside it.
//
// Presentational + server-friendly (no hooks).
//
//   <ProgressTrack value={62} label="Journey progress" />
//   <ProgressTrack value={40} label="Get Moving" tone="move" size="sm" />

const TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  move: 'bg-move',
} as const

export function ProgressTrack({
  value,
  label,
  size = 'md',
  tone = 'primary',
}: {
  /** Percent complete, 0-100 (clamped). */
  value: number
  /** Accessible name for the bar (what is progressing). */
  label?: string
  size?: 'sm' | 'md'
  /** Semantic token family for the fill. Fixed — no threshold color shifts. */
  tone?: 'primary' | 'success' | 'move'
}) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={`overflow-hidden rounded-pill bg-surface-elevated ${size === 'sm' ? 'h-1' : 'h-1.5'}`}
    >
      <div className={`h-full rounded-pill ${TONE[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
