import type { PosterBand } from '@/lib/events/poster-quality'

// The honesty-band chip for the Posted events admin: a quiet chip for the bands
// that pay in full, warning tones for watch (half pay), danger tones for
// throttled (no pay). Semantic tokens only; presentational + server-friendly.

const TONES: Record<PosterBand, string> = {
  new: 'border-border bg-surface-elevated text-muted',
  trusted: 'border-border bg-surface-elevated text-muted',
  neutral: 'border-border bg-surface-elevated text-muted',
  watch: 'border-warning/40 bg-warning-bg text-warning',
  throttled: 'border-danger/40 bg-danger-bg text-danger',
}

export function BandChip({ band }: { band: PosterBand | null }) {
  if (!band) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium capitalize ${TONES[band]}`}
    >
      {band}
    </span>
  )
}
