import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { getProduct, getSellerContact } from '@/lib/commerce/products'
import { canTakePayments } from '@/lib/commerce/selling'
import { buttonClasses } from '@/components/ui/button'
import { getSpaceById, getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { listOpenSlots, getSpaceBookingTimezone } from '@/lib/spaces/booking'
import { getProductReviews } from '@/lib/commerce/reviews'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
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
import { JourneySalesBody } from '@/components/marketplace/journey-sales-body'
import { AtAGlanceCard, journeyFacts } from '@/components/journey/discovery-widgets'
import { getPlanById } from '@/lib/journey-plans'
import { journeyMemberPath } from '@/lib/journeys/sales-path'
import { listActiveVariants } from '@/lib/commerce/variants'
import { effectiveVariantPriceCents, effectiveVariantStock, isBookableServiceKind, describePrice } from '@/lib/commerce/types'
import type { ServiceConfig, Price } from '@/lib/commerce/types'
import { PriceInput } from '@/components/commerce/price-input'

// Public Market listing, advertised in app/sitemap.ts. force-dynamic here would keep the
// crawler on a full render after the (main) public chrome stops reading auth. Own review
// and buy-button state hydrate from /api/viewer / BuyButton. ISR window matches /discover.
export const revalidate = 3600

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
  const meta = listingMetadata(listingDetailFromProduct(product, { isOwner: false, priceLabel }))

  // ── ONE CANONICAL URL, AND THE CHAIN COLLAPSED (ADR-1400, amending ADR-1398 §4) ───────────────
  // ADR-1398 pointed this page at `/journeys/<slug>`, which was right that the Journey slug beats a
  // product uuid (readable, and permanent across a re-price, which archives the product row and
  // writes a new one) and wrong about which Journey URL. `/journeys/<slug>` declares ITS canonical
  // to be `/discover/journeys/<slug>`, so this was a CHAIN: market -> member page -> public page,
  // each hop pointing at a URL that disclaimed itself. Worse, the member page redirects a
  // signed-out visitor away (TWIN_RULES), so the URL search was being consolidated onto was one
  // most of the audience could not load.
  //
  // It now points at the end of that chain directly. `/discover/journeys/<slug>` is readable,
  // permanent, publicly reachable, already self-canonical, and since ADR-1400 it states the price
  // and carries the Offer in its structured data -- which is what makes it a legitimate target for
  // a product page rather than a marketing stub.
  if (product.journeyPlanId) {
    const plan = await getPlanById(product.journeyPlanId)
    if (plan) {
      meta.alternates = { ...(meta.alternates ?? {}), canonical: `/discover/journeys/${plan.plan.slug}` }
    }
  }
  return meta
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
  const product = await getProduct(id)
  if (!product || product.status !== 'active') notFound()
  // 'booking' is an alias of 'service' for rendering/booking: both take the calendar picker, never a
  // Buy button, so a product_kind='booking' row can never mis-render as a plain product (F11).
  const isService = isBookableServiceKind(product.productKind)

  // A Space-owned listing carries TWO extra publish gates beyond status='active' (which only means
  // "live in the Space's own Shop console"): market_published (opt-in to the global Market) and the
  // storefront.published flag (the public Shop tab). The public page is the anonymous gate only.
  // Managers preview drafts from the Shop console, not here. Maker listings keep active===public.
  if (product.ownerKind === 'space') {
    const space = product.ownerSpaceId ? await getSpaceById(product.ownerSpaceId) : null
    if (!space) notFound()
    const storefront = readStorefrontConfig(space.preferences)
    const visible = await getVisibleSpaceBySlug(space.slug, null)
    if (!visible || !(product.marketPublished || storefront.published)) notFound()
  }

  // ── ONE SALES PAGE (ADR-1404) ────────────────────────────────────────────────────────────────
  // A Journey is not a Market listing with extra copy. Shop and Market are doors. The pitch and
  // the till live on the Journey slug. Leftover `/market/<uuid>` links (emails, old cards, a
  // re-priced row) hop here once, then leave. A missing plan falls through to the generic listing
  // so a deleted Journey does not 404 a paid receipt.
  if (product.journeyPlanId) {
    const plan = await getPlanById(product.journeyPlanId)
    if (plan?.plan.slug) redirect(journeyMemberPath(plan.plan.slug))
  }

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
  // Public path is active-only (non-active notFound above). Sold-out is stock/variants,
  // not the sold_out status that only the owner preview used to see.
  const soldOut = hasVariants ? allVariantsSoldOut : product.stock === 0

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
  const [sellerVerified, reviews, comments, highestOfferCents] = await Promise.all([
    sellerVerifiedForProduct(product),
    getProductReviews(product.id),
    getListingComments('product', product.id),
    getHighestOfferCents('product', product.id),
  ])

  // A priced Journey buys ACCESS TO A COURSE, not a parcel, so its purchase panel says so: the
  // amount rides the card form, the confirmation reads "You are in", and closing it lands the buyer
  // in the Journey rather than back on the page that sold it. The slug is the only extra fact that
  // needs, and it is read only for a Journey product.
  const journeyPlan = product.journeyPlanId ? await getPlanById(product.journeyPlanId) : null

  // The hero action: only the connect-only "Contact seller" path is a plain link. The Buy button,
  // variant picker, and booking calendar are interactive, so they render in the footer purchase panel.
  const heroAction: ListingAction | null =
    connectOnly && sellerContact
      ? { kind: 'contact', label: 'Contact seller', href: `/people/${sellerContact.handle}` }
      : { kind: 'none', label: '', href: '' }

  const view = listingDetailFromProduct(product, {
    isOwner: false,
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
    <ViewerProvider>
    <ListingDetailTemplate
      view={view}
      // A Journey product's image set is generated, not curated: it is always exactly the cover,
      // so the solo gallery row under the hero would be the hero again. See the prop's note.
      soloGalleryRow={!journeyPlan}
      asideExtras={
        journeyPlan && !isService ? (
          <AtAGlanceCard
            plan={journeyPlan.plan}
            slug={journeyPlan.plan.slug}
            facts={journeyFacts(journeyPlan.items)}
            enrolled={false}
            canStart
            isAuthor={false}
            progress={null}
            cta={
              soldOut ? (
                <p className="text-body-sm font-medium text-subtle">Every seat is taken.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-page-title font-bold text-text">{priceLabel}</p>
                  <BuyButton
                    productId={product.id}
                    label="Get access"
                    priceLabel={priceLabel}
                    doneTitle="You are in."
                    doneBody={`You are enrolled in ${journeyPlan.plan.title}. A receipt is on its way to your email.`}
                    doneHref={`/journeys/${journeyPlan.plan.slug}/learn`}
                  />
                </div>
              )
            }
          />
        ) : undefined
      }
      comments={comments}
      canComment={false}
      canModerate={false}
      myProfileId={null}
      contactNote={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-meta text-subtle">
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
      }
      footer={
        <>
          <div className="mt-3 rounded-3xl border border-border bg-surface p-5 lift-1">
            {isService ? (
                <div className="space-y-4">
                  {/* Pricing Options P2: a Choose-your-price service shows the buyer control (suggested
                      anchor + optional floor). DISPLAY only, no charge (booking stays on its existing
                      gated path). */}
                  {svc.priceModel === 'choose' && (
                    <div>
                      <p className="mb-2 text-meta font-semibold text-subtle">Name your price</p>
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
            ) : soldOut ? (
              <p className="text-body-sm font-medium text-subtle">Sold out.</p>
            ) : connectOnly ? (
              sellerContact ? (
                <Link href={`/people/${sellerContact.handle}`} className={buttonClasses('primary', 'md')}>
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Contact seller
                </Link>
              ) : (
                <p className="text-body-sm text-subtle">Message the seller to arrange this.</p>
              )
            ) : hasVariants ? (
              <VariantPicker
                productId={product.id}
                priceCents={product.priceCents}
                currency={product.currency}
                variants={variants}
              />
            ) : (
              // LIVE-220: the Market page is a discovery surface. proxy.ts stamps the product id
              // on this path; startCheckoutAction reads that cookie. Do not pass an entryPoint
              // prop — a client argument is what this row retired. `/store/[id]` is never stamped.
              // A Journey's buy control lives in the RAIL (see `asideExtras`), so this panel
              // renders nothing for one: two mounted checkout islands on one page is the defect
              // ADR-1401 removed from the Journey page, not a pattern to copy here.
              journeyPlan ? null : (
                <BuyButton productId={product.id} priceLabel={priceLabel} />
              )
            )}
          </div>

          {/* ── THE SALES PAGE, for a Journey product (ADR-1398) ──────────────────────────────
              Derived live from the Journey this product sells: the story, what you'll learn, the
              phase-by-phase path, how it meets, the guide, the questions. Renders nothing for every
              other product kind, and nothing at all if the Journey cannot be loaded. It sits BELOW
              the purchase panel because the buy box belongs high and the persuading belongs under
              it, and ABOVE reviews because proof reads better after the thing being proved. */}
          {product.journeyPlanId && (
            <JourneySalesBody
              planId={product.journeyPlanId}
              // Proof after the thing being proved and before the objections it answers. Passed in
              // rather than read: reviews are keyed to the product row, which the sales body
              // deliberately knows nothing about.
              proof={
                <ProductReviews
                  productId={product.id}
                  productTitle={product.title}
                  reviews={reviews}
                  myReview={null}
                  signedIn={false}
                  canReview={false}
                  canModerate={false}
                />
              }
            />
          )}

          {!product.journeyPlanId && (
            <ProductReviews
              productId={product.id}
              productTitle={product.title}
              reviews={reviews}
              myReview={null}
              signedIn={false}
              canReview={false}
              canModerate={false}
            />
          )}
          {/* Airwaves (ADR-608, P1): any Recordings attached to this product, gated per viewer. Renders
              nothing when none are attached. Behind Suspense so it never blocks the detail. */}
          <Suspense fallback={null}>
            <AttachedRecordingsSection hostKind="product" hostId={product.id} compact />
          </Suspense>
        </>
      }
    >
      {(sellerVerified || (isService && (svc.durationMin || svc.cancellationWindowHours))) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-subtle">
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
    </ViewerProvider>
  )
}
