import Link from 'next/link'
import { Trophy, Brain, Dumbbell, Sun, Megaphone, type LucideIcon } from 'lucide-react'
import {
  SEASON_RANKS,
  RANK_LABELS,
  seasonRankStyle,
  RANK_TO_KEY,
  type SeasonRank,
} from '@/lib/season-ranks'
import type { PillarSlug } from '@/lib/pillars'
import { SeasonCountdown } from './season-countdown'

// SeasonMap — the My Quest hub's signature surface. One glanceable read of the season:
// a gauge for EACH of the four Pillars (Mind · Body · Spirit · Expression) filling with
// the distinct days you've practiced it this season, framed by the season name, your
// rank, and the weeks left. It answers "how am I doing across the Quest?" in under two
// seconds. Site icons, not emojis; semantic tokens only (no hardcoded color).
//
// Pure + presentational (no hooks, no data reads). The page server-fetches each Pillar's
// progress + the season frame and passes them down.

export interface PillarProgress {
  /** mind | body | spirit | expression. */
  slug: PillarSlug
  /** Display name (e.g. "Mind"). */
  name: string
  /** Distinct days a practice in this Pillar was logged this season. */
  daysLogged: number
  /** The gauge's full mark (the per-Pillar day target). */
  daysTarget: number
}

// Each Pillar's site icon — a real lucide glyph, never an emoji.
const PILLAR_ICON: Record<PillarSlug, LucideIcon> = {
  mind: Brain,
  body: Dumbbell,
  spirit: Sun,
  expression: Megaphone,
}

// One Pillar gauge — a semicircle that fills clockwise with the season's distinct days
// in that Pillar. SVG keeps it crisp and makes the fill a real, accessible fraction.
function PillarGauge({ pillar }: { pillar: PillarProgress }) {
  const Icon = PILLAR_ICON[pillar.slug] ?? Brain
  const fill = pillar.daysTarget > 0 ? Math.min(1, pillar.daysLogged / pillar.daysTarget) : 0
  const pct = Math.round(fill * 100)
  const active = pillar.daysLogged > 0
  const R = 30
  const C = Math.PI * R // semicircle arc length

  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="relative flex h-[68px] w-full items-end justify-center">
        <svg
          viewBox="0 0 80 44"
          className="h-full w-full max-w-[120px]"
          role="img"
          aria-label={`${pillar.name}: ${pillar.daysLogged} of ${pillar.daysTarget} days (${pct}%)`}
        >
          {/* Track */}
          <path
            d="M 10 40 A 30 30 0 0 1 70 40"
            fill="none"
            stroke="var(--color-surface-elevated)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {/* Fill — length = this Pillar's progress fraction. */}
          {fill > 0 && (
            <path
              d="M 10 40 A 30 30 0 0 1 70 40"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - fill)}
              className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            />
          )}
        </svg>

        {/* The Pillar's site icon, dropped into the gauge's mouth. */}
        <span
          className={`absolute bottom-0 flex h-9 w-9 items-center justify-center rounded-full shadow-sm ${
            active ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-subtle'
          }`}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="w-full text-center">
        <p
          className={`text-2xs font-bold uppercase tracking-widest ${
            active ? 'text-primary-strong' : 'text-subtle'
          }`}
        >
          {pillar.name}
        </p>
        <p className="mt-0.5 text-2xs font-medium text-muted">
          {pillar.daysLogged} of {pillar.daysTarget} days
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
  pillars,
  notStarted = false,
  startMs = null,
  startLabel = null,
  achievementsHref = '/crew/store',
}: {
  /** The active Quest's name (e.g. "Stretch"). */
  seasonName: string | null
  /** Whole weeks remaining in the 13-week Quest, or null when no live season. */
  weeksLeft: number | null
  /** The member's current season rank, derived from journeysFinished. */
  rank: SeasonRank
  /** Journeys finished this season (0-3) — drives the rank read. */
  journeysFinished: number
  /** The four Pillars (Mind / Body / Spirit / Expression), in display order, each with
   *  the member's distinct-days progress this season. */
  pillars: PillarProgress[]
  /** True when the live season is dated to start in the future. Then the Pillar gauges read
   *  0 by design (days count inside the season window), so we count down to the start. */
  notStarted?: boolean
  /** The season-start timestamp (ms) — drives the live countdown. */
  startMs?: number | null
  /** The season's start, formatted for the countdown label (e.g. "June 21st"). */
  startLabel?: string | null
  achievementsHref?: string
}) {
  const masterReached = rank === 'master'

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg/55 via-surface to-surface shadow-sm dark:from-primary-bg/20"
      aria-labelledby="season-map-heading"
    >
      {/* Frame — the season is the FRAME: its name + the time left sit at the top, with
          the rank crest the member is climbing toward. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 pt-6 sm:px-7">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
            {seasonName ? `The Quest · ${seasonName}` : 'The Quest'}
          </p>
          {/* Title + (when the season hasn't started) a quiet inline countdown, same row. */}
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 id="season-map-heading" className="text-xl font-bold leading-tight text-text">
              Your season map
            </h2>
            {notStarted && startMs != null && <SeasonCountdown startMs={startMs} label={startLabel} />}
          </div>
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
            <span className="block text-sm font-bold text-text">{RANK_LABELS[rank] ?? rank}</span>
          </span>
        </Link>
      </div>

      {/* The four Pillar gauges — the signature read: Mind · Body · Spirit · Expression,
          each filling with the days you've practiced it this season. A row from the
          smallest screens (each gauge stays legible). */}
      <ul className="mt-5 flex items-start justify-between gap-2 px-4 sm:gap-3 sm:px-7">
        {pillars.map((p) => (
          <PillarGauge key={p.slug} pillar={p} />
        ))}
      </ul>

      {/* The climb line — the Ghost → Master spine. One pip per finished Journey. */}
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
            All three Journeys finished. Master, the season top. Your Trophies keep. The next
            Quest opens a Fresh Start.
          </p>
        )}
      </div>
    </section>
  )
}
