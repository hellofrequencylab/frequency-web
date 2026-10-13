'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { PageHeading } from './page-heading'
import { WizardProgress } from './wizard-progress'
import { SITE_DESIGN } from '@/lib/theme/design'

// FREQUENCY (ADR-1737): the wizard stamps the members kit on its own room (it renders outside the member
// shell as often as inside it), wears the kit's buttons (`.btn.pa.lg` / `.btn.lg`) and its step bar, and
// names the brand in the kit's display face rather than DAWN's amber tile and Anton caps. Inlined at
// build; every DAWN string below is unchanged.
const FREQUENCY = SITE_DESIGN === 'frequency'

// WizardShell — the staged Focus surface for onboarding (docs/MEMBER-DESIGN-SYSTEM.md
// §4, the Wizard pattern). A centered, rail-less, single-column flow in the warm app
// register: a brand mark, a progress cue, a kit `PageHeading`, the current step's body,
// and a standardized Back / Continue footer. Onboarding renders OUTSIDE the app-shell
// (app/onboarding/* is its own route group), so unlike FocusTemplate the shell supplies
// its own full-screen canvas + padding. It also owns the per-step focus move so every
// flow stops re-implementing it.
//
//   <WizardShell step={step} totalSteps={4} stepLabel="About you"
//     eyebrow="Set up" title="Add a face" description="It helps people connect."
//     onBack={() => setStep(1)} onNext={advance} nextLabel="Continue" nextDisabled={!ok}>
//     {/* the step's fields */}
//   </WizardShell>

const WIDTHS = {
  narrow: 'max-w-md',
  default: 'max-w-lg',
  wide: 'max-w-2xl',
} as const

// Shared footer button vocabulary — exported for the rare step that needs a fully
// custom footer (a sign-in block, a multi-action row) but still wants the kit buttons.
export const wizardPrimaryClass = FREQUENCY
  ? 'btn pa lg'
  : 'inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-5 py-3 text-body-sm font-semibold text-on-primary lift-1 transition-all hover:bg-primary-hover enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
export const wizardSecondaryClass = FREQUENCY
  ? 'btn lg'
  : 'inline-flex items-center justify-center rounded-card border border-border-strong bg-surface px-5 py-3 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated motion-reduce:transition-none'

export function WizardShell({
  step,
  totalSteps,
  stepLabel,
  progressVariant = 'bar',
  eyebrow,
  title,
  description,
  width = 'default',
  onBack,
  backLabel = 'Back',
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
  nextBusy = false,
  nextBusyLabel,
  footer,
  error,
  exit,
  children,
}: {
  /** 1-indexed current step (also the animation/focus key). */
  step: number
  totalSteps: number
  stepLabel?: string
  progressVariant?: 'bar' | 'dots'
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  width?: keyof typeof WIDTHS
  /** Back handler — omit on the first step (renders a full-width primary). */
  onBack?: () => void
  backLabel?: string
  /** Primary advance handler. Omit (with `footer`) for a fully custom footer. */
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  nextBusy?: boolean
  nextBusyLabel?: string
  /** Replaces the standard Back/Continue footer entirely (custom action rows). */
  footer?: React.ReactNode
  /** A recoverable error shown above the footer. */
  error?: React.ReactNode
  /** Optional quiet escape links under the card (e.g. Home · Log in). */
  exit?: { href: string; label: string }[]
  children: React.ReactNode
}) {
  // Move focus to the top of each step as it mounts so keyboard + screen-reader users
  // land on the new content. Skipped on the very first paint (the page owns focus).
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
        <button type="button" onClick={onBack} className={`${wizardSecondaryClass} flex-1`}>
          {backLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || nextBusy}
        className={`${wizardPrimaryClass} ${onBack ? 'flex-1' : 'w-full'}`}
      >
        {nextBusy ? (nextBusyLabel ?? nextLabel) : nextLabel}
      </button>
    </div>
  )

  return (
    <main
      className={FREQUENCY ? 'flex min-h-screen flex-col px-5 py-10 sm:px-8' : 'flex min-h-screen flex-col bg-canvas px-5 py-10 sm:px-8'}
      data-kit={FREQUENCY ? 'members' : undefined}
    >
      <div className={`mx-auto flex w-full flex-1 flex-col justify-center ${WIDTHS[width]}`}>
        {/* Brand mark — quiet, app register (not the marketing display lockup). */}
        {FREQUENCY ? (
          <div className="mb-8 flex items-center gap-2">
            <span className="orb" aria-hidden />
            <span className="h3">Frequency</span>
          </div>
        ) : (
          <div className="mb-8 flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-primary" aria-hidden />
            <span className="font-display text-body-lg uppercase tracking-tight text-text">Frequency</span>
          </div>
        )}

        <WizardProgress current={step} total={totalSteps} label={stepLabel} variant={progressVariant} />

        <div
          key={step}
          ref={stageRef}
          tabIndex={-1}
          role="group"
          aria-label={stepLabel ? `Step ${step} of ${totalSteps}: ${stepLabel}` : `Step ${step} of ${totalSteps}`}
          className="mt-7 animate-[slideUp_0.35s_ease-out] outline-none motion-reduce:animate-none"
        >
          <PageHeading eyebrow={eyebrow} title={title} description={description} divider={false} />
          {children}

          {error && <p className={FREQUENCY ? 'mu-err mt-4' : 'mt-4 text-body-sm text-danger'}>{error}</p>}

          <div className="mt-7">{footer ?? standardFooter}</div>
        </div>

        {exit && exit.length > 0 && (
          <p className="mt-8 text-center text-meta text-subtle/70">
            {exit.map((e, i) => (
              <span key={e.href}>
                {i > 0 && <span className="px-1.5 text-border" aria-hidden>|</span>}
                <Link href={e.href} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
                  {e.label}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </main>
  )
}
