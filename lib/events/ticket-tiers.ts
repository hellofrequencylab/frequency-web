import { createAdminClient } from '@/lib/supabase/admin'

// Shared ticket-tier logic (EVENTS-SYSTEM §2.2). Named tiers with richer pricing
// modes + inventory, written ONLY through the service role (admin client). The
// `sold` count is owned by the billing webhook and is NEVER set here.
//
// AUTHORIZATION IS THE CALLER'S JOB. Every writer here assumes the caller has
// already verified the actor may edit this event (the `event.editSettings`
// capability). The admin console actions and the host-facing actions both gate
// before calling in, so these functions never re-check.

export type TicketPricingMode = 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'

export const TICKET_PRICING_MODES: TicketPricingMode[] = [
  'fixed',
  'free',
  'pwyc',
  'sliding_scale',
  'donation',
]

// The editor/reader row shape: every catalog field plus the billing-owned `sold`
// count (read-only) and the `active` flag.
export type TicketTierRow = {
  id: string
  name: string
  description: string | null
  pricing_mode: TicketPricingMode
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
  quantity: number | null
  sold: number
  member_only: boolean
  sort_order: number
  active: boolean
}

/** Dollars string from a form field → integer cents, or null when blank. */
function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = (raw as string | null)?.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

// The normalized catalog fields written to `event_ticket_types` (never `sold`,
// never `event_id`, never `active` — those are set by the specific writer).
type TicketTierCatalogFields = {
  name: string
  description: string | null
  pricing_mode: TicketPricingMode
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
  quantity: number | null
  member_only: boolean
  sort_order: number
}

/**
 * Validate + normalize a tier form into the catalog fields. Throws on invalid
 * input (missing name, unknown mode, a fixed tier with no price). Free and fixed
 * modes null out min/suggested; only fixed keeps a price; buyer-chosen modes
 * (pwyc / sliding_scale / donation) lean on min + suggested.
 */
export function parseTicketTierInput(fd: FormData): TicketTierCatalogFields {
  const name = (fd.get('name') as string)?.trim()
  if (!name) throw new Error('A tier name is required.')

  const mode = (fd.get('pricing_mode') as string)?.trim() as TicketPricingMode
  if (!TICKET_PRICING_MODES.includes(mode)) throw new Error('Invalid pricing mode.')

  const priceCents = dollarsToCents(fd.get('price'))
  // A fixed tier must carry a price; buyer-chosen modes lean on min/suggested.
  if (mode === 'fixed' && (priceCents == null || priceCents <= 0)) {
    throw new Error('A fixed-price tier needs a price.')
  }

  const qtyRaw = (fd.get('quantity') as string)?.trim()
  const quantity = qtyRaw ? Math.max(0, Math.floor(Number(qtyRaw))) : null

  return {
    name,
    description: (fd.get('description') as string)?.trim() || null,
    pricing_mode: mode,
    price_cents: mode === 'fixed' ? priceCents : null,
    min_cents: mode === 'free' || mode === 'fixed' ? null : dollarsToCents(fd.get('min')),
    suggested_cents:
      mode === 'free' || mode === 'fixed' ? null : dollarsToCents(fd.get('suggested')),
    quantity,
    member_only: fd.get('member_only') === 'on',
    sort_order: Number((fd.get('sort_order') as string) || 0) || 0,
  }
}

/** Create a ticket tier on an event. Authorization must already be checked. */
export async function createEventTicketTier(eventId: string, fd: FormData): Promise<void> {
  const fields = parseTicketTierInput(fd)
  const admin = createAdminClient()
  const { error } = await admin.from('event_ticket_types').insert({
    event_id: eventId,
    ...fields,
    active: true,
  })
  if (error) throw new Error(error.message)
}

/** Edit a tier's catalog fields. Never touches `sold` (billing-owned).
 *  Authorization must already be checked. */
export async function updateEventTicketTier(
  tierId: string,
  eventId: string,
  fd: FormData,
): Promise<void> {
  const fields = parseTicketTierInput(fd)
  const admin = createAdminClient()
  const { error } = await admin
    .from('event_ticket_types')
    .update(fields)
    .eq('id', tierId)
    .eq('event_id', eventId)
  if (error) throw new Error(error.message)
}

/** Retire / reactivate a tier. Retiring stops new sales but keeps the row for the
 *  tickets already sold against it (it's never hard-deleted while sold > 0).
 *  Authorization must already be checked. */
export async function setEventTicketTierActive(
  tierId: string,
  eventId: string,
  active: boolean,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('event_ticket_types')
    .update({ active })
    .eq('id', tierId)
    .eq('event_id', eventId)
  if (error) throw new Error(error.message)
}

/** All tiers for an event (active + retired), in display order. `sold` is
 *  read-only. Authorization must already be checked by the caller. */
export async function listEventTicketTiers(eventId: string): Promise<TicketTierRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_ticket_types')
    .select(
      'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, sort_order, active',
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as TicketTierRow[]
}
