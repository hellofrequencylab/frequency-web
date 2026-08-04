// ProgressTrack — the one generic progress bar (DAWN 2026-08-03 §5). The audit
// found ~50 ad-hoc `rounded-pill` + inline-width bars across quest/streak/
// journey/vault/operator surfaces and no shared primitive; this is the
// replacement.
//
// Distinct from Meter on purpose: Meter is the freemium CAP meter and carries
// the 80%/cap color law; ProgressTrack is NEUTRAL progress (a journey, profile
// completeness, a streak toward its next mark, a roster against its cap) with
// one fixed tone and no thresholds. No percentage text baked in — callers
// compose their own labels (SectionHeader, Counter) beside it.
//
// Presentational + server-friendly (no hooks).
//
//   <ProgressTrack value={62} label="Journey progress" />
//   <ProgressTrack value={40} label="Get Moving" tone="move" size="sm" />
//   <ProgressTrack value={9} max={30} label="9 of 30 practice days logged" size="lg" animate />
//   <ProgressTrack indeterminate label="Importing contacts" />

const TONE = {
  primary: 'bg-primary',
  'primary-strong': 'bg-primary-strong',
  success: 'bg-success',
  move: 'bg-move',
  warning: 'bg-warning',
  danger: 'bg-danger',
  signal: 'bg-signal-strong',
  broadcast: 'bg-broadcast',
  /** Inherits the parent's `color` — for bars painted inside an already-toned block. */
  current: 'bg-current',
  neutral: 'bg-border-strong',
} as const

const TRACK = {
  elevated: 'bg-surface-elevated',
  surface: 'bg-surface',
  broadcast: 'bg-broadcast-bg',
  border: 'bg-border/60',
} as const

// Heights measured off the call sites the sweep retired. `sm`/`md` keep their
// original meaning; lg/xl/2xl were added for the thicker in-app + operator bars.
const SIZE = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
  xl: 'h-2.5',
  '2xl': 'h-3',
} as const

export type ProgressTone = keyof typeof TONE
export type ProgressTrackSize = keyof typeof SIZE

export function ProgressTrack({
  value = 0,
  max = 100,
  label,
  size = 'md',
  tone = 'primary',
  track = 'elevated',
  animate = false,
  indeterminate = false,
  minVisible = 0,
  className = '',
}: {
  /** How far along, in the same unit as `max` (clamped to 0..max). Ignored when indeterminate. */
  value?: number
  /** The scale `value` is measured against. Defaults to 100 (i.e. `value` is a percent). */
  max?: number
  /** Accessible name for the bar (what is progressing). */
  label?: string
  size?: ProgressTrackSize
  /** Semantic token family for the fill. Fixed — no threshold color shifts. */
  tone?: ProgressTone
  /** Semantic token for the unfilled track. */
  track?: keyof typeof TRACK
  /** Ease the fill when the value changes. Honors prefers-reduced-motion. */
  animate?: boolean
  /** Work of unknown length: a looping sweep instead of a measured fill. */
  indeterminate?: boolean
  /** Floor, in percent, so a barely-started bar still reads as a bar (e.g. 2). */
  minVisible?: number
  /** Layout-only classes for the track (flex-1, min-w-8, mt-2 …). Never colour or radius. */
  className?: string
}) {
  const span = max > 0 ? max : 100
  const raw = (Math.min(Math.max(value, 0), span) / span) * 100
  const pct = raw > 0 ? Math.max(raw, minVisible) : raw
  const now = Math.round((pct / 100) * span)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={indeterminate ? undefined : span}
      aria-valuenow={indeterminate ? undefined : now}
      aria-label={label}
      className={`overflow-hidden rounded-pill ${TRACK[track]} ${SIZE[size]} ${className}`.trimEnd()}
    >
      {indeterminate ? (
        <div className={`h-full w-full rounded-pill ${TONE[tone]} opacity-60 motion-safe:animate-pulse`} />
      ) : (
        <div
          className={`h-full rounded-pill ${TONE[tone]}${
            animate ? ' transition-[width] duration-500 ease-out motion-reduce:transition-none' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}
