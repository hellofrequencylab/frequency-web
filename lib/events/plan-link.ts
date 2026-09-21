import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpacePlan } from '@/lib/calendar/plans-store'

// THE PLAN A PRODUCTION BELONGS TO (events.plan_id), resolved in ONE place (ADR-1386, PROG-CAL3).
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
// `plan_id` was read off the create form, tested for a UUID SHAPE and nothing else, and written
// with the SERVICE-ROLE client. Nothing ever checked that the Plan belonged to the Space the event
// was landing in, so any signed-in member could post another Space's plan id and hang their event
// off it. And it was create-only: `updateEvent` never touched the column and no surface could
// attach an existing event to a Plan, so one bad link could only be repaired in SQL.
//
// ── THE SHAPE, WHICH IS THE JOURNEY LINK'S ─────────────────────────────────────────────────────
// `resolveJourneyLink` in app/(main)/events/actions.ts already solved this exact problem for
// `journey_id`: resolve and AUTHORIZE before the write, so a link the caller may not make fails the
// save outright instead of leaving a saved row with a silently dropped association (the failure
// mode ADR-883 catalogued). The three states are the same here:
//
//   field absent  -> leave the column alone. An editor that does not surface Plans never wipes one.
//   field blank   -> detach.
//   field an id   -> attach, but only when `getSpacePlan` can read that Plan for this Space.
//
// ── WHY `getSpacePlan` IS THE AUTHORITY ────────────────────────────────────────────────────────
// It reads through the CALLER'S OWN session, so RLS on `space_plans` decides — a Plan the caller
// cannot see does not come back, and the link is refused. The space_id filter on top means a Plan
// the caller CAN see, in a different Space, is refused as well: a Production belongs to the Plan of
// the Space that hosts it (ADR-1386's Host ruling, ADR-911).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PlanLinkResolution =
  | { ok: true; patch: Record<string, string | null>; planId: string | null }
  | { ok: false; message: string }

/** No `planId` field was submitted: the column is left exactly as it is. */
export const NO_PLAN_CHANGE: PlanLinkResolution = { ok: true, patch: {}, planId: null }

/** Authorize a submitted `planId` against the Space the event lives in. `raw` is the raw FormData
 *  value, so `null` (absent) and `''` (detach) stay distinguishable. */
export async function resolvePlanLink(
  raw: FormDataEntryValue | null,
  spaceId: string | null,
): Promise<PlanLinkResolution> {
  if (raw === null) return NO_PLAN_CHANGE
  const planId = typeof raw === 'string' ? raw.trim() : ''
  if (!planId) return { ok: true, patch: { plan_id: null }, planId: null }
  if (!UUID_RE.test(planId) || !spaceId) {
    return { ok: false, message: 'That Plan is not one this space runs.' }
  }
  const plan = await getSpacePlan(spaceId, planId)
  if (!plan) return { ok: false, message: 'That Plan is not one this space runs.' }
  return { ok: true, patch: { plan_id: plan.id }, planId: plan.id }
}

/** Attach an existing event to a Plan, or detach it (`planId: null`). The repair door the create
 *  path never had: break the link once and this is what fixes it without SQL.
 *
 *  The write runs on the service-role client for the same reason every other `events` write in this
 *  repo does — live RLS on `events` carries a restrictive policy pair no ordinary host satisfies
 *  (see the long note on the insert in app/(main)/events/actions.ts). The authority is above it:
 *  the Plan is authorized through the caller's own session, and the event is required to belong to
 *  the SAME Space before a column is touched. */
export async function setEventPlan(
  eventId: string,
  planId: string | null,
  spaceId: string,
): Promise<{ data: true } | { error: string }> {
  if (!UUID_RE.test(eventId) || !UUID_RE.test(spaceId)) {
    return { error: 'That event could not be linked.' }
  }
  if (planId !== null) {
    const plan = await getSpacePlan(spaceId, planId)
    if (!plan) return { error: 'That Plan is not one this space runs.' }
  }
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('events')
    .select('id, space_id, host_space_id')
    .eq('id', eventId)
    .maybeSingle()
  const event = row as { id: string; space_id: string | null; host_space_id: string | null } | null
  if (!event) return { error: 'That event could not be found.' }
  if (event.host_space_id !== spaceId && event.space_id !== spaceId) {
    return { error: 'That event is not on this space’s calendar.' }
  }
  const { error } = await admin
    .from('events')
    .update({ plan_id: planId } as never)
    .eq('id', eventId)
  if (error) return { error: 'That event could not be linked to the Plan.' }
  return { data: true }
}
