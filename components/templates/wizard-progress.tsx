// WizardProgress — the one staged-flow progress cue (docs/MEMBER-DESIGN-SYSTEM.md §4,
// the Wizard pattern). Every onboarding/staged Focus surface reads its "where am I"
// from this, instead of hand-rolling a bar or dots. Presentational + server-friendly
// (no hooks); 1-indexed `current`.
//
//   <WizardProgress current={2} total={4} label="About you" />
//   <WizardProgress current={beat + 1} total={6} label={BEAT_LABELS[beat]} variant="dots" />

// The kit's 4px track segments and pill dots, lit with the iridescent fill (`mu-steps` / `mu-dots`,
// app/themes/frequency/members-ui.css).

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

  const dots = variant === 'dots'
  return (
    <div className={dots ? undefined : 'stack'} style={dots ? undefined : { gap: 12 }}>
      <div
        className={dots ? 'mu-dots' : 'mu-steps'}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={valuetext}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} aria-hidden className={(dots ? i + 1 === current : i < current) ? 'on' : undefined} />
        ))}
      </div>
      {dots ? (
        <span className="sr-only" aria-live="polite">{valuetext}</span>
      ) : (
        <p className="t2" aria-live="polite">
          Step {current} of {total}
          {label && <> · {label}</>}
        </p>
      )}
    </div>
  )
}
