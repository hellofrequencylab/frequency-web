import type { LucideIcon } from 'lucide-react'
import { MarketplaceFacets, type MarketplaceArea } from '@/components/marketplace/facet-nav'

// MARKETPLACE BAR — the one control row under a commerce hero. The area menu (Classifieds · Housing ·
// Market · Events · Frequency Store — MarketplaceFacets, reused not forked) sits on the LEFT with no card
// background; the surface's headline stats sit as small SOFT chips on the RIGHT (the pre-existing stat
// style: a quiet surface-elevated tint, never a hard white bordered card), on the SAME row as the menu.
// The row wraps: on a narrow screen the stats fold under the menu, and a long stat set flows onto a second
// chip row. Every commerce page opens on this same anchored band (ADR-596). Stats arrive as props so any
// surface mounts the same bar with its own numbers. Tokens only, no hex.

export interface MarketplaceStat {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
}

export function MarketplaceBar({
  active,
  stats,
}: {
  active: MarketplaceArea
  stats: MarketplaceStat[]
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <MarketplaceFacets active={active} />
      {stats.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.label}
                className="flex items-center gap-1.5 rounded-lg bg-surface-elevated/60 px-2.5 py-1"
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
                <span className="text-sm font-bold tabular-nums text-text">{s.value}</span>
                <span className="text-xs text-muted">{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
