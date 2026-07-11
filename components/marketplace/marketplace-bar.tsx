import type { LucideIcon } from 'lucide-react'
import { MarketplaceFacets, type MarketplaceArea } from '@/components/marketplace/facet-nav'

// MARKETPLACE BAR — the one control row that sits directly under a commerce hero. The area menu
// (Classifieds · Housing · Market · Events · Frequency Store — MarketplaceFacets, reused not forked)
// sits on the LEFT with NO card background, and the surface's headline stats sit as compact tiles to
// its RIGHT, tight, on the same row (wrapping under the menu only on a narrow screen). Every commerce
// page opens on this same anchored "where am I / how big is it" band (ADR-596). Stats arrive as props
// so any surface (Classifieds, Market, Housing, Events, the Store) mounts the same bar with its own
// numbers. Tokens only, no hex.

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
        <div className="flex flex-wrap items-center gap-2">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.label}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                <span className="text-base font-semibold leading-none tabular-nums text-text">
                  {s.value}
                </span>
                <span className="text-sm leading-none text-muted">{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
