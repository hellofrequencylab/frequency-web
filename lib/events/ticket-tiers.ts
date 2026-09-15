import { createAdminClient } from '@/lib/supabase/admin'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { resolveHostingSpaceIdFromRow } from './host-space'
import { resolveZone, zonedWallClockToInstant } from '@/lib/time/zone'

// Shared ticket-tier logic (EVENTS-SYSTEM §2.2). Named tiers with richer pricing
// modes + inventory, written ONLY through the service role (admin client). The
// `sold` count is owned by the billing webhook and is NEVER set here.
//
// AUTHORIZATION IS THE CALLER'S JOB. Every writer here assumes the caller has
// already verified the actor may edit this event (the `event.editSettings`
// capability). The admin console actions and the host-facing actions both gate
// before calling in, so these functions never re-check.
//
// SALES WINDOW (ADR-1373): a tier may carry an open time and a close time, so "members get first
// RSVP" is a rule the row keeps rather than an operator remembering to flip `active` on later.
// `sales_starts_days_before` is the shape a recurring series survives (written once, resolved
// against each occurrence); `sales_start_at` is the absolute per-occurrence override and wins when
// both are set. The two absolute columns are TRUE INSTANTS (timestamptz), so the operator's
// `datetime-local` input is read as wall-clock in the EVENT'S OWN zone and converted here, at the
// only layer that knows which event a tier belongs to. The decision itself is pure and lives in
// lib/events/sales-window.ts; this module only parses, validates and persists.
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
  /** ADR-1373: absolute open instant; wins over the day count when both are set. */
  sales_start_at: string | null
  /** ADR-1373: opens this many days before the event starts. 0 is meaningful, and is not null. */
  sales_starts_days_before: number | null
  /** ADR-1373: absolute close instant; null = sells until the event ends. */
  sales_end_at: string | null
  /** DERIVED for the editor only, never stored: the same instants as `datetime-local` values in
   *  the event's own zone, so the form round-trips without shipping a timezone database to the
   *  browser. Null whenever the instant is. */
  sales_start_local: string | null
  sales_end_local: string | null
  sort_order: number
  active: boolean
}

// ── Sales window: the `datetime-local` ⇄ instant round trip (ADR-1373) ────────────────────────
// The operator types a wall clock. They mean it in the EVENT'S city, not in the browser's zone and
// not in UTC: "public tickets open Thursday at 6pm" is a statement about the city the event is in.
// The column is a real instant, so the conversion happens here, on the server, where the event's
// zone is known. Doing it in the browser instead would ship a timezone database to every phone
// (check:shell-weight) and would silently change meaning when a host travels.

/** "2027-03-05T18:00" typed against `timeZone` → the true UTC instant, ISO. Null for blank or
 *  malformed input: a half-typed date must read as "no window", never as an Invalid Date that
 *  compares false against everything and quietly disables the window. */
export function localInputToInstant(
  raw: FormDataEntryValue | null,
  timeZone: string | null | undefined,
): string | null {
  const s = (raw as string | null)?.trim()
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) return null
  const [, y, mo, d, h, mi, sec] = m
  const at = zonedWallClockToInstant(
    Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec ?? 0), resolveZone(timeZone),
  )
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** The reverse, for a form default: an instant → the `datetime-local` value that shows the same
 *  wall clock the operator originally typed in the event's zone. */
export function instantToLocalInput(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolveZone(timeZone),
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const value = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : null
  } catch {
    return null
  }
}

/** The event's IANA zone, for the round trip above. Falls back to HOME via resolveZone at use. */
async function loadEventTimeZone(eventId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('time_zone')
    .eq('id', eventId)
    .maybeSingle()
  return (data as { time_zone: string | null } | null)?.time_zone ?? null
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
  sales_start_at: string | null
  sales_starts_days_before: number | null
  sales_end_at: string | null
  sort_order: number
}

/**
 * Validate + normalize a tier form into the catalog fields. Throws on invalid
 * input (missing name, unknown mode, a fixed tier with no price). Free and fixed
 * modes null out min/suggested; only fixed keeps a price; buyer-chosen modes
 * (pwyc / sliding_scale / donation) lean on min + suggested.
 *
 * SALES WINDOW (ADR-1373): `opts.timeZone` is the EVENT'S zone, and the two absolute fields are
 * read as wall clock in it. Omitting it falls back to HOME rather than throwing, because a window
 * is optional and a missing zone must not make an ordinary tier edit fail.
 */
export function parseTicketTierInput(
  fd: FormData,
  opts: { timeZone?: string | null } = {},
): TicketTierCatalogFields {
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

  // ── Sales window (ADR-1373) ──
  // A blank day count is null (no relative rule), NOT 0: 0 means "opens exactly at the event
  // start", which is a real, different window. Anything else is an operator typo, and a typo that
  // silently became "no window" would be a members-first promise that quietly did nothing.
  const daysRaw = (fd.get('sales_starts_days_before') as string | null)?.trim()
  let salesStartsDaysBefore: number | null = null
  if (daysRaw) {
    const n = Number(daysRaw)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('Days before the event must be a whole number, 0 or more.')
    }
    salesStartsDaysBefore = n
  }
  const salesStartAt = localInputToInstant(fd.get('sales_start_at'), opts.timeZone)
  const salesEndAt = localInputToInstant(fd.get('sales_end_at'), opts.timeZone)
  // Mirrors the database check. Caught here so the operator is told at write time rather than
  // meeting a constraint violation, and so the same rule exists on both sides of the wire.
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new Error('Ticket sales have to close after they open.')
  }

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
    sales_start_at: salesStartAt,
    sales_starts_days_before: salesStartsDaysBefore,
    sales_end_at: salesEndAt,
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
  // Root EXCLUDED: without the guard this never threw, because the root stamp made every event
  // look Space-hosted — so a host could restrict a ticket to "space members" on a personal event
  // and ship a ticket nobody could buy. Now they are told at configuration time.
  const spaceId = await resolveHostingSpaceIdFromRow(evRow)
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
    { gatesLive: await featureGatesLive() },
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

/** The admin client, narrowed to the two writes that touch columns newer than the generated types
 *  (ADR-246 exception, ADR-1373). Deliberately typed to the CATALOG FIELDS rather than to `any`, so
 *  a typo in a column name is still a compile error and only the table's own row type is relaxed. */
function ticketTypeWriter() {
  const admin = createAdminClient()
  return admin as unknown as {
    from: (t: 'event_ticket_types') => {
      insert: (row: TicketTierCatalogFields & { event_id: string; active: boolean }) => Promise<{
        error: { message: string } | null
      }>
      update: (row: TicketTierCatalogFields) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
  }
}

/** Create a ticket tier on an event. Authorization must already be checked. */
export async function createEventTicketTier(eventId: string, fd: FormData): Promise<void> {
  const fields = parseTicketTierInput(fd, { timeZone: await loadEventTimeZone(eventId) })
  await validateSpaceAccess(eventId, fields)
  // Untyped write (ADR-246 exception): the sales-window columns are newer than the generated
  // types, exactly as space_members_only / space_tier_id were before their regeneration. The cast
  // narrows nothing else, and the shape being written is TicketTierCatalogFields either way.
  const admin = ticketTypeWriter()
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
  const fields = parseTicketTierInput(fd, { timeZone: await loadEventTimeZone(eventId) })
  await validateSpaceAccess(eventId, fields)
  const admin = ticketTypeWriter()
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
  const [{ data }, timeZone] = await Promise.all([
    admin
      .from('event_ticket_types')
      .select(
        'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, sales_start_at, sales_starts_days_before, sales_end_at, sort_order, active',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    // Read once for the whole list: the editor's `datetime-local` defaults are the stored instants
    // shown in the EVENT'S zone, and every tier on an event shares that zone by definition.
    loadEventTimeZone(eventId),
  ])
  const rows = (data ?? []) as unknown as TicketTierRow[]
  return rows.map((t) => ({
    ...t,
    sales_start_local: instantToLocalInput(t.sales_start_at, timeZone),
    sales_end_local: instantToLocalInput(t.sales_end_at, timeZone),
  }))
}
