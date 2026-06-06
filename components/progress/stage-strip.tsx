import { MEMBER_STAGES } from '@/lib/member-progress'

// A calm "where you are" band: a five-step ladder, the current stage + its focus,
// and the next thing that moves you up. Reveals the shape of the journey without
// turning it into a scoreboard. Presentational — pass plain values.
export function StageStrip({
  stageIndex,
  stageLabel,
  tagline,
  nextStageLabel,
  nextGateLabel,
}: {
  stageIndex: number
  stageLabel: string
  tagline: string
  /** The stage that comes next, or null at the top. */
  nextStageLabel?: string | null
  /** The nearest unmet gate to the next stage, or null at the top. */
  nextGateLabel?: string | null
}) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Your stage</p>
          <p className="text-sm font-bold text-text">{stageLabel}</p>
        </div>
        {/* Five-step ladder. */}
        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          {MEMBER_STAGES.map((s) => (
            <span
              key={s.key}
              title={s.label}
              className={`h-1.5 rounded-full transition-all ${
                s.index <= stageIndex ? 'w-5 bg-primary' : 'w-2.5 bg-surface-elevated'
              }`}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">{tagline}</p>
      {nextStageLabel && nextGateLabel && (
        <p className="mt-1 text-2xs text-subtle">
          Next up — <span className="font-medium text-muted">{nextStageLabel}</span>: {nextGateLabel}
        </p>
      )}
    </div>
  )
}
