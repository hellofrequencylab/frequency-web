import { SegmentedLinks } from '@/components/ui/segmented-control'
import { browsableAreas, type MarketArea } from '@/lib/marketplace/visibility'

// The one faceted nav across every commerce surface (Classifieds · Housing · Market ·
// Events · Frequency Store), so the areas read as one hub no matter which page you land
// on (ADR-596). The `key` values are stable internal ids kept from the old taxonomy
// (all=Classifieds, makers=Market, shop=Frequency Store) so callers do not churn;
// only labels + hrefs carry the new naming. `active` highlights the current area.
//
// EVERY ENTRY STAYS DECLARED AND THE FLAG DECIDES WHICH RENDER (LIVE-245). `area` is the
// lib/marketplace/visibility key each entry answers to, or null for Events, which is a member
// noun rather than a market area and is never switchable here. That is what the owner ruling
// assumed already existed: "flipping it the day real merch exists is a one-row change" is only
// true if the entry is still here and a flag gates it, so deleting the Frequency Store row
// would break the promise rather than keep it.
//
// THE EVENTS ENTRY IS THE COMMERCE FACE, `/events?price=paid` (LIVE-243). It linked at bare
// /events, the full member index of paid AND free events, which made the tab read as a second
// Events index rather than the commerce one. EventsSurface was already parameterised for this
// (its own doc comment names "the commerce tab, where these host actions do not belong") and
// index-data.ts already declares the price facet; the shape was anticipated and never wired.
//
// THE ROW IS THE KIT'S SEGMENTED BOX, NOT PILLS (HYG-092, HYG-105, owner ruling 2026-09-22). The
// area nav is the first level of a two-level browse surface; the second level (kind tabs on
// /classifieds, groups on /market, category tabs on the events surface) stays UnderlineTabs, the one
// tab vocabulary (ADR-937 ruling 4). Box above, underline below: a reader always knows which level
// they are on, and the last pill row is gone.

const AREAS = [
  { key: 'all', area: 'market', href: '/classifieds', label: 'Classifieds' },
  { key: 'housing', area: 'housing', href: '/housing', label: 'Housing' },
  { key: 'makers', area: 'makers', href: '/market', label: 'Market' },
  { key: 'events', area: null, href: '/events?price=paid', label: 'Events' },
  { key: 'shop', area: 'shop', href: '/store', label: 'Frequency Store' },
] as const satisfies readonly {
  key: string
  area: MarketArea | null
  href: string
  label: string
}[]

export type MarketplaceArea = (typeof AREAS)[number]['key']

export async function MarketplaceFacets({ active }: { active: MarketplaceArea }) {
  const open = new Set(await browsableAreas())
  const areas = AREAS.filter((a) => a.area === null || open.has(a.area))
  return (
    <SegmentedLinks
      label="Browse areas"
      size="md"
      scroll={false}
      activeHref={areas.find((a) => a.key === active)?.href}
      links={areas.map((a) => ({ href: a.href, label: a.label }))}
    />
  )
}
