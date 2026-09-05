import { createAdminClient } from '@/lib/supabase/admin'
import { listSpaceStewardIds } from '@/lib/events/placement'
import { normalizeSpaceType, isConsoleSpaceType } from '@/lib/spaces/types'
import { resolveHostingSpaceIdFromRow } from './host-space'

// Shared / co-hosted events (Events EC3, delivers collaborator B2) — the service-role READS + PURE
// resolvers behind the event↔space share relationship. The WRITES (request / feature / approve /
// decline / revoke) live in the 'use server' module app/(main)/events/share-actions.ts (a server-action
// module may export only async functions, so these types + pure helpers cannot live there).
//
// TWO DISTINCT EVENT RELATIONS live near each other and must never blur (ADR-834):
//   A. COHOSTS (people)        — event_cohosts (lib/events/cohosts.ts): a MEMBER who helps RUN the
//      event. Management access (the action gates compose isEventCohost). Quiet avatar credit.
//   B. COLLABORATORS (Spaces)  — event_space_shares (this module): a Business / Non Profit SPACE the
//      event is shared with. Calendar visibility + a featured credit on the event page. NO management
//      access — an accepted share never enters getEventCapabilities or any action gate.
// The A/B split is STRUCTURAL, not name-based (ADR-835, reversing part of ADR-834): a PROFILE can only
// ever be a cohost; a SPACE can only ever be a Collaborator — including a Space named after its owner
// (the owner's own "Daniel Tyack" business Space is a valid Collaborator). The picker and the rows
// badge every result with the Space's type + logo so an owner-named Space never reads as a person
// (collaboratorTypeLabel below).
//
// Mirrors lib/events/placement.ts + lib/spaces/collaborations.ts. The ASYMMETRY vs a space↔space
// collaboration: a share has TWO different kinds of side — the TARGET SPACE (event_space_shares.space_id,
// approved by its stewards) and the EVENT HOST side (the event's host/cohost — event.editSettings — with
// the event's home space as context). So the pure "who approves" helper returns a KIND, not a space id.
//
// event_space_shares is covered by the regenerated Database types (ADR-246 closed), so we reach it
// through the typed admin client. Reads FAIL-SAFE (empty / null on any error). The per-event VISIBILITY gate is NOT
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
  /** `typeLabel` is the disambiguation badge (collaboratorTypeLabel) so an owner-named Space never
   *  reads as a person in the Settings rows (ADR-835). */
  space: { id: string; slug: string; name: string; logoUrl: string | null; typeLabel: string }
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

/**
 * The member-facing message for a FAILED event_space_shares write, mapped from the Postgres/PostgREST
 * error code so a host reads what actually went wrong instead of a blanket "try again". Pure.
 *
 * The codes that matter in practice:
 *   - PGRST205 / 42P01: the event_space_shares table is missing (the EC3 migration band was never
 *     applied to this database). Seen live 2026-07: prod stopped applying at 20261104 and the
 *     20261195..20261204 band (space_collaborations, calendar feeds, event_space_shares, venue holds)
 *     never landed, so EVERY share attempt failed. Retrying cannot help; an operator must migrate.
 *   - 42501: RLS/permission denied. The table is service-role only, so this means the server is not
 *     writing with the service role. Also an operator problem, not a retry.
 *   - 23503: the event or space row vanished between the picker and the write (stale page).
 *   - 22P02: the submitted id is not a uuid, so the picked result was never a Space.
 * 23505 never reaches this mapper (an active duplicate is idempotent success in the action).
 */
export function shareWriteFailureMessage(code?: string | null): string {
  switch (code) {
    case 'PGRST205':
    case '42P01':
    case '42501':
      return 'Event sharing is not set up on this site yet. An operator needs to finish the database setup before events can be co-hosted.'
    case '23503':
      return 'This event or that Space no longer exists. Refresh the page and try again.'
    case '22P02':
      return 'That result is not a Space. Search again and pick a Space from the list.'
    default:
      return 'Could not share this event. Try again.'
  }
}

/**
 * The member-facing refusal when an event with NO home Space tries to take on a Collaborator
 * (the ADR-835 structural rule: a member-hosted / platform event has Cohosts, not Collaborators).
 * PENDING-AWARE: when a Space placement is already asked-for but not yet approved, the line says
 * exactly what is being waited on instead of re-explaining the rule the host already followed
 * (the Royal Temple confusion: "run it under a Space" reads as a dead end when you just did).
 * Pure; enforced in requestEventShare.
 */
export function memberHostedCollaboratorError(
  pendingPlacement: { targetName: string } | null,
): string {
  if (pendingPlacement) {
    return `${pendingPlacement.targetName} hasn't approved hosting this event yet. Collaborators unlock once that placement is approved.`
  }
  return 'A member-hosted event can have Cohosts, not Collaborators. Run this event under a Space to bring Collaborators on.'
}

// ── The Collaborator gate: which Spaces an event may be shared with (ADR-834 + ADR-835) ─────────────

/**
 * The ONE rule for who can be an event Collaborator (ADR-835, owner-ruled): any real console-type
 * Space — Business or Non Profit, never the platform root. The distinction between a person and a
 * Space is STRUCTURAL (a profiles row vs a spaces row), never name-based: a Space named after its
 * owner ("Daniel Tyack" owned by Daniel Tyack) is a valid Collaborator. ADR-834's identity-mirroring
 * heuristic (isPersonalMemberSpace) is retired — if a structural personal-space marker ever lands on
 * `spaces` (none exists today), the personal rejection re-enters HERE, keyed on that marker only.
 * Returns the member-facing error line, or null when the Space is a valid target. Pure. Enforced in
 * requestEventShare + requestFeatureEvent (server-side, the authority) and mirrored by the picker
 * (/api/search-scopes?for=event-share).
 */
export function collaboratorSpaceGateError(target: { type: string | null }): string | null {
  if (!isConsoleSpaceType(normalizeSpaceType(target.type))) {
    return 'Events can only be co-hosted with a Business or Non Profit Space.'
  }
  return null
}

/**
 * The disambiguation badge for a Collaborator picker result or Settings row: the Space's TYPE, worded
 * so an owner-named Space never reads as a person (ADR-835 — the badge replaces the retired
 * name-mirroring gate as the person/Space distinction the member SEES). "Business Space" spells out
 * the entity kind; "Non Profit" already reads as an organization (NAMING: the two public
 * designators). Pure; legacy raw types normalize first, so an unmigrated row still badges correctly.
 */
export function collaboratorTypeLabel(type: string | null | undefined): string {
  return normalizeSpaceType(type) === 'nonprofit' ? 'Non Profit' : 'Business Space'
}

// ── The retired identity-mirroring heuristic (ADR-834 → retired from the gates by ADR-835) ──────────
// isPersonalMemberSpace NO LONGER gates Collaborator eligibility anywhere: the owner ruled the
// person/Space distinction is STRUCTURAL (profiles vs spaces), so an owner-named business Space is a
// valid Collaborator and the type badge does the disambiguation. The helper stays exported ONLY for
// the event CRM tier resolver (lib/events/crm-access.ts, ADR-836), which reads it for a different
// question (does this Space confer the business CRM tier). Do not wire it back into any share path.

/** The identity facts the personal-space check compares. All optional-safe: unknown fields never match.
 *  Local: callers pass a structural object literal; nothing imports the type. */
interface ShareTargetIdentity {
  /** spaces.type, raw or normalized. */
  type: string | null
  name: string | null
  brandName?: string | null
  slug: string | null
  ownerDisplayName: string | null
  ownerHandle: string | null
}

/** Collapse a display string to a comparable identity key (lowercase, alphanumerics only), so
 *  "Audrey DeWitt" / "audrey-dewitt" / "audreydewitt" all read as the same identity. Pure. */
function identityKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Does this Space READ AS its owner (display identity — name / brand name / slug — mirroring the
 * owner's member display name / handle)? Pure; fail-open (no owner facts → not personal). RETIRED
 * from the Collaborator gates (ADR-835 — never use this to block a share); consumed only by the
 * ADR-836 event CRM tier resolver.
 */
export function isPersonalMemberSpace(target: ShareTargetIdentity): boolean {
  const ownerKeys = [target.ownerDisplayName, target.ownerHandle]
    .map(identityKey)
    .filter((k) => k.length > 0)
  if (ownerKeys.length === 0) return false
  const spaceKeys = [target.name, target.brandName ?? null, target.slug]
    .map(identityKey)
    .filter((k) => k.length > 0)
  return spaceKeys.some((k) => ownerKeys.includes(k))
}

// ── IO: the typed admin client (event_space_shares is in the generated types; ADR-246 closed) ─────────

type AdminClient = ReturnType<typeof createAdminClient>

type TargetSpace = {
  id: string; slug: string; name: string; logoUrl: string | null; typeLabel: string; status: string | null
}

/** Batch-resolve target spaces for a set of ids (one query), keyed by id. */
async function resolveSpaces(admin: AdminClient, ids: string[]): Promise<Map<string, TargetSpace>> {
  const map = new Map<string, TargetSpace>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return map
  const { data } = await admin
    .from('spaces')
    .select('id, name, brand_name, slug, brand_logo_url, type, status')
    .in('id', unique)
  for (const r of data ?? []) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.brand_name ?? r.name ?? 'Space',
      logoUrl: r.brand_logo_url,
      typeLabel: collaboratorTypeLabel(r.type),
      status: r.status,
    })
  }
  return map
}

/** A Space credited as a Collaborator on the public event page (accepted share, active Space).
 *  Local: consumers type the rows structurally (SpaceHostLite); nothing imports the type. */
interface CollaboratorSpace {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

/**
 * The Spaces co-hosting an event, for the PUBLIC "Collaborators" credit on the event page (ADR-834).
 * ACCEPTED shares only — a pending/declined/revoked share NEVER renders publicly (the EC3 leak
 * contract), and a suspended/archived Space drops out too. Oldest acceptance first, so the credit
 * order is stable. FAIL-SAFE: [].
 */
export async function listCollaboratorSpacesForEvent(eventId: string): Promise<CollaboratorSpace[]> {
  if (!eventId) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('event_space_shares')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true })
    const rows = (data ?? []) as ShareRow[]
    if (rows.length === 0) return []
    const spaces = await resolveSpaces(admin, rows.map((r) => r.space_id))
    return rows.flatMap((r) => {
      const space = spaces.get(r.space_id)
      if (!space || space.status !== 'active') return []
      return [{ id: space.id, slug: space.slug, name: space.name, logoUrl: space.logoUrl }]
    })
  } catch {
    return []
  }
}

/** The event's home space id, for the pure approver decision + auto-accept check + the co-host
 *  Business gate. The explicit HOSTING entity (events.host_space_id, ADR-819) wins; else the
 *  placement space (events.space_id). FAIL-SAFE: null on any error. */
export async function eventHomeSpaceId(eventId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from('events')
      .select('space_id, host_space_id')
      .eq('id', eventId)
      .maybeSingle()
    // Root EXCLUDED: a personal event has no home Space, and sharing it as the platform tenant's
    // is exactly the "it said it was under Frequency" report this row came from.
    return resolveHostingSpaceIdFromRow(data as { space_id: string | null; host_space_id: string | null } | null)
  } catch {
    return null
  }
}

/** A single share row by id (typed select), for the action authz path. FAIL-SAFE: null. */
export async function loadShare(id: string): Promise<ShareRow | null> {
  if (!id) return null
  try {
    const { data } = await createAdminClient().from('event_space_shares').select('*').eq('id', id).maybeSingle()
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
    const admin = createAdminClient()
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

// 2026-09-05 (scan2 L9-13): listAcceptedSharesForSpace (accepted shares TO a space) was removed; no
// surface listed them.

/**
 * Pending share requests a TARGET SPACE's steward must act on — a host invited this space to co-host
 * their event. Only rows where the TARGET SPACE is the approver (the host side initiated). Newest first.
 * FAIL-SAFE: [].
 */
export async function listIncomingShareRequestsForSpace(spaceId: string): Promise<IncomingShareRequest[]> {
  if (!spaceId) return []
  try {
    const admin = createAdminClient()
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
    const eventById = new Map((events ?? []).map((e) => [e.id, e]))
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))
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

/**
 * Explain a share target id that did NOT resolve to a Space. The picker can only submit what a search
 * surface returned, and person-named results are easy to misread (a member profile vs the personal or
 * business Space they run), so when the id turns out to be a PROFILE or a CIRCLE the host is told that
 * in plain words instead of a dead-end "not found". FAIL-SAFE: the generic not-found line on any error
 * (a non-uuid id just misses both probes and falls through the same way).
 */
export async function describeMissingShareTarget(id: string): Promise<string> {
  const fallback = 'That Space could not be found. Search again and pick a Space from the list.'
  if (!id) return fallback
  try {
    const admin = createAdminClient()
    const [profileRes, circleRes] = await Promise.all([
      admin.from('profiles').select('id').eq('id', id).maybeSingle(),
      admin.from('circles').select('id').eq('id', id).maybeSingle(),
    ])
    if (profileRes.data) {
      return 'That result is a member, not a Space. A member cannot co-host an event, but a Space they run can. Search for that Space by name. Run a business? Put it on the map with a free Business Space.'
    }
    if (circleRes.data) {
      return 'That result is a Circle, not a Space. An event can only be co-hosted with a Space.'
    }
    return fallback
  } catch {
    return fallback
  }
}
