import Link from 'next/link'
import '@/app/themes/frequency/members-b.css'
import { FqIcon } from '@/components/frequency/icon'
import { priceLabel } from '@/components/marketplace/product-card'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace-core'
import type { MarketItem } from '@/lib/commerce/types'

// MARKETPLACE, FREQUENCY BODIES (templates/members/Marketplace.html). Two doors share the one
// reference layout: the head, the filter chips and the four-up portrait grid.
//
//   · CLASSIFIEDS (/classifieds, the Marketplace door's default) is the reference page itself: swap
//     it locally, no in-app payment. Each card's button opens the listing, where the seller is
//     messaged; the price is the seller's own price note.
//   · THE MARKET (/market) sells through checkout, so each card opens the product page, where the
//     buy flow already lives. Prices come from the catalog through the card's own price rule.

export type FqClassified = {
  id: string
  title: string
  kind: ListingKind
  priceNote: string | null
  image: string | null
  seller: string | null
  place: string | null
}

function firstName(name: string | null): string | null {
  return name ? name.split(' ')[0] : null
}

function classifiedPrice(l: FqClassified): string {
  if (l.kind === 'free') return 'Free'
  if (l.priceNote) return l.priceNote
  return LISTING_KINDS.find((k) => k.key === l.kind)?.label ?? ''
}

export function FqClassifiedsBody({
  listings,
  activeKind,
  signedIn,
  subtitle,
}: {
  listings: FqClassified[]
  activeKind: ListingKind | null
  signedIn: boolean
  subtitle: string
}) {
  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Marketplace</span>
          <h1 className="h1">
            Swap it <span className="serif">locally.</span>
          </h1>
          <span className="meta">{subtitle}</span>
        </div>
        {signedIn && (
          <Link className="btn pa lg" href="/classifieds/new">
            <FqIcon name="tip" />
            Post a listing
          </Link>
        )}
      </div>

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
        <div className="g4">
          {listings.map((l) => {
            const who = firstName(l.seller)
            return (
              <div key={l.id} className="stack fqm-item">
                <Link
                  className="ph"
                  href={`/classifieds/${l.id}`}
                  aria-label={l.title}
                  style={l.image ? { backgroundImage: `url('${l.image}')` } : undefined}
                />
                <span className="row">
                  <span className="t1 grow">{l.title}</span>
                  <span className="t1">{classifiedPrice(l)}</span>
                </span>
                {(l.seller || l.place) && (
                  <span className="t2">{[l.seller, l.place].filter(Boolean).join(' · ')}</span>
                )}
                <Link className="btn sm" href={`/classifieds/${l.id}`}>
                  {who ? `Message ${who}` : 'Open listing'}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

const GROUP_LABEL = { products: 'Products', services: 'Services', tickets: 'Tickets' } as const

export function FqMarketBody({
  items,
  group,
  counts,
  signedIn,
}: {
  items: MarketItem[]
  group: keyof typeof GROUP_LABEL | null
  counts: { total: number; products: number; services: number; tickets: number }
  signedIn: boolean
}) {
  return (
    <>
      <div className="head">
        <div>
          <span className="k">Community · Market</span>
          <h1 className="h1">
            Buy from your <span className="serif">community.</span>
          </h1>
          <span className="meta">Buy direct, the seller gets paid, the fee stays low.</span>
        </div>
        {signedIn && (
          <div className="row wrap">
            <Link className="btn pa lg" href="/market/sell">
              <FqIcon name="plus" />
              List a product
            </Link>
            <Link className="btn lg" href="/market/manage">
              My storefront
            </Link>
          </div>
        )}
      </div>

      <nav className="chips fqm-chips lg" aria-label="Group">
        <Link href="/market" className={group ? 'chip' : 'chip on'} aria-current={group ? undefined : 'page'}>
          All {counts.total}
        </Link>
        {(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => (
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

      {items.length === 0 ? (
        <div className="empty stack">
          <span className="h3">{group ? `No ${GROUP_LABEL[group].toLowerCase()} yet.` : 'Nothing in the Market yet.'}</span>
          <span className="t2">When people and businesses publish to the Market, they show up here.</span>
        </div>
      ) : (
        <div className="g4">
          {items.map((p) => {
            const href = p.href ?? `/market/${p.id}`
            const soldOut = p.status === 'sold_out' || p.stock === 0
            return (
              <div key={p.id} className="stack fqm-item">
                <Link
                  className="ph"
                  href={href}
                  aria-label={p.title}
                  style={p.images[0] ? { backgroundImage: `url('${p.images[0]}')` } : undefined}
                />
                <span className="row">
                  <span className="t1 grow">{p.title}</span>
                  <span className="t1">{priceLabel(p)}</span>
                </span>
                {(p.category || soldOut) && (
                  <span className="t2">{[p.category, soldOut ? 'Sold out' : null].filter(Boolean).join(' · ')}</span>
                )}
                <Link className="btn sm" href={href}>
                  {p.productKind === 'ticket' ? 'Get tickets' : p.productKind === 'service' || p.productKind === 'booking' ? 'Book' : 'View'}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
