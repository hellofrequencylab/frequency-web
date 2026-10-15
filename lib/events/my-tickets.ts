import 'server-only'
import { createClient } from '@/lib/supabase/server'

// THE BUYER'S EVENT TICKETS (SCAN-884). My orders read `commerce_orders` only, and an event ticket sale never
// writes there: it writes `event_tickets` (settle_ticket_atomic). So a member who bought a ticket read "No
// orders yet" (the owner's $44 House of Fates sound bath, 2026-09-16). This is the buyer's own side of the
// same table the Space earnings read (lib/commerce/orders.ts ticketEarnings). It reads through the session
// client: the `read own or hosted tickets` policy already returns exactly the caller's own rows, and the
// orders page is a per-request render. Paid tickets only (succeeded_at set), newest first. Fail-soft: an error
// reads as no tickets, which leaves the page as it was.

export interface MyTicket {
  id: string
  qty: number
  amountCents: number
  currency: string
  refunded: boolean
  paidAt: string
  event: { title: string; slug: string; startsAt: string } | null
}

export async function listMyEventTickets(profileId: string): Promise<MyTicket[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('event_tickets')
      .select('id, qty, amount_cents, currency, refunded_at, succeeded_at, events(title, slug, starts_at)')
      .eq('buyer_profile_id', profileId)
      .not('succeeded_at', 'is', null)
      .order('succeeded_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    return (data as unknown as {
      id: string
      qty: number | null
      amount_cents: number | null
      currency: string | null
      refunded_at: string | null
      succeeded_at: string
      events: { title: string; slug: string; starts_at: string } | null
    }[]).map((r) => ({
      id: r.id,
      qty: r.qty ?? 1,
      amountCents: r.amount_cents ?? 0,
      currency: (r.currency ?? 'usd').toUpperCase(),
      refunded: !!r.refunded_at,
      paidAt: r.succeeded_at,
      event: r.events ? { title: r.events.title, slug: r.events.slug, startsAt: r.events.starts_at } : null,
    }))
  } catch {
    return []
  }
}
