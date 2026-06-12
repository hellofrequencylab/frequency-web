import Link from 'next/link'
import { Zap, Gem, Flame, Trophy } from 'lucide-react'
import {
  SEASON_RANKS,
  RANK_LABELS,
  seasonRankStyle,
  rankProgress,
  type SeasonRank,
} from '@/lib/season-ranks'

// StandingHero — the member dashboard's centerpiece (the redesign's "wow" band, the
// member analog of the admin KPI hero). One warm canvas-printed feature band that
// answers "where am I in the game" at a glance: the rank crest, the four gamified
// counts as feature tiles (Zaps · Rank · Streak · Gems, the gamified-stat law,
// MEMBER-DESIGN-SYSTEM §2), and the climb-to-next-rank ladder. Presentational +
// server-friendly (no hooks); the caller fetches the four numbers and the gems
// semantics. Reused on the crew home, the feed standing, and the profile.
//
//   <StandingHero zaps={1240} gems={88} streak={6} rank="conduit" seasonName="Bloom"
//     links={{ zaps: '/crew/leaderboard', gems: '/crew/store', streak: '/crew/streaks',
//              rank: '/crew/achievements' }} />

export function StandingHero({
  zaps,
  gems,
  streak,
  rank,
  seasonName,
  links,
}: {
  zaps: number
  gems: number
  streak: number
  rank: SeasonRank
  /** Optional season name for the eyebrow ("Season · Bloom"). */
  seasonName?: string
  links?: { zaps?: string; gems?: string; streak?: string; rank?: string }
}) {
  const { def, next, pct, zapsToNext } = rankProgress(zaps)

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg/55 via-surface to-surface shadow-sm dark:from-primary-bg/20">
      {/* Crest band — rank identity + climb line, printed on the warm canvas. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 pt-6 sm:px-7">
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
              {seasonName ? `Season · ${seasonName}` : 'Season standing'}
            </p>
            <p className="flex items-center gap-2 text-xl font-bold leading-tight text-text">
              {RANK_LABELS[rank] ?? rank}
              <span className="rank-badge text-2xs" style={seasonRankStyle(rank)}>{def.label}</span>
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">
          {next ? (
            <>
              <span className="font-bold tabular-nums text-text">{zapsToNext.toLocaleString()}</span> zaps to{' '}
              <span className="font-semibold text-text">{next.label}</span>
            </>
          ) : (
            <span className="font-semibold text-text">Top rank reached</span>
          )}
        </p>
      </div>

      {/* The four feature tiles — the only stats a member sees, sized up as the hero. */}
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-4">
        <FeatureTile href={links?.zaps} icon={Zap} iconCls="text-primary" value={zaps.toLocaleString()} label="Zaps" />
        <FeatureTile href={links?.rank} icon={Trophy} iconCls="text-primary-strong" value={def.label} label="Rank" />
        <FeatureTile
          href={links?.streak}
          icon={Flame}
          iconCls={streak > 0 ? 'text-primary-strong' : 'text-subtle'}
          value={`${streak.toLocaleString()}d`}
          label="Streak"
        />
        <FeatureTile href={links?.gems} icon={Gem} iconCls="text-signal" value={gems.toLocaleString()} label="Gems" />
      </div>

      {/* Climb ladder — the rank progress bar + the six-tier spine. */}
      <div className="px-6 py-5 sm:px-7">
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className={`h-full rounded-full transition-all ${def.color}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between">
          {SEASON_RANKS.map((r) => {
            const achieved = zaps >= r.minZaps
            const current = r.rank === rank
            return (
              <div key={r.rank} className="flex flex-col items-center gap-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full ring-2 transition-all ${
                    current ? `${r.color} ring-current ring-offset-1` : achieved ? `${r.color} ring-transparent` : 'bg-border-strong ring-transparent'
                  }`}
                />
                <span className={`text-2xs font-semibold leading-none ${current ? r.text : 'text-subtle'}`}>
                  {r.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// One feature tile in the hero — a white surface cell on the warm band, the count
// loud and the label quiet beneath (value-first, the same anatomy as StatCard).
function FeatureTile({
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-extrabold leading-none tabular-nums text-text">{value}</p>
        <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} aria-hidden />
      </div>
      <p className="mt-1.5 text-xs font-medium text-muted">{label}</p>
    </>
  )
  const cls = 'bg-surface px-4 py-3.5'
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-surface-elevated motion-reduce:transition-none`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
