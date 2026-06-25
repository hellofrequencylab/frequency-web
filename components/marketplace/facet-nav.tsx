import Link from 'next/link'

// The one faceted nav across every marketplace surface (General · Housing · Makers ·
// Shop), so the areas read as one hub no matter which page you land on. General lives
// at /market (the entrenched listings surface); Housing/Makers are /marketplace
// sub-areas; Shop is the first-party store. `active` highlights the current area.

const AREAS = [
  { key: 'all', href: '/market', label: 'All' },
  { key: 'housing', href: '/marketplace/housing', label: 'Housing' },
  { key: 'makers', href: '/marketplace/makers', label: 'Makers' },
  { key: 'shop', href: '/shop', label: 'Shop' },
] as const

export type MarketplaceArea = (typeof AREAS)[number]['key']

export function MarketplaceFacets({ active }: { active: MarketplaceArea }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Marketplace areas">
      {AREAS.map((a) => {
        const on = a.key === active
        return (
          <Link
            key={a.key}
            href={a.href}
            aria-current={on ? 'page' : undefined}
            className={
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
              (on
                ? 'bg-primary text-on-primary'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
            }
          >
            {a.label}
          </Link>
        )
      })}
    </nav>
  )
}
