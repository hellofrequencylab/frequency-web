import Link from 'next/link'
import { Trophy, Check } from 'lucide-react'
import {
  SEASON_RANKS,
  RANK_LABELS,
  seasonRankStyle,
  RANK_TO_KEY,
  type SeasonRank,
} from '@/lib/season-ranks'
import {
  EXPRESSION_PILLAR_LABEL,
  ExpressionIcon,
  expressionPillarStyle,
} from '@/lib/quest/expression-pillar'

// SeasonMap — the Quest hub's signature surface (replaces StandingHero on /crew).
//
// One glanceable read of where you are in the season: three arcs (Mind · Body ·
// Spirit) filling toward Master, the current Journey lit, framed by the season name
// and the weeks left. It answers "how far through the Quest am I?" in under two
// seconds, preattentively — a finished Journey's arc is solid in its rank color, the
// current one glows, the rest sit quiet. Rank tokens only (--rank-* via
// seasonRankStyle); no hardcoded color.
//
// All four Pillars read here. Mind / Body / Spirit carry the three Journey arcs;
// Expression is the capstone built into EVERY Journey (its Expression Challenge), so
// each arc wears a small Expression marker at its crown (done / pending) and the legend
// names Expression beside the three practice Pillars. A member sees Expression is part
// of every Journey, not a fourth Journey or an afterthought.
//
// Pure + presentational (no hooks, no data reads). The page server-fetches the three
// Journeys + their completion state (incl. each Journey's Expression Challenge state)
// and the season frame, and passes them down. The celebratory glow on the current arc
// respects prefers-reduced-motion (a calm static ring is the fallback).

export type JourneyState = 'done' | 'current' | 'upcoming'

/** Each Journey's Expression Challenge state — the capstone that completes it. */
export type ExpressionState = 'done' | 'pending'

export interface SeasonMapJourney {
  /** Stable key + deep link target. */
  slug: string
  /** Journey name (e.g. "Clear"). */
  title: string
  /** The Pillar this Journey carries — its arc label. */
  pillar: 'Mind' | 'Body' | 'Spirit'
  /** A single emoji giving the Journey a face. */
  emoji: string | null
  /** done = finished (a Trophy); current = in its window now; upcoming = not yet open. */
  state: JourneyState
  /** Distinct practice days logged toward the 14-day bar (for the current arc's fill). */
  daysLogged: number
  /** The distinct-days bar (14). */
  daysNeeded: number
  /** This Journey's Expression Challenge: done = completed, pending = not yet. */
  expression: ExpressionState
}

// Each finished Journey lifts the member one rank toward Master. The arc's fill maps
// to that rank's color so the season reads as a climb, not three loose rings.
const RANK_BY_INDEX: readonly SeasonRank[] = ['initiate', 'adept', 'master']

function fillFor(j: SeasonMapJourney): number {
  if (j.state === 'done') return 1
  if (j.state === 'current') {
    return Math.min(1, j.daysNeeded > 0 ? j.daysLogged / j.daysNeeded : 0)
  }
  return 0
}

// One Pillar arc — a semicircle that fills clockwise as the Journey progresses. SVG
// keeps it crisp at any size and lets the fill be a real, accessible fraction.
function PillarArc({
  journey,
  rank,
  index,
}: {
  journey: SeasonMapJourney
  rank: SeasonRank
  index: number
}) {
  const R = 30
  const C = Math.PI * R // semicircle arc length
  const fill = fillFor(journey)
  const current = journey.state === 'current'
  const done = journey.state === 'done'
  const pct = Math.round(fill * 100)
  const expressionDone = journey.expression === 'done'

  // Endowed-progress: never show a stone-cold zero. An open current arc keeps a live
  // track so the climb reads as begun, not absent.
  const trackOpacity = current ? 'opacity-100' : 'opacity-60'

  // The Expression Challenge that caps THIS Journey — named in the arc's label so the
  // 4th Pillar is part of every Journey's screen-reader read, not a silent extra.
  const expressionLabel = `Expression Challenge ${expressionDone ? 'done' : 'pending'}`

  return (
    <li
      className="flex min-w-0 flex-1 flex-col items-center gap-2"
      style={seasonRankStyle(rank)}
    >
      <div className="relative flex h-[68px] w-full items-end justify-center">
        <svg
          viewBox="0 0 80 44"
          className="h-full w-full max-w-[120px]"
          role="img"
          aria-label={`${journey.pillar}: ${journey.title}, ${
            done ? 'finished' : current ? `${pct}% to finish` : 'not started'
          }. ${expressionLabel}.`}
        >
          {/* Track */}
          <path
            d="M 10 40 A 30 30 0 0 1 70 40"
            fill="none"
            stroke="var(--color-surface-elevated)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Fill — the rank color, length = the Journey's progress fraction. */}
          {fill > 0 && (
            <path
              d="M 10 40 A 30 30 0 0 1 70 40"
              fill="none"
              stroke="var(--rank)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - fill)}
              className={`${trackOpacity} transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none`}
            />
          )}
        </svg>

        {/* Expression capstone marker — the 4th Pillar, built into every Journey. It
            crowns the arc in Expression's own accent (plum): a solid Sparkles + check
            when the Expression Challenge is done, a quiet outline while it's pending.
            Decorative here (the SVG label already names it for assistive tech). */}
        <span
          className={`absolute -top-0.5 right-1 flex h-5 w-5 items-center justify-center rounded-full shadow-sm ${
            expressionDone ? '' : 'ring-1'
          }`}
          style={
            expressionDone
              ? { ...expressionPillarStyle(), background: 'var(--rank)', color: 'var(--color-on-primary)' }
              : {
                  ...expressionPillarStyle(),
                  background: 'var(--color-surface)',
                  color: 'var(--rank-deep)',
                  ['--tw-ring-color' as string]: 'var(--rank-bright)',
                }
          }
          aria-hidden
        >
          {expressionDone ? <Check className="h-3 w-3" strokeWidth={3} /> : <ExpressionIcon className="h-3 w-3" />}
        </span>

        {/* The Journey's face, dropped into the arc's mouth. The current one glows
            (a soft pulsing ring); reduced motion gets a steady ring instead. */}
        <span
          className={`absolute bottom-0 flex h-9 w-9 items-center justify-center rounded-full text-base shadow-sm ${
            done
              ? 'text-on-primary'
              : current
              ? 'ring-2 ring-offset-2 ring-offset-surface'
              : 'text-subtle'
          } ${current ? 'motion-safe:animate-pulse' : ''}`}
          style={
            done
              ? { background: 'var(--rank)' }
              : current
              ? {
                  background: 'color-mix(in srgb, var(--rank) 16%, var(--color-surface))',
                  ['--tw-ring-color' as string]: 'var(--rank)',
                  color: 'var(--rank-deep)',
                }
              : { background: 'var(--color-surface-elevated)' }
          }
          aria-hidden
        >
          {journey.emoji ?? index + 1}
        </span>
      </div>

      <div className="w-full text-center">
        <p
          className="text-2xs font-bold uppercase tracking-widest"
          style={current || done ? { color: 'var(--rank-deep)' } : undefined}
        >
          {journey.pillar}
        </p>
        <p
          className={`truncate text-xs font-semibold leading-tight ${
            done || current ? 'text-text' : 'text-subtle'
          }`}
        >
          {journey.title}
        </p>
        <p className="mt-0.5 text-2xs font-medium text-muted">
          {done
            ? 'Finished'
            : current
            ? `${journey.daysLogged} of ${journey.daysNeeded} days`
            : 'Up next'}
        </p>
      </div>
    </li>
  )
}

export function SeasonMap({
  seasonName,
  weeksLeft,
  rank,
  journeysFinished,
  journeys,
  achievementsHref = '/crew/achievements',
}: {
  /** The active Quest's name (e.g. "Stretch"). */
  seasonName: string | null
  /** Whole weeks remaining in the 13-week Quest, or null when no live season. */
  weeksLeft: number | null
  /** The member's current season rank, derived from journeysFinished. */
  rank: SeasonRank
  /** Journeys finished this season (0-3) — drives the rank read. */
  journeysFinished: number
  /** The three Pillar Journeys (Mind, Body, Spirit), already ordered, each carrying
   *  its Expression Challenge state (the 4th Pillar's per-Journey capstone). */
  journeys: SeasonMapJourney[]
  achievementsHref?: string
}) {
  const masterReached = rank === 'master'

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg/55 via-surface to-surface shadow-sm dark:from-primary-bg/20"
      aria-labelledby="season-map-heading"
    >
      {/* Frame — the season is the FRAME, not a card: its name + the time left sit
          at the top, with the rank crest the member is climbing toward. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 pt-6 sm:px-7">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
            {seasonName ? `The Quest · ${seasonName}` : 'The Quest'}
          </p>
          <h2 id="season-map-heading" className="text-xl font-bold leading-tight text-text">
            Your season map
          </h2>
        </div>

        <Link
          href={achievementsHref}
          className="flex items-center gap-2.5 rounded-2xl px-2 py-1 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
          style={seasonRankStyle(rank)}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-primary shadow-sm"
            style={{ background: `var(--rank-${RANK_TO_KEY[rank]})` }}
            aria-hidden
          >
            <Trophy className="h-4 w-4" />
          </span>
          <span className="min-w-0 text-right">
            <span className="block text-2xs font-medium text-subtle">Rank</span>
            <span className="block text-sm font-bold text-text">
              {RANK_LABELS[rank] ?? rank}
            </span>
          </span>
        </Link>
      </div>

      {/* The three arcs — the signature read. Mind → Body → Spirit, filling toward
          Master, each crowned by its Expression Challenge marker (the 4th Pillar built
          into every Journey). A row from the smallest screens (each arc stays legible). */}
      <ul className="mt-5 flex items-start justify-between gap-2 px-4 sm:gap-3 sm:px-7">
        {journeys.map((j, i) => (
          <PillarArc key={j.slug} journey={j} rank={RANK_BY_INDEX[i] ?? 'master'} index={i} />
        ))}
      </ul>

      {/* The four Pillars, named — so the season reads as Mind / Body / Spirit AND
          Expression. The three carry the Journeys; Expression is the capstone woven
          into each one. Plain legend, Expression in its own accent. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-6 sm:px-7">
        <span className="text-2xs font-semibold uppercase tracking-widest text-subtle">
          The four Pillars
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs font-medium text-muted">
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
      </div>
      <p className="mt-1.5 px-6 text-center text-2xs text-subtle sm:px-7">
        Every Journey ends with its Expression Challenge.
      </p>

      {/* The climb line — the same Ghost → Master spine StandingHero uses, so the rank
          ladder reads identically across the app. One pip per finished Journey. */}
      <div className="mt-5 border-t border-border px-6 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {SEASON_RANKS.map((r) => {
              const achieved = journeysFinished >= r.minJourneys
              const isCurrent = r.rank === rank
              return (
                <li key={r.rank} className="flex items-center gap-1.5" style={seasonRankStyle(r.rank)}>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isCurrent ? 'ring-2 ring-offset-1 ring-offset-surface' : ''
                    }`}
                    style={{
                      background: achieved ? 'var(--rank)' : 'var(--color-border-strong)',
                      ['--tw-ring-color' as string]: 'var(--rank)',
                    }}
                    aria-hidden
                  />
                  <span
                    className={`text-2xs font-semibold leading-none ${
                      isCurrent ? 'text-text' : 'text-subtle'
                    }`}
                  >
                    {r.label}
                  </span>
                </li>
              )
            })}
          </ul>
          {weeksLeft != null && (
            <p className="shrink-0 text-2xs font-medium text-muted">
              {weeksLeft <= 0 ? 'Final days' : `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left`}
            </p>
          )}
        </div>
        {masterReached && (
          <p
            className="mt-2 text-xs font-semibold"
            style={{ ...seasonRankStyle('master'), color: 'var(--rank-deep)' }}
          >
            All three Journeys finished, Expression Challenge and all. You reached Master this season.
          </p>
        )}
      </div>
    </section>
  )
}
