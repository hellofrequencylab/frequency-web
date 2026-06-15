'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy, Zap, X } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

// HeroMoment — the landmark celebration for the two real Journey landmarks: a Journey
// just finished, and (if it pushed you up a rung) a new rank reached. It earns its
// interruption with facts — the Trophy, the +75 Zaps the finish purse pays, and the
// rank now reached — never an upsell, and it's rationed to a genuine completion (the
// caller only mounts it on a fresh finish).
//
// Reduced-motion safe: the entrance rise plays via the shared `slideUp` keyframe, which
// `globals.css` disables under prefers-reduced-motion, so a member who asked for less
// motion gets the calm, static card. Dismissible (Esc or the close control). Modeled on
// the trophy-celebration card pattern (token-only colors, reduced-motion safe).
//
//   <HeroMoment journeyTitle="Quiet Mornings" zaps={75} rank="adept" rankAdvanced
//     trophiesHref="/crew/achievements" />

export function HeroMoment({
  journeyTitle,
  zaps = 75,
  rank,
  rankAdvanced = false,
  trophiesHref = '/crew/achievements',
}: {
  /** The Journey just finished — names the win concretely. */
  journeyTitle: string
  /** Zaps the finish paid (the +75 finish purse). */
  zaps?: number
  /** The rank now held after the finish. */
  rank: SeasonRank
  /** True when this finish moved the member up a rung (shows the new-rank line). */
  rankAdvanced?: boolean
  /** Where "See your Trophies" links. */
  trophiesHref?: string
}) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <section
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-3xl border border-rank-gold/40 bg-gradient-to-br from-rank-gold/15 via-surface to-surface p-5 shadow-sm motion-safe:animate-[slideUp_0.45s_ease-out] sm:p-7 dark:from-rank-gold/10"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-elevated hover:text-text motion-reduce:transition-none"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-on-primary shadow-sm"
          style={{ background: 'var(--rank-gold)' }}
          aria-hidden
        >
          <Trophy className="h-7 w-7" />
        </span>
        <div className="min-w-0 pr-6">
          <p className="text-2xs font-semibold uppercase tracking-widest text-rank-gold">
            Journey finished
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-text">
            You finished {journeyTitle}.
          </p>

          {/* The facts: a Trophy, the +Zaps purse, and the rank now held. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-2xs">
              <Trophy className="h-3.5 w-3.5 text-rank-gold" aria-hidden />
              Trophy earned
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-2xs">
              <Zap className="h-3.5 w-3.5 text-primary" aria-hidden />
              +{zaps} Zaps
            </span>
            {rankAdvanced && (
              <span className="rank-badge text-2xs" style={seasonRankStyle(rank)}>
                {RANK_LABELS[rank] ?? rank} reached
              </span>
            )}
          </div>

          <div className="mt-4">
            <Link
              href={trophiesHref}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              See your Trophies
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
