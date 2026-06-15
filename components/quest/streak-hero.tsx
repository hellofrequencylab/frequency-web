'use client'

// StreakHero — the daily practice streak, redesigned for bounded forgiveness
// (the audience-research move: streaks built on loss aversion produce anxiety and
// all-or-nothing collapse; a small reserve + "never miss twice" + a planned pause
// keep people showing up without shame).
//
// Five states, one calm voice — never "you lost your streak":
//   logged_today — lit; today's done.
//   at_risk      — alive, today not logged yet; names the situation, no alarm.
//   resting      — the member set a planned break; the streak waits, no warning.
//   broken       — calm restart: "Pick it back up today. Your best is still here."
//   none         — first run.
//
// The reserve (banked freeze tokens, 1–2 grace days) is surfaced as a safety net
// that auto-bridges one slip. The pause is the "life happens" rest window.
//
// Reduced-motion safe: the milestone celebration rises via the shared `slideUp`
// keyframe, which globals.css disables under prefers-reduced-motion, so a member
// who asked for less motion gets the static card. The flame never animates.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Shield, Check, Pause, Play, PartyPopper } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { STREAK_MILESTONES } from '@/lib/streak'
import type { PracticeStreakState } from '@/lib/practice-streak'
import { pauseStreak, resumeStreak } from '@/app/(main)/crew/streaks/actions'

interface Progress {
  pct: number
  next: { day: number; label: string } | null
  toNext: number
}

/** How long the rest window runs when a member chooses to rest. Bounded server-side. */
const REST_DAYS = 7

export function StreakHero({
  streak,
  progress,
  restEndsLabel,
}: {
  streak: PracticeStreakState
  progress: Progress
  /** Human date the active rest window ends (server-formatted), if resting. */
  restEndsLabel: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const run = (fn: () => Promise<{ data: unknown } | { error: string }>) =>
    start(async () => {
      setNote(null)
      const res = await fn()
      if (isError(res)) {
        setNote(res.error)
        return
      }
      router.refresh()
    })

  const { status, current, longest, freezeTokens, reserveCap, resting } = streak
  const lit = current >= 1 && (status === 'logged_today' || status === 'at_risk')
  const milestoneJustHit =
    status === 'logged_today' && STREAK_MILESTONES.some((m) => m.day === current)

  // The flame leads; its color reads the state, not the count alone.
  const flameTone =
    status === 'logged_today' ? 'text-primary'
    : status === 'at_risk' ? 'text-warning'
    : resting ? 'text-signal-strong'
    : 'text-subtle'
  const flameBg =
    status === 'logged_today' ? 'bg-primary-bg'
    : status === 'at_risk' ? 'bg-warning-bg'
    : resting ? 'bg-signal-bg/50'
    : 'bg-surface-elevated'

  return (
    <section
      aria-labelledby="streak-hero-title"
      className="overflow-hidden rounded-3xl border border-primary-bg bg-gradient-to-br from-primary-bg/40 via-surface to-surface p-5 shadow-sm sm:p-6 dark:from-primary-bg/15"
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${flameBg}`}
          aria-hidden
        >
          {resting ? <Pause className={`h-8 w-8 ${flameTone}`} /> : <Flame className={`h-8 w-8 ${flameTone}`} />}
        </span>

        <div className="min-w-0 flex-1">
          <h2 id="streak-hero-title" className="text-sm font-semibold text-text">
            Daily practice streak
          </h2>

          {/* The number + the supporting counts. */}
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold leading-none tabular-nums text-text">{current}</span>
            <span className="text-sm text-subtle">{current === 1 ? 'day' : 'days'}</span>
          </div>

          {/* The state line — names the situation, never narrates a feeling. */}
          <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">
            {status === 'logged_today' && (lit ? 'Logged today. You’re set until tomorrow.' : 'Logged today.')}
            {status === 'at_risk' && 'No practice logged yet today. One keeps it going.'}
            {status === 'resting' && (restEndsLabel
              ? `Resting through ${restEndsLabel}. Your streak waits for you.`
              : 'Resting. Your streak waits for you.')}
            {status === 'broken' && 'Pick it back up today. Your best is still here.'}
            {status === 'none' && 'Log one practice and day one starts.'}
          </p>

          {/* The three supporting counts: best, reserve, and a quiet "held" note. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-subtle">
              <span className="font-semibold tabular-nums text-muted">{longest}</span> best
            </span>
            <span className="h-4 w-px bg-border-strong" aria-hidden />
            <span
              className="inline-flex items-center gap-1.5"
              title={`Reserve: up to ${reserveCap} grace ${reserveCap === 1 ? 'day' : 'days'} that bridge a slip automatically`}
            >
              <Shield className="h-4 w-4 text-signal-strong" aria-hidden />
              <span className="font-semibold tabular-nums text-signal">{freezeTokens}</span>
              <span className="text-subtle">in reserve</span>
            </span>
            {streak.reserveHeld && (
              <>
                <span className="h-4 w-px bg-border-strong" aria-hidden />
                <span className="text-subtle">reserve covered a slip</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Milestone celebration — only on the day a checkpoint is reached. Calm,
          reduced-motion safe, and a fact (the badge), not a feeling. */}
      {milestoneJustHit && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2.5 rounded-2xl bg-success-bg/70 px-4 py-3 motion-safe:animate-[slideUp_0.4s_ease-out]"
        >
          <PartyPopper className="h-5 w-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm font-semibold text-success">
            Day {current}. {STREAK_MILESTONES.find((m) => m.day === current)?.label} badge earned.
          </p>
        </div>
      )}

      {/* Milestone progress bar + pips. */}
      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        <ol className="mt-2.5 flex items-start justify-between gap-1">
          {STREAK_MILESTONES.map((m) => {
            const hit = m.day <= current
            const isNext = progress.next?.day === m.day
            return (
              <li
                key={m.day}
                className="flex flex-col items-center gap-1"
                title={`${m.label} · ${m.day} days · +${m.zaps} Zaps`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-2xs font-bold ${
                    hit
                      ? 'bg-primary text-on-primary'
                      : isNext
                        ? 'bg-surface text-primary-strong ring-2 ring-primary'
                        : 'bg-surface-elevated text-subtle'
                  }`}
                >
                  {hit ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : m.day}
                </span>
                <span className="text-2xs text-subtle">{m.label}</span>
              </li>
            )
          })}
        </ol>
        {progress.next && (
          <p className="mt-3 text-xs text-subtle">
            {progress.toNext} {progress.toNext === 1 ? 'day' : 'days'} to the {progress.next.label} badge
            {` · +${STREAK_MILESTONES.find((m) => m.day === progress.next!.day)?.zaps ?? 0} Zaps`}
          </p>
        )}
      </div>

      {/* The "life happens" pause — a planned break, not a failure. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-strong/60 pt-4">
        <p className="text-xs text-muted">
          {resting
            ? 'Resting is part of the practice. End it whenever you’re ready.'
            : 'Planning time off? Set a rest so the break doesn’t count against you.'}
        </p>
        {resting ? (
          <button
            type="button"
            onClick={() => run(() => resumeStreak())}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 motion-reduce:transition-none"
          >
            <Play className="h-4 w-4" aria-hidden />
            End rest
          </button>
        ) : (
          <button
            type="button"
            onClick={() => run(() => pauseStreak(REST_DAYS))}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60 motion-reduce:transition-none"
          >
            <Pause className="h-4 w-4" aria-hidden />
            Rest a week
          </button>
        )}
      </div>

      {note && (
        <p className="mt-3 text-xs text-danger" role="alert">
          {note}
        </p>
      )}
    </section>
  )
}
