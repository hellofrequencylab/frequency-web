/**
 * Experience Pass binding (FH-036, docs/hunts/EXPERIENCE-PASS-BINDING.md).
 *
 * An Experience Pass adds published Hunt benefits to ONE canonical Event ticket tier. The Event still
 * sells the seat and owns capacity and price. This module is the pure half: it decides whether a
 * binding may be written, and what a purchase through a bound tier resolves to. It reads no database
 * and calls no provider, so a forged price, a wrong tier and an unclaimed guest seat are all refused
 * here before any money path is reached. The browser may choose a tier and ask for a quantity. It
 * cannot supply a price, a benefit code, a seller or a return destination.
 */

/** Mirrors the CHECK on hunt_entitlements.benefit_code. */
export const BENEFIT_CODE = /^[a-z][a-z0-9_-]{1,40}$/

/** Most seats one purchase may carry. The Event ticket path stays the cap for anything lower. */
export const MAX_PASS_SEATS = 10

export type PassBinding = Readonly<{
  id: string
  huntId: string
  versionId: string
  eventId: string
  ticketTypeId: string
  sellerSpaceId: string
  benefitCodes: readonly string[]
  revision: number
  status: 'active' | 'retired'
}>

/** What the Event ticket path says about a tier. Read server-side, never taken from the browser. */
export type CanonicalTier = Readonly<{
  id: string
  eventId: string
  sellerSpaceId: string
  pricingMode: 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
  priceCents: number | null
  currency: string
  /** null = unlimited */
  quantity: number | null
  sold: number
  salesOpen: boolean
}>

type BindingInput = Readonly<{
  huntId: string
  versionId: string
  eventId: string
  ticketTypeId: string
  sellerSpaceId: string
  benefitCodes: readonly string[]
}>

type BindingRefusal =
  | 'tier_not_found'
  | 'event_mismatch'
  | 'seller_mismatch'
  | 'tier_not_paid'
  | 'no_benefits'
  | 'too_many_benefits'
  | 'bad_benefit_code'
  | 'duplicate_benefit_code'
  | 'benefit_not_in_version'
  | 'tier_already_bound'

/**
 * May this binding be written? The tier must belong to the Event, to the seller, and be a fixed-price
 * paid tier (a free tier issues no paid benefit; a buyer-chosen price has no canonical price to bind to).
 * The benefit codes must be valid, unique and published in the Hunt version being bound.
 */
export function validateBinding(
  input: BindingInput,
  tier: CanonicalTier | null,
  versionBenefitCodes: readonly string[],
  activeBindingForTier: PassBinding | null,
): { ok: true; benefitCodes: string[] } | { ok: false; reason: BindingRefusal } {
  if (!tier || tier.id !== input.ticketTypeId) return { ok: false, reason: 'tier_not_found' }
  if (tier.eventId !== input.eventId) return { ok: false, reason: 'event_mismatch' }
  if (tier.sellerSpaceId !== input.sellerSpaceId) return { ok: false, reason: 'seller_mismatch' }
  if (tier.pricingMode !== 'fixed' || !tier.priceCents || tier.priceCents <= 0) return { ok: false, reason: 'tier_not_paid' }
  if (input.benefitCodes.length === 0) return { ok: false, reason: 'no_benefits' }
  if (input.benefitCodes.length > 10) return { ok: false, reason: 'too_many_benefits' }
  if (input.benefitCodes.some((c) => !BENEFIT_CODE.test(c))) return { ok: false, reason: 'bad_benefit_code' }
  const unique = new Set(input.benefitCodes)
  if (unique.size !== input.benefitCodes.length) return { ok: false, reason: 'duplicate_benefit_code' }
  const published = new Set(versionBenefitCodes)
  if (input.benefitCodes.some((c) => !published.has(c))) return { ok: false, reason: 'benefit_not_in_version' }
  if (activeBindingForTier && activeBindingForTier.status === 'active') return { ok: false, reason: 'tier_already_bound' }
  return { ok: true, benefitCodes: [...input.benefitCodes].sort() }
}

type PurchaseRequest = Readonly<{
  ticketTypeId: string
  eventId: string
  qty: number
  /** Whatever the browser claimed. Never read, kept only so a test can show it is ignored. */
  clientPriceCents?: number
}>

export type PurchaseRefusal =
  | 'binding_retired'
  | 'tier_mismatch'
  | 'event_mismatch'
  | 'seller_mismatch'
  | 'tier_not_paid'
  | 'bad_quantity'
  | 'sold_out'
  | 'sales_closed'
  | 'commerce_paused'

type PurchaseSnapshot = Readonly<{
  bindingId: string
  bindingRevision: number
  huntId: string
  versionId: string
  sellerSpaceId: string
  benefitCodes: readonly string[]
}>

export type ResolvedPurchase = Readonly<{
  ok: true
  /** Canonical, from the tier. The browser's number never appears here. */
  unitCents: number
  qty: number
  totalCents: number
  currency: string
  snapshot: PurchaseSnapshot
}>

/** Freeze the exact binding a purchase was made under. Later edits to the pass leave this intact. */
export function purchaseSnapshot(binding: PassBinding): PurchaseSnapshot {
  return {
    bindingId: binding.id,
    bindingRevision: binding.revision,
    huntId: binding.huntId,
    versionId: binding.versionId,
    sellerSpaceId: binding.sellerSpaceId,
    benefitCodes: [...binding.benefitCodes].sort(),
  }
}

/**
 * Resolve a purchase through a bound tier. `commerceOpen` is the kill switch (hunt_commerce_state): when
 * sales are closed no NEW pass sells, and the answer says so rather than returning a price.
 */
export function resolvePurchase(
  binding: PassBinding,
  tier: CanonicalTier,
  request: PurchaseRequest,
  commerceOpen: boolean,
): ResolvedPurchase | { ok: false; reason: PurchaseRefusal } {
  if (!commerceOpen) return { ok: false, reason: 'commerce_paused' }
  if (binding.status !== 'active') return { ok: false, reason: 'binding_retired' }
  if (request.ticketTypeId !== binding.ticketTypeId || tier.id !== binding.ticketTypeId) return { ok: false, reason: 'tier_mismatch' }
  if (request.eventId !== binding.eventId || tier.eventId !== binding.eventId) return { ok: false, reason: 'event_mismatch' }
  if (tier.sellerSpaceId !== binding.sellerSpaceId) return { ok: false, reason: 'seller_mismatch' }
  if (tier.pricingMode !== 'fixed' || !tier.priceCents || tier.priceCents <= 0) return { ok: false, reason: 'tier_not_paid' }
  if (!Number.isInteger(request.qty) || request.qty < 1 || request.qty > MAX_PASS_SEATS) return { ok: false, reason: 'bad_quantity' }
  if (!tier.salesOpen) return { ok: false, reason: 'sales_closed' }
  if (tier.quantity !== null && tier.sold + request.qty > tier.quantity) return { ok: false, reason: 'sold_out' }
  return {
    ok: true,
    unitCents: tier.priceCents,
    qty: request.qty,
    totalCents: tier.priceCents * request.qty,
    currency: tier.currency.toUpperCase(),
    snapshot: purchaseSnapshot(binding),
  }
}

/** Does a stored purchase snapshot still describe the binding it was bought under? Used by the projection. */
export function snapshotMatches(snapshot: PurchaseSnapshot, binding: PassBinding): boolean {
  return (
    snapshot.bindingId === binding.id &&
    snapshot.bindingRevision === binding.revision &&
    snapshot.huntId === binding.huntId &&
    snapshot.versionId === binding.versionId &&
    snapshot.sellerSpaceId === binding.sellerSpaceId &&
    snapshot.benefitCodes.length === binding.benefitCodes.length &&
    [...snapshot.benefitCodes].sort().every((c, i) => c === [...binding.benefitCodes].sort()[i])
  )
}

/**
 * The only return destination a pass checkout accepts: an Event slug, matched strictly. The browser
 * never supplies a URL, so a return cannot be steered off-site.
 */
export function passReturnPath(eventSlug: string): string | null {
  return /^[a-z0-9][a-z0-9-]{1,98}$/.test(eventSlug) ? `/events/${eventSlug}?pass=return` : null
}

/**
 * What the ticket keeps about a pass purchase (FH-036S): the frozen binding, the canonical price it
 * resolved to and what the buyer was actually charged after any member benefit. Written once, on the
 * ticket's own row (`event_tickets.hunt_pass`), when the checkout is created.
 */
export type StoredPurchase = Readonly<{
  v: 1
  snapshot: PurchaseSnapshot
  eventId: string
  ticketTypeId: string
  qty: number
  /** Canonical, from the tier. */
  unitCents: number
  totalCents: number
  /** What the checkout charged. Never more than the canonical total. */
  chargedCents: number
  currency: string
}>

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

/** Read a stored purchase off the ticket. Total: anything that is not one reads as null, never repaired. */
export function parseStoredPurchase(raw: unknown): StoredPurchase | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const s = (o.snapshot && typeof o.snapshot === 'object' ? o.snapshot : {}) as Record<string, unknown>
  const codes = Array.isArray(s.benefitCodes) ? s.benefitCodes : null
  if (o.v !== 1 || !codes || codes.length === 0 || codes.length > 10 || codes.some((c) => typeof c !== 'string' || !BENEFIT_CODE.test(c))) return null
  if (![s.bindingId, s.huntId, s.versionId, s.sellerSpaceId, o.eventId, o.ticketTypeId, o.currency].every(isText)) return null
  if (![s.bindingRevision, o.qty, o.unitCents, o.totalCents, o.chargedCents].every(isCount)) return null
  return {
    v: 1,
    snapshot: {
      bindingId: s.bindingId as string,
      bindingRevision: s.bindingRevision as number,
      huntId: s.huntId as string,
      versionId: s.versionId as string,
      sellerSpaceId: s.sellerSpaceId as string,
      benefitCodes: [...(codes as string[])].sort(),
    },
    eventId: o.eventId as string,
    ticketTypeId: o.ticketTypeId as string,
    qty: o.qty as number,
    unitCents: o.unitCents as number,
    totalCents: o.totalCents as number,
    chargedCents: o.chargedCents as number,
    currency: o.currency as string,
  }
}

type SettledTicket = Readonly<{ eventId: string; ticketTypeId: string | null; qty: number; amountCents: number; currency: string }>

type SettleRefusal = 'binding_changed' | 'tier_mismatch' | 'event_mismatch' | 'quantity_mismatch' | 'price_mismatch' | 'currency_mismatch'

/**
 * Does the settled ticket still say what the purchase said when it was created? Checked before any benefit
 * is projected, from the ticket as re-read now. A ticket that paid a different amount, holds a different
 * tier or quantity, or names a binding that no longer reads the same is refused and goes to a person.
 */
export function verifySettledPurchase(
  stored: StoredPurchase,
  ticket: SettledTicket,
  binding: PassBinding | null,
): { ok: true } | { ok: false; reason: SettleRefusal } {
  if (!binding || !snapshotMatches(stored.snapshot, binding)) return { ok: false, reason: 'binding_changed' }
  if (ticket.ticketTypeId !== stored.ticketTypeId || binding.ticketTypeId !== stored.ticketTypeId) return { ok: false, reason: 'tier_mismatch' }
  if (ticket.eventId !== stored.eventId || binding.eventId !== stored.eventId) return { ok: false, reason: 'event_mismatch' }
  if (ticket.qty !== stored.qty || stored.qty < 1 || stored.qty > MAX_PASS_SEATS) return { ok: false, reason: 'quantity_mismatch' }
  if (stored.unitCents <= 0 || stored.totalCents !== stored.unitCents * stored.qty) return { ok: false, reason: 'price_mismatch' }
  if (stored.chargedCents <= 0 || stored.chargedCents > stored.totalCents || ticket.amountCents !== stored.chargedCents) return { ok: false, reason: 'price_mismatch' }
  if (ticket.currency.toUpperCase() !== stored.currency.toUpperCase()) return { ok: false, reason: 'currency_mismatch' }
  return { ok: true }
}
