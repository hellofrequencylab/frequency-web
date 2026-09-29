// THE FULFILMENT STATE (LIVE-606, ADR-1575). The PURE half of lib/commerce/fulfilment.ts: the ladder,
// its words, the next step a door offers, the forward-only rule and the record read back out of the
// `shipping` jsonb. Split out so the surfaces that only SHOW an order (the order reads, /orders, the
// seller's control) do not pull the writer's admin client, outbox and notification router into
// every page that lists an order. No IO, no imports beyond types.

import type { FulfillmentStatus } from './types'

/** The ladder, in the order the schema names it. Index = how far along the order is. */
export const FULFILLMENT_LADDER: readonly FulfillmentStatus[] = ['none', 'pending', 'shipped', 'delivered', 'completed']

/** Kinds that leave a warehouse or an inbox: the ones a seller has to act on after the settle. A
 *  service is booked, a ticket is a seat, a Journey opens itself (journey-fulfilment.ts). An unknown
 *  or missing kind (a product deleted after the sale) defaults to something that needs sending. */
const FULFILLABLE_KINDS = new Set(['physical', 'digital'])

/** True when at least one line of the order is something the seller sends. PURE. */
export function orderNeedsFulfilment(kinds: Array<string | null | undefined>): boolean {
  if (kinds.length === 0) return false
  return kinds.some((k) => !k || FULFILLABLE_KINDS.has(k))
}

/** True when a line physically ships (a carrier and a tracking number make sense). A digital-only
 *  order is delivered, never shipped. PURE. */
export function orderShips(kinds: Array<string | null | undefined>): boolean {
  return kinds.some((k) => !k || k === 'physical')
}

/** The member-facing word for each step. Plain, present tense, no processor names. */
export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  none: 'Not sent yet',
  pending: 'Getting ready',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Complete',
}

/** The button label for moving TO a step. */
export const FULFILLMENT_STEP_LABEL: Record<Exclude<FulfillmentStatus, 'none'>, string> = {
  pending: 'Start preparing',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
  completed: 'Mark complete',
}

/**
 * The next step a seller's door offers, or null when the ladder is walked. `pending` is reachable
 * by the writer but the door skips it: a seller's first act on a paid order is sending it, and a
 * separate "I am packing" click is a step nobody asked for. A digital order is never shipped; its
 * first step is delivered. PURE.
 */
export function nextFulfillmentStep(
  current: FulfillmentStatus,
  opts: { ships: boolean },
): Exclude<FulfillmentStatus, 'none'> | null {
  switch (current) {
    case 'none':
    case 'pending':
      return opts.ships ? 'shipped' : 'delivered'
    case 'shipped':
      return 'delivered'
    case 'delivered':
      return 'completed'
    case 'completed':
      return null
  }
}

/** Forward only. Refuses the same step and any earlier one with a sentence a seller can read. PURE. */
export function fulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): { ok: true } | { ok: false; error: string } {
  const fromIdx = FULFILLMENT_LADDER.indexOf(from)
  const toIdx = FULFILLMENT_LADDER.indexOf(to)
  if (toIdx < 0) return { ok: false, error: 'That is not a step an order can take.' }
  if (fromIdx < 0) return { ok: true }
  if (toIdx === fromIdx) return { ok: false, error: `This order is already marked ${FULFILLMENT_LABEL[to].toLowerCase()}.` }
  if (toIdx < fromIdx) {
    return {
      ok: false,
      error: `An order only moves forward. It is ${FULFILLMENT_LABEL[from].toLowerCase()}, so it cannot go back to ${FULFILLMENT_LABEL[to].toLowerCase()}.`,
    }
  }
  return { ok: true }
}

/** A tracking page for the carriers most sellers here use, or null when the carrier is not one we
 *  know: an unknown carrier still gets its number printed, just not a link. PURE. */
export function trackingUrlFor(carrier: string | null | undefined, tracking: string | null | undefined): string | null {
  const code = (tracking ?? '').trim()
  if (!code) return null
  const c = (carrier ?? '').trim().toLowerCase().replace(/[^a-z]/g, '')
  const enc = encodeURIComponent(code)
  if (c === 'usps') return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`
  if (c === 'ups') return `https://www.ups.com/track?tracknum=${enc}`
  if (c === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${enc}`
  if (c === 'dhl') return `https://www.dhl.com/en/express/tracking.html?AWB=${enc}`
  if (c === 'canadapost') return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${enc}`
  if (c === 'royalmail') return `https://www.royalmail.com/track-your-item#/tracking-results/${enc}`
  if (c === 'auspost' || c === 'australiapost') return `https://auspost.com.au/mypost/track/#/details/${enc}`
  return null
}

/** What the seller has said about sending the order, read back from `shipping.fulfilment`. */
export interface OrderFulfilment {
  carrier: string | null
  tracking: string | null
  trackingUrl: string | null
  note: string | null
  shippedAt: string | null
  deliveredAt: string | null
  completedAt: string | null
}

const EMPTY_FULFILMENT: OrderFulfilment = {
  carrier: null,
  tracking: null,
  trackingUrl: null,
  note: null,
  shippedAt: null,
  deliveredAt: null,
  completedAt: null,
}

/** A trimmed string capped at `max`, or null for blank or not a string. PURE. */
export function trimmedText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

/** The fulfilment record inside the `shipping` jsonb, or the empty record. Never throws: the jsonb
 *  is Stripe's address snapshot first and ours second, and either half may be missing. PURE. */
export function fulfilmentFromShipping(shipping: unknown): OrderFulfilment {
  if (!shipping || typeof shipping !== 'object' || Array.isArray(shipping)) return EMPTY_FULFILMENT
  const f = (shipping as { fulfilment?: unknown }).fulfilment
  if (!f || typeof f !== 'object' || Array.isArray(f)) return EMPTY_FULFILMENT
  const r = f as Record<string, unknown>
  const carrier = trimmedText(r.carrier, 60)
  const tracking = trimmedText(r.tracking, 120)
  return {
    carrier,
    tracking,
    trackingUrl: trimmedText(r.trackingUrl, 500) ?? trackingUrlFor(carrier, tracking),
    note: trimmedText(r.note, 500),
    shippedAt: trimmedText(r.shippedAt, 40),
    deliveredAt: trimmedText(r.deliveredAt, 40),
    completedAt: trimmedText(r.completedAt, 40),
  }
}
