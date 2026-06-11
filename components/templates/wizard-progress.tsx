// WizardProgress — the one staged-flow progress cue (docs/MEMBER-DESIGN-SYSTEM.md §4,
// the Wizard pattern). Every onboarding/staged Focus surface reads its "where am I"
// from this, instead of hand-rolling a bar or dots. Presentational + server-friendly
// (no hooks); 1-indexed `current`.
//
//   <WizardProgress current={2} total={4} label="About you" />
//   <WizardProgress current={beat + 1} total={6} label={BEAT_LABELS[beat]} variant="dots" />

export function WizardProgress({
  current,
  total,
  label,
  variant = 'bar',
}: {
  /** 1-indexed current step. */
  current: number
  total: number
  /** The current step's accessible name (shown beside the count). */
  label?: string
  variant?: 'bar' | 'dots'
}) {
  const valuetext = `Step ${current} of ${total}${label ? `: ${label}` : ''}`

  if (variant === 'dots') {
    return (
      <div
        className="flex items-center justify-center gap-2"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={valuetext}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-2 rounded-full transition-all duration-500 motion-reduce:transition-none ${
              i + 1 === current ? 'w-6 bg-primary' : 'w-2 bg-border-strong'
            }`}
          />
        ))}
        <span className="sr-only" aria-live="polite">{valuetext}</span>
      </div>
    )
  }

  return (
    <div>
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={valuetext}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-1.5 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
              i < current ? 'bg-primary' : 'bg-border-strong'
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs font-medium text-subtle" aria-live="polite">
        Step {current} of {total}
        {label && <> · <span className="text-muted">{label}</span></>}
      </p>
    </div>
  )
}
