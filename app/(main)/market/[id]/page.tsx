import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { getCallerProfile, isPlatformStaff } from '@/lib/auth'
import { getProduct, getSellerContact } from '@/lib/commerce/products'
import { canTakePayments } from '@/lib/commerce/selling'
import { buttonClasses } from '@/components/ui/button'
import { getSpaceById, getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { listOpenSlots, getSpaceBookingTimezone } from '@/lib/spaces/booking'
import { getProductReviews, getMyProductReview } from '@/lib/commerce/reviews'
import { sellerVerifiedForProduct } from '@/lib/commerce/seller-verification'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { ReportButton } from '@/components/marketplace/report-button'
import { ProductReviews } from '@/components/marketplace/product-reviews'
import { Suspense } from 'react'
import { AttachedRecordingsSection } from '@/components/airwaves/attached-recordings-section'
import { ServiceBookingPicker } from '@/components/marketplace/service-booking-picker'
import { VariantPicker } from '@/components/marketplace/variant-picker'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromProduct, type ListingAction } from '@/lib/listings-shared/detail-view'
import { listingMetadata } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { getHighestOfferCents } from '@/lib/marketplace/listing-offers'
import { BuyButton } from '../../marketplace/buy-button'
import { listActiveVariants } from '@/lib/commerce/variants'
import { effectiveVariantPriceCents, effectiveVariantStock, isBookableServiceKind, describePrice } from '@/lib/commerce/types'
import type { ServiceConfig, Price } from '@/lib/commerce/types'
import { PriceInput } from '@/components/commerce/price-input'

export const dynamic = 'force-dynamic'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id)
  if (!product) return { title: 'Product not found', robots: { index: false, follow: false } }
  // A lightweight price label is enough for the head (the full service/variant nuance lives in the
  // page body). Free/contact services read plainly; everything else is the base price.
  const priceLabel =
    product.priceCents > 0 ? usd(product.priceCents, product.currency ?? 'usd') : 'Free'
  return listingMetadata(listingDetailFromProduct(product, { isOwner: false, priceLabel }))
}

/** Map a service's quote onto the unified buyer Price (Pricing Options P2). `choose` reads the anchor
 *  from the stored suggested amount (falling back to the base price) plus the optional floor. */
function serviceToPrice(priceCents: number, svc: ServiceConfig): Price {
  switch (svc.priceModel) {
    case 'free':
      return { mode: 'free' }
    case 'contact':
      return { mode: 'contact' }
    case 'choose': {
      const price: Price = { mode: 'choose', suggestedCents: svc.suggestedCents ?? priceCents }
      if (svc.minCents != null) price.minCents = svc.minCents
      return price
    }
    default:
      return { mode: 'fixed', amountCents: priceCents }
  }
}

/** The price label for a service, honoring its priceModel (fixed / from / free / contact / choose). */
function servicePriceLabel(priceCents: number, currency: string, svc: ServiceConfig): string {
  if (svc.priceModel === 'free') return 'Free'
  if (svc.priceModel === 'contact') return 'Contact for pricing'
  if (svc.priceModel === 'choose') return describePrice(serviceToPrice(priceCents, svc))
  const base = usd(priceCents, currency)
  return svc.priceModel === 'from' ? `From ${base}` : base
}

export default async function MarketProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCallerProfile()
  const profileId = caller?.id ?? null
  const product = await getProduct(id)
  if (!product) notFound()
  // 'booking' is an alias of 'service' for rendering/booking: both take the calendar picker, never a
  // Buy button, so a product_kind='booking' row can never mis-render as a plain product (F11).
  const isService = isBookableServiceKind(product.productKind)

  // A Space-owned listing carries TWO extra publish gates beyond status='active' (which only means
  // "live in the Space's own Shop console"): market_published (opt-in to the global Market) and the
  // storefront.published flag (the public Shop tab). A non-manager may view it only when it is opted
  // into the Market OR the Space's storefront is published AND the Space itself is visible. A manager
  // may always preview. Maker (owner_kind='profile') listings keep the active===public semantic (the
  // maker funnel sets market_published), so they skip this. (ADR-596, exposure fix.)
  let isManager = false
  if (product.ownerKind === 'space') {
    const space = product.ownerSpaceId ? await getSpaceById(product.ownerSpaceId) : null
    if (!space) notFound()
    const manage = await resolveSpaceManageAccess(space, profileId, caller?.webRole)
    isManager = manage.canManage || manage.staffViewing
    if (!isManager) {
      const storefront = readStorefrontConfig(space.preferences)
      const visible = await getVisibleSpaceBySlug(space.slug, profileId)
      if (!visible || !(product.marketPublished || storefront.published)) notFound()
    }
  }

  // Owner/manager may preview a non-active (draft) listing; the public sees active only.
  const isOwner = (!!profileId && product.ownerProfileId === profileId) || isManager
  if (product.status !== 'active' && !isOwner) notFound()

  const svc = ((product.metadata as Record<string, unknown>)?.service ?? {}) as ServiceConfig

  // Purchasable variants (Etsy-Grade Phase 2): only a plain product carries them (a service books, never
  // buys). With variants the buyer picks one (the picker sets the price + availability); the price label
  // reads "From <min variant price>" and sold-out means EVERY tracked variant is out (not product.stock).
  const variants = !isService ? await listActiveVariants(product.id) : []
  const hasVariants = variants.length > 0
  const minVariantPrice = hasVariants
    ? Math.min(...variants.map((v) => effectiveVariantPriceCents({ priceCents: product.priceCents }, v)))
    : product.priceCents
  const allVariantsSoldOut =
    hasVariants &&
    variants.every((v) => {
      const s = effectiveVariantStock(v)
      return s != null && s <= 0
    })
  const soldOut = product.status === 'sold_out' || (hasVariants ? allVariantsSoldOut : product.stock === 0)

  // R2 (Phase 0): only a Business Space Shop or the Frequency Store may take in-app payments. An
  // individual maker listing is CONNECT-ONLY — the buyer messages the seller instead of a Buy button.
  const connectOnly = !canTakePayments(product.ownerKind)
  const sellerContact = connectOnly ? await getSellerContact(product.ownerProfileId) : null

  // A service pulls its open slots from the Space's availability calendar (booking_space_id).
  const [slots, tz] =
    isService && product.bookingSpaceId
      ? await Promise.all([listOpenSlots(product.bookingSpaceId), getSpaceBookingTimezone(product.bookingSpaceId)])
      : [[], 'UTC']

  const priceLabel = isService
    ? servicePriceLabel(product.priceCents, product.currency, svc)
    : hasVariants
      ? `From ${usd(minVariantPrice, product.currency)}`
      : usd(product.priceCents, product.currency)

  // Trust & Safety (Phase 8): the seller verification badge, the reviews block, and the viewer's own
  // review (to prefill). A signed-in non-owner may review; a platform operator may moderate.
  const [sellerVerified, reviews, myReview, operator, comments, highestOfferCents] = await Promise.all([
    sellerVerifiedForProduct(product),
    getProductReviews(product.id),
    getMyProductReview(product.id, profileId),
    isPlatformStaff(),
    getListingComments('product', product.id),
    getHighestOfferCents('product', product.id),
  ])

  // The hero action: only the connect-only "Contact seller" path is a plain link. The Buy button,
  // variant picker, and booking calendar are interactive, so they render in the footer purchase panel.
  const heroAction: ListingAction | null =
    connectOnly && sellerContact && !isOwner
      ? { kind: 'contact', label: 'Contact seller', href: `/people/${sellerContact.handle}` }
      : { kind: 'none', label: '', href: '' }

  const view = listingDetailFromProduct(product, {
    isOwner,
    priceLabel,
    seller: null,
    action: heroAction,
    highestOfferCents,
    // The visible-review aggregate feeds the Product AggregateRating JSON-LD (a commerce AIO signal). Only
    // emitted downstream when count > 0, so a listing with no reviews carries no rating node.
    aggregateRating:
      reviews.average != null && reviews.count > 0
        ? { ratingValue: reviews.average, reviewCount: reviews.count }
        : null,
    // The latest visible reviews feed the individual schema.org Review nodes (quotable text + star
    // rich results). The JSON-LD builder caps + drops any without a real author/body, so the full
    // visible list is safe to pass; an unreviewed product yields no Review nodes.
    reviews: reviews.latest.map((r) => ({
      author: r.author?.displayName ?? null,
      rating: r.rating,
      body: r.body,
      datePublished: r.createdAt,
    })),
  })

  return (
    <ListingDetailTemplate
      view={view}
      comments={comments}
      canComment={!!profileId}
      canModerate={isOwner || operator}
      myProfileId={profileId}
      contactNote={
        !isOwner ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle">
              {isService
                ? 'Booking holds your slot; payment is secure on Stripe. The space gets paid directly, the fee stays low.'
                : soldOut
                  ? 'This one is sold out.'
                  : connectOnly
                    ? 'No checkout on this listing. Message the seller to arrange payment and pickup.'
                    : 'Checkout is secure on Stripe. The seller gets paid directly; the platform fee stays low.'}
            </p>
            <ReportButton targetKind="product" targetId={product.id} />
          </div>
        ) : undefined
      }
      footer={
        <>
          <div className="mt-3 rounded-3xl border border-border bg-surface p-5 shadow-sm">
            {isService ? (
              isOwner ? (
                <p className="text-sm text-subtle">This is your service. Members pick a time here to book.</p>
              ) : (
                <div className="space-y-4">
                  {/* Pricing Options P2: a Choose-your-price service shows the buyer control (suggested
                      anchor + optional floor). DISPLAY only, no charge (booking stays on its existing
                      gated path). */}
                  {svc.priceModel === 'choose' && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-subtle">Name your price</p>
                      <PriceInput
                        price={serviceToPrice(product.priceCents, svc)}
                        idPrefix={`svc-${product.id}`}
                      />
                    </div>
                  )}
                  <ServiceBookingPicker
                    productId={product.id}
                    slots={slots}
                    timezone={tz}
                    contactOnly={svc.priceModel === 'contact'}
                  />
                </div>
              )
            ) : soldOut ? (
              <p className="text-sm font-medium text-subtle">Sold out.</p>
            ) : isOwner ? (
              <p className="text-sm text-subtle">
                {connectOnly
                  ? 'This is your listing. Buyers see a Contact seller button here.'
                  : 'This is your listing. Buyers see a Buy button here.'}
              </p>
            ) : connectOnly ? (
              sellerContact ? (
                <Link href={`/people/${sellerContact.handle}`} className={buttonClasses('primary', 'md')}>
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Contact seller
                </Link>
              ) : (
                <p className="text-sm text-subtle">Message the seller to arrange this.</p>
              )
            ) : hasVariants ? (
              <VariantPicker
                productId={product.id}
                priceCents={product.priceCents}
                currency={product.currency}
                variants={variants}
              />
            ) : (
              <BuyButton productId={product.id} />
            )}
          </div>

          <ProductReviews
            productId={product.id}
            productTitle={product.title}
            reviews={reviews}
            myReview={myReview}
            signedIn={!!profileId}
            canReview={!!profileId && !isOwner}
            canModerate={operator}
          />
          {/* Airwaves (ADR-608, P1): any Recordings attached to this product, gated per viewer. Renders
              nothing when none are attached. Behind Suspense so it never blocks the detail. */}
          <Suspense fallback={null}>
            <AttachedRecordingsSection hostKind="product" hostId={product.id} compact />
          </Suspense>
        </>
      }
    >
      {(sellerVerified || (isService && (svc.durationMin || svc.cancellationWindowHours))) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
          {sellerVerified && <VerifiedBadge verified withLabel />}
          {isService && (svc.durationMin || svc.cancellationWindowHours) && (
            <span>
              {svc.durationMin ? `${svc.durationMin} minutes` : null}
              {svc.durationMin && svc.cancellationWindowHours ? ' · ' : null}
              {svc.cancellationWindowHours ? `Free cancellation up to ${svc.cancellationWindowHours}h before` : null}
            </span>
          )}
        </div>
      )}
    </ListingDetailTemplate>
  )
}
