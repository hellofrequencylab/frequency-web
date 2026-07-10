import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getProduct } from '@/lib/commerce/products'
import { listOpenSlots, getSpaceBookingTimezone } from '@/lib/spaces/booking'
import { DetailTemplate } from '@/components/templates'
import { ReportButton } from '@/components/marketplace/report-button'
import { ServiceBookingPicker } from '@/components/marketplace/service-booking-picker'
import { BuyButton } from '../../marketplace/buy-button'
import type { ServiceConfig } from '@/lib/commerce/types'

export const dynamic = 'force-dynamic'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

/** The price label for a service, honoring its priceModel (fixed / from / free / contact). */
function servicePriceLabel(priceCents: number, currency: string, svc: ServiceConfig): string {
  if (svc.priceModel === 'free') return 'Free'
  if (svc.priceModel === 'contact') return 'Contact for pricing'
  const base = usd(priceCents, currency)
  return svc.priceModel === 'from' ? `From ${base}` : base
}

export default async function MarketProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, product] = await Promise.all([getMyProfileId(), getProduct(id)])
  if (!product) notFound()
  const isService = product.productKind === 'service'
  // Maker products, services, and any Market-published listing (a Space's opt-in, Phase 5) render here.
  if (product.vertical !== 'maker' && !isService && !product.marketPublished) notFound()

  // Owner = the maker who owns it (space-owned services show the picker to everyone, incl. the owner
  // previewing). Non-active listings are visible only to their maker owner.
  const isOwner = !!profileId && product.ownerProfileId === profileId
  if (product.status !== 'active' && product.ownerProfileId !== profileId) notFound()

  const svc = ((product.metadata as Record<string, unknown>)?.service ?? {}) as ServiceConfig
  const soldOut = product.status === 'sold_out' || product.stock === 0

  // A service pulls its open slots from the Space's availability calendar (booking_space_id).
  const [slots, tz] =
    isService && product.bookingSpaceId
      ? await Promise.all([listOpenSlots(product.bookingSpaceId), getSpaceBookingTimezone(product.bookingSpaceId)])
      : [[], 'UTC']

  const subtitle = isService
    ? servicePriceLabel(product.priceCents, product.currency, svc)
    : usd(product.priceCents, product.currency)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <DetailTemplate
        back={{ href: '/market', label: 'Market' }}
        title={product.title}
        subtitle={<span className="font-semibold text-text">{subtitle}</span>}
        badges={product.category ? <span className="text-xs text-subtle">{product.category}</span> : undefined}
      >
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          {product.images.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {product.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${product.title}, photo ${i + 1}`}
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}

          {isService && (svc.durationMin || svc.cancellationWindowHours) && (
            <p className="mb-3 text-xs text-subtle">
              {svc.durationMin ? `${svc.durationMin} minutes` : null}
              {svc.durationMin && svc.cancellationWindowHours ? ' · ' : null}
              {svc.cancellationWindowHours ? `Free cancellation up to ${svc.cancellationWindowHours}h before` : null}
            </p>
          )}

          {product.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{product.description}</p>
          )}

          <div className="mt-5 border-t border-border pt-4">
            {isService ? (
              isOwner ? (
                <p className="text-sm text-subtle">This is your service. Members pick a time here to book.</p>
              ) : (
                <ServiceBookingPicker
                  productId={product.id}
                  slots={slots}
                  timezone={tz}
                  contactOnly={svc.priceModel === 'contact'}
                />
              )
            ) : soldOut ? (
              <p className="text-sm font-medium text-subtle">Sold out.</p>
            ) : isOwner ? (
              <p className="text-sm text-subtle">This is your listing. Buyers see a Buy button here.</p>
            ) : (
              <BuyButton productId={product.id} />
            )}
          </div>
        </div>

        {!isOwner && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-subtle">
              {isService
                ? 'Booking holds your slot; payment is secure on Stripe. The space gets paid directly, the fee stays low.'
                : soldOut
                  ? 'This piece is sold out.'
                  : 'Checkout is secure on Stripe. The seller gets paid directly; the platform fee stays low.'}
            </p>
            <ReportButton targetKind="product" targetId={product.id} />
          </div>
        )}
      </DetailTemplate>
    </div>
  )
}
