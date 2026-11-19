'use client'

// Journeys v2 — the trophy celebration (ADR-252, JOURNEYS.md §6). The "present it in a fun way"
// moment: a full-screen card when a learner finishes a Phase or the whole Journey, with the
// trophy, the milestone name, and the Gems earned. A Journey finish with certificates enabled
// also shows a printable certificate card. Modeled on the season celebration's card/Burst/anim
// pattern (token-only colors, reduced-motion safe), but milestone-aware and season-free.

import { capsLabel } from '@/components/ui/caps-label'
import { useEffect, useRef } from 'react'
import { Trophy, Gem, X, Sparkles, Award, Printer } from 'lucide-react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Button } from '@/components/ui/button'

export interface TrophyMilestone {
  kind: 'phase' | 'journey'
  /** Phase title (kind 'phase') or Journey title (kind 'journey'). */
  title: string
  gems?: number
  /** Show the printable certificate (Journey finish only, when the plan enables it). */
  certificate?: boolean
  /** What one phase is called on this Journey's cadence ("week" or "month"). Defaults to week. */
  unit?: 'week' | 'month'
  /** What opens next after a finished week ("Week 3 · The Gathering"), when there is one. */
  next?: string | null
  /** What the learner did, as short counts ("12 steps", "4 weeks"), shown on a Journey finish. */
  stats?: string[]
  /** Where the course home lives, for the way out of a finished Journey. */
  homeHref?: string
}

function Burst() {
  // A ring of token-colored sparks. Purely decorative; no layout impact; hidden under reduced motion.
  const sparks = Array.from({ length: 12 })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The spark's place (rotate, then out) sits on the outer span and the pop on the inner one:
          on one element the pop's own transform replaced the place, and all twelve sat in a dot
          at the centre of the card. `.mc-spark` (members-c.css) pops, then fades. */}
      {sparks.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 motion-reduce:hidden"
          style={{ transform: `rotate(${(360 / sparks.length) * i}deg) translateY(-120px)` }}
        >
          <span className="mc-spark" style={{ animationDelay: `${i * 35}ms` }} />
        </span>
      ))}
    </div>
  )
}

function Certificate({ title }: { title: string }) {
  // The day it was earned is the day this card opens: the celebration only shows on the finishing tap.
  const day = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div className="mt-5 rounded-card border-2 border-rank-gold/40 bg-canvas p-5 text-center">
      <Award className="mx-auto h-7 w-7 text-rank-gold" strokeWidth={1.75} />
      <p className={capsLabel('mt-2 text-2xs font-bold text-rank-gold', 'widest')}>Certificate of completion</p>
      <p className="mt-2 text-body font-bold text-text">{title}</p>
      <p className="mt-1 text-meta text-muted" suppressHydrationWarning>
        Completed on Frequency, {day}
      </p>
    </div>
  )
}

export function TrophyCelebration({ milestone, onDismiss }: { milestone: TrophyMilestone; onDismiss: () => void }) {
  // Escape and the scroll-lock below were already here; focus was not, so the celebration was a
  // wall a keyboard could not walk up to. The learner tabbed on behind an `aria-modal` card that
  // had just told their screen reader the rest of the page did not exist. The hook moves focus to
  // the card's first control (Dismiss), keeps Tab inside it, and hands focus back to whatever the
  // learner was on when the card goes away. No motion is involved, so nothing here touches the
  // reduced-motion guards below.
  const cardRef = useRef<HTMLDivElement>(null)
  useDialogFocusTrap(true, cardRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onDismiss])

  const isJourney = milestone.kind === 'journey'
  const unit = milestone.unit ?? 'week'
  const eyebrow = isJourney ? 'Journey complete' : `${unit === 'month' ? 'Month' : 'Week'} complete`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm print:bg-canvas print:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
      onClick={onDismiss}
    >
      {/* REDUCED MOTION, both animations. `@keyframes slideUp` carries no guard of its own in
          globals.css, so every consumer must add `motion-safe:` — four of five did and this one
          did not. The trophy below is the sharper case: `.animate-cue-pop` IS guarded in
          globals.css, but writing it as an arbitrary `animate-[cue-pop_…]` value bypassed the
          class and therefore the guard, while retyping a bezier that is already `--ease-pop`. The
          confetti in this same file was guarded all along (`motion-reduce:hidden`), which is how
          we know the rule was known and these two were missed. */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary-bg bg-surface p-8 text-center outline-none lift-3 motion-safe:animate-[slideUp_0.45s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <Burst />
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-control p-1 text-subtle transition-colors hover:text-text print:hidden"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-pill bg-primary-bg text-primary-strong animate-cue-pop">
          <Trophy className="h-10 w-10" strokeWidth={1.75} />
        </div>

        <p className={capsLabel('mt-5 inline-flex items-center gap-1.5 text-2xs font-bold text-primary-strong', 'widest')}>
          <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
        </p>
        <h2 className="mt-1.5 text-balance text-lead font-bold text-text">{milestone.title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-body-sm leading-relaxed text-muted">
          {isJourney ? 'That is the whole Journey, start to finish.' : `One ${unit} down. The trophy is yours.`}
        </p>

        {isJourney && milestone.stats && milestone.stats.length > 0 && (
          <p className="mt-3 text-body-sm font-medium tabular-nums text-text">{milestone.stats.join(' · ')}</p>
        )}
        {!isJourney && milestone.next && (
          <p className="mt-3 text-body-sm text-muted">
            Up next: <span className="font-medium text-text">{milestone.next}</span>
          </p>
        )}

        {milestone.gems != null && milestone.gems > 0 && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-pill bg-signal-bg px-4 py-2 text-body-sm font-bold text-signal-strong">
            <Gem className="h-4 w-4" /> +{milestone.gems} Gems
          </div>
        )}

        {isJourney && milestone.certificate && <Certificate title={milestone.title} />}

        <div className="mt-6 flex items-center gap-2 print:hidden">
          {isJourney && milestone.certificate && (
            <Button variant="secondary" size="lg" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
          <Button size="lg" onClick={onDismiss} className="flex-1">
            {isJourney ? 'Done' : 'Keep going'}
          </Button>
        </div>
        {isJourney && milestone.homeHref && (
          <a href={milestone.homeHref} className="mt-3 inline-block text-body-sm font-medium text-primary-strong underline-offset-2 hover:underline print:hidden">
            Back to the course home
          </a>
        )}
      </div>
    </div>
  )
}
