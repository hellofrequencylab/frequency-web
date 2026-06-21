'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, Check, ChevronDown, Sparkles, Heart, Compass, Map, Users, Route, ArrowRight, Snowflake } from 'lucide-react'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { StandingTiles } from '@/components/gamification/standing-tiles'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { STREAK_MILESTONES, streakProgress } from '@/lib/streak'
import type { Practice, PartialPracticeToday } from '@/lib/practices'
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
  if (streak < 3) return 'You showed up. That’s the whole game, so keep the thread going.'
  if (streak < 7) return 'A rhythm is forming. This is how it starts to feel like yours.'
  if (streak < 30) return 'You’re building something real, one day at a time.'
  return 'Steady and lit. You’ve made this a way of being, not a task.'
}

const RESOURCES = [
  { href: '/practices', label: 'Practices', Icon: Heart },
  { href: '/journeys', label: 'Journeys', Icon: Map },
  { href: '/circles', label: 'Circles', Icon: Users },
] as const

export function JourneyBoard({
  practices,
  partials = [],
  streak = 0,
  zaps = 0,
  gems = 0,
  rank,
  atRisk = false,
  loggedToday = false,
  freezeTokens = 0,
  willFreezeProtect = false,
  stageIndex = 99,
  pillarBalance,
  activeJourney,
}: {
  practices: Practice[]
  /** Practices started but not finished today (a partial timed log). Each renders a
   *  "Finish Practice" row that resumes the right timer where the member left off. */
  partials?: PartialPracticeToday[]
  streak?: number
  /** Season zaps — the standing scoreboard count (gamified-stat law, §2). */
  zaps?: number
  /** Lifetime gems — the standing scoreboard count (matches /crew + profile). */
  gems?: number
  /** Season rank, from lib/season-ranks. The one source of truth for the badge. */
  rank?: SeasonRank
  /** Member stage index (lib/member-progress). Drives progressive reveal of the
   *  lower panels; defaults high so an un-staged caller shows everything. */
  stageIndex?: number
  /** Streak is alive but today isn't logged yet — log to keep it. */
  atRisk?: boolean
  /** A practice was already logged today (streak is safe). */
  loggedToday?: boolean
  /** Banked freeze tokens that can absorb a missed day. */
  freezeTokens?: number
  /** A freeze would automatically protect today if missed. */
  willFreezeProtect?: boolean
  /** The member's adopted practices counted per Pillar (all four, zero-filled). */
  pillarBalance?: PillarCount[]
  /** The member's top enrolled journey — a slim "current step" line that links to
   *  the My Quest hub. Undefined = no enrolled journey. `done`/`total` are
   *  phases complete vs total; `nextStepTitle` is the next lesson (v2; ADR-253). */
  activeJourney?: {
    title: string
    href: string
    done: number
    total: number
    nextStepTitle: string | null
  }
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
  const hasReminders = practices.length > 0 || partials.length > 0

  // Closed position: one slim row (about a third of the open board) — the flame,
  // the count, a thin progress bar, and the expand control. Everything else waits
  // behind the chevron.
  if (collapsed) {
    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-primary-bg bg-primary-bg/30">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
            <Flame className="h-3 w-3" />
          </span>
          <p className="shrink-0 text-sm font-bold leading-tight text-text">
            {streak > 0 ? `${streak} day streak` : 'Your journey'}
          </p>
          {freezeTokens > 0 && (
            <span
              title={`${freezeTokens} streak freeze${freezeTokens === 1 ? '' : 's'} banked, bridges a missed day`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-signal-bg/50 px-1.5 py-0.5 text-3xs font-semibold text-signal-strong"
            >
              <Snowflake className="h-3 w-3" />{freezeTokens}
            </span>
          )}
          {atRisk && !willFreezeProtect && (
            <span className="hidden truncate text-xs text-muted sm:inline">Log one practice today to keep it.</span>
          )}
          <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${p.pct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand"
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
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold leading-tight text-text">
                <span>{streak > 0 ? `${streak} day streak` : 'Your journey'}</span>
                {!p.maxed && p.next && (
                  <span className="font-medium text-muted">
                    · {p.toNext} {p.toNext === 1 ? 'day' : 'days'} to your {p.next.day}-day badge
                  </span>
                )}
                {freezeTokens > 0 && (
                  <span
                    title={`${freezeTokens} streak freeze${freezeTokens === 1 ? '' : 's'} banked, bridges a missed day`}
                    className="inline-flex items-center gap-0.5 rounded-full bg-signal-bg/50 px-1.5 py-0.5 text-3xs font-semibold text-signal-strong"
                  >
                    <Snowflake className="h-3 w-3" />{freezeTokens}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                {atRisk
                  ? willFreezeProtect
                    ? 'Today’s not logged yet. A freeze has you covered, but logging keeps it clean.'
                    : 'Log one practice today to keep your streak alive.'
                  : encouragement(streak)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {rank && (
              <Link
                href="/crew"
                title={`Season rank · ${RANK_LABELS[rank] ?? rank}`}
                className="rank-badge text-2xs font-bold leading-tight"
                style={seasonRankStyle(rank)}
              >
                {RANK_LABELS[rank] ?? rank}
              </Link>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse"
              aria-expanded
              className="rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
            >
              <ChevronDown className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>

        {/* Standing scoreboard — the unified four counts (Zaps · Gems · Streak),
            the same kit tiles the rail and /crew use (MEMBER-DESIGN-SYSTEM §2).
            Rank rides as the badge above. */}
        <div className="mt-3">
          <StandingTiles
            variant="compact"
            zaps={zaps}
            gems={gems}
            streak={streak}
            rank={rank ?? 'ghost'}
            links={{ zaps: '/crew/leaderboard', gems: '/crew/store', streak: '/crew/leaderboard' }}
          />
        </div>

        {/* Streak progress — slim bar + milestone pips. */}
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${p.pct}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-1">
            {STREAK_MILESTONES.map((m) => {
              const hit = m.day <= streak
              const isNext = p.next?.day === m.day
              return (
                <span
                  key={m.day}
                  title={`${m.label} · ${m.day} days`}
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
              )
            })}
          </div>
        </div>
      </div>

      {/* Today's move — the one action, always visible. */}
      <div className="mx-4 mt-3 border-t border-primary-bg pt-3">
        {hasReminders ? (
          <ul className="space-y-2">
            {/* Partials first — a started-but-unfinished sit reads "Finish Practice" and
                resumes the right timer where the member left off. */}
            {partials.map(({ practice, secondsDone, secondsTarget }) => (
              <li key={`partial-${practice.id}`} className="flex items-center justify-between gap-3">
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
                    resumeFromSec={secondsDone}
                    secondsTarget={secondsTarget}
                  />
                </span>
              </li>
            ))}
            {/* To-log practices — one smart button per row, routed by the practice's timer kind. */}
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
              {loggedToday || streak > 0
                ? 'All caught up. Come back tomorrow to keep your streak alive.'
                : 'Adopt a practice to start your streak.'}
            </p>
          </div>
        )}
      </div>

      {/* Your journey — a slim "current step" line; the full tab lives at the link. */}
      {activeJourney && (
        <Link
          href={activeJourney.href}
          className="group mx-4 mt-3 flex items-center gap-2.5 border-t border-primary-bg pt-3"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong">
            <Route className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">
              {activeJourney.nextStepTitle
                ? `Next: ${activeJourney.nextStepTitle}`
                : `Keep going in ${activeJourney.title}`}
            </p>
            <p className="truncate text-2xs text-subtle">
              {activeJourney.title}
              {activeJourney.total > 0 ? ` · ${activeJourney.done}/${activeJourney.total} phases done` : ''}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-colors group-hover:text-primary-strong" />
        </Link>
      )}

      {/* Pillar balance — a calm read of where your practice sits across the four
          Pillars. Coverage, not a score. */}
      {stageIndex >= 3 && pillarBalance && pillarBalance.length > 0 && (
        <div className="mt-3 border-t border-primary-bg px-4 pt-3">
          <p className="mb-1.5 text-2xs font-medium text-subtle">Your pillars</p>
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
                <p className="text-3xs text-subtle">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource center — a few warm doors back into the place. Held back until a
          member is past the very first days so the board stays focused early on. */}
      {stageIndex >= 2 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-primary-bg bg-surface/40 px-3 py-2.5">
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
