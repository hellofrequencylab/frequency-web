// Commerce core contracts (ADR-39X). The charge model (destination charge +
// application fee) lives in ./checkout.ts; these are data shapes only.

export type OwnerKind = 'platform' | 'profile' | 'space'
export type ProductKind = 'physical' | 'digital' | 'service' | 'booking' | 'ticket'
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
}

export interface CheckoutInput {
  buyerProfileId: string
  items: { productId: string; variantId?: string | null; qty: number }[]
  shipping?: Record<string, unknown>
}

// ── Market grouping (ADR-593) ──────────────────────────────────────────────────────────────
// The Market umbrella surface groups every listing by TYPE into three rails. The grouping is
// derived from the existing `product_kind` discriminator (no new column): the schema already
// distinguishes physical/digital/service/booking/ticket, so the umbrella reads the group from it.

/** The three typed rails the Market umbrella groups listings into. */
export type MarketGroup = 'products' | 'services' | 'tickets'

/** Map a product_kind to its Market group (ADR-593). Physical/digital = Products; service/booking =
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

/** The pricing model a service quotes at (mirrors the retiring SpaceOffering.priceModel so the
 *  Phase 3 backfill is a field map, not a redesign). `contact` = enquire, no checkout. */
export type ServicePriceModel = 'fixed' | 'from' | 'free' | 'contact'

/** How often a service recurs. `once` = one-off. */
export type ServiceRecurrence = 'once' | 'weekly' | 'monthly'

/** The service-specific config stored under `commerce_products.metadata.service` for a
 *  product_kind='service'|'booking' listing (ADR-593). Scheduling itself rides `booking_space_id`
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
