import Link from 'next/link'
import { Zap, Gem, Flame, Trophy } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { Counter, type CounterTone } from '@/components/ui/counter'
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
        <ScoreTile href={links?.zaps} icon={Zap} tone="primary" value={zaps} label="Zaps" />
        <ScoreTile href={links?.gems} icon={Gem} tone="signal" value={gems} label="Gems" />
        <ScoreTile
          href={links?.streak}
          icon={Flame}
          tone={streak > 0 ? 'primary-strong' : 'neutral'}
          value={streak}
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
//
// The count itself is a Counter in its `stacked` layout, not hand-rolled markup: the numeral was
// tabular but not MONO here, which is the half of DAWN's counter law that keeps a changing score
// from shuffling sideways. The tile keeps its own tint, padding and link affordance; only the
// reading moved into the kit. Tone follows the KIND (Zaps amber, Gems teal, a lit streak amber, a
// cold one neutral) in the shared tone vocabulary rather than a raw class per call site.
function ScoreTile({
  href,
  icon: Icon,
  tone,
  value,
  label,
}: {
  href?: string
  icon: typeof Zap
  tone: CounterTone
  value: number
  label: string
}) {
  const inner = <Counter value={value} label={label} glyph={Icon} tone={tone} layout="stacked" />
  const cls = 'block rounded-lg bg-primary-bg/40 px-2 py-2 text-center'
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-primary-bg/60 motion-reduce:transition-none`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
