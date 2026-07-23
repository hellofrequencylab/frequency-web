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
  /** An explicit network-sourced entry point (ADR-811 §A) a discovery / marketplace surface passes so
   *  the order is classified `network` even without a referral cookie. Absent = classify from cookies,
   *  default `self`. */
  entryPoint?: 'discovery' | 'marketplace' | 'referral' | null
}

// ── Variants (Etsy-Grade Phase 2) ───────────────────────────────────────────
// A product may have 0..N variants (e.g. "Small / Blue"). A plain product with no
// variants keeps its single price + single stock and behaves exactly as before.

/** A single purchasable variant of a product. `priceCents` null = inherit the product price;
 *  `stock` null = untracked / unlimited (does NOT inherit product stock — the variant governs). */
export interface CommerceVariant {
  id: string
  productId: string
  /** Human label, e.g. "Small / Blue" (snapshotted onto the order item at purchase). */
  name: string
  /** Structured option dimensions, e.g. { Size: 'S', Color: 'Blue' } (up to ~2 dimensions). */
  options: Record<string, string>
  /** null = inherit the product price; a number = this variant's own price. */
  priceCents: number | null
  /** null = untracked / unlimited; a number = tracked stock. */
  stock: number | null
  sku: string | null
  sortOrder: number
  active: boolean
  createdAt: string
}

/** An authoring-side variant row (create or edit). An `id` marks an existing row to update;
 *  no `id` inserts a new one. Blank price/stock map to null (inherit price / untracked stock). */
export interface VariantInput {
  id?: string
  name: string
  options?: Record<string, string>
  priceCents?: number | null
  stock?: number | null
  sku?: string | null
  sortOrder?: number
  active?: boolean
}

/** The price a buyer pays for this variant: the variant's own price, or the product price when the
 *  variant does not override it (priceCents null = inherit). PURE. */
export function effectiveVariantPriceCents(
  product: { priceCents: number },
  variant: { priceCents: number | null },
): number {
  return variant.priceCents ?? product.priceCents
}

/** The quantity available for this variant. A variant governs its OWN stock: `stock` null = untracked
 *  (unlimited), a number = that many. It never falls back to the product's stock (unlike price). PURE. */
export function effectiveVariantStock(variant: { stock: number | null }): number | null {
  return variant.stock
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
 *  Phase 3 backfill is a field map, not a redesign). `contact` = enquire, no checkout. `choose` = the
 *  buyer names the amount, guided by a suggested anchor + optional floor (Pricing Options P1); it
 *  supersedes the bare `from` for new services (`from` stays for stored rows). */
export type ServicePriceModel = 'fixed' | 'from' | 'free' | 'contact' | 'choose'

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
  /** Choose-your-price anchor in cents (the required suggested amount when priceModel='choose'). */
  suggestedCents?: number
  /** Choose-your-price floor in cents (optional; protects a practitioner's rate). */
  minCents?: number
}

// ── Unified Price Mode (Pricing Options P1, ADR-607) ────────────────────────────────────────────
// One shared, config-only pricing primitive across every sellable thing (tickets, services,
// donations). It reuses the ticket-tier field names (min/suggested) so most plumbing already
// exists, and read-time narrowing (the adapters below) keeps every stored row valid with NO data
// migration. See docs/PRICING-OPTIONS-STRATEGY.md for the full model. PURE (no IO), so it lives with
// the other data shapes and is unit-tested in ./price.test.ts.
//
// MONEY STAYS OFF. A Price is a display + validation config only; nothing here charges. Taking money
// remains gated behind payoutsLive() + canTakePayments at the checkout seam, unchanged.

/** The four buyer-facing price modes. `choose` = the buyer names the amount (guided by a suggested
 *  anchor, optionally floored). It absorbs PWYW + sliding scale + donation. `contact` = no checkout,
 *  an enquiry. */
export type PriceMode = 'fixed' | 'choose' | 'free' | 'contact'

/** The unified price for one sellable offer. Which fields apply depends on `mode`:
 *  - `fixed`   -> `amountCents`.
 *  - `choose`  -> `suggestedCents` (REQUIRED, the anchor) + optional `minCents` floor; `donation` flips
 *                it to gift framing and `pickAmountsCents` carries the quick-pick chip amounts.
 *  - `free` / `contact` -> no amount fields.
 *  Amounts are integer cents. Config only: setting a Price never implies a live charge. */
export interface Price {
  mode: PriceMode
  amountCents?: number
  suggestedCents?: number
  minCents?: number
  donation?: boolean
  pickAmountsCents?: number[]
}

/** One named option in a Good / Better / Best package set, each carrying its own Price. `recommended`
 *  marks the middle "Most popular" option. */
export interface OfferingOption {
  id?: string
  name: string
  price: Price
  recommended?: boolean
}

/** A sellable thing: either a single `price`, OR a package set (`options`, 2 to 4 named options each
 *  with its own Price). When `options` is present it wins; `price` is the fallback / first option. */
export interface Offering {
  price: Price
  options?: OfferingOption[]
}

export const PRICE_MODES: readonly PriceMode[] = ['fixed', 'choose', 'free', 'contact']

/** Min / max package options (the research sweet spot is 3, capped at 4 so the picker never sprawls). */
export const MIN_PACKAGE_OPTIONS = 2
export const MAX_PACKAGE_OPTIONS = 4

const MAX_PICK_AMOUNTS = 8
// A generous upper bound (in cents) so a typo cannot store an absurd amount.
const MAX_PRICE_CENTS = 100_000_000

/** Coerce a raw value to a non-negative integer number of cents, clamped to MAX_PRICE_CENTS, or
 *  undefined when it cannot be made a valid amount. `allowZero=false` drops a zero (e.g. a suggested
 *  anchor of $0 is not meaningful). PURE. */
function toCents(raw: unknown, allowZero = true): number | undefined {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return undefined
  if (n === 0 && !allowZero) return undefined
  return Math.min(n, MAX_PRICE_CENTS)
}

/** Coerce a raw value to a clean array of positive cent amounts (drops non-positive / malformed,
 *  de-duplicates, sorts ascending, caps the count). Anything non-array reads as empty. PURE. */
export function normalizePickAmounts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  for (const item of raw) {
    const cents = toCents(item, false)
    if (cents != null) seen.add(cents)
    if (seen.size >= MAX_PICK_AMOUNTS) break
  }
  return [...seen].sort((a, b) => a - b)
}

/** Coerce a raw value to a clean Price, dropping the fields that do not apply to its mode. An unknown
 *  mode falls back to `fixed` (default-safe). This does NOT reject an invalid Price (e.g. a `choose`
 *  with no anchor) - call `validatePrice` for that; normalize only makes the shape well-formed so a
 *  stored row always resolves. PURE. */
export function normalizePrice(raw: {
  mode?: unknown
  amountCents?: unknown
  suggestedCents?: unknown
  minCents?: unknown
  donation?: unknown
  pickAmountsCents?: unknown
}): Price {
  const mode: PriceMode = PRICE_MODES.includes(raw.mode as PriceMode)
    ? (raw.mode as PriceMode)
    : 'fixed'

  if (mode === 'free' || mode === 'contact') return { mode }

  if (mode === 'fixed') {
    return { mode, amountCents: toCents(raw.amountCents) ?? 0 }
  }

  // choose
  const donation = raw.donation === true
  const price: Price = { mode: 'choose' }
  const suggested = toCents(raw.suggestedCents, false)
  if (suggested != null) price.suggestedCents = suggested
  const min = toCents(raw.minCents)
  if (min != null) price.minCents = min
  if (donation) {
    price.donation = true
    const picks = normalizePickAmounts(raw.pickAmountsCents)
    if (picks.length) price.pickAmountsCents = picks
  }
  return price
}

/** Validate a normalized-ish Price. Returns a plain, voice-compliant error string, or null when the
 *  Price is usable. The one hard rule: a `choose` price MUST carry a suggested anchor (the single
 *  biggest lever in pay-what-you-want); the floor stays optional. A `fixed` price needs an amount
 *  above zero. Free / contact never fail. PURE. */
export function validatePrice(price: Price): string | null {
  switch (price.mode) {
    case 'free':
    case 'contact':
      return null
    case 'fixed':
      if (!price.amountCents || price.amountCents <= 0) return 'Set a price above zero.'
      return null
    case 'choose':
      if (!price.suggestedCents || price.suggestedCents <= 0) {
        return 'Add a suggested amount so buyers have a starting point.'
      }
      if (price.minCents != null && price.suggestedCents < price.minCents) {
        return 'The suggested amount cannot be below the minimum.'
      }
      return null
  }
}

/** Format integer cents as a plain dollar string ($25 or $25.50). PURE. */
export function formatPriceCents(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** A short, voice-compliant label for a Price ("Fixed $40", "From $20", "Choose your price", "Free",
 *  "Enquire", "Donation"). No em / en dashes. PURE. */
export function describePrice(price: Price): string {
  switch (price.mode) {
    case 'free':
      return 'Free'
    case 'contact':
      return 'Enquire'
    case 'fixed':
      return price.amountCents ? `Fixed ${formatPriceCents(price.amountCents)}` : 'Fixed'
    case 'choose':
      if (price.donation) return 'Donation'
      if (price.minCents) return `From ${formatPriceCents(price.minCents)}`
      return 'Choose your price'
  }
}

// ── Adapters: Price <-> the existing ticket-tier columns (NO migration) ──────────────────────────
// The ticket-tier model (pricing_mode fixed|free|pwyc|sliding_scale|donation + price/min/suggested)
// is the template the unified Price maps onto. These read-time adapters let the shared editor drive
// the existing event_ticket_types columns without a schema change.

/** The subset of a ticket-tier row a Price maps onto (mirrors lib/events/ticket-tiers TicketTierRow). */
export interface TicketPriceColumns {
  pricing_mode: 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
}

/** Write a Price back onto the existing ticket-tier columns (no new columns). `choose` splits by the
 *  donation flag + whether a floor is set: donation -> `donation`; a floored choose -> `sliding_scale`;
 *  a bare choose -> `pwyc`. `contact` has no ticket equivalent (tickets never enquire) and maps to
 *  `free` (no charge) so the row stays valid. PURE. */
export function priceToTicketPricingMode(price: Price): TicketPriceColumns {
  switch (price.mode) {
    case 'free':
    case 'contact':
      return { pricing_mode: 'free', price_cents: null, min_cents: null, suggested_cents: null }
    case 'fixed':
      return {
        pricing_mode: 'fixed',
        price_cents: price.amountCents ?? null,
        min_cents: null,
        suggested_cents: null,
      }
    case 'choose': {
      const min = price.minCents ?? null
      const suggested = price.suggestedCents ?? null
      if (price.donation) {
        return { pricing_mode: 'donation', price_cents: null, min_cents: min, suggested_cents: suggested }
      }
      return {
        pricing_mode: min != null ? 'sliding_scale' : 'pwyc',
        price_cents: null,
        min_cents: min,
        suggested_cents: suggested,
      }
    }
  }
}

/** Read the existing ticket-tier columns back into a Price (the inverse of priceToTicketPricingMode).
 *  `pwyc` / `sliding_scale` -> `choose`; `donation` -> `choose` + donation. PURE. */
export function ticketRowToPrice(row: TicketPriceColumns): Price {
  switch (row.pricing_mode) {
    case 'free':
      return { mode: 'free' }
    case 'fixed':
      return { mode: 'fixed', amountCents: row.price_cents ?? 0 }
    case 'pwyc':
    case 'sliding_scale': {
      const price: Price = { mode: 'choose' }
      if (row.suggested_cents != null) price.suggestedCents = row.suggested_cents
      if (row.min_cents != null) price.minCents = row.min_cents
      return price
    }
    case 'donation': {
      const price: Price = { mode: 'choose', donation: true }
      if (row.suggested_cents != null) price.suggestedCents = row.suggested_cents
      if (row.min_cents != null) price.minCents = row.min_cents
      return price
    }
  }
}
