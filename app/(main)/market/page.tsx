import Link from 'next/link'
import { Plus, ShoppingBag, Package, CalendarClock, Ticket } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { getMyProfileId } from '@/lib/auth'
import { listMarketListings } from '@/lib/commerce/products'
import { productRatingsFor } from '@/lib/commerce/reviews'
import { sellerVerifiedFor } from '@/lib/commerce/seller-verification'
import { foundingSellersFor } from '@/lib/founding/status'
import { MARKET_GROUPS, asMarketGroup, marketGroupForKind, type MarketGroup, type MarketItem } from '@/lib/commerce/types'
import { listTicketedEventProjections } from '@/lib/commerce/ticket-projection'
import { ProductCard } from '@/components/marketplace/product-card'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar, InstantGrid, InstantSection } from '@/components/marketplace/market-search'
import { MarketplaceColumnsProvider, MarketplaceColumns } from '@/components/marketplace/column-selector'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import { MarketplaceHiddenBanner } from '@/components/marketplace/hidden-banner'

// Market — the community commerce umbrella (ADR-596). Hero-led (the site PhotoHero grammar), a stats
// band, then Products / Services / Tickets rails aggregating market-published listings across makers and
// Business Spaces. A ?group= narrows to one type. No em or en dashes.

export const metadata = {
  title: 'Market',
  description: 'Products, services, and tickets from people and businesses in the Frequency community.',
}

const HERO_IMAGE = 'https://picsum.photos/seed/frequency-market/1600/600'
const GROUP_LABEL: Record<MarketGroup, string> = { products: 'Products', services: 'Services', tickets: 'Tickets' }

const GRID_CLASS = 'mp-grid gap-6'
const searchText = (p: MarketItem) => `${p.title} ${p.description ?? ''}`

function GroupRail({ active }: { active: MarketGroup | null }) {
  const tabs: { key: MarketGroup | null; label: string }[] = [
    { key: null, label: 'All' },
    ...MARKET_GROUPS.map((g) => ({ key: g, label: GROUP_LABEL[g] })),
  ]
  return (
    <nav aria-label="Market groups" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {tabs.map((t) => {
        const on = t.key === active
        const href = t.key ? `/market?group=${t.key}` : '/market'
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              on ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>
}) {
  const { group: groupParam } = await searchParams
  const group = asMarketGroup(groupParam)
  const viewerProfileId = await getMyProfileId()

  // One read powers the stats band, the rails, and the grid (grouped in-process). The hero search bar
  // filters every rail instantly on the client (InstantGrid / InstantSection read the shared query).
  const all = await listMarketListings({ limit: 100 })
  // Read-only projection (ADR-596 / audit #2): ticketed events surface in the Tickets rail and deep-link
  // to the event ticket flow. Events stay the source of truth (no commerce_products row). Fail-soft to [].
  const ticketProjections = await listTicketedEventProjections({ limit: 60 })
  // Trust & Safety (Phase 8): aggregate ratings + seller verification for every commerce card, in batch
  // reads. Plus the Founding charter mark (ADR-599). Projections carry none of these (they are events).
  const [ratings, verified, founding] = await Promise.all([
    productRatingsFor(all.map((p) => p.id)),
    sellerVerifiedFor(all),
    foundingSellersFor(all),
  ])
  // Commerce listings + ticketed-event projections, unified as MarketItem[] for grouping + display.
  const items: MarketItem[] = [...all, ...ticketProjections]
  const byGroup = (g: MarketGroup) => items.filter((p) => marketGroupForKind(p.productKind) === g)
  const counts = {
    total: items.length,
    products: byGroup('products').length,
    services: byGroup('services').length,
    tickets: byGroup('tickets').length,
  }

  const shown = group ? byGroup(group) : null
  const sections = MARKET_GROUPS.map((g) => ({ group: g, items: byGroup(g) })).filter((s) => s.items.length > 0)

  return (
    <MarketSearchProvider>
    <div className="space-y-8">
      <MarketHero
        image={HERO_IMAGE}
        eyebrow="The Market"
        title="Buy from your community"
        subtitle="Products, services, and tickets from the people and businesses around you. Buy direct, the seller gets paid, the fee stays low."
        search={<MarketSearchBar placeholder="Search the Market" />}
        action={
          viewerProfileId ? (
            <>
              <Link href="/market/sell" className={buttonClasses('primary', 'md')}>
                <Plus className="h-4 w-4" aria-hidden /> List a product
              </Link>
              <Link href="/market/manage" className={buttonClasses('secondary', 'md')}>
                My storefront
              </Link>
            </>
          ) : undefined
        }
      />

      <MarketplaceHiddenBanner area="makers" />

      <div className="space-y-6">
        <MarketplaceFacets active="makers" />

        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <StatCard size="sm" label="Listings" value={counts.total} icon={ShoppingBag} />
          <StatCard size="sm" label="Products" value={counts.products} icon={Package} />
          <StatCard size="sm" label="Services" value={counts.services} icon={CalendarClock} />
          <StatCard size="sm" label="Tickets" value={counts.tickets} icon={Ticket} />
        </div>

        <MarketplaceColumnsProvider className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GroupRail active={group} />
            <MarketplaceColumns />
          </div>

          <div className="@container">
          {shown ? (
            shown.length > 0 ? (
              <InstantGrid items={shown.map((p) => ({ text: searchText(p) }))} className={GRID_CLASS}>
                {shown.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    rating={ratings.get(p.id) ?? null}
                    verified={verified.get(p.id) ?? false}
                    founding={founding.get(p.id) ?? false}
                  />
                ))}
              </InstantGrid>
            ) : (
              <EmptyState
                icon={ShoppingBag}
                variant="first-use"
                title={`No ${GROUP_LABEL[group!].toLowerCase()} yet.`}
                description="When people and businesses publish to the Market, they show up here."
              />
            )
          ) : sections.length > 0 ? (
            <div className="space-y-10">
              {sections.map((s) => (
                <InstantSection
                  key={s.group}
                  title={GROUP_LABEL[s.group]}
                  seeAllHref={`/market?group=${s.group}`}
                  items={s.items.map((p) => ({ text: searchText(p) }))}
                  className={GRID_CLASS}
                >
                  {s.items.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      rating={ratings.get(p.id) ?? null}
                      verified={verified.get(p.id) ?? false}
                      founding={founding.get(p.id) ?? false}
                    />
                  ))}
                </InstantSection>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ShoppingBag}
              variant="first-use"
              title="Nothing in the Market yet."
              description="This is where the community sells. Publish a product, service, or ticket and it shows up here."
            />
          )}
          </div>
        </MarketplaceColumnsProvider>
      </div>

      <MarketplaceGuide />
    </div>
    </MarketSearchProvider>
  )
}
