import { createAdminClient } from '@/lib/supabase/admin'
import { featureAllowed } from '@/lib/pricing/gates'
import { billingLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'

// Shared ticket-tier logic (EVENTS-SYSTEM §2.2). Named tiers with richer pricing
// modes + inventory, written ONLY through the service role (admin client). The
// `sold` count is owned by the billing webhook and is NEVER set here.
//
// AUTHORIZATION IS THE CALLER'S JOB. Every writer here assumes the caller has
// already verified the actor may edit this event (the `event.editSettings`
// capability). The admin console actions and the host-facing actions both gate
// before calling in, so these functions never re-check.
//
// MEMBERSHIP-LINKED ACCESS (ADR-823): a tier may be restricted to active members of the event's
// HOSTING Space (space_members_only / space_tier_id). Both writers validate that INPUT here —
// the event must have a hosting Space, the Space's plan must clear the Collective gate, and a
// named membership tier must belong to that Space — so neither surface (host Manage nor the
// admin console) can persist a gate the checkout can't honestly enforce.

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
  /** ADR-823: only active members of the event's hosting Space may buy this tier. */
  space_members_only: boolean
  /** ADR-823: narrows the gate to one space_membership_tiers row; null = any active membership. */
  space_tier_id: string | null
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
  space_members_only: boolean
  space_tier_id: string | null
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

  // ADR-823: a named membership tier implies the space-members gate (a tier IS a subset of the
  // members), so space_tier_id forces space_members_only true — the checkout reads both.
  const spaceTierId = (fd.get('space_tier_id') as string | null)?.trim() || null

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
    space_members_only: spaceTierId != null || fd.get('space_members_only') === 'on',
    space_tier_id: spaceTierId,
    sort_order: Number((fd.get('sort_order') as string) || 0) || 0,
  }
}

/**
 * Validate a tier's membership-access gate against the EVENT it will live on (ADR-823). No-op for
 * an ungated tier. For a gated one, requires (in order):
 *   1. a hosting Space — the gate keys on events.host_space_id (falling back to the placement
 *      space_id, the same resolution the checkout + attribution use, ADR-819);
 *   2. the Space's plan to clear the Collective floor (feature `space_membership_tickets` —
 *      selling membership-included tickets is Collective depth, like collaborators/automation);
 *   3. a named space_tier_id to be a real membership tier OF that Space (no cross-space gates).
 * Throws a member-readable Error on any miss, exactly like parseTicketTierInput.
 */
async function validateSpaceAccess(
  eventId: string,
  fields: Pick<TicketTierCatalogFields, 'space_members_only' | 'space_tier_id'>,
): Promise<void> {
  if (!fields.space_members_only && !fields.space_tier_id) return

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('space_id, host_space_id')
    .eq('id', eventId)
    .maybeSingle()
  const evRow = ev as { space_id: string | null; host_space_id: string | null } | null
  const spaceId = evRow?.host_space_id ?? evRow?.space_id ?? null
  if (!spaceId) {
    throw new Error('Set a hosting space for this event before restricting a ticket to its members.')
  }

  const { data: sp } = await admin
    .from('spaces')
    .select('plan')
    .eq('id', spaceId)
    .maybeSingle()
  const plan = asSpacePlan((sp as { plan: string | null } | null)?.plan)
  const allowed = await featureAllowed(
    'space_membership_tickets',
    { plan },
    { billingLive: await billingLive() },
  )
  if (!allowed) {
    throw new Error('Membership-only tickets are part of the Collective plan.')
  }

  if (fields.space_tier_id) {
    // The named membership tier must belong to THE hosting Space. space_membership_tiers is not in
    // the generated types yet (ADR-246) — narrow untyped read, same convention as lib/spaces/memberships.
    const db = admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null }>
            }
          }
        }
      }
    }
    const { data: tier } = await db
      .from('space_membership_tiers')
      .select('id')
      .eq('id', fields.space_tier_id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (!tier) throw new Error('That membership tier doesn’t belong to the hosting space.')
  }
}

/** Create a ticket tier on an event. Authorization must already be checked. */
export async function createEventTicketTier(eventId: string, fd: FormData): Promise<void> {
  const fields = parseTicketTierInput(fd)
  await validateSpaceAccess(eventId, fields)
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
  await validateSpaceAccess(eventId, fields)
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
      'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, sort_order, active',
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as TicketTierRow[]
}
