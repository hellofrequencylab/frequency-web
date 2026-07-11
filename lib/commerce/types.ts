// Commerce core contracts (ADR-39X). The charge model (destination charge +
// application fee) lives in ./checkout.ts; these are data shapes only.

export type OwnerKind = 'platform' | 'profile' | 'space'
export type ProductKind = 'physical' | 'digital' | 'service' | 'booking' | 'ticket'
/** A physical listing's condition (Phase 0). null = unset (services/bookings/tickets have none).
 *  Role gate (R3): individuals may list 'used' only; Business Spaces + the Store may list either. */
export type ProductCondition = 'new' | 'used'
export type CommerceVertical = 'shop' | 'maker' | 'service'
export type ProductStatus = 'draft' | 'active' | 'sold_out' | 'archived'
export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded' | 'failed'
export type FulfillmentStatus = 'none' | 'pending' | 'shipped' | 'delivered' | 'completed'

export interface CommerceProduct {
  id: string
  ownerKind: OwnerKind
  ownerProfileId: string | null
  ownerSpaceId: string | null
  entityId: string
  productKind: ProductKind
  vertical: CommerceVertical
  title: string
  description: string | null
  images: string[]
  priceCents: number
  currency: string
  stock: number | null
  category: string | null
  status: ProductStatus
  bookingSpaceId: string | null
  /** New or Used (Phase 0). null when condition does not apply (services/bookings/tickets). */
  condition: ProductCondition | null
  /** Opt-in to appear in the global Market umbrella (ADR-596). status='active' shows a listing in the
   *  Space's own Shop; this flag additionally publishes it to the cross-space Market. */
  marketPublished: boolean
  /** Buyer-facing discovery tags (Etsy-Grade Phase 1), stored in commerce_products.tags. The free-form
   *  complement to the controlled `category` taxonomy (lib/commerce/categories.ts). */
  tags: string[]
  metadata: Record<string, unknown>
  isDemo: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductInput {
  ownerKind: OwnerKind
  ownerProfileId?: string | null
  ownerSpaceId?: string | null
  productKind?: ProductKind
  vertical?: CommerceVertical
  title: string
  description?: string | null
  images?: string[]
  priceCents: number
  stock?: number | null
  category?: string | null
  bookingSpaceId?: string | null
  /** New or Used (Phase 0). Omit/null when condition does not apply. The create action enforces the
   *  role gate (R3): a 'profile' seller may only pass 'used'. */
  condition?: ProductCondition | null
  /** Opt this listing into the global Market on create (the maker path sets true; Space listings
   *  default false and opt in per-listing from the Shop console). */
  marketPublished?: boolean
  /** Buyer-facing discovery tags (Etsy-Grade Phase 1). Capped + stored in commerce_products.tags. */
  tags?: string[]
  /** Service quote + policy for a service/booking listing (priceModel, duration, deposit,
   *  cancellationWindowHours, noShowFeePct). Persisted under metadata.service; ignored for non-services. */
  service?: ServiceConfig | null
}

export interface CheckoutInput {
  buyerProfileId: string
  items: { productId: string; variantId?: string | null; qty: number }[]
  shipping?: Record<string, unknown>
}

// ── Market grouping (ADR-596) ──────────────────────────────────────────────────────────────
// The Market umbrella surface groups every listing by TYPE into three rails. The grouping is
// derived from the existing `product_kind` discriminator (no new column): the schema already
// distinguishes physical/digital/service/booking/ticket, so the umbrella reads the group from it.

/** A Market browse item: either a real `commerce_products` listing or a READ-ONLY projection (a
 *  ticketed event surfaced in the Tickets rail, ADR-596 / audit #2 — events stay the source of
 *  truth, never a commerce_products row). Extends the product shape with two optional fields:
 *  `href` (an explicit destination override, so a projected ticket deep-links to /events/<slug>
 *  instead of /market/<id>) and `projected` (the discriminator). Real commerce products omit both,
 *  so they keep routing to /market/<id>. `priceCents` is widened to nullable so a free projection
 *  (no positive tier) reads as "Free" rather than "$0". A plain CommerceProduct is assignable to a
 *  MarketItem, so every existing reader/consumer keeps working unchanged. */
export type MarketItem = Omit<CommerceProduct, 'priceCents'> & {
  priceCents: number | null
  /** Explicit link override. Absent for commerce products (they route to /market/<id>). */
  href?: string
  /** True for a read-only ticketed-event projection (never backed by a commerce_products row). */
  projected?: boolean
}

/** The three typed rails the Market umbrella groups listings into. */
export type MarketGroup = 'products' | 'services' | 'tickets'

/** The Market groups in display order (Products, Services, Tickets). */
export const MARKET_GROUPS: readonly MarketGroup[] = ['products', 'services', 'tickets']

/** Map a product_kind to its Market group (ADR-596). Physical/digital = Products; service/booking =
 *  Services; ticket = Tickets. PURE. */
export function marketGroupForKind(kind: ProductKind): MarketGroup {
  switch (kind) {
    case 'ticket':
      return 'tickets'
    case 'service':
    case 'booking':
      return 'services'
    default:
      return 'products'
  }
}

/** The product_kinds that make up a Market group (the inverse of marketGroupForKind), so the umbrella
 *  reader can filter in SQL rather than post-fetch. PURE. */
export function kindsForGroup(group: MarketGroup): ProductKind[] {
  switch (group) {
    case 'tickets':
      return ['ticket']
    case 'services':
      return ['service', 'booking']
    default:
      return ['physical', 'digital']
  }
}

/** Narrow an arbitrary value to a MarketGroup, or null (default-deny). PURE. */
export function asMarketGroup(raw: string | string[] | undefined): MarketGroup | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'products' || v === 'services' || v === 'tickets' ? v : null
}

/** Whether a product_kind is a bookable service. `'booking'` is an ALIAS of `'service'` for
 *  rendering + the booking path: both take the calendar picker (never a Buy button), so a
 *  product_kind='booking' row can never mis-render as a plain product (F11). PURE. */
export function isBookableServiceKind(kind: ProductKind): boolean {
  return kind === 'service' || kind === 'booking'
}

/** The pricing model a service quotes at (mirrors the retiring SpaceOffering.priceModel so the
 *  Phase 3 backfill is a field map, not a redesign). `contact` = enquire, no checkout. */
export type ServicePriceModel = 'fixed' | 'from' | 'free' | 'contact'

/** How often a service recurs. `once` = one-off. */
export type ServiceRecurrence = 'once' | 'weekly' | 'monthly'

/** The service-specific config stored under `commerce_products.metadata.service` for a
 *  product_kind='service'|'booking' listing (ADR-596). Scheduling itself rides `booking_space_id`
 *  + the Booking engine (Phase 4); this holds the quote + policy. All fields optional so a minimal
 *  service (fixed price, no policy) needs none of them. */
export interface ServiceConfig {
  priceModel?: ServicePriceModel
  /** Session length in minutes (for bookable services). */
  durationMin?: number
  /** Deposit taken at booking, in cents (Phase 4 no-show protection). */
  depositCents?: number
  recurrence?: ServiceRecurrence
  /** Hours before the appointment that free cancellation closes (e.g. 24 or 48). */
  cancellationWindowHours?: number
  /** No-show / late-cancel fee as a percentage of the service price (e.g. 50 or 100). */
  noShowFeePct?: number
  /** Sliding-scale / pay-what-you-can offered on this service. */
  slidingScale?: boolean
}
