import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listSpaceStewardIds } from '@/lib/events/placement'

// Shared / co-hosted events (Events EC3, delivers collaborator B2) — the service-role READS + PURE
// resolvers behind the event↔space share relationship. The WRITES (request / feature / approve /
// decline / revoke) live in the 'use server' module app/(main)/events/share-actions.ts (a server-action
// module may export only async functions, so these types + pure helpers cannot live there).
//
// Mirrors lib/events/placement.ts + lib/spaces/collaborations.ts. The ASYMMETRY vs a space↔space
// collaboration: a share has TWO different kinds of side — the TARGET SPACE (event_space_shares.space_id,
// approved by its stewards) and the EVENT HOST side (the event's host/cohost — event.editSettings — with
// the event's home space as context). So the pure "who approves" helper returns a KIND, not a space id.
//
// event_space_shares is newer than the generated Database types, so we reach it through an untyped admin
// handle (ADR-246). Reads FAIL-SAFE (empty / null on any error). The per-event VISIBILITY gate is NOT
// applied here — these reads power the host/steward management UI (which must show a pending share even
// for a currently-private event); the LEAK gate lives in the calendar READERS (store + RPC) that decide
// what surfaces publicly.

export type ShareStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

/** Which side of a share must act on a pending row: the target space's stewards, or the event's host. */
export type ShareSide = 'target-space' | 'event-host'

/** A raw event_space_shares row. */
export interface ShareRow {
  id: string
  event_id: string
  space_id: string
  invited_by_space_id: string | null
  requested_by: string
  status: ShareStatus
  created_at: string | null
  responded_at: string | null
  responded_by: string | null
}

/** One share as the EVENT-side field renders it: the target space resolved, plus whether the pending
 *  row is awaiting the EVENT HOST's approval (a space asked to feature it) vs the target's. */
export interface EventShareView {
  id: string
  status: ShareStatus
  space: { id: string; slug: string; name: string; logoUrl: string | null }
  /** True when this pending row awaits the EVENT HOST (a space initiated a "feature" request). */
  awaitingHostApproval: boolean
  createdAt: string | null
}

/** One incoming share request as a TARGET SPACE's steward inbox renders it (the event to host). */
export interface IncomingShareRequest {
  id: string
  eventId: string
  eventTitle: string
  eventSlug: string
  requestedByName: string
  createdAt: string | null
}

// ── PURE helpers (no IO, unit-tested) ────────────────────────────────────────────────────────────────

/**
 * Which SIDE must approve a pending share — the party that did NOT initiate it. Pure.
 *
 * The target space initiated (a "feature this event" ask) iff the inviter IS the target space
 * (`invited_by_space_id === space_id`) → the EVENT HOST approves. Otherwise the event's host side
 * initiated (an "invite" — the inviter is the event's home space, or null for a platform event) → the
 * TARGET SPACE approves. `eventHomeSpaceId` names the host side so the invite case is explicit.
 */
export function approverSideForShare(
  row: Pick<ShareRow, 'space_id' | 'invited_by_space_id'>,
  eventHomeSpaceId: string | null,
): ShareSide {
  if (row.invited_by_space_id === row.space_id) return 'event-host'
  if (row.invited_by_space_id === eventHomeSpaceId || row.invited_by_space_id === null) return 'target-space'
  // Unexpected inviter (neither the target nor the home space): fail safe to the target space's
  // steward gate (a real steward check still guards the action).
  return 'target-space'
}

/** The role `spaceId` plays in a share row: the 'target' it is shared TO, or the event's 'host' home
 *  space. Pure. */
export function roleFor(
  row: Pick<ShareRow, 'space_id'>,
  spaceId: string,
): 'target' | 'host' {
  return row.space_id === spaceId ? 'target' : 'host'
}

/**
 * Whether a requested share should AUTO-ACCEPT instead of sitting pending. Pure over the two facts the
 * action gathers: the caller already stewards the OTHER (approving) side, OR an accepted space
 * collaboration already links the event's home space and the target space. Either makes the approval
 * round-trip unnecessary.
 */
export function shouldAutoAcceptShare(input: {
  callerStewardsApprovingSide: boolean
  collaborationLinksSpaces: boolean
}): boolean {
  return input.callerStewardsApprovingSide || input.collaborationLinksSpaces
}

// ── IO: untyped admin handle (event_space_shares isn't in the generated types yet, ADR-246) ───────────

function untyped(): SupabaseClient {
  return createAdminClient()
}

type TargetSpace = { id: string; slug: string; name: string; logoUrl: string | null }

/** Batch-resolve target spaces for a set of ids (one query), keyed by id. */
async function resolveSpaces(admin: SupabaseClient, ids: string[]): Promise<Map<string, TargetSpace>> {
  const map = new Map<string, TargetSpace>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return map
  const { data } = await admin
    .from('spaces')
    .select('id, name, brand_name, slug, brand_logo_url')
    .in('id', unique)
  for (const r of (data ?? []) as Array<{
    id: string; name: string | null; brand_name: string | null; slug: string; brand_logo_url: string | null
  }>) {
    map.set(r.id, { id: r.id, slug: r.slug, name: r.brand_name ?? r.name ?? 'Space', logoUrl: r.brand_logo_url })
  }
  return map
}

/** The event's home space id (events.space_id), for the pure approver decision + auto-accept check.
 *  FAIL-SAFE: null on any error. */
export async function eventHomeSpaceId(eventId: string): Promise<string | null> {
  try {
    const { data } = await untyped().from('events').select('space_id').eq('id', eventId).maybeSingle()
    return (data as { space_id: string | null } | null)?.space_id ?? null
  } catch {
    return null
  }
}

/** A single share row by id (untyped select), for the action authz path. FAIL-SAFE: null. */
export async function loadShare(id: string): Promise<ShareRow | null> {
  if (!id) return null
  try {
    const { data } = await untyped().from('event_space_shares').select('*').eq('id', id).maybeSingle()
    return (data as ShareRow | null) ?? null
  } catch {
    return null
  }
}

/** Every non-terminal (pending|accepted) share FOR an event, target space resolved — the host-side
 *  field's list. `homeSpaceId` decides which pending rows await the HOST (a space's feature request).
 *  FAIL-SAFE: []. */
export async function listSharesForEvent(eventId: string): Promise<EventShareView[]> {
  if (!eventId) return []
  try {
    const admin = untyped()
    const homeSpaceId = await eventHomeSpaceId(eventId)
    const { data } = await admin
      .from('event_space_shares')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as ShareRow[]
    if (rows.length === 0) return []
    const spaces = await resolveSpaces(admin, rows.map((r) => r.space_id))
    return rows.flatMap((r) => {
      const space = spaces.get(r.space_id)
      if (!space) return []
      return [
        {
          id: r.id,
          status: r.status,
          space,
          awaitingHostApproval:
            r.status === 'pending' && approverSideForShare(r, homeSpaceId) === 'event-host',
          createdAt: r.created_at,
        } satisfies EventShareView,
      ]
    })
  } catch {
    return []
  }
}

/** Accepted shares TO a space (the events another host brought here). Target space resolved. FAIL-SAFE. */
export async function listAcceptedSharesForSpace(spaceId: string): Promise<ShareRow[]> {
  if (!spaceId) return []
  try {
    const { data } = await untyped()
      .from('event_space_shares')
      .select('*')
      .eq('space_id', spaceId)
      .eq('status', 'accepted')
    return (data ?? []) as ShareRow[]
  } catch {
    return []
  }
}

/**
 * Pending share requests a TARGET SPACE's steward must act on — a host invited this space to co-host
 * their event. Only rows where the TARGET SPACE is the approver (the host side initiated). Newest first.
 * FAIL-SAFE: [].
 */
export async function listIncomingShareRequestsForSpace(spaceId: string): Promise<IncomingShareRequest[]> {
  if (!spaceId) return []
  try {
    const admin = untyped()
    const { data } = await admin
      .from('event_space_shares')
      .select('*')
      .eq('space_id', spaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as ShareRow[]
    // Only the invites the TARGET SPACE approves (the host side initiated, so the inviter is NOT this
    // space). A "feature" request this space itself initiated (inviter === space_id) awaits the EVENT
    // HOST, not this inbox.
    const inbox = rows.filter((r) => r.invited_by_space_id !== r.space_id)
    if (inbox.length === 0) return []

    const eventIds = [...new Set(inbox.map((r) => r.event_id))]
    const requesterIds = [...new Set(inbox.map((r) => r.requested_by))]
    const [{ data: events }, { data: profiles }] = await Promise.all([
      admin.from('events').select('id, title, slug').in('id', eventIds),
      admin.from('profiles').select('id, display_name').in('id', requesterIds),
    ])
    const eventById = new Map(
      ((events ?? []) as Array<{ id: string; title: string | null; slug: string }>).map((e) => [e.id, e]),
    )
    const nameById = new Map(
      ((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]),
    )
    return inbox.flatMap((r) => {
      const ev = eventById.get(r.event_id)
      if (!ev) return []
      return [
        {
          id: r.id,
          eventId: r.event_id,
          eventTitle: ev.title ?? 'Untitled event',
          eventSlug: ev.slug,
          requestedByName: nameById.get(r.requested_by) ?? 'A host',
          createdAt: r.created_at,
        },
      ]
    })
  } catch {
    return []
  }
}

/** Profile ids that may approve on the TARGET SPACE's behalf: owner + active admins (reuses the
 *  placement steward resolver — one definition of "a space's stewards"). FAIL-SAFE: []. */
export async function listShareApproverIds(spaceId: string): Promise<string[]> {
  try {
    return await listSpaceStewardIds(spaceId)
  } catch {
    return []
  }
}
