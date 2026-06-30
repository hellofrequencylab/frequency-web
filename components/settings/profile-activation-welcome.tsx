import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'
import type { OnboardingStatus } from '@/lib/onboarding/status'

// A small first-visit welcome at the top of Edit Profile. Edit Profile is the
// landing spot for the very first activation step (Add a profile photo), but
// arriving here cold gives no sense of the bigger "getting set up" arc — so a
// member who jumps straight to settings loses the thread the feed guide carries.
// This banner reuses the SAME activation status (getOnboardingStatus) the feed
// guide reads, so the two can never disagree, and borrows its azure `broadcast`
// shades and warm voice. It's a quiet orientation cue, not a second guide: no
// step list, no tour, no dismiss — just "here's where you are, and here's the
// next thing." It returns null once activation is complete, so established
// members never see it.

// A warm, progress-keyed line — mirrors the feed guide's `activationNote` voice so
// the two surfaces feel of a piece. Reads only the status counts (no extra data).
function welcomeNote(doneCount: number, total: number): string {
  if (doneCount <= 0) return 'Welcome in. A few small steps and Frequency starts to feel like yours.'
  if (doneCount < total - 1) return 'You’re finding your footing — keep going, you’re most of the way in.'
  return 'So close. One more and you’re fully set up here.'
}

export function ProfileActivationWelcome({
  status,
  name,
}: {
  status: OnboardingStatus
  name?: string
}) {
  const current = status.current
  if (!current) return null // activation complete — nothing to orient toward

  const firstName = name?.trim().split(/\s+/)[0] || ''
  const greeting = firstName ? `Welcome, ${firstName}` : 'Welcome'
  const lastStepLeft = status.todo.length === 1

  return (
    <div className="mb-6 rounded-2xl border border-broadcast-bg bg-broadcast-bg/40 p-4 dark:bg-broadcast-bg/20">
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-broadcast-strong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-broadcast-strong/80">
            {lastStepLeft
              ? 'Almost there — one step left'
              : `${greeting} · ${status.doneCount} of ${status.total} done`}
          </p>
          <h2 className="text-base font-bold leading-tight text-text">{current.headline}</h2>
          <p className="mt-0.5 text-sm leading-snug text-muted">{welcomeNote(status.doneCount, status.total)}</p>
        </div>
      </div>

      {/* At-a-glance "where am I" — the same segmented stepper shape as the feed guide. */}
      <div
        className="mt-3 flex gap-1.5"
        role="img"
        aria-label={`Setup progress: ${status.doneCount} of ${status.total} steps done`}
      >
        {status.steps.map((s) => (
          <span
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              s.done ? 'bg-broadcast' : s.key === current.key ? 'bg-broadcast/40' : 'bg-broadcast-bg'
            }`}
          />
        ))}
      </div>

      {/* One CTA — the next thing to do. The full step list lives on the feed guide;
          here we just point the way so this stays an orientation cue, not a clone. */}
      <div className="mt-3">
        <Link
          href={current.href}
          className="inline-flex items-center gap-1.5 rounded-xl border border-broadcast-bg px-4 py-2 text-sm font-medium text-broadcast-strong transition-colors hover:bg-broadcast-bg/50"
        >
          {current.cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
