'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Flame, Check, ChevronDown } from 'lucide-react'
import { LogPracticeButton } from './log-practice-button'
import { STREAK_MILESTONES, streakProgress } from '@/lib/streak'
import type { Practice } from '@/lib/practices'

const COLLAPSE_KEY = 'fq_streak_collapsed'

// Feed streak tracker + practice reminders (the WAM North-Star surface). The
// streak is a Duolingo-style progress bar toward award checkpoints; it collapses
// to a skinny line, but the reminders (the practices to log, or the caught-up
// note) stay visible either way. Renders nothing when there's no streak AND
// nothing to log.
export function PracticePrompt({
  practices,
  streak = 0,
  atRisk = false,
  loggedToday = false,
}: {
  practices: Practice[]
  streak?: number
  /** Streak is alive but today isn't logged yet — log to keep it. */
  atRisk?: boolean
  /** A practice was already logged today (streak is safe). */
  loggedToday?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // One-time read of the persisted preference on mount. We render the default
    // (expanded) on the server, then apply the stored choice client-side, so there
    // is no hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  if (practices.length === 0 && streak <= 0) return null

  const p = streakProgress(streak)
  const hasReminders = practices.length > 0

  // Collapsed → a single skinny line (~1/3 the open height): streak + a slim inline
  // progress bar + the expand chevron. Reminders/checkpoints only show when open.
  if (collapsed) {
    return (
      <div className="mb-6 rounded-xl border border-primary-bg bg-primary-bg/30 px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
            <Flame className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 truncate text-xs font-bold text-text">
            {streak > 0 ? `${streak} day streak` : 'Start your streak'}
            <span className="ml-1.5 font-normal text-muted">
              {p.maxed ? '· legend' : p.next ? `· ${p.toNext} to ${p.next.day}-day` : ''}
            </span>
          </p>
          <div className="ml-auto h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand streak"
            aria-expanded={false}
            className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-primary-bg bg-primary-bg/30 p-4">
      {/* Streak header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
            <Flame className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-text">
              {streak > 0 ? `${streak} day streak` : 'Start your streak'}
            </p>
            <p className={`text-2xs leading-tight ${atRisk ? 'font-semibold text-warning' : 'text-muted'}`}>
              {atRisk
                ? 'Log today to keep your streak alive.'
                : loggedToday && p.next
                  ? `Logged today. ${p.toNext} ${p.toNext === 1 ? 'day' : 'days'} to your ${p.next.day}-day badge`
                  : p.maxed
                    ? 'Every badge earned. Legend.'
                    : p.next
                      ? `${p.toNext} ${p.toNext === 1 ? 'day' : 'days'} to your ${p.next.day}-day badge`
                      : 'Log a practice to begin'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand streak' : 'Collapse streak'}
          aria-expanded={!collapsed}
          className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Progress bar — always shown (slim); checkpoints only when expanded. */}
      <div className="mt-2.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${p.pct}%` }}
          />
        </div>

        {!collapsed && (
          <div className="mt-2.5 flex items-center justify-between gap-1">
            {STREAK_MILESTONES.map((m) => {
              const hit = m.day <= streak
              const isNext = p.next?.day === m.day
              return (
                <div key={m.day} className="flex flex-col items-center gap-1" title={`${m.label} · ${m.day} days`}>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-3xs font-bold transition-colors ${
                      hit
                        ? 'bg-primary text-on-primary'
                        : isNext
                          ? 'bg-surface text-primary-strong ring-2 ring-primary'
                          : 'bg-surface text-subtle'
                    }`}
                  >
                    {hit ? <Check className="h-3 w-3" strokeWidth={3} /> : m.day}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reminders — hidden when collapsed so the box drops to ~half height. */}
      {!collapsed && (
      <div className="mt-3 border-t border-primary-bg pt-3">
        {hasReminders ? (
          <ul className="space-y-2">
            {practices.map((practice) => (
              <li key={practice.id} className="flex items-center justify-between gap-3">
                <Link
                  href={`/practices/${practice.id}`}
                  className="min-w-0 truncate text-sm text-text transition-colors hover:text-primary-strong"
                >
                  {practice.title}
                </Link>
                <span className="shrink-0">
                  <LogPracticeButton
                    practiceId={practice.id}
                    timerKind={practice.timer_kind}
                    mindlessMode={practice.mindless_mode}
                    movementConfig={practice.movement_config}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" />
            <p className="text-sm text-muted">
              {streak > 0
                ? 'All caught up. Come back tomorrow to keep your streak alive.'
                : 'Adopt a practice to start a streak.'}
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
