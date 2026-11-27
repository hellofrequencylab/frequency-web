// THE OTHER SALES ON A SPACE'S ORDERS TAB (LIVE-2545).
//
// The Orders tab's money cards (readCompleteSpaceEarnings) add up four sources: shop orders, event
// tickets, donations and split-order shares. Its list read only shop orders, so a Space that sold a
// ticket saw "2 orders, $88" above "No orders yet." and could not find the sale. This module reads the
// two missing sources with the SAME rules the cards use (tickets on events this Space hosts, or owns
// with no other host, that have settled; donations to this Space that have settled), so the list and
// the cards count the same sales.
//
// Each row carries who bought, what, how much, when and where it stands. A guest checkout has no
// profile, so its buyer is the email they paid with. FAIL-SOFT: an unreadable source gives [] for
// that source, and the tab still lists the rest. Server-only. No em or en dashes.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

type SpaceSaleKind = 'ticket' | 'donation' | 'order'

export interface SpaceSale {
  id: string
  kind: SpaceSaleKind
  /** What was bought: the event title for a ticket, "Donation" for a gift. */
  title: string
  qty: number
  amountCents: number
  /** Frequency's fee on this sale (0 on your own people). */
  feeCents: number
  currency: string
  /** Display name for a member, the checkout email for a guest, null when neither is known. */
  buyer: string | null
  buyerEmail: string | null
  /** When the money settled. */
  at: string
  status: 'paid' | 'refunded'
  stripePaymentIntentId: string | null
}

function db(): SupabaseClient {
  return createAdminClient()
}

type TicketRow = {
  id: string
  event_id: string
  buyer_profile_id: string | null
  guest_email: string | null
  qty: number | null
  amount_cents: number | null
  platform_fee_cents: number | null
  currency: string | null
  status: string | null
  refunded_at: string | null
  succeeded_at: string
  stripe_payment_intent_id: string | null
}

type DonationRow = {
  id: string
  donor_profile_id: string | null
  amount_cents: number | null
  platform_fee_cents: number | null
  currency: string | null
  status: string | null
  refunded_at: string | null
  succeeded_at: string
  stripe_payment_intent_id: string | null
}

/** Paid or refunded, read the way the earnings cards read it: either the status or the stamp means
 *  refunded; otherwise only a succeeded row is a sale. Null for anything else. PURE. */
export function saleStatus(status: string | null | undefined, refundedAt: string | null | undefined): SpaceSale['status'] | null {
  if (status === 'refunded' || refundedAt) return 'refunded'
  if (status === 'succeeded') return 'paid'
  return null
}

async function ticketSales(spaceId: string, limit: number): Promise<{ rows: TicketRow[]; titles: Map<string, string> }> {
  const { data: events, error: evErr } = await db()
    .from('events')
    .select('id, title')
    .or(`host_space_id.eq.${spaceId},and(space_id.eq.${spaceId},host_space_id.is.null)`)
  if (evErr) throw new Error(evErr.message)
  const titles = new Map(((events ?? []) as { id: string; title: string | null }[]).map((e) => [e.id, e.title ?? 'Event']))
  if (titles.size === 0) return { rows: [], titles }
  const { data, error } = await db()
    .from('event_tickets')
    .select('id, event_id, buyer_profile_id, guest_email, qty, amount_cents, platform_fee_cents, currency, status, refunded_at, succeeded_at, stripe_payment_intent_id')
    .in('event_id', [...titles.keys()])
    .not('succeeded_at', 'is', null)
    .order('succeeded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as TicketRow[], titles }
}

async function donationSales(spaceId: string, limit: number): Promise<DonationRow[]> {
  const { data, error } = await db()
    .from('space_donations')
    .select('id, donor_profile_id, amount_cents, platform_fee_cents, currency, status, refunded_at, succeeded_at, stripe_payment_intent_id')
    .eq('space_id', spaceId)
    .not('succeeded_at', 'is', null)
    .order('succeeded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as DonationRow[]
}

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const { data } = await db().from('profiles').select('id, display_name').in('id', ids)
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) out.set(p.id, p.display_name)
    }
  } catch {
    // A name is decoration; the sale still lists.
  }
  return out
}

/** A Space's ticket sales and donations, newest first, capped at `limit`. */
export async function listSpaceTicketAndDonationSales(spaceId: string, opts: { limit?: number } = {}): Promise<SpaceSale[]> {
  if (!spaceId) return []
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const [tickets, donations] = await Promise.all([
    ticketSales(spaceId, limit).catch((error) => {
      console.error('[commerce/space-sales] tickets unreadable:', error)
      return { rows: [] as TicketRow[], titles: new Map<string, string>() }
    }),
    donationSales(spaceId, limit).catch((error) => {
      console.error('[commerce/space-sales] donations unreadable:', error)
      return [] as DonationRow[]
    }),
  ])
  const names = await profileNames([
    ...new Set(
      [...tickets.rows.map((t) => t.buyer_profile_id), ...donations.map((d) => d.donor_profile_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ])

  const out: SpaceSale[] = []
  for (const t of tickets.rows) {
    const status = saleStatus(t.status, t.refunded_at)
    if (!status) continue
    out.push({
      id: t.id,
      kind: 'ticket',
      title: tickets.titles.get(t.event_id) ?? 'Event',
      qty: Math.max(1, Number(t.qty) || 1),
      amountCents: Number(t.amount_cents) || 0,
      feeCents: Number(t.platform_fee_cents) || 0,
      currency: t.currency ?? 'usd',
      buyer: (t.buyer_profile_id && names.get(t.buyer_profile_id)) || t.guest_email || null,
      buyerEmail: t.guest_email,
      at: t.succeeded_at,
      status,
      stripePaymentIntentId: t.stripe_payment_intent_id,
    })
  }
  for (const d of donations) {
    const status = saleStatus(d.status, d.refunded_at)
    if (!status) continue
    out.push({
      id: d.id,
      kind: 'donation',
      title: 'Donation',
      qty: 1,
      amountCents: Number(d.amount_cents) || 0,
      feeCents: Number(d.platform_fee_cents) || 0,
      currency: d.currency ?? 'usd',
      buyer: (d.donor_profile_id && names.get(d.donor_profile_id)) || null,
      buyerEmail: null,
      at: d.succeeded_at,
      status,
      stripePaymentIntentId: d.stripe_payment_intent_id,
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

/**
 * WHAT ONE PERSON BOUGHT FROM A SPACE (LIVE-2549), for their contact record: tickets to this Space's
 * events, gifts to this Space, and shop orders this Space sold, newest first. The person is matched by
 * their member profile when they have one, and by the email on a guest ticket otherwise. Scoped to the
 * Space on every read, so a contact record never shows what the person bought somewhere else.
 * FAIL-SOFT to [].
 */
export async function listSpacePurchasesForPerson(
  spaceId: string,
  person: { profileId: string | null; email: string | null },
  opts: { limit?: number } = {},
): Promise<SpaceSale[]> {
  const email = person.email?.trim().toLowerCase() || null
  if (!spaceId || (!person.profileId && !email)) return []
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  try {
    const mine = (s: { buyerProfileId: string | null; guestEmail: string | null }) =>
      (person.profileId && s.buyerProfileId === person.profileId) || (email && s.guestEmail?.toLowerCase() === email)

    const [tickets, donations, orders] = await Promise.all([
      ticketSales(spaceId, 200).catch(() => ({ rows: [] as TicketRow[], titles: new Map<string, string>() })),
      person.profileId
        ? donationSales(spaceId, 200).catch(() => [] as DonationRow[])
        : Promise.resolve([] as DonationRow[]),
      person.profileId ? orderSales(spaceId, person.profileId, limit).catch(() => [] as SpaceSale[]) : Promise.resolve([] as SpaceSale[]),
    ])
    const out: SpaceSale[] = [...orders]
    for (const t of tickets.rows) {
      if (!mine({ buyerProfileId: t.buyer_profile_id, guestEmail: t.guest_email })) continue
      const status = saleStatus(t.status, t.refunded_at)
      if (!status) continue
      out.push({
        id: t.id,
        kind: 'ticket',
        title: tickets.titles.get(t.event_id) ?? 'Event',
        qty: Math.max(1, Number(t.qty) || 1),
        amountCents: Number(t.amount_cents) || 0,
        feeCents: Number(t.platform_fee_cents) || 0,
        currency: t.currency ?? 'usd',
        buyer: null,
        buyerEmail: t.guest_email,
        at: t.succeeded_at,
        status,
        stripePaymentIntentId: t.stripe_payment_intent_id,
      })
    }
    for (const d of donations) {
      if (d.donor_profile_id !== person.profileId) continue
      const status = saleStatus(d.status, d.refunded_at)
      if (!status) continue
      out.push({
        id: d.id,
        kind: 'donation',
        title: 'Donation',
        qty: 1,
        amountCents: Number(d.amount_cents) || 0,
        feeCents: Number(d.platform_fee_cents) || 0,
        currency: d.currency ?? 'usd',
        buyer: null,
        buyerEmail: null,
        at: d.succeeded_at,
        status,
        stripePaymentIntentId: d.stripe_payment_intent_id,
      })
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit)
  } catch (error) {
    console.error('[commerce/space-sales] purchases unreadable:', error)
    return []
  }
}

/** Shop orders one member bought from one Space (settled or refunded). */
async function orderSales(spaceId: string, profileId: string, limit: number): Promise<SpaceSale[]> {
  const { data, error } = await db()
    .from('commerce_orders')
    .select('id, amount_cents, platform_fee_cents, currency, status, created_at, stripe_payment_intent_id, commerce_order_items ( title, qty )')
    .eq('owner_space_id', spaceId)
    .eq('buyer_profile_id', profileId)
    .in('status', ['paid', 'fulfilled', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  type Row = {
    id: string
    amount_cents: number | null
    platform_fee_cents: number | null
    currency: string | null
    status: string
    created_at: string
    stripe_payment_intent_id: string | null
    commerce_order_items: { title: string | null; qty: number | null }[] | null
  }
  return ((data ?? []) as unknown as Row[]).map((o) => {
    const items = o.commerce_order_items ?? []
    return {
      id: o.id,
      kind: 'order' as const,
      title: (items[0]?.title ?? 'Order') + (items.length > 1 ? ` +${items.length - 1}` : ''),
      qty: items.reduce((n, i) => n + (Number(i.qty) || 1), 0) || 1,
      amountCents: Number(o.amount_cents) || 0,
      feeCents: Number(o.platform_fee_cents) || 0,
      currency: o.currency ?? 'usd',
      buyer: null,
      buyerEmail: null,
      at: o.created_at,
      status: o.status === 'refunded' ? ('refunded' as const) : ('paid' as const),
      stripePaymentIntentId: o.stripe_payment_intent_id,
    }
  })
}

/** What a person has spent with a Space, net of refunds. PURE. */
export function lifetimeSpendCents(sales: Pick<SpaceSale, 'amountCents' | 'status'>[]): number {
  return sales.reduce((n, s) => n + (s.status === 'paid' ? s.amountCents : 0), 0)
}
