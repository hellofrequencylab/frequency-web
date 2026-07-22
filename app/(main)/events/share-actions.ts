'use server'

// Shared / co-hosted events (Events EC3, delivers collaborator B2) — the WRITES: request / feature /
// approve / decline / revoke an event↔space share. Mirrors app/(main)/events/placement-actions.ts
// (request → steward-approve) and collaborations-actions.ts (either side initiates, the other approves).
//
// TWO ENTRY POINTS:
//   • requestEventShare  — the EVENT HOST invites a space to co-host; the TARGET SPACE's stewards approve.
//   • requestFeatureEvent — a SPACE STEWARD asks to feature an event; the EVENT HOST approves.
// Either AUTO-ACCEPTS when the caller already stewards the approving side, or an accepted space
// collaboration already links the event's home space and the target (shouldAutoAcceptShare).
//
// AUTHZ (event_space_shares is service-role only, so these gates ARE the authority): the host side is
// gated on event.editSettings (getEventCapabilities); the space side on the space's steward set
// (listShareApproverIds). Status transitions are ATOMIC (status-guarded WHERE) so a concurrent
// accept/decline/revoke cannot be clobbered by a stale read. Unique-violation (an active row already
// exists) is treated as idempotent success.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { getSpaceById } from '@/lib/spaces/store'
import { listAcceptedCollaborations } from '@/lib/spaces/collaborations'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import {
  loadShare,
  listSharesForEvent,
  eventHomeSpaceId,
  listShareApproverIds,
  approverSideForShare,
  shouldAutoAcceptShare,
  type ShareRow,
  type EventShareView,
} from '@/lib/events/event-share'

/**
 * The event's current shares for the host-side field. Gated on event.editSettings so only a host/cohost
 * sees them; anyone else gets an empty list. Mirrors loadEventPlacement.
 */
export async function loadEventShares(eventId: string): Promise<EventShareView[]> {
  if (!(await viewerHostsEvent(eventId))) return []
  return listSharesForEvent(eventId)
}

/** A chainable + awaitable write filter (supabase builders are both), so a status-guarded update is
 *  atomic at the DB (the row updates only if still in the expected state). Mirrors collaborations. */
interface WriteFilter extends Promise<{ error: { code?: string } | null }> {
  eq: (c: string, val: string) => WriteFilter
  in: (c: string, vals: string[]) => WriteFilter
}

/** Untyped admin handle for event_space_shares (not in the generated types yet, ADR-246). */
function sharesTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => {
        select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { code?: string } | null }> }
      }
      update: (v: Record<string, unknown>) => WriteFilter
    }
  }).from('event_space_shares')
}

/** True when the signed-in caller is a steward (owner/admin) of `spaceId`. Fail-closed. */
async function viewerStewardsSpace(spaceId: string, profileId: string): Promise<boolean> {
  const approvers = await listShareApproverIds(spaceId)
  return approvers.includes(profileId)
}

/** True when the signed-in caller can edit the event (host/cohost). Fail-closed. */
async function viewerHostsEvent(eventId: string): Promise<boolean> {
  const caps = await getEventCapabilities(eventId)
  return caps.has('event.editSettings')
}

/** True when an accepted space↔space collaboration already links `a` and `b` (either direction). */
async function collaborationLinks(a: string | null, b: string): Promise<boolean> {
  if (!a) return false
  try {
    const accepted = await listAcceptedCollaborations(a)
    return accepted.some((c) => c.partner.id === b)
  } catch {
    return false
  }
}

/** Best-effort notification when a share is requested (to the approving side) or resolved (to requester). */
async function notify(
  admin: SupabaseClient,
  recipientIds: string[],
  actorId: string | null,
  type: string,
  eventId: string,
  body: string,
): Promise<void> {
  try {
    const recipients = [...new Set(recipientIds)].filter((id) => id && id !== actorId)
    if (recipients.length === 0) return
    await admin.from('notifications').insert(
      recipients.map((recipient_id) => ({
        recipient_id,
        actor_id: actorId,
        type,
        reference_type: 'event',
        reference_id: eventId,
        body,
      })),
    )
  } catch {
    /* best-effort */
  }
}

async function eventTitleSlug(admin: SupabaseClient, eventId: string): Promise<{ title: string; slug: string | null }> {
  const { data } = await admin.from('events').select('title, slug').eq('id', eventId).maybeSingle()
  const ev = data as { title: string | null; slug: string | null } | null
  return { title: ev?.title ?? 'this event', slug: ev?.slug ?? null }
}

/** Revalidate every surface an accepted/changed share can appear on: the event page, the master events
 *  calendar, and the target space's calendar + profile. */
async function revalidateShare(eventSlug: string | null, targetSpaceId: string): Promise<void> {
  if (eventSlug) revalidatePath(`/events/${eventSlug}`)
  revalidatePath('/events')
  revalidatePath('/events/calendar')
  const space = await getSpaceById(targetSpaceId)
  if (space) {
    revalidatePath(`/spaces/${space.slug}`, 'layout')
    revalidatePath(`/spaces/${space.slug}/calendar`)
    revalidatePath(`/spaces/${space.slug}/manage`)
  }
}

/**
 * Insert a share (or treat an existing active row as success). `invitedBySpaceId` marks who initiated
 * (the event's home space for a host invite, the target space for a feature request); `autoAccept`
 * skips the round-trip. Returns ok/fail. 23505 (an active pending|accepted row already exists) = success.
 */
async function insertShare(args: {
  eventId: string
  targetSpaceId: string
  invitedBySpaceId: string | null
  requestedBy: string
  autoAccept: boolean
}): Promise<ActionResult> {
  const { error } = await sharesTable()
    .insert([
      {
        event_id: args.eventId,
        space_id: args.targetSpaceId,
        invited_by_space_id: args.invitedBySpaceId,
        requested_by: args.requestedBy,
        status: args.autoAccept ? 'accepted' : 'pending',
        ...(args.autoAccept ? { responded_at: new Date().toISOString(), responded_by: args.requestedBy } : {}),
      },
    ])
    .select('id')
    .maybeSingle()
  if (error && error.code !== '23505') return fail('Could not share this event. Try again.')
  return ok()
}

/**
 * The event HOST invites a space to co-host. Caller must edit the event (event.editSettings). The event
 * must not be shared to its own home space. Auto-accepts when the caller already stewards the target OR
 * an accepted collaboration links the event's home space and the target; otherwise the target's stewards
 * are notified and the row sits pending.
 */
export async function requestEventShare(
  eventId: string,
  slug: string,
  spaceId: string,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to share this event.')
  if (!(await viewerHostsEvent(eventId))) return fail('You do not manage this event.')

  const target = await getSpaceById(spaceId)
  if (!target) return fail('That space could not be found.')
  if (target.status !== 'active') return fail('That space is not active.')

  const homeSpaceId = await eventHomeSpaceId(eventId)
  if (homeSpaceId && homeSpaceId === spaceId) return fail('This event already lives in that space.')

  // Auto-accept: the host also stewards the target, or the two spaces already collaborate.
  const autoAccept = shouldAutoAcceptShare({
    callerStewardsApprovingSide: await viewerStewardsSpace(spaceId, profileId),
    collaborationLinksSpaces: await collaborationLinks(homeSpaceId, spaceId),
  })

  const res = await insertShare({
    eventId,
    targetSpaceId: spaceId,
    invitedBySpaceId: homeSpaceId, // the host side initiated (null for a platform event)
    requestedBy: profileId,
    autoAccept,
  })
  if (isError(res)) return res

  if (!autoAccept) {
    const admin = createAdminClient()
    const { title } = await eventTitleSlug(admin, eventId)
    const stewards = await listShareApproverIds(spaceId)
    await notify(admin, stewards, profileId, 'event_share_request', eventId, `asked to bring “${title}” to your Space`)
  }

  await revalidateShare(slug, spaceId)
  return ok()
}

/**
 * A SPACE steward asks to FEATURE an event on their space. Caller must steward `spaceId`. Auto-accepts
 * when the caller also hosts the event OR an accepted collaboration links the spaces; otherwise the
 * event's host is notified and the row sits pending (the host approves).
 */
export async function requestFeatureEvent(spaceId: string, eventId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to feature an event.')
  if (!(await viewerStewardsSpace(spaceId, profileId))) return fail('You do not manage this space.')

  const target = await getSpaceById(spaceId)
  if (!target) return fail('That space could not be found.')

  const homeSpaceId = await eventHomeSpaceId(eventId)
  if (homeSpaceId && homeSpaceId === spaceId) return fail('This event already lives in your space.')

  const admin = createAdminClient()
  const { title, slug } = await eventTitleSlug(admin, eventId)

  const autoAccept = shouldAutoAcceptShare({
    callerStewardsApprovingSide: await viewerHostsEvent(eventId),
    collaborationLinksSpaces: await collaborationLinks(homeSpaceId, spaceId),
  })

  const res = await insertShare({
    eventId,
    targetSpaceId: spaceId,
    invitedBySpaceId: spaceId, // the target space initiated the feature request
    requestedBy: profileId,
    autoAccept,
  })
  if (isError(res)) return res

  if (!autoAccept) {
    // Notify the event's host side to approve. Best-effort: the event's host_id.
    const { data } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle()
    const hostId = (data as { host_id: string | null } | null)?.host_id
    await notify(admin, hostId ? [hostId] : [], profileId, 'event_feature_request', eventId, `asked to feature “${title}” on ${target.name}`)
  }

  await revalidateShare(slug, spaceId)
  return ok()
}

/**
 * Feature an event by its link or slug (the space manage surface's "Feature an event" form). Resolves a
 * VISIBLE, PUBLISHED event (public/unlisted only — never a draft or private one reachable by guessing a
 * slug), then delegates to requestFeatureEvent, which re-checks that the caller stewards the space and
 * routes the request to the event's host for approval. Accepts a bare slug or a full /events/<slug> URL.
 */
export async function requestFeatureEventBySlug(spaceId: string, eventSlug: string): Promise<ActionResult> {
  const clean = (eventSlug ?? '').trim().replace(/^.*\/events\//, '').replace(/[/?#].*$/, '')
  if (!clean) return fail('Paste an event link or slug to feature.')
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('id, status, visibility')
    .eq('slug', clean)
    .maybeSingle()
  const ev = data as { id: string; status: string | null; visibility: string | null } | null
  if (!ev || ev.status !== 'published' || !['public', 'unlisted'].includes(ev.visibility ?? '')) {
    return fail('Could not find a public event with that link.')
  }
  return requestFeatureEvent(spaceId, ev.id)
}

/** True when the signed-in caller may act on the NON-initiating (approving) side of `row`. */
async function viewerApprovesShare(row: ShareRow, profileId: string): Promise<boolean> {
  const homeSpaceId = await eventHomeSpaceId(row.event_id)
  const side = approverSideForShare(row, homeSpaceId)
  return side === 'target-space'
    ? viewerStewardsSpace(row.space_id, profileId)
    : viewerHostsEvent(row.event_id)
}

async function respondToShare(shareId: string, next: 'accepted' | 'declined'): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to respond to this request.')
  const row = await loadShare(shareId)
  if (!row) return fail('That request could not be found.')
  if (row.status !== 'pending') return fail('That request has already been handled.')
  if (!(await viewerApprovesShare(row, profileId))) return fail('You cannot respond to this request.')

  // Guard the status in the WHERE too: the row updates only if STILL pending (atomic transition).
  const { error } = await sharesTable()
    .update({ status: next, responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', shareId)
    .eq('status', 'pending')
  if (error) return fail('Could not update the request. Try again.')

  const admin = createAdminClient()
  const { title, slug } = await eventTitleSlug(admin, row.event_id)
  await notify(
    admin,
    [row.requested_by],
    profileId,
    next === 'accepted' ? 'event_share_approved' : 'event_share_declined',
    row.event_id,
    next === 'accepted' ? `is now co-hosting “${title}”` : `passed on co-hosting “${title}”`,
  )

  await revalidateShare(slug, row.space_id)
  return ok()
}

/** Approve a pending share. Caller must be on the NON-initiating side. */
export async function approveEventShare(shareId: string): Promise<ActionResult> {
  return respondToShare(shareId, 'accepted')
}

/** Decline a pending share. Caller must be on the NON-initiating side. */
export async function declineEventShare(shareId: string): Promise<ActionResult> {
  return respondToShare(shareId, 'declined')
}

/**
 * End a live (accepted) share, or cancel a pending one. Caller may be on EITHER side (the event host, or
 * a steward of the target space). status → 'revoked' (terminal; frees a future re-share via the partial
 * index).
 */
export async function revokeEventShare(shareId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage this share.')
  const row = await loadShare(shareId)
  if (!row) return fail('That share could not be found.')
  if (row.status !== 'pending' && row.status !== 'accepted') return fail('This share is already ended.')

  const [stewardsTarget, hostsEvent] = await Promise.all([
    viewerStewardsSpace(row.space_id, profileId),
    viewerHostsEvent(row.event_id),
  ])
  if (!stewardsTarget && !hostsEvent) return fail('You cannot end this share.')

  // Guard the status in the WHERE: only a still-live (pending|accepted) row is revoked.
  const { error } = await sharesTable()
    .update({ status: 'revoked', responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', shareId)
    .in('status', ['pending', 'accepted'])
  if (error) return fail('Could not end the share. Try again.')

  const { slug } = await eventTitleSlug(createAdminClient(), row.event_id)
  await revalidateShare(slug, row.space_id)
  return ok()
}
