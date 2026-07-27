import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isBlockedBetween } from '@/lib/blocking'
import { rateLimitOk } from '@/lib/rate-limit'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import { isEventCohost } from '@/lib/events/cohosts'
import { asWebRole, isStaff } from '@/lib/core/roles'
import {
  getEventCapabilities,
  getCircleCapabilities,
  getHubCapabilities,
  getNexusCapabilities,
} from '@/lib/core/load-capabilities'
import type { Capability } from '@/lib/core/capabilities'

// SCOPED PERSONAL-DM POLICY (CRM Everywhere plan 5.7 / ADR-827, owner ruling 4: leaders can message
// the members of scopes they LEAD). The policy layer OVER the deliberately ungated 1:1 seam
// (lib/messages/direct-conversation findOrCreateDirectConversation — the caller owns policy): each
// `canDm*` gate answers "does the sender lead this scope AND is the target actually in it", and
// `openScopedDm` is the one front door that runs gate -> block check -> rate limits -> the seam.
//
// The leadership leg is the SAME audience as the page gate (audit ruling: the DM audience and the
// page-gate audience must be identical). Each gate keeps the broadcast-style FK walk as a fast path
// (a circle is led by its host, its hub's guide, or its nexus's mentor; a hub by its guide or its
// nexus's mentor; a nexus by its mentor; an event by its host or an ACCEPTED cohost), then FALLS
// BACK to the exact capability the page gate resolves (event.editSettings / circle.moderate /
// hub.manage / nexus.manage via lib/core/load-capabilities) — so scope managers the capability
// resolver admits (stewardship edges, circle-scope managers, hosting-space operators) can DM the
// members they can already see. Platform staff (web_role admin/janitor, ADR-208) pass every gate —
// they already hold the full cross-lane lens.
//
// F2 compliance: this opens (or reuses) the THREAD only — it never sends a message body, and it never
// records a CRM touch. The DM touch (recordDmTouch, body: null) belongs to the message SEND path
// (app/(main)/messages/actions.ts), which fires only when a message is actually sent.
//
// FAIL-CLOSED: every gate returns false on any error / missing row, so a read failure never grants
// access; the rate limiter fails closed in production when unconfigured (lib/rate-limit).

/** A hub/nexus place-tree scope for the subtree membership gate. */
export interface PlaceTreeScope {
  kind: 'hub' | 'nexus'
  id: string
}

/** The scope a DM is being opened FROM (the surface the leader is standing on). */
export interface ScopedDmInput {
  scope: { kind: 'event' | 'circle' | 'hub' | 'nexus' | 'space'; id: string }
  targetProfileId: string
}

/** Platform staff on the STAFF axis (profiles.web_role admin/janitor, ADR-208). Fail-closed. */
async function isStaffProfile(profileId: string): Promise<boolean> {
  if (!profileId) return false
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('web_role')
      .eq('id', profileId)
      .maybeSingle()
    return isStaff(asWebRole((data as { web_role: string | null } | null)?.web_role))
  } catch {
    return false
  }
}

/** Does the sender lead this hub — its guide, or the mentor of the nexus above it? (The broadcast
 *  hub walk, over the LIVE hierarchy table: hubs.nexus_id references nexuses(id), the same table
 *  every page gate reads via lib/core/load-capabilities.) Fail-closed. */
async function leadsHub(senderProfileId: string, hubId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: h } = await admin.from('hubs').select('guide_id, nexus_id').eq('id', hubId).maybeSingle()
    if (!h) return false
    if (h.guide_id === senderProfileId) return true
    if (!h.nexus_id) return false
    const { data: n } = await admin.from('nexuses').select('mentor_id').eq('id', h.nexus_id).maybeSingle()
    return n?.mentor_id === senderProfileId
  } catch {
    return false
  }
}

/** Does the sender lead this nexus — its mentor? Fail-closed. */
async function leadsNexus(senderProfileId: string, nexusId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: n } = await admin.from('nexuses').select('mentor_id').eq('id', nexusId).maybeSingle()
    return n?.mentor_id === senderProfileId
  } catch {
    return false
  }
}

/** The page-gate capability fallback for the leadership leg. The capability loaders resolve the
 *  CALLER's capabilities (they read the session), so this leg applies only when the sender IS the
 *  signed-in caller — openScopedDm always passes the caller, and any other invocation fails closed
 *  rather than grant on someone else's capabilities. Fail-closed on any error. */
async function senderHasCapability(
  senderProfileId: string,
  cap: Capability,
  load: () => Promise<Set<Capability>>,
): Promise<boolean> {
  if (!senderProfileId) return false
  try {
    if ((await getMyProfileId()) !== senderProfileId) return false
    return (await load()).has(cap)
  } catch {
    return false
  }
}

/** Does the target hold an ACTIVE membership in ANY of these circles? One read, filtered to the
 *  target (never resolves the whole roster). Fail-closed. */
async function isActiveMemberOfCircles(targetProfileId: string, circleIds: string[]): Promise<boolean> {
  if (circleIds.length === 0) return false
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('memberships')
      .select('id')
      .in('circle_id', circleIds)
      .eq('profile_id', targetProfileId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * May the sender DM this event attendee? Sender must LEAD the event — the SAME audience as the
 * Manage page gate: events.host_id / an ACCEPTED cohost / platform staff (the fast path), or
 * anyone the page gate admits via 'event.editSettings' (circle-scope managers, hosting-space
 * operators). Target must actually be an attendee (event_rsvps status going|maybe — the Message
 * Attendees audience, owner ruling). Fail-closed on any error.
 */
export async function canDmEventAttendee(
  senderProfileId: string,
  targetProfileId: string,
  eventId: string,
): Promise<boolean> {
  if (!senderProfileId || !targetProfileId || !eventId) return false
  try {
    const admin = createAdminClient()

    // The leadership leg: host, accepted cohost, staff, or the page-gate capability.
    const { data: ev } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle()
    if (!ev) return false
    const leads =
      ev.host_id === senderProfileId ||
      (await isEventCohost(eventId, senderProfileId)) ||
      (await isStaffProfile(senderProfileId)) ||
      (await senderHasCapability(senderProfileId, 'event.editSettings', () => getEventCapabilities(eventId)))
    if (!leads) return false

    // The audience leg: the target RSVP'd going or maybe (waitlist/declined are out of scope).
    const { data: rsvp } = await admin
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', targetProfileId)
      .in('status', ['going', 'maybe'])
      .limit(1)
      .maybeSingle()
    return !!rsvp
  } catch {
    return false
  }
}

/**
 * May the sender DM this circle member? Sender must LEAD the circle — the SAME audience as the
 * page gate: its host, the guide of its hub, the mentor of the nexus above (the fast-path walk),
 * platform staff, or anyone the page gate admits via 'circle.moderate' (stewardship edges). Target
 * must hold an ACTIVE membership in the circle, or BE the circle's host (the roster includes the
 * host via unionRosterIds, so a guide/mentor can message them too). Fail-closed on any error.
 */
export async function canDmCircleMember(
  senderProfileId: string,
  targetProfileId: string,
  circleId: string,
): Promise<boolean> {
  if (!senderProfileId || !targetProfileId || !circleId) return false
  try {
    const admin = createAdminClient()

    const { data: c } = await admin.from('circles').select('host_id, hub_id').eq('id', circleId).maybeSingle()
    if (!c) return false
    const leads =
      c.host_id === senderProfileId ||
      (c.hub_id ? await leadsHub(senderProfileId, c.hub_id) : false) ||
      (await isStaffProfile(senderProfileId)) ||
      (await senderHasCapability(senderProfileId, 'circle.moderate', () => getCircleCapabilities(circleId)))
    if (!leads) return false

    // The host is a roster row (unionRosterIds appends them) even without a membership row.
    if (targetProfileId === c.host_id) return true
    return isActiveMemberOfCircles(targetProfileId, [circleId])
  } catch {
    return false
  }
}

/**
 * May the sender DM this hub/nexus subtree member? Sender must LEAD the scope — the SAME audience
 * as the page gate: the hub's guide (or the mentor above it) / the nexus's mentor (the fast-path
 * walk), platform staff, or anyone the page gate admits via 'hub.manage' / 'nexus.manage'
 * (stewardship edges); target must hold an ACTIVE membership in a circle of that subtree. The
 * membership check is TARGETED (circle ids of the subtree + one membership read filtered to the
 * target), never a full 20k-id roster resolve. Fail-closed on any error.
 */
export async function canDmPlaceTreeMember(
  senderProfileId: string,
  targetProfileId: string,
  scope: PlaceTreeScope,
): Promise<boolean> {
  if (!senderProfileId || !targetProfileId || !scope.id) return false
  try {
    const admin = createAdminClient()

    const leads =
      (scope.kind === 'hub'
        ? await leadsHub(senderProfileId, scope.id)
        : await leadsNexus(senderProfileId, scope.id)) ||
      (await isStaffProfile(senderProfileId)) ||
      (await senderHasCapability(
        senderProfileId,
        scope.kind === 'hub' ? 'hub.manage' : 'nexus.manage',
        () => (scope.kind === 'hub' ? getHubCapabilities(scope.id) : getNexusCapabilities(scope.id)),
      ))
    if (!leads) return false

    // The subtree's circle ids (hub -> its circles; nexus -> its hubs -> their circles), mirroring
    // the place-tree walk (lib/messaging/place-tree.ts) without resolving any member lists.
    let circleIds: string[] = []
    if (scope.kind === 'hub') {
      const { data } = await admin.from('circles').select('id').eq('hub_id', scope.id)
      circleIds = (data ?? []).map((r) => r.id as string)
    } else {
      const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', scope.id)
      const hubIds = (hubs ?? []).map((h) => h.id as string)
      if (hubIds.length === 0) return false
      const { data } = await admin.from('circles').select('id').in('hub_id', hubIds)
      circleIds = (data ?? []).map((r) => r.id as string)
    }

    return isActiveMemberOfCircles(targetProfileId, circleIds)
  } catch {
    return false
  }
}

/** Does the profile hold an ACTIVE space_members row here (optionally narrowed to roles)?
 *  Fail-closed. */
async function hasActiveSpaceMemberRow(
  profileId: string,
  spaceId: string,
  roles: string[] | null,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    let q = admin
      .from('space_members')
      .select('id')
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .eq('status', 'active')
    if (roles) q = q.in('role', roles)
    const { data } = await q.limit(1).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * May the sender DM this Space member? Sender must LEAD the Space: its owner
 * (spaces.owner_profile_id), an ACTIVE space_members admin or moderator, or platform staff (the
 * same staff axis every other gate here passes). Target must hold an ACTIVE space_members row, or
 * BE the owner (the owner is on the roster without a member row, same as a circle's host).
 * Fail-closed on any error.
 */
export async function canDmSpaceMember(
  senderProfileId: string,
  spaceId: string,
  targetProfileId: string,
): Promise<boolean> {
  if (!senderProfileId || !spaceId || !targetProfileId) return false
  try {
    const admin = createAdminClient()

    const { data: s } = await admin
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', spaceId)
      .maybeSingle()
    if (!s) return false
    const leads =
      s.owner_profile_id === senderProfileId ||
      (await hasActiveSpaceMemberRow(senderProfileId, spaceId, ['admin', 'moderator'])) ||
      (await isStaffProfile(senderProfileId))
    if (!leads) return false

    if (targetProfileId === s.owner_profile_id) return true
    return hasActiveSpaceMemberRow(targetProfileId, spaceId, null)
  } catch {
    return false
  }
}

/**
 * Open (or reuse) the 1:1 thread from the signed-in leader to a member of a scope they lead. The ONE
 * front door for every leader-surface Message button: resolves the caller, runs the matching scope
 * gate, the block check (always), and the abuse rate limits, THEN reaches the ungated seam. Returns
 * the conversation id for the caller to land in (`/messages/<id>`). Throws a plain-voice Error on
 * every refusal (the callers surface it). Sends NO message body and records NO CRM touch — the DM
 * touch belongs to the send path, when a message is actually sent.
 */
export async function openScopedDm(input: ScopedDmInput): Promise<{ conversationId: string }> {
  const senderProfileId = await getMyProfileId()
  if (!senderProfileId) throw new Error('Sign in to message members.')

  const { scope, targetProfileId } = input
  if (!targetProfileId || targetProfileId === senderProfileId) {
    throw new Error('Pick another member to message.')
  }

  // 1) The scope gate: the sender leads this scope AND the target is in it.
  const allowed =
    scope.kind === 'event'
      ? await canDmEventAttendee(senderProfileId, targetProfileId, scope.id)
      : scope.kind === 'circle'
        ? await canDmCircleMember(senderProfileId, targetProfileId, scope.id)
        : scope.kind === 'space'
          ? await canDmSpaceMember(senderProfileId, scope.id, targetProfileId)
          : await canDmPlaceTreeMember(senderProfileId, targetProfileId, { kind: scope.kind, id: scope.id })
  if (!allowed) throw new Error('You can only message members of a scope you lead.')

  // 2) The block gate — ALWAYS, both directions (parity with startConversation / messageHost).
  if (await isBlockedBetween(senderProfileId, targetProfileId)) {
    throw new Error('You cannot message this member.')
  }

  // 3) Abuse limits (fail-closed in production when unconfigured, per lib/rate-limit): new-thread
  //    starts per day, plus the shared per-minute message bucket the Phase 5 send path will draw on.
  if (!(await rateLimitOk('scoped-dm:start', senderProfileId, 30, '1 d'))) {
    throw new Error('You have started a lot of conversations today. Try again tomorrow.')
  }
  if (!(await rateLimitOk('scoped-dm:msg', senderProfileId, 20, '1 m'))) {
    throw new Error('Slow down a little. Try again in a minute.')
  }

  // 4) The ungated seam — policy satisfied, open or reuse the thread.
  const admin = createAdminClient()
  const conversationId = await findOrCreateDirectConversation(admin, senderProfileId, targetProfileId)
  return { conversationId }
}
