// FIND ANY PAYMENT, ACROSS EVERY SPACE (LIVE-2547).
//
// Money lands in three tables: event_tickets, space_donations and commerce_orders. Before this, staff
// answering "a payment came through last night, where is it?" had the shop orders list and nothing
// for a ticket or a gift; the answer took a database query. This reads all three, newest first, and
// can narrow by a Stripe payment id (pi_...), a guest's email, or a buyer's name. A member's
// account email is not searched (it lives with sign-in, not on the sale); search a member by name.
//
// Staff only: the page gates on requireAdmin before this is called. Read-only. FAIL-SOFT per source:
// an unreadable table gives [] for that source and is named in `unreadable`, so a partial answer is
// never passed off as the whole one. Server-only. No em or en dashes.

import 'server-only'
import { feeBearingSpaceId } from '@/lib/events/belonging'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface FoundPayment {
  id: string
  kind: 'ticket' | 'donation' | 'order'
  title: string
  amountCents: number
  feeCents: number
  currency: string
  status: string
  at: string
  buyer: string | null
  spaceName: string | null
  spaceSlug: string | null
  stripePaymentIntentId: string | null
}

interface PaymentSearch {
  payments: FoundPayment[]
  /** Sources that could not be read, so the page can say the list is partial. */
  unreadable: string[]
}

type Source = 'event_tickets' | 'space_donations' | 'commerce_orders'

/** How a search box value narrows the read. PURE. */
export function classifyPaymentQuery(raw: string | null | undefined): { kind: 'none' } | { kind: 'intent' | 'email' | 'name'; value: string } {
  const q = (raw ?? '').trim()
  if (!q) return { kind: 'none' }
  if (/^pi_[A-Za-z0-9]+$/.test(q)) return { kind: 'intent', value: q }
  if (q.includes('@')) return { kind: 'email', value: q.toLowerCase() }
  return { kind: 'name', value: q }
}

/** Escape the wildcards a person might type, so "50%_off" searches for itself. PURE. */
function like(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function db(): SupabaseClient {
  return createAdminClient()
}

type TicketRow = {
  id: string
  event_id: string
  buyer_profile_id: string | null
  guest_email: string | null
  amount_cents: number | null
  platform_fee_cents: number | null
  currency: string | null
  status: string | null
  created_at: string
  succeeded_at: string | null
  stripe_payment_intent_id: string | null
}
type DonationRow = {
  id: string
  space_id: string | null
  donor_profile_id: string | null
  amount_cents: number | null
  platform_fee_cents: number | null
  currency: string | null
  status: string | null
  created_at: string
  succeeded_at: string | null
  stripe_payment_intent_id: string | null
}
type OrderRow = {
  id: string
  owner_space_id: string | null
  buyer_profile_id: string | null
  guest_email: string | null
  amount_cents: number | null
  platform_fee_cents: number | null
  currency: string | null
  status: string | null
  created_at: string
  stripe_payment_intent_id: string | null
  commerce_order_items: { title: string | null }[] | null
}

/** Payments across the platform, newest first. With no query: the latest of every kind. */
export async function findPayments(rawQuery: string | null | undefined, opts: { limit?: number } = {}): Promise<PaymentSearch> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const query = classifyPaymentQuery(rawQuery)
  const unreadable: string[] = []

  // A name search resolves to profile ids first; no match means no buyer-keyed rows can match.
  let profileIds: string[] | null = null
  if (query.kind === 'name') {
    const { data, error } = await db().from('profiles').select('id').ilike('display_name', like(query.value)).limit(50)
    if (error) unreadable.push('profiles')
    profileIds = ((data ?? []) as { id: string }[]).map((p) => p.id)
  }
  const noBuyerMatch = query.kind === 'name' && (profileIds?.length ?? 0) === 0

  const read = async <T>(source: Source, run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> => {
    try {
      const { data, error } = await run()
      if (error) throw new Error(error.message)
      return (data ?? []) as T[]
    } catch (err) {
      console.error('[admin/payments-finder] source unreadable', { source, err })
      unreadable.push(source)
      return []
    }
  }

  const [tickets, donations, orders] = await Promise.all([
    noBuyerMatch
      ? Promise.resolve([] as TicketRow[])
      : read<TicketRow>('event_tickets', () => {
          let q = db()
            .from('event_tickets')
            .select('id, event_id, buyer_profile_id, guest_email, amount_cents, platform_fee_cents, currency, status, created_at, succeeded_at, stripe_payment_intent_id')
            .in('status', ['succeeded', 'refunded'])
          if (query.kind === 'intent') q = q.eq('stripe_payment_intent_id', query.value)
          if (query.kind === 'email') q = q.ilike('guest_email', like(query.value))
          if (query.kind === 'name') q = q.in('buyer_profile_id', profileIds ?? [])
          return q.order('created_at', { ascending: false }).limit(limit)
        }),
    noBuyerMatch || query.kind === 'email'
      ? Promise.resolve([] as DonationRow[])
      : read<DonationRow>('space_donations', () => {
          let q = db()
            .from('space_donations')
            .select('id, space_id, donor_profile_id, amount_cents, platform_fee_cents, currency, status, created_at, succeeded_at, stripe_payment_intent_id')
            .in('status', ['succeeded', 'refunded'])
          if (query.kind === 'intent') q = q.eq('stripe_payment_intent_id', query.value)
          if (query.kind === 'name') q = q.in('donor_profile_id', profileIds ?? [])
          return q.order('created_at', { ascending: false }).limit(limit)
        }),
    noBuyerMatch
      ? Promise.resolve([] as OrderRow[])
      : read<OrderRow>('commerce_orders', () => {
          let q = db()
            .from('commerce_orders')
            .select('id, owner_space_id, buyer_profile_id, guest_email, amount_cents, platform_fee_cents, currency, status, created_at, stripe_payment_intent_id, commerce_order_items ( title )')
            .in('status', ['paid', 'fulfilled', 'refunded'])
          if (query.kind === 'intent') q = q.eq('stripe_payment_intent_id', query.value)
          if (query.kind === 'email') q = q.ilike('guest_email', like(query.value))
          if (query.kind === 'name') q = q.in('buyer_profile_id', profileIds ?? [])
          return q.order('created_at', { ascending: false }).limit(limit)
        }),
  ])

  // Names for what the rows point at. Decoration: a missing name never drops a payment.
  const eventIds = [...new Set(tickets.map((t) => t.event_id))]
  const events = new Map<string, { title: string | null; spaceId: string | null }>()
  if (eventIds.length) {
    const { data } = await db().from('events').select('id, title, host_space_id, space_id').in('id', eventIds)
    for (const e of (data ?? []) as { id: string; title: string | null; host_space_id: string | null; space_id: string | null }[]) {
      events.set(e.id, { title: e.title, spaceId: feeBearingSpaceId(e) })
    }
  }
  const spaceIds = [
    ...new Set(
      [...[...events.values()].map((e) => e.spaceId), ...donations.map((d) => d.space_id), ...orders.map((o) => o.owner_space_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ]
  const spaces = new Map<string, { name: string | null; slug: string | null }>()
  if (spaceIds.length) {
    const { data } = await db().from('spaces').select('id, name, slug').in('id', spaceIds)
    for (const s of (data ?? []) as { id: string; name: string | null; slug: string | null }[]) spaces.set(s.id, { name: s.name, slug: s.slug })
  }
  const buyerIds = [
    ...new Set(
      [...tickets.map((t) => t.buyer_profile_id), ...donations.map((d) => d.donor_profile_id), ...orders.map((o) => o.buyer_profile_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ]
  const names = new Map<string, string>()
  if (buyerIds.length) {
    const { data } = await db().from('profiles').select('id, display_name').in('id', buyerIds)
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) if (p.display_name) names.set(p.id, p.display_name)
  }
  const space = (id: string | null) => (id ? spaces.get(id) ?? null : null)

  const payments: FoundPayment[] = [
    ...tickets.map((t): FoundPayment => {
      const ev = events.get(t.event_id)
      const s = space(ev?.spaceId ?? null)
      return {
        id: t.id,
        kind: 'ticket',
        title: ev?.title ?? 'Event',
        amountCents: Number(t.amount_cents) || 0,
        feeCents: Number(t.platform_fee_cents) || 0,
        currency: t.currency ?? 'usd',
        status: t.status === 'refunded' ? 'refunded' : 'paid',
        at: t.succeeded_at ?? t.created_at,
        buyer: (t.buyer_profile_id && names.get(t.buyer_profile_id)) || t.guest_email || null,
        spaceName: s?.name ?? null,
        spaceSlug: s?.slug ?? null,
        stripePaymentIntentId: t.stripe_payment_intent_id,
      }
    }),
    ...donations.map((d): FoundPayment => {
      const s = space(d.space_id)
      return {
        id: d.id,
        kind: 'donation',
        title: 'Donation',
        amountCents: Number(d.amount_cents) || 0,
        feeCents: Number(d.platform_fee_cents) || 0,
        currency: d.currency ?? 'usd',
        status: d.status === 'refunded' ? 'refunded' : 'paid',
        at: d.succeeded_at ?? d.created_at,
        buyer: (d.donor_profile_id && names.get(d.donor_profile_id)) || null,
        spaceName: s?.name ?? null,
        spaceSlug: s?.slug ?? null,
        stripePaymentIntentId: d.stripe_payment_intent_id,
      }
    }),
    ...orders.map((o): FoundPayment => {
      const s = space(o.owner_space_id)
      const items = o.commerce_order_items ?? []
      return {
        id: o.id,
        kind: 'order',
        title: (items[0]?.title ?? 'Order') + (items.length > 1 ? ` +${items.length - 1}` : ''),
        amountCents: Number(o.amount_cents) || 0,
        feeCents: Number(o.platform_fee_cents) || 0,
        currency: o.currency ?? 'usd',
        status: o.status === 'refunded' ? 'refunded' : 'paid',
        at: o.created_at,
        buyer: (o.buyer_profile_id && names.get(o.buyer_profile_id)) || o.guest_email || null,
        spaceName: s?.name ?? null,
        spaceSlug: s?.slug ?? null,
        stripePaymentIntentId: o.stripe_payment_intent_id,
      }
    }),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)

  return { payments, unreadable: [...new Set(unreadable)] }
}
