import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonGeometry } from './button'

// STAGE TIMELINE (ADR-1504). A stepper: a row of real buttons that walk a thing through its
// stages, left to right. The current step is emphasised and carries `aria-current="step"`,
// earlier steps read as done (a check glyph), later steps as upcoming (their number). Colour
// never carries the state alone: the glyph and `aria-current` do. A refused step is a real
// `disabled` attribute, and the caller says WHY in the hint under the row, never in a tooltip.
//
// This is a STEPPER, not a segmented control (HYG-105 owns that): a segmented control picks one of
// several equal options; a stepper has an order, and where you are on it is part of the reading.
//
// Composes `buttonGeometry` so every step keeps the button's tap floor and press state while the
// step states supply their own semantic tokens (button.tsx says why the two cannot be merged).

export type StageTimelineStepState = 'done' | 'current' | 'upcoming'

export interface StageTimelineStep {
  key: string
  /** The step's visible label. It IS the accessible name, so it must be real words. */
  label: string
  state: StageTimelineStepState
  disabled?: boolean
}

const STEP: Record<StageTimelineStepState, string> = {
  // The MUTED amber pair the system already carries (button.tsx `primarySoft`), with a solid edge.
  current: 'border border-primary bg-primary-bg text-primary-strong',
  done: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-elevated',
  upcoming: 'border border-dashed border-border text-muted hover:border-border-strong hover:bg-surface-elevated hover:text-text',
}

const GLYPH: Record<StageTimelineStepState, string> = {
  current: 'bg-primary text-on-primary',
  done: 'bg-success-bg text-success',
  upcoming: 'bg-surface-elevated text-muted',
}

export function StageTimeline({
  label,
  steps,
  onStep,
  hint,
  hintId,
  reasons = [],
  pending = false,
  className,
}: {
  /** The group's accessible name ("Stage"). */
  label: string
  steps: readonly StageTimelineStep[]
  onStep: (key: string) => void
  /** One plain line under the row: what the current step means. */
  hint?: string
  hintId?: string
  /** Why the disabled steps are disabled. Rendered under the hint, so the refusal is readable. */
  reasons?: readonly string[]
  /** A write is in flight: the row is `aria-busy` and no step can fire twice. */
  pending?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid gap-1', className)}>
      <div
        role="group"
        aria-label={label}
        aria-busy={pending || undefined}
        // Four steps wrap to two rows on a phone and sit on one row from `sm` up; never a sideways scroll.
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
      >
        {steps.map((step, i) => {
          const current = step.state === 'current'
          return (
            <button
              key={step.key}
              type="button"
              aria-current={current ? 'step' : undefined}
              disabled={pending || step.disabled}
              onClick={() => onStep(step.key)}
              className={cn(buttonGeometry('sm'), STEP[step.state], 'min-w-0')}
            >
              <span
                aria-hidden
                className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-pill text-meta', GLYPH[step.state])}
              >
                {step.state === 'done' ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          )
        })}
      </div>
      {hint && (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      )}
      {reasons.map((reason) => (
        <p key={reason} className="text-meta text-muted">
          {reason}
        </p>
      ))}
    </div>
  )
}
