'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getEventCapabilities, getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  getPlacementView,
  resolvePlacementTarget,
  listSpaceStewardIds,
  listSpaceEventCreatorIds,
  listCircleStewardIds,
  livePlacementPatch,
  clearPlacementPatch,
  NO_PLACEMENT,
  type PlacementView,
  type PlacementTargetType,
} from '@/lib/events/placement'
import { spaceIdForCircle } from '@/lib/circles/store'
import { resolveRegionScopeId } from '@/lib/events/event-drafts'

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

/** Set the columns that make the event live under a target. Returns whether the write LANDED —
 *  the Royal Temple bug: this update's error was dropped, so a failed write reported "Lives here"
 *  while the row never changed. Callers must surface a false.
 *
 *  A CIRCLE placement writes the bare `scope_id` / `scope_type` pair alongside the typed
 *  `scope_circle_id` (see livePlacementPatch): the typed column alone is invisible to every
 *  circle reader, so placing an event in a Circle used to say "Lives here" while the Circle page,
 *  the members' RLS read, and the host's management rights all stayed unchanged. */
async function setEventPlacementColumn(
  admin: SupabaseClient,
  eventId: string,
  target: PlacementTarget,
): Promise<boolean> {
  const circleSpaceId = target.type === 'circle' ? await spaceIdForCircle(target.id) : null
  const patch = livePlacementPatch(target, { circleSpaceId })
  const { error } = await admin.from('events').update(patch).eq('id', eventId)
  if (error) {
    console.error('[event-placement] events update failed', {
      code: error.code,
      message: error.message,
      eventId,
      target,
    })
    return false
  }
  return true
}

const PLACEMENT_WRITE_FAILED =
  'Could not place this event there. Please try again, and tell an operator if it keeps failing.'

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

  // Steward-of-target shortcut: no one to ask, so place it now. viewerIsSteward already
  // admits PLATFORM STAFF (getSpaceCapabilities grants staff full operator authority on any
  // Space; the circle capability resolver does the same), so an operator placing a seeded
  // event goes live immediately instead of parking a pending ask nobody can see (ADR-841).
  if (await viewerIsSteward(target)) {
    // The LIVE column is the placement; write it FIRST and surface a failure honestly. The
    // request row is the audit trail — a failure there logs but never fakes a dead placement.
    if (!(await setEventPlacementColumn(admin, eventId, target))) {
      return fail(PLACEMENT_WRITE_FAILED)
    }
    const { error: auditErr } = await admin.from('event_placement_requests').insert({
      event_id: eventId,
      target_type: target.type,
      space_id: target.type === 'space' ? target.id : null,
      circle_id: target.type === 'circle' ? target.id : null,
      requested_by: actorId,
      status: 'approved',
      responded_at: new Date().toISOString(),
      responded_by: actorId,
    })
    if (auditErr) {
      console.error('[event-placement] audit insert failed', { code: auditErr.code, message: auditErr.message, eventId })
    }
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

  if (!(await setEventPlacementColumn(admin, req.event_id, target))) {
    return fail(PLACEMENT_WRITE_FAILED)
  }
  // 🔴 CORRECTION 2026-09-05 (scan-2 L5-10). This update's error used to be dropped and the
  // requester told "placed" regardless, the same shape as approveEventRsvp in admin-actions.ts.
  // The event columns above have already landed (setEventPlacementColumn surfaced its own error),
  // so on a refused write here the event IS placed but the request still reads pending; say so
  // rather than notify over a row that did not change, and leave the request for a retry.
  const { error: requestError } = await admin
    .from('event_placement_requests')
    .update({ status: 'approved', responded_at: new Date().toISOString(), responded_by: actorId })
    .eq('id', requestId)
  if (requestError) {
    console.error('[event-placement] request approve failed', {
      code: requestError.code,
      message: requestError.message,
      requestId,
    })
    return fail('The event was placed, but the request could not be marked approved. Try again.')
  }

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

  // A CIRCLE-scoped event has to leave the bare scope pair too, or "Remove" clears the typed
  // column while the event keeps showing on the Circle (see clearPlacementPatch). It lands where
  // a standalone public event lands: the host's region.
  const { data: evRow } = await admin
    .from('events')
    .select('host_id, scope_type, visibility')
    .eq('id', eventId)
    .maybeSingle()
  const current = evRow as { host_id: string | null; scope_type: string | null; visibility: string | null } | null
  const regionId =
    current?.scope_type === 'circle'
      ? await resolveRegionScopeId(current.host_id ?? actorId ?? '')
      : null
  // scope_id is NOT NULL: with no region to move to we cannot untie the bare pair, so say so
  // rather than report a removal that only half happened.
  if (current?.scope_type === 'circle' && !regionId) {
    return fail('Could not remove this event from where it lives. Please try again.')
  }

  // Clearing where it lives also clears the HOSTING entity (ADR-819): an event that no longer
  // lives under any space cannot stay billed/displayed as that space's event.
  const { error: clearErr } = await admin
    .from('events')
    .update(
      clearPlacementPatch({
        scopeType: current?.scope_type ?? null,
        visibility: current?.visibility ?? null,
        regionId,
      }),
    )
    .eq('id', eventId)
  if (clearErr) {
    console.error('[clearEventPlacement]', { code: clearErr.code, message: clearErr.message, eventId })
    return fail('Could not remove this event from where it lives. Please try again.')
  }
  await admin
    .from('event_placement_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString(), responded_by: actorId })
    .eq('event_id', eventId)
    .eq('status', 'pending')

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  return ok(NO_PLACEMENT)
}

// ── The HOSTING ENTITY (ADR-819): who hosts this event — the operator personally, or a Space ──────

/** The hosting entity as the editor field renders it. */
export interface HostEntityView {
  /** The hosting Space (billed + displayed host), or null for a personal event. */
  hostSpace: { id: string; slug: string; name: string } | null
}

/** Read the event's hosting entity. Gated on event.editSettings (managers only). */
export async function loadEventHostEntity(eventId: string): Promise<HostEntityView> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return { hostSpace: null }
  const admin = untyped()
  const { data } = await admin.from('events').select('host_space_id').eq('id', eventId).maybeSingle()
  const hostSpaceId = (data as { host_space_id: string | null } | null)?.host_space_id ?? null
  if (!hostSpaceId) return { hostSpace: null }
  const ref = await resolvePlacementTarget({ type: 'space', id: hostSpaceId })
  return { hostSpace: ref ? { id: ref.id, slug: ref.slug, name: ref.name } : null }
}

/**
 * Set WHO HOSTS the event: the operator personally (kind 'profile'), or a Space (kind 'space').
 * Space-hosted means the space is the billed + displayed host — "Hosted by <space>", ticket money
 * through the space owner's Connect account, the space plan's take-rate (ADR-819).
 *
 * Gates: the caller manages the event (event.editSettings), AND for a space target they help run
 * it (editor+, the same authority that creates events under the space). Making a space the host
 * also makes the event LIVE under it when it does not already (placement follows hosting, so the
 * page, the space calendar, and the money all agree).
 */
export async function setEventHostEntity(
  eventId: string,
  slug: string,
  host: { kind: 'profile' } | { kind: 'space'; spaceId: string },
): Promise<ActionResult<HostEntityView>> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You do not manage this event.')
  const actorId = await getMyProfileId()
  if (!actorId) return fail('You need to be signed in.')

  const admin = untyped()

  if (host.kind === 'profile') {
    const { error } = await admin.from('events').update({ host_space_id: null }).eq('id', eventId)
    if (error) {
      console.error('[setEventHostEntity clear]', { code: error.code, message: error.message, eventId })
      return fail('Could not change the host. Please try again.')
    }
    revalidatePath(`/events/${slug}`)
    revalidatePath('/events')
    return ok({ hostSpace: null })
  }

  // Space authority: someone who helps run the space (editor+, the same set that creates its
  // events), OR platform staff (ADR-841 — an operator hands a seeded event to its real
  // organizer's Space without joining that Space first).
  const creators = await listSpaceEventCreatorIds(host.spaceId)
  if (!creators.includes(actorId) && !(await isPlatformStaff())) {
    return fail('Only someone who helps run that space can make it the host.')
  }
  const ref = await resolvePlacementTarget({ type: 'space', id: host.spaceId })
  if (!ref) return fail('That space could not be found.')

  // 🔴 THE HOST NO LONGER MOVES THE EVENT. This used to write `space_id: host.spaceId` alongside
  // the hosting axis, which forced the two columns the schema deliberately separated (ADR-819:
  // space_id is pure tenancy, host_space_id is "hosted by, billed, paid") to be equal. The effect
  // was that naming a host RE-HOMED the event: an event at Royal Temple hosted by Audrey DeWitt
  // could not be expressed, because choosing the host moved it out of the venue. Owner report.
  //
  // The original intent is still served. Writing space_id mattered for a SEEDED or platform event
  // whose placement is null or the ROOT space ("the platform's lane"), where handing it to its real
  // organizer's Space should also give it a home. So the placement is claimed ONLY when there is no
  // meaningful venue yet, and a real venue Space is never clobbered.
  const { data: currentRow } = await admin.from('events').select('space_id').eq('id', eventId).maybeSingle()
  const currentSpaceId = ((currentRow as { space_id: string | null } | null)?.space_id ?? null)?.trim() || null
  const rootSpaceId = await loadRootSpaceId()
  const claimsPlacement = !currentSpaceId || currentSpaceId === rootSpaceId

  const patch: Record<string, string> = { host_space_id: host.spaceId }
  if (claimsPlacement) patch.space_id = host.spaceId

  // Surface a failed write (the Royal Temple bug: this error was dropped, so the UI read
  // success while host_space_id never changed).
  const { error } = await admin.from('events').update(patch).eq('id', eventId)
  if (error) {
    console.error('[setEventHostEntity]', { code: error.code, message: error.message, eventId, spaceId: host.spaceId })
    return fail('Could not make that space the host. Please try again.')
  }

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath(`/spaces/${ref.slug}`)
  return ok({ hostSpace: { id: ref.id, slug: ref.slug, name: ref.name } })
}

/** The spaces the CALLER can host an event as (owner or active editor+ member), for the
 *  "Hosted by" picker. Small list, name-sorted. FAIL-SAFE: []. */
export async function listMyHostableSpaces(): Promise<{ id: string; slug: string; name: string }[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const admin = untyped()
  try {
    const byId = new Map<string, { id: string; slug: string; name: string }>()
    const put = (rows: unknown) => {
      for (const s of (rows ?? []) as Array<{ id: string; slug: string; name: string | null; brand_name: string | null }>) {
        byId.set(s.id, { id: s.id, slug: s.slug, name: s.brand_name ?? s.name ?? 'Space' })
      }
    }
    const { data: owned } = await admin
      .from('spaces')
      .select('id, slug, name, brand_name')
      .eq('owner_profile_id', profileId)
      .eq('status', 'active')
    put(owned)
    const { data: memberships } = await admin
      .from('space_members')
      .select('space_id')
      .eq('profile_id', profileId)
      .in('role', ['editor', 'moderator', 'admin'])
      .eq('status', 'active')
    const ids = ((memberships ?? []) as Array<{ space_id: string }>)
      .map((m) => m.space_id)
      .filter((id) => !byId.has(id))
    if (ids.length > 0) {
      const { data: managed } = await admin
        .from('spaces')
        .select('id, slug, name, brand_name')
        .in('id', ids)
        .eq('status', 'active')
      put(managed)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
