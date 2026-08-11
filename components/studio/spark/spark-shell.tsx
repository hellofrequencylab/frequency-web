'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPARK SHELL (docs/STUDIO.md, ADR-597).
//
// The staged surface every guided creation flow runs in. It composes the page-framework's
// `WizardProgress` and the shared footer button vocabulary rather than restating them, which is
// the specific thing four wizards each did by hand: `WizardShell` already existed in
// components/templates and NOT ONE wizard used it (only onboarding did), so each re-declared the
// centered column, the progress cue, the heading block, and the Back/Continue row.
//
// `WizardShell` itself is not reused directly because it supplies its own full-screen canvas for
// onboarding, which renders OUTSIDE the app shell. A Spark runs INSIDE the app shell, so it takes
// that file's vocabulary (the exported button classes + WizardProgress) and supplies its own
// in-shell column. Same look, correct chrome.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'

export interface SparkShellProps {
  /** The thing being made, shown as the eyebrow ("New Event"). */
  eyebrow: string
  title: string
  description?: ReactNode
  /** 1-indexed step, and the total for THIS path (paths differ in length: an upload path is
   *  shorter than the question path, and the count must tell the truth about the path taken). */
  step: number
  totalSteps: number
  stepLabel?: string
  /** Hidden on the first screen, where there is nothing to go back to. */
  onBack?: () => void
  backLabel?: string
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  /** Renders the primary action busy and blocks double-submits. */
  busy?: boolean
  /** Replaces the standard footer entirely (the doors screen has no footer at all). */
  footer?: ReactNode
  /** A recoverable reason, shown above the footer. */
  error?: ReactNode
  /** Quiet links under the card (the manual escape hatch, once past the doors). */
  exits?: { label: string; onSelect: () => void }[]
  children: ReactNode
}

export function SparkShell({
  eyebrow,
  title,
  description,
  step,
  totalSteps,
  stepLabel,
  onBack,
  backLabel = 'Back',
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  busy,
  footer,
  error,
  exits,
  children,
}: SparkShellProps) {
  // Move focus to the top of each step as it mounts, so keyboard and screen-reader users land on
  // the new content instead of being stranded where the previous step's button used to be.
  // Skipped on first paint, which the page itself owns.
  const stageRef = useRef<HTMLDivElement>(null)
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    stageRef.current?.focus()
  }, [step])

  const standardFooter = onNext && (
    <div className={onBack ? 'flex gap-3' : ''}>
      {onBack && (
        <button type="button" onClick={onBack} disabled={busy} className={`${wizardSecondaryClass} flex-1`}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || busy}
        className={`${wizardPrimaryClass} ${onBack ? 'flex-1' : 'w-full'}`}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {nextLabel}
      </button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={step} total={totalSteps} label={stepLabel} />

      <div
        key={step}
        ref={stageRef}
        tabIndex={-1}
        role="group"
        aria-label={stepLabel ? `Step ${step} of ${totalSteps}: ${stepLabel}` : `Step ${step} of ${totalSteps}`}
        className="mt-7 animate-[slideUp_0.35s_ease-out] outline-none motion-reduce:animate-none"
      >
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">{eyebrow}</p>
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}

        <div className="mt-5">{children}</div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        {(footer ?? standardFooter) && <div className="mt-7">{footer ?? standardFooter}</div>}
      </div>

      {exits && exits.length > 0 && (
        <p className="mt-8 text-center text-xs text-subtle">
          {exits.map((exit, i) => (
            <span key={exit.label}>
              {i > 0 && (
                <span className="px-1.5 text-border" aria-hidden>
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={exit.onSelect}
                className="underline-offset-4 transition-colors hover:text-muted hover:underline"
              >
                {exit.label}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
