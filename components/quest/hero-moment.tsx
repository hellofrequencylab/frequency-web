'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Trophy, Zap, X, Sparkles, ArrowRight } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

// HeroMoment — the landmark celebration for the real Journey landmarks: a Journey
// just finished, the rank it pushed you to, and (at the apex) the whole season
// closed. It earns its interruption with facts — the Trophy, the +75 Zaps the finish
// purse pays, and the rank now reached — never an upsell, and it's rationed to a
// genuine completion (the caller only mounts it on a fresh finish).
//
// Two reads, one component:
//   • Default — "You finished <Journey>." plus the finish facts and the rank reached.
//   • seasonComplete — the 3rd Journey lands you on Master, the season's apex. This is
//     a bigger, distinct beat: "You finished the season." It states the season is done,
//     then RE-LIGHTS the next goal so the win doesn't end in a dead-end (research: beat
//     the post-reward dip by naming the next thing). It points at the next Quest by name
//     and date when one is scheduled, else a plain "the next Quest opens soon", and at
//     the Trophy Case so the win feels kept across the 13-week reset.
//
// Reduced-motion safe: the entrance rise plays via the shared `slideUp` keyframe, which
// `globals.css` disables under prefers-reduced-motion, so a member who asked for less
// motion gets the calm, static card. Dismissible (Esc or the close control). Modeled on
// the trophy-celebration card pattern (token-only colors, reduced-motion safe).
//
// Mounting marks the finish as seen: the auto-fire path on the Quest hub passes an
// `onSeen` callback that records the seen-marker (a server action) so the moment fires
// exactly once. It runs on mount (the member has now seen it), so dismissing or
// navigating away never re-arms it. The `?finished=` link path omits `onSeen` and is
// unchanged, so the contract stays additive.
//
//   <HeroMoment journeyTitle="Quiet Mornings" zaps={75} rank="adept" rankAdvanced
//     trophiesHref="/crew/achievements" onSeen={() => markSeen(id)} />

export interface NextSeason {
  /** The next Quest's name when scheduled (e.g. "Bloom"), else null. */
  name: string | null
  /** Its start date (ISO) when known, else null. */
  startsAt: string | null
}

export function HeroMoment({
  journeyTitle,
  zaps = 75,
  rank,
  rankAdvanced = false,
  seasonComplete = false,
  next = null,
  trophiesHref = '/crew/achievements',
  onSeen,
}: {
  /** The Journey just finished — names the win concretely. */
  journeyTitle: string
  /** Zaps the finish paid (the +75 finish purse). */
  zaps?: number
  /** The rank now held after the finish. */
  rank: SeasonRank
  /** True when this finish moved the member up a rung (shows the new-rank line). */
  rankAdvanced?: boolean
  /** True at the apex — the 3rd Journey lands on Master. Fires the season-complete beat. */
  seasonComplete?: boolean
  /** What comes next, for the season-complete beat's re-light line. */
  next?: NextSeason | null
  /** Where "See your Trophies" links. */
  trophiesHref?: string
  /** Fired once on mount to record this finish as seen (auto-fire path only).
   *  May be a server action — its returned promise is intentionally not awaited. */
  onSeen?: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(true)

  // Record "seen" once, on mount, so the auto-fire moment never fires twice.
  const seenRef = useRef(false)
  useEffect(() => {
    if (seenRef.current) return
    seenRef.current = true
    void onSeen?.()
  }, [onSeen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return seasonComplete ? (
    <SeasonCompleteMoment
      journeyTitle={journeyTitle}
      zaps={zaps}
      next={next}
      trophiesHref={trophiesHref}
      onClose={() => setOpen(false)}
    />
  ) : (
    <FinishMoment
      journeyTitle={journeyTitle}
      zaps={zaps}
      rank={rank}
      rankAdvanced={rankAdvanced}
      trophiesHref={trophiesHref}
      onClose={() => setOpen(false)}
    />
  )
}

// The dismiss control, shared by both reads. 44x44 tap target.
function DismissButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Dismiss"
      className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-elevated hover:text-text motion-reduce:transition-none"
    >
      <X className="h-4 w-4" />
    </button>
  )
}

// ── The default finish / rank-up read ─────────────────────────────────────────
function FinishMoment({
  journeyTitle,
  zaps,
  rank,
  rankAdvanced,
  trophiesHref,
  onClose,
}: {
  journeyTitle: string
  zaps: number
  rank: SeasonRank
  rankAdvanced: boolean
  trophiesHref: string
  onClose: () => void
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-3xl border border-rank-gold/40 bg-gradient-to-br from-rank-gold/15 via-surface to-surface p-5 shadow-sm motion-safe:animate-[slideUp_0.45s_ease-out] sm:p-7 dark:from-rank-gold/10"
    >
      <DismissButton onClose={onClose} />

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

// ── The season-complete read — the apex, and the re-light ─────────────────────
// Master is the season's top. This beat says the season is done in plain words, keeps
// the Master crest, then names what comes next so the win opens a door instead of
// closing one. The reset reads as a Fresh Start: Trophies are kept, the next Quest is
// already on its way.
function SeasonCompleteMoment({
  journeyTitle,
  zaps,
  next,
  trophiesHref,
  onClose,
}: {
  journeyTitle: string
  zaps: number
  next: NextSeason | null
  trophiesHref: string
  onClose: () => void
}) {
  // The re-light line: name and date the next Quest when known, else a plain pointer.
  const nextDate =
    next?.startsAt != null
      ? new Date(next.startsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : null
  const nextLine = next?.name
    ? nextDate
      ? `The next Quest, ${next.name}, opens ${nextDate}.`
      : `The next Quest, ${next.name}, opens soon.`
    : 'The next Quest opens soon.'

  return (
    <section
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-3xl border border-rank-gold/50 bg-gradient-to-br from-rank-gold/20 via-surface to-surface p-6 shadow-md motion-safe:animate-[slideUp_0.5s_ease-out] sm:p-8 dark:from-rank-gold/12"
    >
      <DismissButton onClose={onClose} />

      <div className="max-w-xl pr-6">
        <span
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-on-primary shadow-sm"
          style={{ background: 'var(--rank-gold)' }}
          aria-hidden
        >
          <Trophy className="h-8 w-8" />
        </span>

        <p className="text-2xs font-semibold uppercase tracking-widest text-rank-gold">
          Season complete · Master
        </p>
        <p className="mt-1 text-2xl font-bold leading-tight text-text">
          You finished the season.
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {journeyTitle} was the third Journey. All three are done, every Expression
          Challenge and all, so you reached Master, the top rank this season.
        </p>

        {/* The facts kept: a Trophy and the Master crest. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-2xs">
            <Trophy className="h-3.5 w-3.5 text-rank-gold" aria-hidden />
            Trophy earned
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-primary" aria-hidden />
            +{zaps} Zaps
          </span>
          <span className="rank-badge text-2xs" style={seasonRankStyle('master')}>
            Master reached
          </span>
        </div>

        {/* The re-light — what comes next, so the apex opens a door. The Trophy Case keeps
            the win across the reset; the next Quest is the goal to climb again. */}
        <div className="mt-5 rounded-2xl border border-border bg-surface/70 p-4">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest text-primary-strong">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            What comes next
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text">{nextLine}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Your Trophies are yours to keep. Rank resets for a Fresh Start, so everyone
            climbs the next Quest from the same line.
          </p>
        </div>

        <div className="mt-5">
          <Link
            href={trophiesHref}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
          >
            See your Trophy Case
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
