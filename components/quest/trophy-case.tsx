import Link from 'next/link'
import { Trophy, Zap, Gem, Target } from 'lucide-react'
import {
  RANK_LABELS,
  seasonRankStyle,
  type SeasonRank,
} from '@/lib/season-ranks'
import { Counter, CounterRow, type CounterTone } from '@/components/ui/counter'
import { RankBadge } from '@/components/ui/rank-badge'
import type { SeasonBlock, JourneyTrophy } from '@/lib/quest/trophies'

// TrophyCase — the lifetime record beside the resettable seasonal rank.
//
// A resettable rank is hollow unless something permanent sits next to it. This is
// that permanent thing: every finished Journey you keep forever, grouped by season,
// newest first. Past seasons carry their stamped summary (the rank reached, the
// season's Zaps, Gems converted, challenges finished). The season is the doing;
// Trophies are what you keep, so the 13-week reset reads as a Fresh Start, not a
// loss.
//
// Pure + presentational (no hooks, no data reads). The page server-fetches the case
// (lib/quest/trophies.ts) and passes it down. Rank colors come from rank tokens only
// (--rank-* via seasonRankStyle); no hardcoded color. A record, not homework: it
// never shows "% complete" or any pressure metric.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** One Trophy tile — a finished Journey, with the rank it earned. */
function TrophyTile({ trophy }: { trophy: JourneyTrophy }) {
  const rankLabel = RANK_LABELS[trophy.rankEarned] ?? trophy.rankEarned
  const inner = (
    <span className="flex h-full items-start gap-3" style={seasonRankStyle(trophy.rankEarned)}>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-body-lg lift-1"
        style={{
          background: 'color-mix(in srgb, var(--rank) 16%, var(--color-surface))',
          color: 'var(--rank-deep)',
        }}
        aria-hidden
      >
        {trophy.emoji ?? <Trophy className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold leading-tight text-text">
          {trophy.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {trophy.pillar && (
            <span className="text-2xs font-bold uppercase tracking-widest text-muted">
              {trophy.pillar}
            </span>
          )}
          {/* `dot={false}`: this chip shares a wrapped meta row with the Pillar label and
              the date, and the tile already carries the rank wash on its emoji medallion. */}
          <RankBadge rank={trophy.rankEarned} size="sm" dot={false}>
            {rankLabel}
          </RankBadge>
        </span>
        <span className="mt-1 block text-2xs font-medium text-muted">
          {formatDate(trophy.completedAt)}
        </span>
      </span>
    </span>
  )

  const cls =
    'rounded-2xl border border-border bg-surface p-3.5 lift-1 transition-colors hover:bg-surface-elevated motion-reduce:transition-none'

  return trophy.slug ? (
    <Link href={`/journeys/${trophy.slug}`} className={`block ${cls}`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

/** A past season's stamped summary — the rank reached, season Zaps, Gems, challenges. */
function SeasonSummary({
  finalRank,
  finalZaps,
  gemsConverted,
  challengesCompleted,
}: {
  finalRank: SeasonRank
  finalZaps: number
  gemsConverted: number
  challengesCompleted: number
}) {
  // The stamped summary is three READINGS, which is precisely what Counter is for — and the tone
  // follows the kind rather than the chrome: Zaps amber, Gems teal (DAWN's counter tone law), the
  // challenge tally neutral because it is a tally, not a currency. They were all `text-subtle`
  // glyphs over tabular-but-not-mono numerals before.
  const stats: { icon: typeof Zap; label: string; value: number; tone: CounterTone }[] = [
    { icon: Zap, label: 'Season Zaps', value: finalZaps, tone: 'primary' },
    { icon: Gem, label: 'Gems kept', value: gemsConverted, tone: 'signal' },
    { icon: Target, label: 'Challenges', value: challengesCompleted, tone: 'neutral' },
  ]
  return (
    <div
      className="rounded-card bg-surface-elevated/60 px-3.5 py-2.5"
      style={seasonRankStyle(finalRank)}
    >
      <CounterRow>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-2xs font-medium text-muted">Rank reached</span>
          <RankBadge rank={finalRank}>{RANK_LABELS[finalRank] ?? finalRank}</RankBadge>
        </span>
        {stats.map((s) => (
          <Counter key={s.label} value={s.value} label={s.label} glyph={s.icon} tone={s.tone} />
        ))}
      </CounterRow>
    </div>
  )
}

/** One season's block — its header, optional stamped summary, and its Trophy grid. */
function SeasonGroup({ block, isCurrent }: { block: SeasonBlock; isCurrent: boolean }) {
  const heading = block.name
    ? `Season ${block.season} · ${block.name}`
    : `Season ${block.season}`
  return (
    <section aria-label={heading}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-body-sm font-bold tracking-tight text-text">{heading}</h3>
        <span className="text-2xs font-medium tabular-nums text-muted">
          {isCurrent ? 'This season' : 'Kept'} ·{' '}
          {block.trophies.length} {block.trophies.length === 1 ? 'Trophy' : 'Trophies'}
        </span>
      </div>

      {block.summary && (
        <div className="mb-3">
          <SeasonSummary
            finalRank={block.summary.finalRank}
            finalZaps={block.summary.finalZaps}
            gemsConverted={block.summary.gemsConverted}
            challengesCompleted={block.summary.challengesCompleted}
          />
        </div>
      )}

      {block.trophies.length > 0 && (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {block.trophies.map((t) => (
            <li key={t.id} className="list-none">
              <TrophyTile trophy={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function TrophyCase({
  seasons,
  totalTrophies,
  currentSeason,
}: {
  /** Every season with a record, newest first (from getTrophyCase). */
  seasons: SeasonBlock[]
  /** Total finished Journeys across all seasons — the case's headline count. */
  totalTrophies: number
  /** The active season number, so its block reads as "this season". */
  currentSeason: number | null
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5 lift-1">
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control lift-1"
          style={{
            ...seasonRankStyle('master'),
            background: 'color-mix(in srgb, var(--rank) 16%, var(--color-surface))',
            color: 'var(--rank-deep)',
          }}
          aria-hidden
        >
          <Trophy className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-widest text-muted">
            Yours to keep
          </p>
          <p className="text-body-sm font-bold text-text">
            {totalTrophies} {totalTrophies === 1 ? 'Trophy' : 'Trophies'} across{' '}
            {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {seasons.map((block) => (
          <SeasonGroup
            key={block.season}
            block={block}
            isCurrent={currentSeason != null && block.season === currentSeason}
          />
        ))}
      </div>
    </div>
  )
}
