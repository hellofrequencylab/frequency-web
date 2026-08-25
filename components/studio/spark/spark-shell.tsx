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
// It also carries AUTOSAVE for every Spark at once (ADR-991 + the sync extension, ./draft/*): what
// the author types is kept on their own device as they go AND staged against their account, so
// reopening the Spark on any device offers to restore it or to start fresh. Where the two copies
// disagree and the newer one came from elsewhere, the author is asked rather than told. No ENTITY
// row exists before the commit each wizard already gates on, so deferred creation is unchanged. No
// wizard wires any of this; composing the shell IS the wiring.
//
// `WizardShell` itself is not reused directly because it supplies its own full-screen canvas for
// onboarding, which renders OUTSIDE the app shell. A Spark runs INSIDE the app shell, so it takes
// that file's vocabulary (the exported button classes + WizardProgress) and supplies its own
// in-shell column. Same look, correct chrome.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { FieldError } from './field/field-control'
import { draftScope } from './draft/draft-store'
import { useSparkDraft } from './draft/use-spark-draft'
import { SparkDraftConflict, SparkDraftCue, SparkResumeOffer } from './draft/spark-resume'
import { useReportWizardDraft } from '../wizard-guard'

export interface SparkShellProps {
  /** The thing being made, shown as the eyebrow ("New Event"). */
  eyebrow: string
  title: string
  /**
   * The heading level for `title`. Defaults to 1 for a standalone Spark that owns its page. Pass 2
   * when the Spark is mounted INSIDE a template that already rendered an h1 (an AdminTemplate page,
   * for one), because two h1s on a page is a real navigation bug for a screen-reader user, not a
   * style preference.
   */
  headingLevel?: 1 | 2
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
  /**
   * Where this Spark's autosaved answers are filed. Defaults to the route plus the eyebrow, which is
   * stable per surface and says nothing about which entity it is (the kit stays entity-blind).
   *
   * Pass `null` to turn autosave off for a surface where a resumed draft would be wrong. Pass a
   * string to make the scope narrower than the route can (two Sparks on one page, or a per-Space
   * flow that should not hand one Space's typing to another).
   */
  draftScopeKey?: string | null
  children: ReactNode
}

export function SparkShell({
  eyebrow,
  title,
  headingLevel = 1,
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
  draftScopeKey,
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

  // Autosave, for every Spark at once (ADR-991). The shell owns it because the shell is the one
  // thing all of them compose; a wizard adds nothing and inherits it. `draftScopeKey === null`
  // opts a surface out entirely.
  const pathname = usePathname()
  const scope = draftScopeKey === null ? null : (draftScopeKey ?? draftScope([pathname, eyebrow]))
  const draft = useSparkDraft({ scope, step, stageRef, busy, route: pathname, label: eyebrow })

  // Report this draft up to the Spark modal, when there IS one (ADR-1017). The modal needs exactly
  // three things it cannot work out for itself — which draft is on screen, how to erase both copies
  // of it, and whether a write is still owed — and a Spark rendered as a full page has no provider
  // above it, so this is a no-op there. Nothing about the wizard changes either way.
  useReportWizardDraft({ scope, discard: draft.discard, pending: draft.saveState === 'saving' })

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
      {draft.phase === 'offer' && (
        <SparkResumeOffer
          savedLabel={draft.savedLabel}
          fromAnotherDevice={draft.fromAnotherDevice}
          onRestore={draft.restore}
          onDiscard={draft.discard}
        />
      )}
      {draft.phase === 'conflict' && draft.conflict && (
        <SparkDraftConflict
          localLabel={draft.conflict.localLabel}
          otherLabel={draft.conflict.otherLabel}
          onTakeOther={draft.takeOther}
          onKeepLocal={draft.keepLocal}
        />
      )}

      <WizardProgress current={step} total={totalSteps} label={stepLabel} />
      <SparkDraftCue saveState={draft.saveState} restored={draft.restored} />

      <div
        key={step}
        ref={stageRef}
        tabIndex={-1}
        role="group"
        aria-label={stepLabel ? `Step ${step} of ${totalSteps}: ${stepLabel}` : `Step ${step} of ${totalSteps}`}
        className="mt-7 animate-[slideUp_0.35s_ease-out] outline-none motion-reduce:animate-none"
      >
        <p className="eyebrow mb-1.5 text-primary-strong">{eyebrow}</p>
        {headingLevel === 1 ? (
          <h1 className="text-page-title font-bold text-text">{title}</h1>
        ) : (
          <h2 className="text-page-title font-bold text-text">{title}</h2>
        )}
        {description && <p className="mt-1 text-body-sm leading-relaxed text-muted">{description}</p>}

        <div className="mt-5">{children}</div>

        {/* A div, not a p: callers pass rich error content (a Banner is a div) and nesting one
            inside a p is invalid HTML that React will silently reflow.
            The reason a step could not continue is ANNOUNCED, not just coloured — the author is
            one keystroke from walking away believing it went through, so this is the assertive
            register. `FieldError` keeps the live region mounted whether or not there is anything
            in it, which is the half that made the difference (see its note). */}
        <FieldError as="div" className="mt-4 text-body-sm text-warning">
          {error}
        </FieldError>

        {(footer ?? standardFooter) && <div className="mt-7">{footer ?? standardFooter}</div>}
      </div>

      {exits && exits.length > 0 && (
        <p className="mt-8 text-center text-meta text-subtle">
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
