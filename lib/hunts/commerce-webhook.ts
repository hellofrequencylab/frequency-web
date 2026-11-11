/**
 * The IO half of lib/hunts/commerce-hooks.ts (FH-037S): the three entry points the Stripe webhook and the
 * repair cron call. Every one is best effort and a no-op until HUNTS_COMMERCE_ENABLED is on. It reads the
 * canonical ticket by the provider's own reference and writes only hunt_* rows.
 */
import type Stripe from 'stripe'
import { db, huntRpc, loadTicketSource, projectTicketBenefits, repairMissingBenefits, activeBindingForTier } from './commerce-store'
import { attachAttendee } from './entitlements'
import { applyChargeReversal, guarded, nextIntentState, reversalForCharge, reversalForDispute } from './commerce-hooks'
import { huntSwitchOn } from './flags'

type TicketRef = { id: string; ticket_type_id: string | null; status: string }

async function ticketBy(column: 'stripe_checkout_session_id' | 'stripe_payment_intent_id', value: string): Promise<TicketRef | null> {
  const { data } = await db().from('event_tickets').select('id, ticket_type_id, status').eq(column, value).maybeSingle()
  return (data as TicketRef | null) ?? null
}

/** Leave a visible, retryable record that a hook failed. Only a bound tier has anything to retry. */
async function recordFailure(ticket: TicketRef, message: string): Promise<void> {
  if (!ticket.ticket_type_id) return
  const binding = await activeBindingForTier(ticket.ticket_type_id)
  if (!binding) return
  const { data: existing } = await db()
    .from('hunt_commerce_intents')
    .select('id, attempts')
    .eq('source_type', 'event-ticket')
    .eq('source_id', ticket.id)
    .eq('binding_id', binding.id)
    .maybeSingle()
  const attempts = ((existing as { attempts: number } | null)?.attempts ?? 0) + 1
  const next = nextIntentState(attempts, Date.now())
  const row = { status: next.status, attempts, next_attempt_at: next.nextAttemptAt, last_error: message }
  const write = existing
    ? db().from('hunt_commerce_intents').update(row).eq('id', (existing as { id: string }).id)
    : db().from('hunt_commerce_intents').insert({ source_type: 'event-ticket', source_id: ticket.id, binding_id: binding.id, ...row })
  const { error } = await write
  if (error) throw new Error(error.message)
}

/** After the ticket is recorded from a paid session (webhook or checkout return): project its benefits. */
export async function huntsAfterTicketSession(sessionId: string): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const ticket = await ticketBy('stripe_checkout_session_id', sessionId).catch(() => null)
  if (!ticket) return
  await guarded('ticket-projection', async () => { await projectTicketBenefits(ticket.id) }, (m) => recordFailure(ticket, m))
}

/** A refunded charge: revoke or open a review case for the ticket it paid for. */
export async function huntsAfterChargeRefund(charge: Stripe.Charge): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!pi) return
  const ticket = await ticketBy('stripe_payment_intent_id', pi).catch(() => null)
  if (!ticket) return
  await guarded('ticket-refund', () => applyChargeReversal(huntRpc, ticket.id, reversalForCharge(charge)), (m) => recordFailure(ticket, m))
}

/** A decided dispute: a lost one revokes, a won one restores only while canonical state is still paid. */
export async function huntsAfterDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!pi) return
  const ticket = await ticketBy('stripe_payment_intent_id', pi).catch(() => null)
  if (!ticket) return
  await guarded(
    'ticket-dispute',
    () => applyChargeReversal(huntRpc, ticket.id, reversalForDispute(dispute, ticket.status === 'succeeded')),
    (m) => recordFailure(ticket, m),
  )
}

/**
 * A paid guest seat becomes the verified attendee's once the claim names a profile on the seat that ticket
 * minted. The claim itself runs in SQL at sign-in, so this scan finds seats still waiting (`pending_claim`),
 * re-reads the canonical attendee, and attaches it. Attaching is idempotent and only ever activates.
 */
async function attachClaimedSeats(limit = 50): Promise<{ checked: number; attached: number }> {
  const { data } = await db()
    .from('hunt_entitlements')
    .select('source_id, unit_key')
    .eq('source_type', 'event-ticket')
    .eq('state', 'pending_claim')
    .limit(limit)
  const rows = (data as { source_id: string; unit_key: string }[] | null) ?? []
  let attached = 0
  for (const row of rows) {
    const source = await loadTicketSource(row.source_id)
    const seat = source?.seats.find((x) => x.unit === row.unit_key)
    if (!seat?.profileId) continue
    attached += (await attachAttendee(huntRpc, row.source_id, row.unit_key, seat.profileId)) > 0 ? 1 : 0
  }
  return { checked: rows.length, attached }
}

/** The repair cron's pass: missing benefits first, then seats whose claim has landed. Bounded and idempotent. */
export async function huntsRepairPass(limit = 50): Promise<{ checked: number; repaired: number; attached: number } | null> {
  if (!huntSwitchOn('commerce')) return null
  const repair = await repairMissingBenefits(limit)
  const claims = await attachClaimedSeats(limit)
  return { ...repair, attached: claims.attached }
}
