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
// `space_multi_pipeline` is not here on purpose: a Space has exactly one pipeline (its crm_stages) and
// there is no write that creates a second, so there is nothing to count until multi-pipeline exists.
//
// Each refusal names the next step for the thing being attempted, never the wall (CONTENT-VOICE).

import { createAdminClient } from '@/lib/supabase/admin'
import { featureGatesLive } from '@/lib/pricing/settings'
import { spaceAllowanceHeadroom, spaceAllowanceVerdict } from '@/lib/pricing/space-allowance'

export type MeterCheck = { ok: true } | { ok: false; error: string }

const OK: MeterCheck = { ok: true }

export const BOOKINGS_FULL_MESSAGE =
  'This Space has taken all the bookings its plan includes this month. Ask the Space to see its plan options, or book again next month.'
export const TIERS_FULL_MESSAGE =
  'Your plan includes this many membership tiers. Every tier you have stays as it is. See plans to add more.'
export const COLLABORATORS_FULL_MESSAGE =
  'Your plan includes this many hosted Collaborators. Everyone you host now stays. See plans to host more.'
export const JOURNEY_SPACE_FULL_MESSAGE =
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
export async function countMonthBookings(spaceId: string): Promise<number> {
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
export async function countHostedCollaborators(hostSpaceId: string): Promise<number> {
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
