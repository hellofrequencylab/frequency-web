'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, Check, ChevronDown, Sparkles, Heart, Compass, Map, Users } from 'lucide-react'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { STREAK_MILESTONES, streakProgress } from '@/lib/streak'
import type { Practice } from '@/lib/practices'
import type { PillarCount } from '@/lib/pillars'

// The graduated home surface. Once a member finishes activation, the streak box
// "levels up" into this: a multi-purpose journey guide + resource center that takes
// the top of the feed. It's meant to be inspirational and useful, NOT a wall of
// meters — three calm blocks: where your streak stands, the one move for today, and
// a few warm doors back into the place. (Pillar balance + your active Journey plan
// land here once the Journey-plan library ships — see docs/BACKLOG.md §Q.)

const COLLAPSE_KEY = 'fq_journey_board_collapsed'

// A small, tasteful line of encouragement keyed to where the streak is — warmth,
// not confetti, and never a score.
function encouragement(streak: number): string {
  if (streak <= 0) return 'A fresh page. Log one practice today and your story here begins.'
  if (streak < 3) return 'You showed up. That’s the whole game — keep the thread going.'
  if (streak < 7) return 'A rhythm is forming. This is how it starts to feel like yours.'
  if (streak < 30) return 'You’re building something real, one day at a time.'
  return 'Steady and lit. You’ve made this a way of being, not a task.'
}

const RESOURCES = [
  { href: '/practices', label: 'Practices', Icon: Heart },
  { href: '/crew/quests', label: 'Quests', Icon: Map },
  { href: '/circles', label: 'Circles', Icon: Users },
] as const

export function JourneyBoard({
  practices,
  streak = 0,
  pillarBalance,
}: {
  practices: Practice[]
  streak?: number
  /** The member's adopted practices counted per Pillar (all four, zero-filled). */
  pillarBalance?: PillarCount[]
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
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

  const p = streakProgress(streak)
  const hasReminders = practices.length > 0

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary-bg bg-primary-bg/30">
      {/* Hero band: streak + a warm, un-gamified line. */}
      <div className="relative px-4 pt-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/10 to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
              <Flame className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-text">
                {streak > 0 ? `${streak} day streak` : 'Your journey'}
                {!p.maxed && p.next && (
                  <span className="ml-1.5 font-medium text-muted">
                    · {p.toNext} {p.toNext === 1 ? 'day' : 'days'} to your {p.next.day}-day badge
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">{encouragement(streak)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Streak progress — slim bar always; milestone pips when expanded. */}
        <div className="mt-3">
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
                  <span
                    key={m.day}
                    title={`${m.label} · ${m.day} days`}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                      hit
                        ? 'bg-primary text-on-primary'
                        : isNext
                          ? 'bg-surface text-primary-strong ring-2 ring-primary'
                          : 'bg-surface text-subtle'
                    }`}
                  >
                    {hit ? <Check className="h-3 w-3" strokeWidth={3} /> : m.day}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Today's move — the one action, always visible. */}
      <div className="mx-4 mt-3 border-t border-primary-bg pt-3">
        {hasReminders ? (
          <ul className="space-y-2">
            {practices.map((practice) => (
              <li key={practice.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-text">{practice.title}</span>
                <LogPracticeButton practiceId={practice.id} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" />
            <p className="text-sm text-muted">
              {streak > 0
                ? 'All caught up. Come back tomorrow to keep your streak alive.'
                : 'Adopt a practice to start your streak.'}
            </p>
          </div>
        )}
      </div>

      {/* Pillar balance — a calm read of where your practice sits across the four
          Pillars. Coverage, not a score. */}
      {!collapsed && pillarBalance && pillarBalance.length > 0 && (
        <div className="mt-3 border-t border-primary-bg px-4 pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-subtle">Your pillars</p>
          <div className="flex gap-1.5">
            {pillarBalance.map((p) => (
              <div
                key={p.slug}
                className={`flex-1 rounded-lg px-2 py-1.5 text-center ${
                  p.count > 0 ? 'bg-surface' : 'bg-surface/50'
                }`}
              >
                <p className={`text-sm font-bold tabular-nums ${p.count > 0 ? 'text-text' : 'text-subtle'}`}>
                  {p.count}
                </p>
                <p className="text-[10px] text-subtle">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource center — a few warm doors back into the place. */}
      {!collapsed && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-primary-bg bg-surface/40 px-3 py-2.5">
          <Compass className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="mr-0.5 text-xs font-medium text-subtle">Keep exploring</span>
          {RESOURCES.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary-strong"
            >
              <Icon className="h-3 w-3" /> {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
