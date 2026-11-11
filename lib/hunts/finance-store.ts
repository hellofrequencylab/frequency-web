/**
 * The finance store (FH-040): the IO half over lib/hunts/finance-view.ts. It READS tickets and tiers and
 * writes only hunt_reconciliation. Scope for the page is enforced inside the reader on every read.
 */
import { activeBindingForTier, db } from './commerce-store'
import { createReconciliationReader, matchReconciliation } from './finance-view'

/** The redacted reader the finance page takes. Scope is enforced inside it on every read. */
export const reconciliationReader = createReconciliationReader(db)

type TicketRow = {
  id: string
  ticket_type_id: string | null
  qty: number
  amount_cents: number
  platform_fee_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  refunded_at: string | null
  created_at: string
}

/**
 * Record one reconciliation row for a ticket on a bound tier. Expected is the canonical tier price times
 * quantity; the provider side is the amount the signed webhook booked on the ticket. Re-running updates
 * the same row (unique per source), so the aging clock keeps its first-seen time.
 */
export async function reconcileTicket(ticketId: string, now: number = Date.now()): Promise<'matched' | 'pending' | 'exception' | null> {
  const { data: t } = await db()
    .from('event_tickets')
    .select('id, ticket_type_id, qty, amount_cents, platform_fee_cents, currency, status, refunded_at, created_at')
    .eq('id', ticketId)
    .maybeSingle()
  const ticket = t as TicketRow | null
  if (!ticket?.ticket_type_id) return null
  const binding = await activeBindingForTier(ticket.ticket_type_id)
  if (!binding) return null
  const { data: tier } = await db().from('event_ticket_types').select('price_cents').eq('id', ticket.ticket_type_id).maybeSingle()
  const unit = (tier as { price_cents: number | null } | null)?.price_cents
  if (!unit) return null
  const { count } = await db()
    .from('hunt_entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'event-ticket')
    .eq('source_id', ticket.id)
    .in('state', ['pending_claim', 'active', 'suspended'])
  const refunded = ticket.status === 'refunded' || ticket.refunded_at ? ticket.amount_cents : 0
  const ageMinutes = Math.max(0, Math.floor((now - new Date(ticket.created_at).getTime()) / 60000))
  const verdict = matchReconciliation({
    currency: ticket.currency.toUpperCase(),
    expectedAmountMinor: unit * ticket.qty,
    providerAmountMinor: ticket.status === 'succeeded' || ticket.status === 'refunded' ? ticket.amount_cents : null,
    feeMinor: ticket.platform_fee_cents,
    refundedMinor: refunded,
    transferMinor: null,
    openEntitlements: count ?? 0,
    ageMinutes,
  })
  const { error } = await db().from('hunt_reconciliation').upsert(
    {
      source_type: 'event-ticket',
      source_id: ticket.id,
      seller_space_id: binding.sellerSpaceId,
      currency: ticket.currency.toUpperCase(),
      expected_amount_minor: unit * ticket.qty,
      provider_amount_minor: ticket.status === 'succeeded' || ticket.status === 'refunded' ? ticket.amount_cents : null,
      fee_minor: ticket.platform_fee_cents,
      refunded_minor: refunded,
      entitlement_count: count ?? 0,
      status: verdict.status,
      note: verdict.note,
      last_checked_at: new Date(now).toISOString(),
    },
    { onConflict: 'source_type,source_id' },
  )
  if (error) throw new Error(`hunt_reconciliation write failed: ${error.message}`)
  return verdict.status
}
