import Link from 'next/link'
import { Suspense } from 'react'
import '@/app/themes/active/members-b'
import { FqIcon } from '@/components/frequency/icon'
import { priceLabel } from '@/components/marketplace/product-card'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace-core'
import { marketGroupForKind, type MarketItem } from '@/lib/commerce/types'
import type { ProductRating } from '@/lib/commerce/reviews'
import { FqItemGrid, type FqGridItem } from './item-grid'
import { FqHiddenAreaNote } from './areas'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks, type FqMenuViewer } from '@/components/frequency/members/shell/nav'
import { AREA_PREFIX } from '@/lib/marketplace/visibility'
import { AMENITIES, PROPERTY_TYPES } from '@/lib/listings/types'
import { Input } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { SaveListingButton } from '@/components/marketplace/save-listing-button'

// MARKETPLACE, FREQUENCY BODIES (templates/members/Marketplace.html). Two doors share the one
// reference layout: the head, the filter chips and the four-up portrait grid.
//
//   · CLASSIFIEDS (/classifieds, the Marketplace door's default) is the reference page itself: swap
//     it locally, no in-app payment. Each card's button opens the listing, where the seller is
//     messaged; the price is the seller's own price note.
//   · THE MARKET (/market) sells through checkout, so each card opens the product page, where the
//     buy flow already lives. Prices come from the catalog through the card's own price rule.
//
// THE HYBRID RULE (owner, design pass): the DAWN pages also carry the Marketplace's doors, headline
// counts, an instant search, Near me with distances, the operator's hidden-area notice, intro copy
// and CTA, a Market grouped into Products / Services / Tickets rails, and each product's rating,
// verified seller and Founding marks. All of it stays, in the kit: the doors as tabs, the counts in
// the meta line, the search and Near me in the find row (item-grid.tsx), the marks on the card.

type FqClassified = {
  id: string
  title: string
  kind: ListingKind
  priceNote: string | null
  image: string | null
  seller: string | null
  place: string | null
  description: string | null
  lat: number | null
  lng: number | null
  unclaimed: boolean
}

function firstName(name: string | null): string | null {
  return name ? name.split(' ')[0] : null
}

function classifiedPrice(l: FqClassified): string {
  if (l.kind === 'free') return 'Free'
  if (l.priceNote) return l.priceNote
  return LISTING_KINDS.find((k) => k.key === l.kind)?.label ?? ''
}

function Intro({ body, ctaLabel, ctaHref }: { body: string | null; ctaLabel: string | null; ctaHref: string | null }) {
  if (!body && !(ctaLabel && ctaHref)) return null
  return (
    <div className="row wrap fqm-intro">
      {body && <p className="body grow">{body}</p>}
      {ctaLabel && ctaHref && (
        <a className="btn" href={ctaHref}>
          {ctaLabel}
        </a>
      )}
    </div>
  )
}

/** The Marketplace hub's children less its four areas, which the area tabs above already draw (gated
 *  by area visibility, FqMarketAreas, now pinned in each subtree's layout). */
const AREA_HREFS: readonly string[] = Object.values(AREA_PREFIX)
const marketplaceHubLinks = (v: FqMenuViewer) => hubLinks('/marketplace', v).filter((l) => !AREA_HREFS.includes(l.href))

export function FqClassifiedsBody({
  listings,
  activeKind,
  signedIn,
  subtitle,
  stats,
  intro,
}: {
  listings: FqClassified[]
  activeKind: ListingKind | null
  signedIn: boolean
  subtitle: string
  /** The whole board's counts (one unfiltered read), for the meta line. */
  stats: { total: number; free: number; lend: number; request: number }
  intro: { body: string | null; ctaLabel: string | null; ctaHref: string | null }
}) {
  const meta = [
    subtitle,
    `${stats.total} ${stats.total === 1 ? 'listing' : 'listings'}`,
    stats.free > 0 ? `${stats.free} free` : null,
    stats.lend > 0 ? `${stats.lend} to lend` : null,
    stats.request > 0 ? `${stats.request} looking for` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const items: FqGridItem[] = listings.map((l) => {
    const who = firstName(l.seller)
    return {
      id: l.id,
      href: `/classifieds/${l.id}`,
      title: l.title,
      price: classifiedPrice(l),
      sub: [l.seller, l.place].filter(Boolean).join(' · ') || null,
      image: l.image,
      text: `${l.title} ${l.description ?? ''}`,
      cta: who ? `Message ${who}` : 'Open listing',
      tag: l.unclaimed ? 'Unclaimed' : null,
      lat: l.lat,
      lng: l.lng,
    }
  })

  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Marketplace</span>
          <h2 className="h1">
            Swap it <span className="serif">locally.</span>
          </h2>
          <span className="meta">{meta}</span>
        </div>
        {signedIn && (
          <Link className="btn pa sm" href="/classifieds/new">
            <FqIcon name="tip" />
            Post a listing
          </Link>
        )}
      </div>
      <Intro {...intro} />
      <FqHiddenAreaNote area="market" />

      <nav className="chips fqm-chips lg" aria-label="Kind">
        <Link href="/classifieds" className={activeKind ? 'chip' : 'chip on'} aria-current={activeKind ? undefined : 'page'}>
          All
        </Link>
        {LISTING_KINDS.map((k) => (
          <Link
            key={k.key}
            href={`/classifieds?kind=${k.key}`}
            className={activeKind === k.key ? 'chip on' : 'chip'}
            aria-current={activeKind === k.key ? 'page' : undefined}
          >
            {k.label}
          </Link>
        ))}
      </nav>

      {listings.length === 0 ? (
        <div className="empty stack">
          <span className="h3">{activeKind ? 'Nothing here yet' : 'Classifieds is just getting started'}</span>
          <span className="t2">
            {signedIn
              ? 'Post the first listing. Offer something, give it away, or ask for what you need.'
              : 'Sign in to post and respond to listings.'}
          </span>
        </div>
      ) : (
        <FqItemGrid sections={[{ items }]} placeholder="Search listings" nearMe={listings.some((l) => l.lat != null)} />
      )}
      <Suspense fallback={null}>
        <HubLinks title="Marketplace" links={marketplaceHubLinks} />
      </Suspense>
    </>
  )
}

const GROUP_LABEL = { products: 'Products', services: 'Services', tickets: 'Tickets' } as const
type Group = keyof typeof GROUP_LABEL

const groupOf = (p: MarketItem): Group => marketGroupForKind(p.productKind)

export function FqMarketBody({
  items,
  group,
  counts,
  signedIn,
  ratings,
  verified,
  founding,
}: {
  items: MarketItem[]
  group: Group | null
  counts: { total: number; products: number; services: number; tickets: number }
  signedIn: boolean
  ratings: Map<string, ProductRating>
  verified: Map<string, boolean>
  founding: Map<string, boolean>
}) {
  const toItem = (p: MarketItem): FqGridItem => {
    const href = p.href ?? `/market/${p.id}`
    const soldOut = p.status === 'sold_out' || p.stock === 0
    const r = ratings.get(p.id)
    return {
      id: p.id,
      href,
      title: p.title,
      price: priceLabel(p),
      sub:
        [r && r.count > 0 ? `★ ${r.average.toFixed(1)} (${r.count})` : null, p.category, soldOut ? 'Sold out' : null]
          .filter(Boolean)
          .join(' · ') || null,
      image: p.images[0] ?? null,
      text: `${p.title} ${p.description ?? ''}`,
      cta: p.productKind === 'ticket' ? 'Get tickets' : p.productKind === 'service' || p.productKind === 'booking' ? 'Book' : 'View',
      tag: founding.get(p.id) ? 'Founding' : verified.get(p.id) ? 'Verified' : null,
      category: p.category,
      cents: p.priceCents,
      at: p.createdAt ?? null,
    }
  }
  // FEATURED: makers the community can trust at a glance (Founding, Verified, or rated 4.5+),
  // up to four, shown first on the unfiltered landing only. They leave their group rail so no
  // card appears twice.
  const isFeatured = (p: MarketItem) => {
    const r = ratings.get(p.id)
    return !p.projected && (founding.get(p.id) || verified.get(p.id) || (r && r.count > 0 && r.average >= 4.5))
  }
  const featured = group ? [] : items.filter(isFeatured).slice(0, 4)
  const featuredIds = new Set(featured.map((p) => p.id))
  const sections = group
    ? [{ items: items.filter((p) => groupOf(p) === group).map(toItem) }]
    : [
        ...(featured.length > 0 ? [{ title: 'Featured makers', items: featured.map(toItem) }] : []),
        ...(Object.keys(GROUP_LABEL) as Group[])
          .map((g) => ({
            title: GROUP_LABEL[g],
            seeAll: `/market?group=${g}`,
            items: items.filter((p) => groupOf(p) === g && !featuredIds.has(p.id)).map(toItem),
          }))
          .filter((s) => s.items.length > 0),
      ]
  const empty = sections.every((s) => s.items.length === 0)

  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Market</span>
          <h2 className="h1">
            Buy from your <span className="serif">community.</span>
          </h2>
          <span className="meta">
            Buy direct, the seller gets paid, the fee stays low · {counts.total} {counts.total === 1 ? 'listing' : 'listings'}
          </span>
        </div>
        {signedIn && (
          <div className="row wrap">
            <Link className="btn pa sm" href="/market/sell">
              <FqIcon name="plus" />
              List a product
            </Link>
            <Link className="btn sm" href="/market/manage">
              My storefront
            </Link>
          </div>
        )}
      </div>
      <FqHiddenAreaNote area="makers" />

      <nav className="chips fqm-chips" aria-label="Group">
        <Link href="/market" className={group ? 'chip' : 'chip on'} aria-current={group ? undefined : 'page'}>
          All {counts.total}
        </Link>
        {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
          <Link
            key={g}
            href={`/market?group=${g}`}
            className={group === g ? 'chip on' : 'chip'}
            aria-current={group === g ? 'page' : undefined}
          >
            {GROUP_LABEL[g]} {counts[g]}
          </Link>
        ))}
      </nav>

      {empty ? (
        <div className="empty stack">
          <span className="h3">{group ? `No ${GROUP_LABEL[group].toLowerCase()} yet.` : 'Nothing in the Market yet.'}</span>
          <span className="t2">When people and businesses publish to the Market, they show up here.</span>
        </div>
      ) : (
        <FqItemGrid sections={sections} placeholder="Search the Market" />
      )}

      <div className="panel row wrap fqm-note">
        <span className="t2 grow">
          {signedIn
            ? 'Make something, teach something, host something? Put it on the Market and the people near you will find it.'
            : 'Sign in to sell on the Market and to message the people behind the listings.'}
        </span>
        <Link className="btn pa" href={signedIn ? '/market/sell' : '/sign-in?next=/market'}>
          {signedIn ? 'List a product' : 'Sign in'}
        </Link>
      </div>
      <Suspense fallback={null}>
        <HubLinks title="Marketplace" links={marketplaceHubLinks} />
      </Suspense>
    </>
  )
}

// THE STORE AND HOUSING, IN THE KIT (LIVE-1090). Same head, chips and portrait grid as the other
// two doors, so all four areas read as one Marketplace under the pinned header.

export function FqStoreBody({ products }: { products: MarketItem[] }) {
  const items: FqGridItem[] = products.map((p) => {
    const soldOut = p.status === 'sold_out' || p.stock === 0
    return {
      id: p.id,
      href: `/store/${p.id}`,
      title: p.title,
      price: priceLabel(p),
      sub: [p.category, soldOut ? 'Sold out' : null].filter(Boolean).join(' · ') || null,
      image: p.images[0] ?? null,
      text: `${p.title} ${p.description ?? ''}`,
      cta: 'View',
      category: p.category,
      cents: p.priceCents,
      at: p.createdAt ?? null,
    }
  })
  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Store</span>
          <h2 className="h1">
            Wear it, gift it, <span className="serif">show up.</span>
          </h2>
          <span className="meta">
            Frequency merch, event passes and retreats, straight from us to you · {products.length} in stock · flat shipping
          </span>
        </div>
      </div>
      <FqHiddenAreaNote area="shop" />
      {items.length === 0 ? (
        <div className="empty stack">
          <span className="h3">The Store is being stocked</span>
          <span className="t2">Merch, event passes and retreats are coming. Check back soon.</span>
        </div>
      ) : (
        <FqItemGrid sections={[{ items }]} placeholder="Search the Store" />
      )}
    </>
  )
}

type FqHome = {
  id: string
  title: string
  description: string | null
  image: string | null
  priceNote: string | null
  category: string | null
  city: string | null
  lat: number | null
  lng: number | null
  createdAt: string
  unclaimed: boolean
}

export function FqHousingBody({
  homes,
  savedIds,
  selectedType,
  savedOnly,
  min,
  max,
  amenities,
  hasFacets,
}: {
  homes: FqHome[]
  savedIds: string[]
  selectedType: string
  savedOnly: boolean
  min: string
  max: string
  amenities: string[]
  hasFacets: boolean
}) {
  const saved = new Set(savedIds)
  const items: FqGridItem[] = homes.map((h) => ({
    id: h.id,
    href: `/housing/${h.id}`,
    title: h.title,
    price: h.priceNote?.trim() || 'Free',
    sub: [h.category, h.city].filter(Boolean).join(' · ') || null,
    image: h.image,
    text: `${h.title} ${h.description ?? ''}`,
    cta: 'Open listing',
    tag: h.unclaimed ? 'Unclaimed' : null,
    at: h.createdAt,
    lat: h.lat,
    lng: h.lng,
    corner: <SaveListingButton listingId={h.id} initialSaved={saved.has(h.id)} signedIn />,
  }))
  const typeHref = (slug?: string) => (slug ? `/housing?type=${slug}` : '/housing')
  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Housing</span>
          <h2 className="h1">
            Find your place, and <span className="serif">your people.</span>
          </h2>
          <span className="meta">Rentals, sublets and roommates who fit · {homes.length} {homes.length === 1 ? 'listing' : 'listings'}</span>
        </div>
        <div className="row wrap">
          <Link className="btn sm" href="/housing/roommates">
            Find a roommate
          </Link>
          <Link className="btn pa sm" href="/housing/new">
            <FqIcon name="plus" />
            List housing
          </Link>
        </div>
      </div>
      <FqHiddenAreaNote area="housing" />

      <nav className="chips fqm-chips lg" aria-label="Property type">
        <Link href="/housing" className={!selectedType && !savedOnly ? 'chip on' : 'chip'} aria-current={!selectedType && !savedOnly ? 'page' : undefined}>
          All
        </Link>
        {PROPERTY_TYPES.map((t) => (
          <Link key={t.slug} href={typeHref(t.slug)} className={selectedType === t.slug ? 'chip on' : 'chip'} aria-current={selectedType === t.slug ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
        <Link href={savedOnly ? '/housing' : '/housing?saved=1'} className={savedOnly ? 'chip on' : 'chip'} aria-current={savedOnly ? 'true' : undefined}>
          Saved
        </Link>
      </nav>

      {!savedOnly && (
        <details className="fqm-more-filters" open={hasFacets}>
          <summary className="chip">More filters</summary>
          <form method="get" className="fqm-filter-form" aria-label="Filter housing">
            {selectedType && <input type="hidden" name="type" value={selectedType} />}
            <label className="stack">
              <span className="t2">Min rent per month</span>
              <Input name="min" type="number" min="0" inputMode="numeric" defaultValue={min} placeholder="Any" />
            </label>
            <label className="stack">
              <span className="t2">Max rent per month</span>
              <Input name="max" type="number" min="0" inputMode="numeric" defaultValue={max} placeholder="Any" />
            </label>
            <fieldset className="stack">
              <legend className="t2">Amenities</legend>
              <div className="row wrap">
                {AMENITIES.map((a) => (
                  <Checkbox key={a.slug} name="amenity" value={a.slug} defaultChecked={amenities.includes(a.slug)} label={a.label} />
                ))}
              </div>
            </fieldset>
            <div className="row wrap">
              <button type="submit" className="btn pa sm">
                Apply filters
              </button>
              {hasFacets && (
                <Link className="btn sm" href="/housing">
                  Clear
                </Link>
              )}
            </div>
          </form>
        </details>
      )}

      {items.length === 0 ? (
        <div className="empty stack">
          <span className="h3">{savedOnly ? 'Nothing saved yet' : hasFacets ? 'Nothing matches those filters' : 'No housing listed near you yet'}</span>
          <span className="t2">
            {savedOnly
              ? 'Tap the heart on a home to keep it here.'
              : hasFacets
                ? 'Try widening the price range or clearing an amenity.'
                : 'List a room, a rental or a sublet. Roommate listings match to members you would get along with.'}
          </span>
        </div>
      ) : (
        <FqItemGrid sections={[{ items }]} placeholder="Search housing" nearMe={homes.some((h) => h.lat != null)} />
      )}
    </>
  )
}
