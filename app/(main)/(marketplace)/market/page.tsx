import { getMyProfileId } from '@/lib/auth'
import { listMarketListings } from '@/lib/commerce/products'
import { withJourneySalesHref } from '@/lib/journeys/listing-href'
import { productRatingsFor } from '@/lib/commerce/reviews'
import { sellerVerifiedFor } from '@/lib/commerce/seller-verification'
import { foundingSellersFor } from '@/lib/founding/status'
import { asMarketGroup, marketGroupForKind, type MarketGroup, type MarketItem } from '@/lib/commerce/types'
import { listTicketedEventProjections } from '@/lib/commerce/ticket-projection'
import { FqMarketBody } from '@/components/frequency/members/marketplace/marketplace-body'

// Market — the community commerce umbrella (ADR-596). Hero-led (the site PhotoHero grammar), a stats
// band, then Products / Services / Tickets rails aggregating market-published listings across makers and
// Business Spaces. A ?group= narrows to one type. No em or en dashes.

// Same posture as the Frequency Store index (app/(main)/store/page.tsx:19-23): no /discover twin
// exists for the Market, and this thin, client-filtered aggregate index is not the SEO surface —
// the individual /market/<id> listing pages are (self-canonical, Product schema, and the ones
// app/sitemap.ts advertises). So the index is noindexed but still FOLLOWED, letting crawlers walk
// through to the indexable listing pages. It stays out of the robots.ts DISALLOW list for exactly
// the reason noted there: a blanket "/market" rule would deindex the listing pages too.
export const metadata = {
  title: 'Market',
  description: 'Products, services, and tickets from people and businesses in the Frequency community.',
  robots: { index: false, follow: true },
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
  const all = await withJourneySalesHref(await listMarketListings({ limit: 100 }))
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

  return (
    <FqMarketBody
      items={items}
      group={group ?? null}
      counts={counts}
      signedIn={!!viewerProfileId}
      ratings={ratings}
      verified={verified}
      founding={founding}
    />
  )
}
