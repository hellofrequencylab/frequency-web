import Link from 'next/link'

// The one faceted nav across every commerce surface (Classifieds · Housing · Market ·
// Frequency Store), so the areas read as one hub no matter which page you land on
// (ADR-596). The `key` values are stable internal ids kept from the old taxonomy
// (all=Classifieds, makers=Market, shop=Frequency Store) so callers do not churn;
// only labels + hrefs carry the new naming. `active` highlights the current area.

const AREAS = [
  { key: 'all', href: '/classifieds', label: 'Classifieds' },
  { key: 'housing', href: '/marketplace/housing', label: 'Housing' },
  { key: 'makers', href: '/market', label: 'Market' },
  { key: 'shop', href: '/store', label: 'Frequency Store' },
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
