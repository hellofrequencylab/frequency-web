import Link from 'next/link'
import { Compass, Check, Sparkles, ArrowRight } from 'lucide-react'
import type { OnboardingStatus } from '@/lib/onboarding/status'

// The persistent activation guide that owns the top of the feed until a member is
// fully set up (join a circle → adopt a practice → log it). Unlike the old
// "Find your first circle" box, it does NOT vanish the moment you join a circle —
// it advances through the remaining steps and only graduates (into the JourneyBoard)
// once every step is done. Teal (`signal`) so it reads as "getting set up", distinct
// from the warm amber of the home surfaces below it. Lightweight and inviting by
// design — a short headline, a slim bar, and a compact checklist, not a wall.

export function FeedOnboardingGuide({ status }: { status: OnboardingStatus }) {
  const current = status.current
  if (!current) return null // complete — the JourneyBoard takes over

  return (
    <div className="mb-6 rounded-2xl border border-signal-bg bg-signal-bg/40 p-4 dark:bg-signal-bg/20">
      {/* Header: the current step's invitation + progress */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-signal-bg text-signal-strong">
            <Compass className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-text">{current.headline}</h2>
            <p className="mt-0.5 text-sm leading-snug text-muted">{current.blurb}</p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold tabular-nums text-signal-strong">{status.pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-signal-bg">
        <div
          className="h-full rounded-full bg-signal transition-all duration-500"
          style={{ width: `${status.pct}%` }}
        />
      </div>

      {/* Compact step checklist — done steps tick off; the current one is emphasized. */}
      <div className="mt-3 space-y-0.5">
        {status.steps.map((step) => {
          const isCurrent = step.key === current.key
          return (
            <Link
              key={step.key}
              href={step.href}
              className={`group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors ${
                step.done ? 'cursor-default' : 'hover:bg-signal-bg/60'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? 'bg-success-bg text-success'
                    : isCurrent
                      ? 'bg-signal text-on-signal'
                      : 'border border-signal-bg text-subtle'
                }`}
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span
                className={`flex-1 text-sm ${
                  step.done
                    ? 'text-subtle line-through decoration-success/40'
                    : isCurrent
                      ? 'font-semibold text-text'
                      : 'text-muted'
                }`}
              >
                {step.label}
              </span>
              {!step.done && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-signal-strong opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </Link>
          )
        })}
      </div>

      {/* CTAs — the current step's action + a warm Vera offer. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={current.href}
          className="inline-flex items-center gap-1.5 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-on-signal transition-colors hover:opacity-90"
        >
          {current.cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/feed?welcome=vera&v=chat"
          className="inline-flex items-center gap-1.5 rounded-xl border border-signal-bg px-4 py-2 text-sm font-medium text-signal-strong transition-colors hover:bg-signal-bg/50"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask Vera
        </Link>
      </div>
    </div>
  )
}
