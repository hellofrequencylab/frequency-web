import Link from 'next/link'
import {
  AREA_LABEL,
  AREA_PREFIX,
  browsableAreas,
  isMarketplaceOperator,
  marketplaceVisibility,
  type MarketArea,
} from '@/lib/marketplace/visibility'

// The Marketplace's doors in the kit (the DAWN MarketplaceBar's area picker and the operator's
// hidden-area banner, redrawn). The doors are the areas THIS viewer may browse (browsableAreas, the
// same read both commerce navs use), plus paid Events, which the Marketplace has always linked as
// its Events tab. An operator looking at an area members cannot see gets one quiet panel saying so.

export async function FqMarketAreas({ active }: { active: MarketArea | 'events' }) {
  const areas = await browsableAreas()
  const doors: { key: MarketArea | 'events'; href: string; label: string }[] = [
    ...areas.map((a) => ({ key: a, href: AREA_PREFIX[a], label: AREA_LABEL[a] })),
    { key: 'events', href: '/events?price=paid', label: 'Events' },
  ]
  if (doors.length < 2) return null
  return (
    <nav className="tabs fqm-tabs" aria-label="Marketplace">
      {doors.map((d) => (
        <Link key={d.key} href={d.href} className={d.key === active ? 'on' : undefined} aria-current={d.key === active ? 'page' : undefined}>
          {d.label}
        </Link>
      ))}
    </nav>
  )
}

export async function FqHiddenAreaNote({ area }: { area: MarketArea }) {
  const [vis, operator] = await Promise.all([marketplaceVisibility(), isMarketplaceOperator()])
  if (vis[area] || !operator) return null
  return (
    <div className="panel row wrap fqm-note">
      <span className="t2 grow">
        {AREA_LABEL[area]} is hidden from members. Only operators can see it.
      </span>
      <Link className="btn sm" href="/admin/marketplace">
        Visibility settings
      </Link>
    </div>
  )
}
