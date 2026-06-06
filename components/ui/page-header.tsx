import Link from 'next/link'
import { Zap, Gem, Flame } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

export type ViewerGamStats = { zaps: number; gems: number; streak: number; rank: SeasonRank }

function GamStat({ icon: Icon, value, label, fill }: { icon: LucideIcon; value: string; label: string; fill?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <Icon className={`h-4 w-4 text-primary ${fill ? 'fill-current' : ''}`} />
      <span className="mt-1 text-base font-bold leading-none tabular-nums text-text">{value}</span>
      <span className="mt-1 text-xs text-subtle">{label}</span>
    </div>
  )
}

// The shared page header: title + description + primary action (left), and the
// viewer's gamification stats (right). Establishes one grammar across the
// community browse pages (Circles, Interests, Events, Practices, Partners).
export function PageHeader({
  title,
  description,
  action,
  secondaryAction,
  gam,
}: {
  title: string
  description: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  gam?: ViewerGamStats | null
}) {
  return (
    <header className="mb-6 flex flex-col gap-6 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-2xl">
        <h1 className="mb-1.5 text-2xl font-bold text-text">{title}</h1>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
        {(action || secondaryAction) && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {action}
            {secondaryAction}
          </div>
        )}
      </div>

      {gam && (
        <>
          {/* Mobile: a compact single-row pill — roughly a quarter of the full
              card's footprint, so it doesn't dominate a narrow screen. */}
          <Link
            href="/crew"
            className="inline-flex items-center gap-2.5 self-start rounded-full border border-border bg-surface px-3 py-1.5 shadow-sm transition-colors hover:border-primary-bg sm:hidden"
          >
            <span className="rank-badge text-3xs font-bold leading-none" style={seasonRankStyle(gam.rank)}>
              {RANK_LABELS[gam.rank]}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-text">
              <Zap className="h-3.5 w-3.5 fill-current text-primary" />{gam.zaps.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-text">
              <Gem className="h-3.5 w-3.5 text-primary" />{gam.gems.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-text">
              <Flame className="h-3.5 w-3.5 text-primary" />{gam.streak}w
            </span>
          </Link>

          {/* Desktop+ : the full stat card. */}
          <Link
            href="/crew"
            className="hidden shrink-0 items-center gap-5 self-start rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-all hover:border-primary-bg hover:shadow-md sm:flex"
          >
            <div className="flex flex-col items-center">
              <span className="rank-badge text-xs font-bold leading-tight" style={seasonRankStyle(gam.rank)}>
                {RANK_LABELS[gam.rank]}
              </span>
              <span className="mt-1.5 text-xs text-subtle">Rank</span>
            </div>
            <GamStat icon={Zap} value={gam.zaps.toLocaleString()} label="Zaps" fill />
            <GamStat icon={Gem} value={gam.gems.toLocaleString()} label="Gems" />
            <GamStat icon={Flame} value={`${gam.streak}w`} label="Streak" />
          </Link>
        </>
      )}
    </header>
  )
}

// A calm stats strip — a borderless row of value/label counts on the canvas
// (not a boxed card). Matches the de-boxed treatment the Circles exemplar uses,
// so every page's stat row reads the same way (DESIGN.md "group, don't box").
export function StatStrip({ items }: { items: { value: number; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-xl font-bold leading-none tabular-nums text-text">{it.value.toLocaleString()}</div>
          <div className="mt-1 text-xs text-subtle">{it.label}</div>
        </div>
      ))}
    </div>
  )
}
