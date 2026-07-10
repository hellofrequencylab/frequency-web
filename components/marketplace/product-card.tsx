import Image from 'next/image'
import { Package, CalendarClock, Ticket, Star } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { marketGroupForKind, type CommerceProduct, type MarketGroup } from '@/lib/commerce/types'
import type { ProductRating } from '@/lib/commerce/reviews'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

/** The card's price label. A service honors its priceModel (From / Free / Enquire); a product shows its
 *  flat price. Keeps a raw '$0' Buy from rendering on an enquire-only service (ADR-596). */
function priceLabel(product: CommerceProduct): string {
  const svc = (product.metadata as Record<string, unknown>)?.service as { priceModel?: string } | undefined
  if (product.productKind === 'service' && svc?.priceModel) {
    if (svc.priceModel === 'free') return 'Free'
    if (svc.priceModel === 'contact') return 'Enquire'
    const base = usd(product.priceCents, product.currency)
    return svc.priceModel === 'from' ? `From ${base}` : base
  }
  return usd(product.priceCents, product.currency)
}

/** A bookable service's duration, when set, for the card's stat row. */
function serviceDuration(product: CommerceProduct): string | null {
  const svc = (product.metadata as Record<string, unknown>)?.service as { durationMin?: number } | undefined
  return svc?.durationMin ? `${svc.durationMin} min` : null
}

const GROUP_META: Record<MarketGroup, { label: string; Icon: typeof Package }> = {
  products: { label: 'Product', Icon: Package },
  services: { label: 'Service', Icon: CalendarClock },
  tickets: { label: 'Ticket', Icon: Ticket },
}

// Browse card for a commerce product (maker / Frequency Store / Space storefront). Every card leads with
// a header image: the listing's first photo, or a branded gradient + type icon when it has none, so the
// grid always reads as a real catalog. Stats: the type, category, price, a service's duration, the
// aggregate rating (Phase 8) and a seller "Verified" badge when the seller carries verification.
export function ProductCard({
  product,
  href,
  rating,
  verified = false,
}: {
  product: CommerceProduct
  href: string
  rating?: ProductRating | null
  verified?: boolean
}) {
  const soldOut = product.status === 'sold_out' || product.stock === 0
  const group = marketGroupForKind(product.productKind)
  const { label: groupLabel, Icon } = GROUP_META[group]
  const duration = group === 'services' ? serviceDuration(product) : null

  const cover = product.images[0] ? (
    <Image fill src={product.images[0]} alt="" className="object-cover" sizes="(min-width:1024px) 25vw, 100vw" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg/40 via-surface-elevated to-surface-elevated">
      <Icon className="h-10 w-10 text-primary/40" aria-hidden />
    </div>
  )

  return (
    <EntityCard
      href={href}
      cover={cover}
      title={product.title}
      badge={
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary-bg/60 px-2 py-0.5 text-2xs font-semibold text-primary-strong">
            {groupLabel}
          </span>
          <VerifiedBadge verified={verified} />
        </span>
      }
      context={product.category ?? undefined}
      description={product.description ?? undefined}
      meta={
        <>
          <span className="font-semibold text-text">{priceLabel(product)}</span>
          {duration && <span>{duration}</span>}
          {rating && rating.count > 0 && (
            <span className="inline-flex items-center gap-1 text-subtle">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
              <span>
                {rating.average.toFixed(1)}
                <span className="text-2xs"> ({rating.count})</span>
              </span>
            </span>
          )}
          {soldOut && (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-subtle">
              Sold out
            </span>
          )}
        </>
      }
      dimmed={soldOut}
    />
  )
}
