import Link from 'next/link'
import { Zap, Gem, Flame, Trophy } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'

// StandingTiles — the single way a member's standing renders anywhere it appears
// (docs/MEMBER-DESIGN-SYSTEM.md §2, the gamified-stat law). The four counts — Zaps ·
// Rank · Streak · Gems — are the ONLY stat tiles a member sees, and they look the same
// on the crew home, the journey panel, the profile, and the rail. Presentational +
// server-friendly (no hooks): the caller fetches the numbers, decides the gems semantics
// (season vs lifetime), and passes the per-tile links.
//
//   <StandingTiles zaps={1240} gems={88} streak={6} rank="conduit"
//     links={{ zaps: '/crew/leaderboard', gems: '/crew/store', streak: '/crew/streaks',
//              rank: '/crew/achievements' }} />
//
// Variants:
//   `grid`    (default) — the crew-home Zaps/Rank/Streak/Gems grid (StatCard tiles).
//              Pass showRank={false} on surfaces that already render rank as a badge +
//              progress bar (the profile), to keep rank from doubling.
//   `compact` — the rail Quest scoreboard: a tight three-up of Zaps/Gems/Streak.

export type StandingLinks = {
  zaps?: string
  gems?: string
  streak?: string
  rank?: string
}

export function StandingTiles({
  zaps,
  gems,
  streak,
  rank,
  variant = 'grid',
  showRank = true,
  links,
}: {
  zaps: number
  gems: number
  streak: number
  rank: SeasonRank
  variant?: 'grid' | 'compact'
  showRank?: boolean
  links?: StandingLinks
}) {
  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        <ScoreTile href={links?.zaps} icon={Zap} iconCls="text-primary" value={zaps.toLocaleString()} label="Zaps" />
        <ScoreTile href={links?.gems} icon={Gem} iconCls="text-signal" value={gems.toLocaleString()} label="Gems" />
        <ScoreTile
          href={links?.streak}
          icon={Flame}
          iconCls={streak > 0 ? 'text-primary-strong' : 'text-subtle'}
          value={streak.toLocaleString()}
          label="Streak"
        />
      </div>
    )
  }

  return (
    <div className={`grid gap-2.5 ${showRank ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
      <StatCard label="Zaps" value={zaps.toLocaleString()} icon={Zap} href={links?.zaps} />
      {showRank && (
        <StatCard label="Rank" value={RANK_LABELS[rank] ?? rank} icon={Trophy} href={links?.rank} />
      )}
      <StatCard label="Streak" value={`${streak}d`} icon={Flame} href={links?.streak} />
      <StatCard label="Gems" value={gems.toLocaleString()} icon={Gem} href={links?.gems} />
    </div>
  )
}

// One cell of the compact rail scoreboard — a tinted, optionally-linked count.
function ScoreTile({
  href,
  icon: Icon,
  iconCls,
  value,
  label,
}: {
  href?: string
  icon: typeof Zap
  iconCls: string
  value: string
  label: string
}) {
  const inner = (
    <>
      <span className="flex items-center justify-center gap-1 text-base font-bold tabular-nums text-text">
        <Icon className={`h-3.5 w-3.5 ${iconCls}`} /> {value}
      </span>
      <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{label}</span>
    </>
  )
  const cls = 'rounded-lg bg-primary-bg/40 px-2 py-2 text-center'
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-primary-bg/60 motion-reduce:transition-none`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
