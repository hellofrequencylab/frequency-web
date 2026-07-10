'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities, getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  getPlacementView,
  resolvePlacementTarget,
  listSpaceStewardIds,
  listCircleStewardIds,
  NO_PLACEMENT,
  type PlacementView,
  type PlacementTargetType,
} from '@/lib/events/placement'

// "Where does this event live" — request / approve / decline / clear placement of an event
// under a Space or Circle. The host asks; a steward of the target consents before the event
// goes live there. See lib/events/placement.ts for the shared reads and migration
// 20261111000000_event_placement_requests.sql for the request table + access model.
//
// event_placement_requests is newer than the generated types, so writes go through an untyped
// admin handle (repo convention). Every action gates server-side (the admin client bypasses
// RLS, so these gates are the authority).

type PlacementTarget = { type: PlacementTargetType; id: string }

/** Untyped admin handle for the not-yet-in-types event_placement_requests table (ADR-246 escape:
 *  a return-type annotation, not a cast — the repo convention from circles/admin-actions.ts). */
function untyped(): SupabaseClient {
  return createAdminClient()
}

/** Is the CURRENT viewer a steward of this target (may approve placement into it)? */
async function viewerIsSteward(target: PlacementTarget): Promise<boolean> {
  if (target.type === 'circle') {
    const caps = await getCircleCapabilities(target.id)
    return caps.has('circle.editSettings')
  }
  const [space, profileId] = await Promise.all([getSpaceById(target.id), getMyProfileId()])
  if (!space || !profileId) return false
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.isAdmin
}

/** Best-effort steward notification when a host asks to place an event under their target. */
async function notifyStewardsOfRequest(
  admin: SupabaseClient,
  target: PlacementTarget,
  eventId: string,
  eventTitle: string,
  actorId: string | null,
): Promise<void> {
  try {
    const stewardIds =
      target.type === 'space'
        ? await listSpaceStewardIds(target.id)
        : await listCircleStewardIds(target.id)
    const recipients = stewardIds.filter((id) => id && id !== actorId)
    if (recipients.length === 0) return
    await admin.from('notifications').insert(
      recipients.map((recipient_id) => ({
        recipient_id,
        actor_id: actorId,
        type: 'event_placement_request',
        reference_type: 'event',
        reference_id: eventId,
        body: `asked to bring “${eventTitle}” to your ${target.type === 'space' ? 'Space' : 'Circle'}`,
      })),
    )
  } catch {
    /* best-effort */
  }
}

/** Best-effort note to the requester when a steward approves or declines their placement. */
async function notifyRequesterOfDecision(
  admin: SupabaseClient,
  requesterId: string,
  actorId: string | null,
  eventId: string,
  eventTitle: string,
  targetName: string,
  approved: boolean,
): Promise<void> {
  try {
    if (!requesterId || requesterId === actorId) return
    await admin.from('notifications').insert({
      recipient_id: requesterId,
      actor_id: actorId,
      type: approved ? 'event_placement_approved' : 'event_placement_declined',
      reference_type: 'event',
      reference_id: eventId,
      body: approved
        ? `placed “${eventTitle}” in ${targetName}`
        : `passed on placing “${eventTitle}” in ${targetName}`,
    })
  } catch {
    /* best-effort */
  }
}

/** Set (or clear) the event column that makes it live under a target. */
async function setEventPlacementColumn(
  admin: SupabaseClient,
  eventId: string,
  target: PlacementTarget,
): Promise<void> {
  const patch = target.type === 'space' ? { space_id: target.id } : { scope_circle_id: target.id }
  await admin.from('events').update(patch).eq('id', eventId)
}

/**
 * Read the event's current placement for the editor field. Gated on event.editSettings so only
 * a host/cohost sees it; anyone else gets the empty view.
 */
export async function loadEventPlacement(eventId: string): Promise<PlacementView> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return NO_PLACEMENT
  return getPlacementView(eventId)
}

/**
 * Ask to place an event under a Space or Circle. Caller must be the event host/cohost. If the
 * caller is ALSO a steward of the target, the request auto-approves (the event goes live
 * immediately). Otherwise it sits pending and the target's stewards are notified.
 */
export async function requestEventPlacement(
  eventId: string,
  slug: string,
  target: PlacementTarget,
): Promise<ActionResult<PlacementView>> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You do not manage this event.')
  if (target.type !== 'space' && target.type !== 'circle') return fail('Pick a Space or Circle.')

  const ref = await resolvePlacementTarget(target)
  if (!ref) return fail('That Space or Circle could not be found.')

  const admin = untyped()
  const actorId = await getMyProfileId()
  if (!actorId) return fail('You need to be signed in.')

  const { data: ev } = await admin.from('events').select('title').eq('id', eventId).maybeSingle()
  const eventTitle = (ev as { title: string | null } | null)?.title ?? 'this event'

  // Steward-of-target shortcut: no one to ask, so place it now.
  if (await viewerIsSteward(target)) {
    await admin.from('event_placement_requests').insert({
      event_id: eventId,
      target_type: target.type,
      space_id: target.type === 'space' ? target.id : null,
      circle_id: target.type === 'circle' ? target.id : null,
      requested_by: actorId,
      status: 'approved',
      responded_at: new Date().toISOString(),
      responded_by: actorId,
    })
    await setEventPlacementColumn(admin, eventId, target)
    revalidatePath(`/events/${slug}`)
    revalidatePath('/events')
    return ok({ status: 'live', target: ref, requestId: null })
  }

  // Otherwise record a pending ask. A duplicate pending ask (unique index) is a no-op success.
  const { data: inserted, error } = await admin
    .from('event_placement_requests')
    .insert({
      event_id: eventId,
      target_type: target.type,
      space_id: target.type === 'space' ? target.id : null,
      circle_id: target.type === 'circle' ? target.id : null,
      requested_by: actorId,
      status: 'pending',
    })
    .select('id')
    .maybeSingle()

  let requestId = (inserted as { id: string } | null)?.id ?? null
  if (error) {
    // Already-pending (unique violation): fetch the existing pending request id and treat as success.
    const { data: existing } = await admin
      .from('event_placement_requests')
      .select('id')
      .eq('event_id', eventId)
      .eq(target.type === 'space' ? 'space_id' : 'circle_id', target.id)
      .eq('status', 'pending')
      .maybeSingle()
    requestId = (existing as { id: string } | null)?.id ?? null
    if (!requestId) return fail('That request could not be saved. Please try again.')
  } else {
    await notifyStewardsOfRequest(admin, target, eventId, eventTitle, actorId)
  }

  revalidatePath(`/events/${slug}`)
  return ok({ status: 'pending', target: ref, requestId })
}

/** Load a pending request row for the approve/decline actions. */
async function loadPendingRequest(admin: SupabaseClient, requestId: string) {
  const { data } = await admin
    .from('event_placement_requests')
    .select('id, event_id, target_type, space_id, circle_id, requested_by, status')
    .eq('id', requestId)
    .maybeSingle()
  return data as {
    id: string
    event_id: string
    target_type: PlacementTargetType
    space_id: string | null
    circle_id: string | null
    requested_by: string
    status: string
  } | null
}

function targetFromRequest(req: {
  target_type: PlacementTargetType
  space_id: string | null
  circle_id: string | null
}): PlacementTarget | null {
  if (req.target_type === 'space' && req.space_id) return { type: 'space', id: req.space_id }
  if (req.target_type === 'circle' && req.circle_id) return { type: 'circle', id: req.circle_id }
  return null
}

/** Approve a placement request. Caller must be a steward of the target Space/Circle. */
export async function approveEventPlacement(requestId: string): Promise<ActionResult> {
  const admin = untyped()
  const req = await loadPendingRequest(admin, requestId)
  if (!req) return fail('That request could not be found.')
  if (req.status !== 'pending') return fail('That request has already been handled.')

  const target = targetFromRequest(req)
  if (!target) return fail('That request is malformed.')
  if (!(await viewerIsSteward(target))) return fail('You do not steward this Space or Circle.')

  const actorId = await getMyProfileId()
  const ref = await resolvePlacementTarget(target)

  await setEventPlacementColumn(admin, req.event_id, target)
  await admin
    .from('event_placement_requests')
    .update({ status: 'approved', responded_at: new Date().toISOString(), responded_by: actorId })
    .eq('id', requestId)

  const { data: ev } = await admin.from('events').select('title, slug').eq('id', req.event_id).maybeSingle()
  const event = ev as { title: string | null; slug: string } | null
  await notifyRequesterOfDecision(
    admin,
    req.requested_by,
    actorId,
    req.event_id,
    event?.title ?? 'the event',
    ref?.name ?? 'your target',
    true,
  )

  if (event?.slug) revalidatePath(`/events/${event.slug}`)
  revalidatePath('/events')
  if (target.type === 'space' && ref) revalidatePath(`/spaces/${ref.slug}/manage`)
  if (target.type === 'circle' && ref) revalidatePath(`/circles/${ref.slug}/manage`)
  return ok()
}

/** Decline a placement request. Caller must be a steward of the target Space/Circle. */
export async function declineEventPlacement(requestId: string): Promise<ActionResult> {
  const admin = untyped()
  const req = await loadPendingRequest(admin, requestId)
  if (!req) return fail('That request could not be found.')
  if (req.status !== 'pending') return fail('That request has already been handled.')

  const target = targetFromRequest(req)
  if (!target) return fail('That request is malformed.')
  if (!(await viewerIsSteward(target))) return fail('You do not steward this Space or Circle.')

  const actorId = await getMyProfileId()
  const ref = await resolvePlacementTarget(target)

  await admin
    .from('event_placement_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString(), responded_by: actorId })
    .eq('id', requestId)

  const { data: ev } = await admin.from('events').select('title').eq('id', req.event_id).maybeSingle()
  await notifyRequesterOfDecision(
    admin,
    req.requested_by,
    actorId,
    req.event_id,
    (ev as { title: string | null } | null)?.title ?? 'the event',
    ref?.name ?? 'your target',
    false,
  )

  if (target.type === 'space' && ref) revalidatePath(`/spaces/${ref.slug}/manage`)
  if (target.type === 'circle' && ref) revalidatePath(`/circles/${ref.slug}/manage`)
  return ok()
}

/**
 * Remove an event from where it currently lives. Nulls the live column (space_id / scope_circle_id)
 * and declines any still-pending request for the event. Caller must be the event host/cohost.
 */
export async function clearEventPlacement(
  eventId: string,
  slug: string,
): Promise<ActionResult<PlacementView>> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You do not manage this event.')

  const admin = untyped()
  const actorId = await getMyProfileId()

  await admin.from('events').update({ space_id: null, scope_circle_id: null }).eq('id', eventId)
  await admin
    .from('event_placement_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString(), responded_by: actorId })
    .eq('event_id', eventId)
    .eq('status', 'pending')

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  return ok(NO_PLACEMENT)
}
