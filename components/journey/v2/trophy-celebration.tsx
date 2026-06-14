'use client'

// Journeys v2 — the trophy celebration (ADR-252, JOURNEYS.md §6). The "present it in a fun way"
// moment: a full-screen card when a learner finishes a Phase or the whole Journey, with the
// trophy, the milestone name, and the Gems earned. A Journey finish with certificates enabled
// also shows a printable certificate card. Modeled on the season celebration's card/Burst/anim
// pattern (token-only colors, reduced-motion safe), but milestone-aware and season-free.

import { useEffect } from 'react'
import { Trophy, Gem, X, Sparkles, Award, Printer } from 'lucide-react'

export interface TrophyMilestone {
  kind: 'phase' | 'journey'
  /** Phase title (kind 'phase') or Journey title (kind 'journey'). */
  title: string
  gems?: number
  /** Show the printable certificate (Journey finish only, when the plan enables it). */
  certificate?: boolean
}

function Burst() {
  // A ring of token-colored sparks. Purely decorative; no layout impact; hidden under reduced motion.
  const sparks = Array.from({ length: 12 })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {sparks.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-primary motion-reduce:hidden"
          style={{
            transform: `rotate(${(360 / sparks.length) * i}deg) translateY(-120px)`,
            opacity: 0.7,
            animation: 'cue-pop 600ms cubic-bezier(0.34,1.56,0.64,1) both',
            animationDelay: `${i * 35}ms`,
          }}
        />
      ))}
    </div>
  )
}

function Certificate({ title }: { title: string }) {
  return (
    <div className="mt-5 rounded-2xl border-2 border-rank-gold/40 bg-canvas p-5 text-center">
      <Award className="mx-auto h-7 w-7 text-rank-gold" strokeWidth={1.75} />
      <p className="mt-2 text-2xs font-bold uppercase tracking-widest text-rank-gold">Certificate of completion</p>
      <p className="mt-2 text-base font-bold text-text">{title}</p>
      <p className="mt-1 text-xs text-muted">Completed on Frequency</p>
    </div>
  )
}

export function TrophyCelebration({ milestone, onDismiss }: { milestone: TrophyMilestone; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const isJourney = milestone.kind === 'journey'
  const eyebrow = isJourney ? 'Journey complete' : 'Phase complete'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary-bg bg-surface p-8 text-center shadow-2xl animate-[slideUp_0.45s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <Burst />
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-lg p-1 text-subtle transition-colors hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-bg text-primary-strong animate-[cue-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)]">
          <Trophy className="h-10 w-10" strokeWidth={1.75} />
        </div>

        <p className="mt-5 inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-primary-strong">
          <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
        </p>
        <h2 className="mt-1.5 text-balance text-xl font-bold text-text">{milestone.title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
          {isJourney ? 'That is the whole program, start to finish.' : 'One phase down. The trophy is yours.'}
        </p>

        {milestone.gems != null && milestone.gems > 0 && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-signal-bg px-4 py-2 text-sm font-bold text-signal-strong">
            <Gem className="h-4 w-4" /> +{milestone.gems} Gems
          </div>
        )}

        {isJourney && milestone.certificate && <Certificate title={milestone.title} />}

        <div className="mt-6 flex items-center gap-2">
          {isJourney && milestone.certificate && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          )}
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {isJourney ? 'Done' : 'Keep going'}
          </button>
        </div>
      </div>
    </div>
  )
}
