import Link from 'next/link'
import { Trophy } from 'lucide-react'
import {
  SEASON_RANKS,
  RANK_LABELS,
  seasonRankStyle,
  rankProgress,
  type SeasonRank,
} from '@/lib/season-ranks'
import {
  EXPRESSION_PILLAR_LABEL,
  ExpressionIcon,
  expressionPillarStyle,
} from '@/lib/quest/expression-pillar'

// JourneyRank — the rank ladder that lives at the top of the Journey page, where
// rank actually advances (the audit's core fix: the Journey view rendered zero rank
// context). Season rank = Journeys finished this season: Ghost → Initiate → Adept →
// Master. This band always NAMES the next requirement ("Finish a Journey to reach
// Adept" / "1 Journey to Master"), so the stakes are visible while a member practices.
//
// It also frames the four Pillars at the top of the Journey view: Mind / Body / Spirit
// carry the Journeys, and Expression (its own accent) is the capstone built into every
// one, so a member reads "all four Pillars" before scrolling to a single Journey.
//
// Presentational + server-friendly (no hooks): the caller fetches the finished count
// and the current rank and passes them in.
//
//   <JourneyRank rank="initiate" journeysFinished={1} seasonName="Bloom"
//     rankHref="/crew/achievements" />

export function JourneyRank({
  rank,
  journeysFinished,
  seasonName,
  rankHref,
}: {
  rank: SeasonRank
  /** Journeys finished this season — drives the ladder + the next-rung line. */
  journeysFinished: number
  /** Optional season name for the eyebrow ("Season · Bloom"). */
  seasonName?: string
  /** Where the rank crest links (e.g. /crew/achievements). */
  rankHref?: string
}) {
  const { def, next, pct } = rankProgress(journeysFinished)
  const toNext = next ? Math.max(0, next.minJourneys - journeysFinished) : 0

  // The next requirement, always named and always plain. One Journey finished
  // moves you up one rung; we never narrate feelings, every count is a real act.
  const nextLine = next
    ? toNext <= 1
      ? `Finish a Journey to reach ${next.label}.`
      : `${toNext} Journeys to ${next.label}.`
    : 'Top rank reached. Master.'

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg/55 via-surface to-surface shadow-sm dark:from-primary-bg/20">
      {/* Crest band — rank identity + the next requirement, named. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <div className="flex items-center gap-3.5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-on-primary shadow-sm"
            style={{ background: `var(--rank-${def.rankKey})` }}
            aria-hidden
          >
            <Trophy className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
              {seasonName ? `Season · ${seasonName}` : 'Season rank'}
            </p>
            <p className="flex items-center gap-2 text-xl font-bold leading-tight text-text">
              {RANK_LABELS[rank] ?? rank}
              <span className="rank-badge text-2xs" style={seasonRankStyle(rank)}>
                {def.label}
              </span>
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">{nextLine}</p>
      </div>

      {/* The ladder — the progress fill + the four-rung spine, each rung a real
          milestone (Journeys finished), so the climb reads as honest work, not a meter. */}
      <div className="px-5 py-5 sm:px-7">
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full transition-all ${def.color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <ol className="mt-2.5 flex justify-between">
          {SEASON_RANKS.map((r) => {
            const achieved = journeysFinished >= r.minJourneys
            const current = r.rank === rank
            return (
              <li key={r.rank} className="flex flex-col items-center gap-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full ring-2 transition-all ${
                    current
                      ? `${r.color} ring-current ring-offset-1`
                      : achieved
                        ? `${r.color} ring-transparent`
                        : 'bg-border-strong ring-transparent'
                  }`}
                  aria-hidden
                />
                <span
                  className={`text-2xs font-semibold leading-none ${current ? r.text : 'text-subtle'}`}
                >
                  {r.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {/* The four Pillars — Mind / Body / Spirit carry the Journeys; Expression is the
          capstone woven into every one. Named here so the Journey view leads with all
          four, not just the three practice Pillars. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-5 py-3 sm:px-7">
        <span className="text-2xs font-semibold uppercase tracking-widest text-subtle">
          The four Pillars
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted">
          <span>Mind</span>
          <span aria-hidden className="text-border-strong">·</span>
          <span>Body</span>
          <span aria-hidden className="text-border-strong">·</span>
          <span>Spirit</span>
          <span aria-hidden className="text-border-strong">·</span>
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ ...expressionPillarStyle(), color: 'var(--rank-deep)' }}
          >
            <ExpressionIcon className="h-3 w-3" aria-hidden />
            {EXPRESSION_PILLAR_LABEL}
          </span>
        </span>
        <span className="w-full text-2xs text-subtle">
          Every Journey ends with its Expression Challenge.
        </span>
      </div>

      {rankHref && (
        <div className="border-t border-border px-5 py-2.5 sm:px-7">
          <Link
            href={rankHref}
            className="inline-flex items-center text-xs font-semibold text-primary-strong transition-colors hover:text-primary motion-reduce:transition-none"
          >
            See your Trophies and Awards
          </Link>
        </div>
      )}
    </section>
  )
}
