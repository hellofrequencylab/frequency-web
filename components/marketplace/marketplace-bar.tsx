import type { LucideIcon } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { MarketplaceFacets, type MarketplaceArea } from '@/components/marketplace/facet-nav'

// MARKETPLACE BAR — the one compact control box that sits directly under a commerce hero. It pairs the
// shared area picker (Classifieds · Housing · Market · Events · Frequency Store — MarketplaceFacets, reused
// not forked) with the surface's headline stat tiles, so every commerce page opens on the same anchored
// "where am I / how big is it" band (ADR-596). Stats arrive as props so any surface (Market, Housing, the
// Store) can mount the same bar with its own numbers. Tokens only, no hex.

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
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <MarketplaceFacets active={active} />
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} size="sm" label={s.label} value={s.value} icon={s.icon} />
          ))}
        </div>
      )}
    </div>
  )
}
