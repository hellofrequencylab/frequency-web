import Link from 'next/link'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { RankBadge } from '@/components/ui/rank-badge'
import { FqIcon } from '@/components/frequency/icon'
import type { SeasonBlock, JourneyTrophy } from '@/lib/quest/trophies'

// THE TROPHY CASE, IN THE KIT (LIVE-1103, LIVE-938 area 4). The Vault's lifetime record: every finished Journey,
// grouped by season, newest first, with each past season's stamped summary. Same data and rules as DAWN's
// components/quest/trophy-case.tsx (a record, never a "% complete"); drawn in the members kit's own pieces (`.panel`,
// `.card`, `.ic`, `.t1`/`.t2`) so the Vault stops nesting a DAWN card that members-ui.css had to repaint. The
// rank keeps its data-driven hue through seasonRankStyle, pending the rank-colour ruling (SCAN-860).

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TrophyTile({ trophy }: { trophy: JourneyTrophy }) {
  const inner = (
    <>
      <span className="ic" style={seasonRankStyle(trophy.rankEarned)} aria-hidden>
        {trophy.emoji ?? <FqIcon name="trophy" />}
      </span>
      <span className="stack grow mc-gap-4">
        <span className="t1">{trophy.title}</span>
        <span className="row wrap mc-gap-6">
          {trophy.pillar && <span className="tag">{trophy.pillar}</span>}
          <RankBadge rank={trophy.rankEarned} size="sm" dot={false}>
            {RANK_LABELS[trophy.rankEarned] ?? trophy.rankEarned}
          </RankBadge>
        </span>
        <span className="t2">{formatDate(trophy.completedAt)}</span>
      </span>
    </>
  )
  return trophy.slug ? (
    <Link href={`/journeys/${trophy.slug}`} className="card row mc-gap-12">
      {inner}
    </Link>
  ) : (
    <div className="card row mc-gap-12">{inner}</div>
  )
}

function SeasonSummary({ summary }: { summary: NonNullable<SeasonBlock['summary']> }) {
  const rank: SeasonRank = summary.finalRank
  return (
    <div className="panel row wrap mc-gap-16" style={seasonRankStyle(rank)}>
      <span className="row mc-gap-6">
        <span className="t2">Rank reached</span>
        <RankBadge rank={rank}>{RANK_LABELS[rank] ?? rank}</RankBadge>
      </span>
      <span className="t2">⚡ {summary.finalZaps.toLocaleString()} Season Zaps</span>
      <span className="t2">💎 {summary.gemsConverted.toLocaleString()} Gems kept</span>
      <span className="t2">
        {summary.challengesCompleted.toLocaleString()} {summary.challengesCompleted === 1 ? 'challenge' : 'challenges'}
      </span>
    </div>
  )
}

export function FqTrophyCase({
  seasons,
  totalTrophies,
  currentSeason,
}: {
  seasons: SeasonBlock[]
  totalTrophies: number
  currentSeason: number | null
}) {
  return (
    <div className="stack mc-gap-24">
      <span className="t2">
        {totalTrophies} {totalTrophies === 1 ? 'Trophy' : 'Trophies'} across {seasons.length}{' '}
        {seasons.length === 1 ? 'season' : 'seasons'}
      </span>
      {seasons.map((block) => {
        const heading = block.name ? `Season ${block.season} · ${block.name}` : `Season ${block.season}`
        const isCurrent = currentSeason != null && block.season === currentSeason
        return (
          <section key={block.season} aria-label={heading} className="stack mc-gap-12">
            <div className="row mc-between">
              <span className="h3">{heading}</span>
              <span className="meta">
                {isCurrent ? 'This season' : 'Kept'} · {block.trophies.length}{' '}
                {block.trophies.length === 1 ? 'Trophy' : 'Trophies'}
              </span>
            </div>
            {block.summary && <SeasonSummary summary={block.summary} />}
            {block.trophies.length > 0 && (
              <div className="g3">
                {block.trophies.map((t) => (
                  <TrophyTile key={t.id} trophy={t} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
