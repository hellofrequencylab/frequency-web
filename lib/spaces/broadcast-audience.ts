import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listActiveSpaceMemberIds } from '@/lib/spaces/resonance-roster'
import { listActiveCircleMemberIds } from '@/lib/circles/crm-roster'
import { listEventCrmMemberIds } from '@/lib/events/crm-roster'
import { unionSegmentIds } from '@/lib/events/broadcast-audience'
import type { BroadcastSegment } from '@/components/comms/broadcast-types'

// THE SPACE BROADCAST AUDIENCE (Message center, ADR-858). The segments the Space's message
// console offers, and the ONE server-side resolver its send action trusts (ADR-274: the
// client's profileIds exist only for the live count; the action re-resolves from keys).
// The Space analogue of lib/events/broadcast-audience.ts, with the same posture throughout.
//
//   members            — every ACTIVE space member plus the owner (the same set the roster
//                        and resonance surfaces read, via listActiveSpaceMemberIds)
//   tier:<id>          — one paid membership tier's ACTIVE members (space_memberships), so
//                        "message the Gold members" is one chip. With a tier's circle linked
//                        (ADR-858 phase 2) this converges with that circle's segment — both
//                        are offered, because the tier read is the billing truth while the
//                        circle read is the communications-hub truth.
//   circle:<id>        — one of the Space's OWN circles' members (circles.space_id = space,
//                        the attach model from ADR-857), via the same read the circle CRM
//                        roster uses. Hosts count as members, mirroring the owner rule.
//   event:<id>         — one UPCOMING space event's RSVPs (going or maybe — the Message
//                        Attendees set), for events the space owns or hosts
//                        (host_space_id ?? space_id, the ADR-819 convention).
//
// Every read is service-role BEHIND the caller's space-manage gate, deduped by profile id,
// and FAIL-SAFE: a broken read degrades to an empty segment, never a throw.

export const MEMBERS_SEGMENT_KEY = 'members'

/** Read caps: a message console lists a scannable set, not an unbounded archive. */
const CIRCLES_CAP = 12
const EVENTS_CAP = 10
const TIER_ROWS_CAP = 5000

/** Untyped admin handle for the reads below (loose row narrowing, ADR-246). */
function db(): { from: (t: string) => any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  return createAdminClient() as never
}

/** One `tier:<id>` segment per ACTIVE paid tier that has active members. */
async function readTierSegments(spaceId: string): Promise<BroadcastSegment[]> {
  try {
    const [tiersRes, membershipsRes] = await Promise.all([
      db()
        .from('space_membership_tiers')
        .select('id, name')
        .eq('space_id', spaceId)
        .eq('is_active', true)
        .order('sort', { ascending: true }),
      db()
        .from('space_memberships')
        .select('tier_id, member_profile_id')
        .eq('space_id', spaceId)
        .eq('status', 'active')
        .limit(TIER_ROWS_CAP),
    ])
    const byTier = new Map<string, Set<string>>()
    for (const m of (membershipsRes?.data ?? []) as { tier_id: string | null; member_profile_id: string | null }[]) {
      if (!m.tier_id || !m.member_profile_id) continue
      const set = byTier.get(m.tier_id) ?? new Set<string>()
      set.add(m.member_profile_id)
      byTier.set(m.tier_id, set)
    }
    const segments: BroadcastSegment[] = []
    for (const t of (tiersRes?.data ?? []) as { id: string; name: string | null }[]) {
      const ids = byTier.get(t.id)
      if (!ids || ids.size === 0) continue
      segments.push({ key: `tier:${t.id}`, label: `${t.name || 'Membership'} members`, profileIds: [...ids] })
    }
    return segments
  } catch {
    return []
  }
}

/** One `circle:<id>` segment per non-archived circle the Space owns. */
async function readCircleSegments(spaceId: string): Promise<BroadcastSegment[]> {
  try {
    const { data } = await db()
      .from('circles')
      .select('id, name')
      .eq('space_id', spaceId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(CIRCLES_CAP)
    const circles = (data ?? []) as { id: string; name: string | null }[]
    const segments = await Promise.all(
      circles.map(async (c) => {
        const ids = await listActiveCircleMemberIds(c.id)
        return {
          key: `circle:${c.id}`,
          label: c.name || 'Circle',
          profileIds: [...ids],
        } satisfies BroadcastSegment
      }),
    )
    return segments.filter((s) => s.profileIds.length > 0)
  } catch {
    return []
  }
}

/** One `event:<id>` segment per upcoming event the Space owns or hosts. Deliberately the
 *  OPERATOR view (any status/visibility, not the public-calendar filter): a host messages
 *  the RSVPs of a private event exactly as easily as a public one. */
async function readEventSegments(spaceId: string): Promise<BroadcastSegment[]> {
  try {
    const nowIso = new Date().toISOString()
    const { data } = await db()
      .from('events')
      .select('id, title, starts_at, space_id, host_space_id')
      .or(`host_space_id.eq.${spaceId},space_id.eq.${spaceId}`)
      .gte('starts_at', nowIso)
      .is('removed_at', null)
      .order('starts_at', { ascending: true })
      .limit(EVENTS_CAP)
    const rows = ((data ?? []) as { id: string; title: string | null; space_id: string | null; host_space_id: string | null }[])
      // ADR-819 convention: host_space_id wins; a row whose host is ANOTHER space is not ours.
      .filter((e) => (e.host_space_id ?? e.space_id) === spaceId)
    const segments = await Promise.all(
      rows.map(async (e) => {
        const ids = await listEventCrmMemberIds(e.id)
        return {
          key: `event:${e.id}`,
          label: `${e.title || 'Event'} RSVPs`,
          profileIds: [...ids],
        } satisfies BroadcastSegment
      }),
    )
    return segments.filter((s) => s.profileIds.length > 0)
  } catch {
    return []
  }
}

/**
 * The composer's segment list for one Space: members always first (even when empty, so the
 * summary line can say so honestly), then paid tiers, then the Space's circles, then its
 * upcoming events' RSVPs. Caller gates space-manage first.
 */
export async function loadSpaceBroadcastSegments(spaceId: string): Promise<BroadcastSegment[]> {
  const [memberIds, tiers, circles, events] = await Promise.all([
    listActiveSpaceMemberIds(spaceId),
    readTierSegments(spaceId),
    readCircleSegments(spaceId),
    readEventSegments(spaceId),
  ])
  return [
    { key: MEMBERS_SEGMENT_KEY, label: 'All space members', profileIds: [...memberIds] },
    ...tiers,
    ...circles,
    ...events,
  ]
}

/**
 * SEND-TIME RESOLUTION: re-load the segments and union the selected keys server-side, so
 * the action never trusts a client-supplied id list (ADR-274). Unknown keys resolve to
 * nothing; no keys defaults to all members. FAIL-SAFE to [].
 */
export async function resolveSpaceBroadcastAudience(
  spaceId: string,
  selectedKeys: readonly string[],
): Promise<string[]> {
  const keys = selectedKeys.length > 0 ? selectedKeys : [MEMBERS_SEGMENT_KEY]
  const segments = await loadSpaceBroadcastSegments(spaceId)
  return unionSegmentIds(segments, keys)
}

/**
 * Which scope-spine coordinates a send should carry, derived from the SELECTED segments
 * (ADR-831: log where it happened). Exactly one circle selected and nothing wider →
 * scope_kind 'circle'; exactly one event and nothing wider → 'event'; anything else is a
 * space-wide send: scope NULL, carried by the conversation's space_id lane alone
 * ('space' is deliberately NOT a scope_kind — the spine treats the space as tenancy).
 */
export function scopeForSelection(
  selectedKeys: readonly string[],
): { kind: 'circle' | 'event'; id: string } | null {
  const keys = [...new Set(selectedKeys)]
  if (keys.length !== 1) return null
  const only = keys[0]!
  const m = /^(circle|event):(.+)$/.exec(only)
  if (!m) return null
  return { kind: m[1] as 'circle' | 'event', id: m[2]! }
}
