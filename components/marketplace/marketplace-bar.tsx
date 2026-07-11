import type { LucideIcon } from 'lucide-react'
import { MarketplaceFacets, type MarketplaceArea } from '@/components/marketplace/facet-nav'

// MARKETPLACE BAR — the one compact control row that sits directly under a commerce hero. It pairs the
// shared area picker (Classifieds · Housing · Market · Events · Frequency Store — MarketplaceFacets, reused
// not forked) with the surface's headline stats, so every commerce page opens on the same anchored
// "where am I / how big is it" band (ADR-596). No card, no heavy background: the menu reads as chrome and
// the stats sit inline to its RIGHT, tight but with room to breathe, wrapping under the menu on narrow
// screens. Stats arrive as props so any surface (Classifieds, Market, Housing, Events, the Store) can
// mount the same bar with its own numbers. Tokens only, no hex.

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
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.label} className="flex items-center gap-1.5 text-sm">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                <dt className="sr-only">{s.label}</dt>
                <dd className="flex items-baseline gap-1">
                  <span className="font-semibold tabular-nums text-text">{s.value}</span>
                  <span className="text-muted">{s.label}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
