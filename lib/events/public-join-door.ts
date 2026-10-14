import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { payoutsLive } from '@/lib/billing/connect'
import { eventPayoutReadyOrUnknown } from '@/lib/events/payout-readiness'
import { getCapacityInfo } from '@/lib/events/capacity'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { TICKETS_NOT_READY } from '@/lib/events/ticket-eligibility'
import { rsvpWindowStateFromDetails, rsvpWindowNote } from '@/lib/events/rsvp-window'
import { checkInWindowOpen } from '@/lib/events/checkin-window'
import { formatSalesDate, ticketOnSale } from '@/lib/events/sales-window'
import { eventInstant, isEventPast } from '@/lib/time/zone'
import type { GuestTicketTier } from '@/components/events/guest-ticket-form'

// THE SIGNED-OUT JOIN DOOR on the public event page (/events/<slug>, the cached share URL).
//
// The guest RSVP form and the guest ticket form were built for exactly this reader, and both lived
// only on the member page (/events/<slug>/full), which a signed-out visitor never reaches: the proxy
// sends them the cached public body instead (lib/nav/member-event-rewrite.ts). So the page a
// stranger opens from a shared link offered "Find your Circle" where "I'm coming" belonged.
//
// This module answers ONE question for that page: which door does a guest get? It mirrors the
// member page's signed-out chain (event-member-page.tsx, rsvp-payment-flow.tsx) rather than
// inventing a rule, and every write behind the forms re-checks on the server (capture_guest_rsvp,
// createTicketCheckout), so a cached answer that went stale can only show a form the server then
// refuses with a clear line, never sell something it should not.
//
// COOKIE-FREE BY CONSTRUCTION. The page is ISR (revalidate 3600). Everything here uses the admin
// client or pure helpers; nothing reads the request. The admin read publishes only what the member
// page already shows any signed-out visitor: tier names, prices, sold-out, whether the room is full.

export type PublicJoinDoor =
  | { kind: 'cancelled' }
  | { kind: 'ended' }
  | { kind: 'rsvp'; isFull: boolean; note?: string }
  | { kind: 'rsvp_closed'; line: string }
  | { kind: 'tickets'; tiers?: GuestTicketTier[]; priceLabel?: string }
  | { kind: 'tickets_closed'; line: string }
  | { kind: 'not_ready'; line: string }
  | { kind: 'sign_in' }

export type DoorTier = GuestTicketTier & {
  notYetOnSale: boolean
  salesClosed: boolean
  opensOnLabel: string | null
}

export type JoinDoorInput = {
  isCancelled: boolean
  /** Past the end (or the start when there is no end). */
  hasEnded: boolean
  /** Within the guest door's grace: open from the start until four hours past the end (PROG-GD4). */
  inGuestGrace: boolean
  joinMode: 'auto' | 'rsvp' | 'tickets'
  flatPriceCents: number
  tiers: DoorTier[]
  /** The platform payout switch AND the payee's Connect account are both ready. */
  paymentsReady: boolean
  rsvpWindowLine: string | null
  isFull: boolean
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** A guest holds no membership, so a gated tier is not an offer to them (guest-ticket-form.tsx). */
const guestCanBuy = (t: DoorTier) => !t.memberOnly && !t.spaceMembersOnly

/** PURE. The member page's signed-out chain, in one place, so it can be tested. */
export function resolvePublicJoinDoor(input: JoinDoorInput): PublicJoinDoor {
  if (input.isCancelled) return { kind: 'cancelled' }

  const hasTiers = input.tiers.length > 0
  const isPaidEvent = hasTiers || input.flatPriceCents > 0
  const ticketsMode = TICKETING_ENABLED && isPaidEvent && input.joinMode !== 'rsvp'

  if (ticketsMode) {
    if (input.hasEnded) return { kind: 'tickets_closed', line: 'Ticket sales have closed.' }
    if (!input.paymentsReady) return { kind: 'not_ready', line: TICKETS_NOT_READY }
    if (!hasTiers) return { kind: 'tickets', priceLabel: dollars(input.flatPriceCents) }
    if (input.tiers.every((t) => t.soldOut)) return { kind: 'tickets_closed', line: 'Sold out.' }
    const buyable = input.tiers.filter((t) => guestCanBuy(t) && !t.notYetOnSale && !t.salesClosed && !t.soldOut)
    if (buyable.length > 0) return { kind: 'tickets', tiers: buyable }
    const opens = input.tiers.find((t) => guestCanBuy(t) && t.notYetOnSale && t.opensOnLabel)
    if (opens) return { kind: 'tickets_closed', line: `Tickets go on sale ${opens.opensOnLabel}.` }
    // Only members-only rates are left: an account is the one honest path.
    if (input.tiers.some((t) => !guestCanBuy(t))) return { kind: 'sign_in' }
    return { kind: 'tickets_closed', line: 'Ticket sales have closed.' }
  }

  // RSVP mode (free, or priced at the door). The guest seat is taken until the grace closes.
  if (input.hasEnded && !input.inGuestGrace) return { kind: 'ended' }

  // A priced RSVP with rates that can be paid online: the purchase door (rsvp-payment-flow.tsx
  // `guestDoor`). Otherwise the seat is collected here and the money at the door.
  if (hasTiers && input.paymentsReady && !input.hasEnded) {
    const buyable = input.tiers.filter((t) => guestCanBuy(t) && !t.notYetOnSale && !t.salesClosed && !t.soldOut)
    if (buyable.length > 0) return { kind: 'tickets', tiers: buyable }
  }

  if (input.rsvpWindowLine) return { kind: 'rsvp_closed', line: input.rsvpWindowLine }

  const general = input.tiers.find((t) => guestCanBuy(t) && !t.notYetOnSale && !t.salesClosed)
  const doorCents = general ? (general.pricingMode === 'fixed' ? general.priceCents ?? 0 : 0) : input.flatPriceCents
  const note = doorCents > 0 ? `Pay the ${dollars(doorCents)} at the door.` : undefined
  return { kind: 'rsvp', isFull: input.isFull, ...(note ? { note } : {}) }
}

type EventRow = {
  id: string
  starts_at: string
  ends_at: string | null
  time_zone: string | null
  is_cancelled: boolean | null
  join_mode: string | null
  price_cents: number | null
  details: unknown
  host_id: string | null
  host_space_id: string | null
}

type TierRow = {
  id: string
  name: string
  description: string | null
  pricing_mode: GuestTicketTier['pricingMode']
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
  quantity: number | null
  sold: number | null
  member_only: boolean
  space_members_only: boolean
  space_tier_id: string | null
  sales_start_at: string | null
  sales_starts_days_before: number | null
  sales_end_at: string | null
}

/**
 * The door for one public event, or null when it cannot be read (no service key at build, a failed
 * read). Null keeps the page's plain sign-up card, so a read failure costs the form, never the page.
 */
export async function loadPublicJoinDoor(eventId: string): Promise<{ door: PublicJoinDoor; going: number } | null> {
  try {
    const admin = createAdminClient()
    const [{ data: ev }, { data: rawTiers }, capacity] = await Promise.all([
      admin
        .from('events')
        .select('id, starts_at, ends_at, time_zone, is_cancelled, join_mode, price_cents, details, host_id, host_space_id')
        .eq('id', eventId)
        .maybeSingle(),
      admin
        .from('event_ticket_types')
        .select(
          'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, sales_start_at, sales_starts_days_before, sales_end_at',
        )
        .eq('event_id', eventId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      getCapacityInfo(eventId),
    ])
    const event = ev as unknown as EventRow | null
    if (!event) return null

    const zone = event.time_zone
    const startInstant = eventInstant(event.starts_at, zone)
    const now = new Date()
    const tiers: DoorTier[] = ((rawTiers ?? []) as unknown as TierRow[]).map((t) => {
      const spotsLeft = t.quantity == null ? null : Math.max(0, t.quantity - (t.sold ?? 0))
      const sale = ticketOnSale(t, startInstant, now)
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        pricingMode: t.pricing_mode,
        priceCents: t.price_cents,
        minCents: t.min_cents,
        suggestedCents: t.suggested_cents,
        soldOut: spotsLeft != null && spotsLeft <= 0,
        memberOnly: t.member_only,
        spaceMembersOnly: t.space_members_only || t.space_tier_id != null,
        notYetOnSale: sale.reason === 'not_yet',
        salesClosed: sale.reason === 'closed',
        opensOnLabel: sale.opensAt ? formatSalesDate(sale.opensAt, zone) : null,
      }
    })

    const flatPriceCents = event.price_cents ?? 0
    const isPaidEvent = tiers.length > 0 || flatPriceCents > 0
    const paymentsReady =
      isPaidEvent && TICKETING_ENABLED
        ? (await payoutsLive()) &&
          (await eventPayoutReadyOrUnknown({ id: event.id, host_id: event.host_id, host_space_id: event.host_space_id })) === true
        : false

    const joinMode = event.join_mode === 'rsvp' || event.join_mode === 'tickets' ? event.join_mode : 'auto'
    const door = resolvePublicJoinDoor({
      isCancelled: !!event.is_cancelled,
      hasEnded: isEventPast(event.starts_at, event.ends_at, zone),
      inGuestGrace: checkInWindowOpen(event.starts_at, event.ends_at, zone),
      joinMode,
      flatPriceCents,
      tiers,
      paymentsReady,
      rsvpWindowLine: rsvpWindowNote(rsvpWindowStateFromDetails(event.details, zone)),
      isFull: capacity.isFull,
    })
    return { door, going: capacity.going }
  } catch (err) {
    console.error('[public-join-door] read failed; the page keeps its sign-up card', err)
    return null
  }
}
