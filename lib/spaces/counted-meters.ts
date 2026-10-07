// THE COUNTED SPACE METERS (LIVE-749, ADR-1709). Server-only.
//
// Four plan-axis meters were display-only: the ladder published a number for bookings a month,
// membership tiers, hosted Collaborators and people per Journey, and nothing counted any of them, so
// the 2026-12-01 switch (pricing_settings.beta_grace) would have enforced nothing. Each one now counts
// where it is written and asks the ONE write seam (spaceAllowanceVerdict) before adding one.
//
// The rules are the seam's, restated so a reader does not have to open it:
//   - Not live (beta grace) means no count runs and every write passes.
//   - A full meter stops the NEXT write. It never hides, deletes or locks what already exists, and the
//     grandfather floor means a Space already over a new number keeps everything it has.
//   - Every failure grants. A broken count must never refuse a member.
//
// LIVE-750 adds the new Space meters the ladder introduced: Circles, upcoming Events, guests per Event
// (and its personal twin), published Practices, bookable services and shop listings.
//
// `space_multi_pipeline` is not here on purpose: a Space has exactly one pipeline (its crm_stages) and
// there is no write that creates a second, so there is nothing to count until multi-pipeline exists.
//
// Each refusal names the next step for the thing being attempted, never the wall (CONTENT-VOICE).

import { createAdminClient } from '@/lib/supabase/admin'
import { featureGatesLive } from '@/lib/pricing/settings'
import { spaceAllowanceHeadroom, spaceAllowanceVerdict } from '@/lib/pricing/space-allowance'
import { memberWithinLeadershipAllowance } from '@/lib/pricing/member-leadership'
import { resolveHostingSpaceIdFromRow } from '@/lib/events/host-space'
import type { EntitlementTier } from '@/lib/core/entitlement'

type MeterCheck = { ok: true } | { ok: false; error: string }

const OK: MeterCheck = { ok: true }

const BOOKINGS_FULL_MESSAGE =
  'This Space has taken all the bookings its plan includes this month. Ask the Space to see its plan options, or book again next month.'
const TIERS_FULL_MESSAGE =
  'Your plan includes this many membership tiers. Every tier you have stays as it is. See plans to add more.'
const COLLABORATORS_FULL_MESSAGE =
  'Your plan includes this many hosted Collaborators. Everyone you host now stays. See plans to host more.'
const JOURNEY_SPACE_FULL_MESSAGE =
  'This Journey has every place its Space plan includes. Everyone already on it keeps their place.'

async function gatesLive(): Promise<boolean> {
  try {
    return await featureGatesLive()
  } catch {
    return false // a flag read that fails never turns a cap on
  }
}

/** The narrow query shape a head count needs. Several of these tables are not in the generated types,
 *  so this reads them loosely, the way booking.ts and memberships.ts already do. */
interface CountFilter extends PromiseLike<{ count: number | null; error: unknown }> {
  eq: (column: string, value: string) => CountFilter
  in: (column: string, values: string[]) => CountFilter
  gte: (column: string, value: string) => CountFilter
  is: (column: string, value: null) => CountFilter
  neq: (column: string, value: string) => CountFilter
  or: (filters: string) => CountFilter
}
interface CountTable {
  select: (columns: string, opts: { count: 'exact'; head: true }) => CountFilter
}

function looseTable(table: string): CountTable {
  return (createAdminClient() as unknown as { from: (t: string) => CountTable }).from(table)
}

/** A head count on one table, FAIL-SAFE to 0 (an under-count can only under-enforce). */
async function headCount(table: string, filter: (q: CountFilter) => CountFilter): Promise<number> {
  try {
    const { count, error } = await filter(looseTable(table).select('id', { count: 'exact', head: true }))
    if (error || typeof count !== 'number') return 0
    return Math.max(0, count)
  } catch {
    return 0
  }
}

/** The first instant of the current calendar month, UTC. The bookings meter is per month. */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// ── Bookings a month (space_bookings) ───────────────────────────────────────────────────────────

/** Live bookings this Space took this month: confirmed, plus deposit holds still pending. */
async function countMonthBookings(spaceId: string): Promise<number> {
  return headCount('space_bookings', (q) =>
    q.eq('space_id', spaceId).in('status', ['confirmed', 'pending']).gte('created_at', monthStartIso()),
  )
}

/** May this Space take one more booking this month? */
export async function checkSpaceBookingMeter(spaceId: string): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const verdict = await spaceAllowanceVerdict(spaceId, 'space_bookings', await countMonthBookings(spaceId))
    return verdict.allowed ? OK : { ok: false, error: BOOKINGS_FULL_MESSAGE }
  } catch {
    return OK
  }
}

// ── Membership tiers (space_membership_tiers) ───────────────────────────────────────────────────

/**
 * May this Space save a tier set of `nextCount` tiers? The tier editor replaces the whole set, so this
 * asks for headroom rather than one more: a set that does not grow always saves (removing or editing
 * tiers is never refused), and a set that grows must fit inside what the plan still has room for.
 */
export async function checkMembershipTierMeter(spaceId: string, nextCount: number): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const existing = await headCount('space_membership_tiers', (q) => q.eq('space_id', spaceId))
    const adding = Math.trunc(nextCount) - existing
    if (adding <= 0) return OK
    const headroom = await spaceAllowanceHeadroom(spaceId, 'space_membership_tiers', existing)
    if (headroom == null || adding <= headroom) return OK
    return { ok: false, error: TIERS_FULL_MESSAGE }
  } catch {
    return OK
  }
}

// ── Hosted Collaborators (space_collaborators) ──────────────────────────────────────────────────

/** Collaborator Spaces this Space hosts or has asked to host. A pending request holds its place, so
 *  two requests cannot both be accepted into the last slot. Declined and revoked rows are terminal. */
async function countHostedCollaborators(hostSpaceId: string): Promise<number> {
  return headCount('space_collaborations', (q) =>
    q.eq('host_space_id', hostSpaceId).in('status', ['accepted', 'pending']),
  )
}

/**
 * May this Space host one more Collaborator? `alreadyCounted` is for the accept step: the pending row
 * being accepted is already in the count, so accepting it adds nothing new.
 */
export async function checkHostedCollaboratorMeter(
  hostSpaceId: string,
  opts: { alreadyCounted?: boolean } = {},
): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const used = await countHostedCollaborators(hostSpaceId)
    const verdict = await spaceAllowanceVerdict(
      hostSpaceId,
      'space_collaborators',
      opts.alreadyCounted ? Math.max(0, used - 1) : used,
    )
    return verdict.allowed ? OK : { ok: false, error: COLLABORATORS_FULL_MESSAGE }
  } catch {
    return OK
  }
}

// ── People per Journey, Space-owned Journeys (space_journey) ───────────────────────────────────

/**
 * May one more person enrol in this Journey, by its Space's plan? Only a Space-owned Journey meters
 * here; a personal Journey (no Space, or the platform root) is the member's own meter
 * (journey_enrollees) and passes. The count is people active on this one Journey.
 */
export async function checkSpaceJourneyMeter(planId: string, rootSpaceId: string | null): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const { data } = await createAdminClient().from('journey_plans').select('space_id').eq('id', planId).maybeSingle()
    const spaceId = (data as { space_id: string | null } | null)?.space_id ?? null
    if (!spaceId || spaceId === rootSpaceId) return OK
    const used = await headCount('journey_enrollments', (q) => q.eq('plan_id', planId).is('completed_at', null))
    const verdict = await spaceAllowanceVerdict(spaceId, 'space_journey', used)
    return verdict.allowed ? OK : { ok: false, error: JOURNEY_SPACE_FULL_MESSAGE }
  } catch {
    return OK
  }
}

// ── The new Space meters (LIVE-750) ────────────────────────────────────────────────────────────

const CIRCLES_FULL_MESSAGE =
  'Your plan includes this many Circles, the Space Circle among them. Every Circle you have stays. See plans to add more.'
const EVENTS_FULL_MESSAGE =
  'Your plan includes this many upcoming events at once. As one finishes you can add the next, or see plans for more.'
const EVENT_GUESTS_FULL_MESSAGE = 'This event has every place its host\'s plan includes.'
const PRACTICES_FULL_MESSAGE =
  'Your plan includes this many live Practices. Every one you have stays live. See plans to publish more.'
const SERVICES_FULL_MESSAGE =
  'Your plan includes this many bookable services. Every one you have stays. See plans to add more.'
const SHOP_FULL_MESSAGE =
  'Your plan includes this many shop listings. Every one you have stays. See plans to list more.'

/** A plain "may this Space add one more" over a head count, for the meters below. */
async function oneMore(spaceId: string, key: string, used: () => Promise<number>, message: string): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const verdict = await spaceAllowanceVerdict(spaceId, key, await used())
    return verdict.allowed ? OK : { ok: false, error: message }
  } catch {
    return OK
  }
}

/** May this Space add one more Circle? The Space Circle counts (it is one of the three). Archived
 *  Circles do not. */
export async function checkSpaceCircleMeter(spaceId: string): Promise<MeterCheck> {
  return oneMore(
    spaceId,
    'space_circles',
    () => headCount('circles', (q) => q.eq('space_id', spaceId).in('status', ['draft', 'forming', 'active'])),
    CIRCLES_FULL_MESSAGE,
  )
}

/** May this Space schedule one more upcoming event? Past, cancelled and removed events never count. */
export async function checkSpaceEventMeter(spaceId: string): Promise<MeterCheck> {
  return oneMore(
    spaceId,
    'space_events',
    () =>
      headCount('events', (q) =>
        q
          .eq('host_space_id', spaceId)
          .is('removed_at', null)
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .gte('starts_at', new Date().toISOString()),
      ),
    EVENTS_FULL_MESSAGE,
  )
}

/** May this Space have one more live Practice? */
export async function checkSpacePracticeMeter(spaceId: string): Promise<MeterCheck> {
  return oneMore(
    spaceId,
    'space_practice_publish',
    () => headCount('practices', (q) => q.eq('space_id', spaceId).eq('status', 'approved')),
    PRACTICES_FULL_MESSAGE,
  )
}

/** May this Space list one more active product? */
export async function checkSpaceShopMeter(spaceId: string): Promise<MeterCheck> {
  return oneMore(
    spaceId,
    'space_shop_listings',
    () =>
      headCount('commerce_products', (q) =>
        q.eq('owner_kind', 'space').eq('owner_space_id', spaceId).eq('status', 'active'),
      ),
    SHOP_FULL_MESSAGE,
  )
}

/** May this Space save a service set of `nextCount` services? Like tiers: only a set that grows asks. */
export async function checkSpaceServicesMeter(spaceId: string, nextCount: number): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const existing = await headCount('space_service_types', (q) => q.eq('space_id', spaceId))
    const adding = Math.trunc(nextCount) - existing
    if (adding <= 0) return OK
    const headroom = await spaceAllowanceHeadroom(spaceId, 'space_services', existing)
    if (headroom == null || adding <= headroom) return OK
    return { ok: false, error: SERVICES_FULL_MESSAGE }
  } catch {
    return OK
  }
}

/**
 * May one more guest say yes to this event? A Space-hosted event reads its Space's plan
 * (space_event_guests); a personal event reads its HOST's membership tier (event_guests: Member 30,
 * Crew 100). Counts the going RSVPs on this one event.
 */
export async function checkEventGuestMeter(eventId: string): Promise<MeterCheck> {
  try {
    if (!(await gatesLive())) return OK
    const admin = createAdminClient()
    const { data: event } = await admin
      .from('events')
      .select('space_id, host_space_id, host_id')
      .eq('id', eventId)
      .maybeSingle()
    if (!event) return OK
    const row = event as { space_id: string | null; host_space_id: string | null; host_id: string | null }
    const going = await headCount('event_rsvps', (q) => q.eq('event_id', eventId).eq('status', 'going'))
    const hostingSpaceId = await resolveHostingSpaceIdFromRow(row)
    if (hostingSpaceId) {
      const verdict = await spaceAllowanceVerdict(hostingSpaceId, 'space_event_guests', going)
      return verdict.allowed ? OK : { ok: false, error: EVENT_GUESTS_FULL_MESSAGE }
    }
    if (!row.host_id) return OK
    const { data: host } = await admin.from('profiles').select('membership_tier').eq('id', row.host_id).maybeSingle()
    const tier = ((host as { membership_tier: string | null } | null)?.membership_tier ?? 'free') as EntitlementTier
    return (await memberWithinLeadershipAllowance('event_guests', tier, going))
      ? OK
      : { ok: false, error: EVENT_GUESTS_FULL_MESSAGE }
  } catch {
    return OK
  }
}
