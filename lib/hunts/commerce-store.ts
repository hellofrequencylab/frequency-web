/**
 * The money store for Hunts (FH-036 to FH-040): the IO half over lib/hunts/pass-binding.ts,
 * entitlements.ts, merch.ts and refunds.ts.
 *
 * Every Hunt table is service role only, so this file is the tenancy wall. It READS canonical rows
 * (event_tickets, event_ticket_types, event_rsvps, commerce_orders) and WRITES only hunt_* tables and
 * hunt_* functions. It never touches a ticket, an order, a seat or a refund: settlement, capacity and
 * money movement stay with lib/billing/tickets.ts and lib/commerce/checkout.ts. Nothing here is called
 * from a request path until HUNTS_COMMERCE_ENABLED is on, and the callers (route, repair cron) check it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  findMissingIntents,
  planTicketProjection,
  projectPlan,
  seatUnit,
  type ProjectionSummary,
  type Rpc,
  type TicketSource,
} from './entitlements'
import type { PassBinding } from './pass-binding'

// eslint-disable-next-line no-restricted-syntax -- the FH-036..047 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

/** The RPC caller the pure modules take, bound to the service-role client. */
export const huntRpc: Rpc = (fn, args) => db().rpc(fn, args)

type BindingRow = {
  id: string
  hunt_id: string
  version_id: string
  event_id: string
  ticket_type_id: string
  seller_space_id: string
  benefit_codes: string[]
  revision: number
  status: 'active' | 'retired'
}

function toBinding(r: BindingRow): PassBinding {
  return {
    id: r.id,
    huntId: r.hunt_id,
    versionId: r.version_id,
    eventId: r.event_id,
    ticketTypeId: r.ticket_type_id,
    sellerSpaceId: r.seller_space_id,
    benefitCodes: r.benefit_codes,
    revision: r.revision,
    status: r.status,
  }
}

const BINDING_COLS = 'id, hunt_id, version_id, event_id, ticket_type_id, seller_space_id, benefit_codes, revision, status'

export async function activeBindingForTier(ticketTypeId: string): Promise<PassBinding | null> {
  const { data, error } = await db().from('hunt_pass_bindings').select(BINDING_COLS).eq('ticket_type_id', ticketTypeId).eq('status', 'active').maybeSingle()
  if (error) throw new Error(`hunt_pass_bindings read failed: ${error.message}`)
  return data ? toBinding(data as BindingRow) : null
}

export async function bindingById(id: string): Promise<PassBinding | null> {
  const { data, error } = await db().from('hunt_pass_bindings').select(BINDING_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(`hunt_pass_bindings read failed: ${error.message}`)
  return data ? toBinding(data as BindingRow) : null
}

type TicketRow = {
  id: string
  event_id: string
  ticket_type_id: string | null
  buyer_profile_id: string | null
  qty: number
  amount_cents: number
  platform_fee_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  refunded_at: string | null
}

/**
 * Re-read a ticket NOW and build the canonical source. Seat 1 belongs to the buyer when the buyer is a
 * member; every other seat, and every seat of a guest purchase, stays unclaimed until a verified claim
 * names a profile on the seat that ticket minted. A buyer holding several seats is not the attendee of all.
 */
export async function loadTicketSource(ticketId: string): Promise<TicketSource | null> {
  const { data: t } = await db()
    .from('event_tickets')
    .select('id, event_id, ticket_type_id, buyer_profile_id, qty, amount_cents, platform_fee_cents, currency, status, refunded_at')
    .eq('id', ticketId)
    .maybeSingle()
  if (!t) return null
  const ticket = t as TicketRow
  const { data: ev } = await db().from('events').select('space_id, host_space_id').eq('id', ticket.event_id).maybeSingle()
  const sellerSpaceId = ((ev as { host_space_id: string | null; space_id: string | null } | null)?.host_space_id ?? (ev as { space_id: string | null } | null)?.space_id) ?? ''
  const { data: rsvp } = await db().from('event_rsvps').select('profile_id').eq('from_ticket_id', ticket.id).limit(1).maybeSingle()
  const attendee = ((rsvp as { profile_id: string | null } | null)?.profile_id ?? ticket.buyer_profile_id) || null
  const seats = Array.from({ length: Math.max(ticket.qty, 0) }, (_, i) => ({ unit: seatUnit(i + 1), profileId: i === 0 ? attendee : null }))
  return {
    kind: 'event-ticket',
    id: ticket.id,
    status: ticket.status,
    refundedAt: ticket.refunded_at,
    disputeOpen: false,
    eventId: ticket.event_id,
    ticketTypeId: ticket.ticket_type_id,
    sellerSpaceId,
    currency: ticket.currency,
    qty: ticket.qty,
    seats,
  }
}

/**
 * Project the benefits for one ticket, safely repeatable from a webhook, a checkout return or the repair
 * scan. Returns null when the ticket is not on a bound tier (nothing to do).
 */
export async function projectTicketBenefits(ticketId: string): Promise<{ summary: ProjectionSummary; disposition: string } | null> {
  const source = await loadTicketSource(ticketId)
  if (!source?.ticketTypeId) return null
  const binding = await activeBindingForTier(source.ticketTypeId)
  if (!binding) return null
  const { plan, summary } = await projectPlan(huntRpc, planTicketProjection(source, binding))
  return { summary, disposition: plan.ok ? 'projected' : plan.disposition }
}

/** The repair scan: settled tickets on bound tiers that have no benefit yet. Bounded, newest first. */
export async function repairMissingBenefits(limit = 50): Promise<{ checked: number; repaired: number }> {
  const { data: bindings } = await db().from('hunt_pass_bindings').select(BINDING_COLS).eq('status', 'active')
  const byTier = new Map((bindings as BindingRow[] | null ?? []).map((b) => [b.ticket_type_id, toBinding(b)]))
  if (byTier.size === 0) return { checked: 0, repaired: 0 }
  const { data: tickets } = await db()
    .from('event_tickets')
    .select('id, ticket_type_id')
    .eq('status', 'succeeded')
    .in('ticket_type_id', [...byTier.keys()])
    .order('succeeded_at', { ascending: false })
    .limit(limit)
  const rows = (tickets as { id: string; ticket_type_id: string | null }[] | null) ?? []
  const { data: have } = await db().from('hunt_entitlements').select('source_id').eq('source_type', 'event-ticket').in('source_id', rows.map((r) => r.id))
  const projected = new Set(((have as { source_id: string }[] | null) ?? []).map((h) => h.source_id))
  const missing = findMissingIntents(rows.map((r) => ({ sourceId: r.id, ticketTypeId: r.ticket_type_id })), byTier, projected)
  let repaired = 0
  for (const m of missing) {
    const out = await projectTicketBenefits(m.sourceId)
    if (out && out.disposition === 'projected') repaired += 1
  }
  return { checked: rows.length, repaired }
}
