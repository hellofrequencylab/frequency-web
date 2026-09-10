'use server'

// EVENT ACCESS from the MEMBERSHIP settings (ADR-824). The owner directive: tiers need an editable
// "event access" — which of the Space's events a membership includes. The data model is the
// ADR-823 gate on event_ticket_types (a members-only FREE tier per event); this module manages
// that gate from the membership side, so an operator configures inclusion where they price their
// tiers, without opening each event's Manage screen. The event-side editors stay in sync because
// both surfaces read/write the same rows.
//
// AUTHZ: every action re-resolves the caller and gates on the Space's canEditProfile (owner /
// admin / editor) — the same bar as editing the tiers themselves — and every event write is bound
// to an event HOSTED BY this Space. Setting access is additionally plan-gated at the Collective
// floor (feature `space_membership_tickets`), matching the event-side writers.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { resolveHostingSpaceIdFromRow } from './host-space'
import { isUpcomingByInstant, MAX_TZ_OFFSET_MS } from '@/lib/pricing/member-meter-usage'

/** One upcoming event of the Space with its current members-ticket state.
 *  audience: 'none' = no members ticket; 'members' = any active membership; else a tier id. */
export interface SpaceEventAccessRow {
  eventId: string
  slug: string
  title: string
  startsAt: string
  audience: 'none' | 'members' | string
}

/** May this caller manage the Space's membership surfaces? Shared gate for both actions. */
async function guardManage(spaceId: string): Promise<{ error: string } | { ok: true }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Sign in.' }
  const space = await getSpaceById(spaceId)
  if (!space) return { error: 'Space not found.' }
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return { error: 'You do not have permission to manage this space.' }
  return { ok: true }
}

/** Upcoming, published, not-cancelled events HOSTED by this Space, each with its members-ticket
 *  state. Manager-gated read. FAIL-SAFE to [] on any error past the gate. */
export async function listSpaceEventAccess(
  spaceId: string,
): Promise<ActionResult<{ rows: SpaceEventAccessRow[] }>> {
  const gate = await guardManage(spaceId)
  if ('error' in gate) return fail(gate.error)
  try {
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('id, slug, title, starts_at, time_zone, status, is_cancelled')
      .or(`host_space_id.eq.${spaceId},and(host_space_id.is.null,space_id.eq.${spaceId})`)
      // 2026-09-05 (scan2 L6-14, ADR-1211): widened by the largest zone offset and re-filtered by the real
      // instant below; raw starts_at is the event's wall clock, not an instant.
      .gte('starts_at', new Date(Date.now() - MAX_TZ_OFFSET_MS).toISOString())
      .order('starts_at', { ascending: true })
      .limit(48)
    const rows = ((events ?? []) as unknown as {
      id: string
      slug: string
      title: string
      starts_at: string
      time_zone: string | null
      status: string | null
      is_cancelled: boolean | null
    }[])
      .filter((e) => (e.status ?? 'published') === 'published' && !e.is_cancelled)
      .filter((e) => isUpcomingByInstant(e))
      .slice(0, 24)
    if (rows.length === 0) return ok({ rows: [] })

    const { data: gates } = await admin
      .from('event_ticket_types')
      .select('event_id, space_tier_id, active')
      .in('event_id', rows.map((e) => e.id))
      .eq('space_members_only', true)
    const byEvent = new Map<string, { space_tier_id: string | null; active: boolean }>()
    for (const g of ((gates ?? []) as unknown as {
      event_id: string
      space_tier_id: string | null
      active: boolean
    }[])) {
      // One managed members ticket per event; an ACTIVE row wins over a retired one.
      const prev = byEvent.get(g.event_id)
      if (!prev || (!prev.active && g.active)) byEvent.set(g.event_id, g)
    }

    return ok({
      rows: rows.map((e) => {
        const g = byEvent.get(e.id)
        const audience: SpaceEventAccessRow['audience'] =
          !g || !g.active ? 'none' : g.space_tier_id ?? 'members'
        return { eventId: e.id, slug: e.slug, title: e.title, startsAt: e.starts_at, audience }
      }),
    })
  } catch {
    return ok({ rows: [] })
  }
}

/** The managed members ticket on one event: any `space_members_only` row, the ACTIVE one winning
 *  over a retired one. One read per event, shared by the writer below and its series fan-out. */
async function findManagedTier(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<{ id: string; active: boolean } | null> {
  const { data: gates } = await admin
    .from('event_ticket_types')
    .select('id, active, sort_order')
    .eq('event_id', eventId)
    .eq('space_members_only', true)
    .order('active', { ascending: false })
    .limit(1)
  return ((gates ?? []) as unknown as { id: string; active: boolean }[])[0] ?? null
}

/** Apply an already-authorized, already-validated access decision to ONE event. Returns false on a
 *  write failure so the caller can report it. Every authorization, plan and tier-ownership check
 *  stays in `setSpaceEventAccess`, which is what makes this safe to run over a series' dates: the
 *  decision is made once, about the series, and only the WRITE is repeated. */
async function writeEventAccess(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  decision: { retire: true } | { retire: false; tierId: string | null; name: string },
): Promise<boolean> {
  const existing = await findManagedTier(admin, eventId)

  if (decision.retire) {
    // Retire (never delete — sold/claimed history stays attached).
    if (!existing || !existing.active) return true
    const { error } = await admin
      .from('event_ticket_types')
      .update({ active: false })
      .eq('id', existing.id)
      .eq('event_id', eventId)
    return !error
  }

  if (existing) {
    const { error } = await admin
      .from('event_ticket_types')
      .update({ active: true, space_tier_id: decision.tierId, space_members_only: true })
      .eq('id', existing.id)
      .eq('event_id', eventId)
    return !error
  }
  const { error } = await admin.from('event_ticket_types').insert({
    event_id: eventId,
    name: decision.name,
    description: null,
    pricing_mode: 'free',
    sort_order: 1,
    active: true,
    space_members_only: true,
    space_tier_id: decision.tierId,
  })
  return !error
}

/**
 * The FUTURE materialised occurrences of a series anchor (ADR-1306).
 *
 * A recurring event's occurrences are real `events` rows, and their members ticket is a row of
 * their own. Granting access on the anchor alone therefore covered exactly one date — the one
 * nobody attends after the first week — while every materialised date stayed uncovered. Same rule
 * as `propagateAnchorEditsToOccurrences`: PAST occurrences are never touched, because a past
 * occurrence is the record of a gathering that already happened.
 *
 * Returns [] for a standalone event, so the caller needs no branch.
 */
async function futureOccurrenceIds(
  admin: ReturnType<typeof createAdminClient>,
  anchorId: string,
): Promise<string[]> {
  const { data } = await admin
    .from('events')
    .select('id')
    .eq('parent_event_id', anchorId)
    .gte('starts_at', new Date().toISOString())
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Set an event's members-ticket state from the membership settings: 'none' retires the members
 *  ticket; 'members' opens it to any active membership; a tier id narrows it to that tier. Creates
 *  the FREE members ticket when the event doesn't have one yet. Manager-gated; Collective-floor
 *  plan gate; the event must be hosted by this Space; a tier id must be this Space's tier.
 *
 *  ON A SERIES ANCHOR the same decision reaches its FUTURE occurrences (ADR-1306). */
export async function setSpaceEventAccess(
  spaceId: string,
  eventId: string,
  audience: 'none' | 'members' | string,
): Promise<ActionResult> {
  const gate = await guardManage(spaceId)
  if ('error' in gate) return fail(gate.error)
  const admin = createAdminClient()

  // The event must be HOSTED by this Space (the same resolution the checkout gates on).
  const { data: ev } = await admin
    .from('events')
    // `parent_event_id` rides along so an ANCHOR can fan the decision out to its own future dates.
    // A child row is left as a single event: the fan-out belongs to the series, and reaching
    // upward from one date would silently re-open access the host retired on the anchor.
    .select('id, space_id, host_space_id, parent_event_id')
    .eq('id', eventId)
    .maybeSingle()
  const evRow = ev as {
    id: string
    space_id: string | null
    host_space_id: string | null
    parent_event_id: string | null
  } | null
  // 🔴 Root EXCLUDED, and here it is an AUTHORIZATION boundary, not a label. The raw pair resolved
  // every root-stamped (i.e. ordinary personal) event to the root tenant, so an operator working
  // the ROOT Space's console passed this check on other members' events.
  const hostingId = await resolveHostingSpaceIdFromRow(evRow)
  if (!evRow || hostingId !== spaceId) {
    return fail('That event is not hosted by this space.')
  }

  // An ANCHOR carries its future dates with it; a standalone event resolves to [].
  const alsoApplyTo =
    evRow.parent_event_id == null ? await futureOccurrenceIds(admin, eventId) : []

  if (audience === 'none') {
    if (!(await writeEventAccess(admin, eventId, { retire: true }))) {
      return fail('Could not update event access. Try again.')
    }
    for (const occurrenceId of alsoApplyTo) {
      await writeEventAccess(admin, occurrenceId, { retire: true })
    }
    return ok()
  }

  // Opening/narrowing access is the Collective-depth capability (same gate as the event-side
  // writers). Checked only when GRANTING access, so retiring always works.
  const { data: sp } = await admin
    .from('spaces')
    .select('plan, name, brand_name')
    .eq('id', spaceId)
    .maybeSingle()
  const spRow = sp as { plan: string | null; name: string | null; brand_name: string | null } | null
  const allowed = await featureAllowed(
    'space_membership_tickets',
    { plan: asSpacePlan(spRow?.plan) },
    { gatesLive: await featureGatesLive() },
  )
  if (!allowed) return fail('Membership-only tickets are part of the Collective plan.')

  const tierId = audience === 'members' ? null : audience
  if (tierId) {
    const tdb = admin as unknown as {
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
    const { data: tier } = await tdb
      .from('space_membership_tiers')
      .select('id')
      .eq('id', tierId)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (!tier) return fail('That membership tier does not belong to this space.')
  }

  const brand = spRow?.brand_name ?? spRow?.name
  const decision = {
    retire: false as const,
    tierId,
    name: brand ? `${brand} Member` : 'Members',
  }
  if (!(await writeEventAccess(admin, eventId, decision))) {
    return fail('Could not update event access. Try again.')
  }
  // The occurrences are best-effort: the host's decision is recorded on the series, and one date
  // whose write failed is healed the next time access is set rather than losing the whole action.
  for (const occurrenceId of alsoApplyTo) {
    await writeEventAccess(admin, occurrenceId, decision)
  }
  return ok()
}
