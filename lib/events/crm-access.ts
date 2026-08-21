import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { asWebRole, isStaff } from '@/lib/core/roles'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { normalizeSpaceType, isConsoleSpaceType } from '@/lib/spaces/types'
import { isPersonalMemberSpace } from '@/lib/events/event-share'
import { resolveHostingSpaceIdFromRow } from './host-space'

// EVENT CRM ACCESS TIERS (ADR-836, owner-ruled). The upsell seam between personal and business
// accounts on an event's Message Attendees surface. One pure resolver decides what a viewer may
// DO with the attendee list; the event CRM actions enforce it server-side (the authority) and
// the UI renders the same decision.
//
// THE TIERS (for a viewer the manage gate already admitted — host, personal cohost, or a
// steward of the event's host Space):
//   staff     — platform staff (web_role admin/janitor). Full access always.
//   business  — the viewer manages the event's host Space (resolveHostingSpaceId, the
//               ADR-819 resolution) AND that Space is a real Business / Non Profit Space
//               (never the platform root, never a member's personal-mirror space, ADR-834).
//               The attendee list is a marketing base: message any time, any channel.
//   personal  — a personal host or cohost with no business Space behind them. Full contact
//               management BEFORE + DURING the event; after the event ends the list stays
//               VISIBLE (roster + metrics, "tracked and visible to both") but messaging LOCKS
//               except ONE action: re-invite the list to another event the viewer hosts.
//
// The metrics rule: every tier that can open the surface can SEE the roster + metrics; only
// business/staff can ACT on them past the lock (message/export beyond the re-invite).
//
// BETA POSTURE (recorded in ADR-836): this lock enforces LIVE, not beta-soft. The lib/pricing
// beta convention (featureAllowed short-circuits to grant while billing is off; teases hidden,
// ADR-466/782) governs PLAN-axis paywalls on existing usage. This is an account-structure
// access split that no billing flag can flip, and creating a Business Space is free, so there
// is nothing to paywall. Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

export type EventCrmTier = 'staff' | 'business' | 'personal'

/** What the event row contributes to the decision. `hostSpaceId` is the ADR-819 hosting
 *  resolution ALREADY applied by the caller: resolveHostingSpaceId (null = personally or
 *  platform hosted). Times are the anchor's own columns (recurrence kept simple, owner ruling:
 *  the anchor's ends_at, or starts_at plus a day when ends_at is null). */
export interface EventCrmAccessEvent {
  id: string
  hostSpaceId: string | null
  startsAt: string | null
  endsAt: string | null
}

/** The viewer facts the pure resolver needs (the IO loader below assembles them). */
export interface EventCrmViewerFacts {
  /** Platform staff on the STAFF axis (profiles.web_role admin/janitor, ADR-208). */
  staff: boolean
  /** The viewer manages the event's host Space AND that Space is a real Business / Non Profit
   *  Space (console type, not root, not a personal-mirror space per ADR-834's identity rule). */
  hostSpaceSteward: boolean
}

export interface ResolveEventCrmAccessInput {
  viewerProfileId: string | null
  event: EventCrmAccessEvent
  caps: EventCrmViewerFacts
  /** The host Space's billing plan when known. Carried for future refinement; the tier splits
   *  on ACCOUNT TYPE (owner ruling: Business/Non Profit stewardship), never on the plan, so it
   *  does not change the decision today. */
  hostSpacePlan?: string | null
  now?: Date
}

export interface EventCrmAccess {
  tier: EventCrmTier
  /** The roster stays readable for every tier that can open the surface. Always true: the lock
   *  never hides the list ("tracked and visible to both"). */
  canViewRoster: true
  /** Event + attendee metrics stay readable for every tier. Always true, same ruling. */
  canViewMetrics: true
  /** Free-form outreach (DM, email, Dispatch) is allowed right now. */
  canMessage: boolean
  /** The one post-lock action: invite this list to another event the viewer hosts/cohosts. */
  canReinvite: boolean
  /** When free-form messaging locks for a personal-tier viewer (ISO instant). Null = never
   *  (business/staff, or an event with no dates to end on). */
  locksAt: string | null
  /** True once a personal-tier viewer is at or past locksAt. */
  locked: boolean
}

// ── Copy (voice canon: one plain sentence, one link, no dark patterns) ────────────────────

/** The one quiet upsell line shown on locked actions. Links to the Space creation flow. */
export const EVENT_CRM_UPSELL_LINE = 'Message this list any time with a Business Space.'
export const EVENT_CRM_UPSELL_HREF = '/spaces/new'

/** The locked-state explanation shown in the Message Attendees surface + composer. */
export const EVENT_CRM_LOCKED_MESSAGE =
  'This event has ended, so new messages to this list are locked. You can still invite everyone to your next event.'

/** The typed refusal the server actions return when a locked personal-tier viewer tries a
 *  free-form send. One message everywhere, ending on the upsell line. */
export function eventCrmLockedError(): string {
  return `${EVENT_CRM_LOCKED_MESSAGE} ${EVENT_CRM_UPSELL_LINE}`
}

// ── The pure seam ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** When free-form messaging locks for the personal tier: the anchor's ends_at, else starts_at
 *  plus a day (the simple recurrence-safe rule, owner ruling; the day of slack also absorbs the
 *  wall-clock-as-UTC storage skew). Null when the event has no usable dates: with no way to
 *  know it ended, the lock never engages (fail-open on a data gap, not on authorization). PURE. */
export function eventCrmLocksAt(event: Pick<EventCrmAccessEvent, 'startsAt' | 'endsAt'>): string | null {
  const ends = event.endsAt ? Date.parse(event.endsAt) : NaN
  if (Number.isFinite(ends)) return new Date(ends).toISOString()
  const starts = event.startsAt ? Date.parse(event.startsAt) : NaN
  if (Number.isFinite(starts)) return new Date(starts + DAY_MS).toISOString()
  return null
}

/**
 * The entitlement decision for a viewer of an event's Message Attendees / CRM surface. PURE:
 * the caller (or the IO loader below) resolves the facts. The caller is assumed to have passed
 * the manage gate already ('event.editSettings' or an accepted cohost); this seam decides what
 * that viewer may DO, never who gets in.
 */
export function resolveEventCrmAccess(input: ResolveEventCrmAccessInput): EventCrmAccess {
  const now = input.now ?? new Date()
  const tier: EventCrmTier = input.caps.staff
    ? 'staff'
    : input.caps.hostSpaceSteward
      ? 'business'
      : 'personal'

  if (tier !== 'personal') {
    // Business/staff: the list is a marketing base. Message any time, before/during/after.
    return {
      tier,
      canViewRoster: true,
      canViewMetrics: true,
      canMessage: true,
      canReinvite: true,
      locksAt: null,
      locked: false,
    }
  }

  const locksAt = eventCrmLocksAt(input.event)
  const locked = locksAt != null && now.getTime() >= Date.parse(locksAt)
  return {
    tier,
    canViewRoster: true,
    canViewMetrics: true,
    canMessage: !locked,
    // Re-invite is always available: before the lock it is redundant with full messaging,
    // after the lock it is the ONE action left.
    canReinvite: true,
    locksAt,
    locked,
  }
}

// ── IO: assemble the facts for the signed-in viewer ───────────────────────────────────────

interface EventRow {
  id: string
  host_id: string | null
  space_id: string | null
  host_space_id: string | null
  starts_at: string | null
  ends_at: string | null
}

interface HostSpaceRow {
  id: string
  type: string | null
  plan: string | null
  name: string | null
  brand_name: string | null
  slug: string | null
  owner_profile_id: string | null
}

/** Platform staff on the STAFF axis. Fail-closed (mirrors lib/messages/scoped-dm). */
async function isStaffProfile(profileId: string | null): Promise<boolean> {
  if (!profileId) return false
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('web_role').eq('id', profileId).maybeSingle()
    return isStaff(asWebRole((data as { web_role: string | null } | null)?.web_role))
  } catch {
    return false
  }
}

/** Does the viewer manage this host Space, and is it a REAL Business / Non Profit Space? The
 *  stewardship leg is the same space capability the manage gate delegates through
 *  (getSpaceCapabilities canEditProfile, lib/core/load-capabilities); the "real business" leg is
 *  the ADR-834 rule: console type (never root) and not a member's personal-mirror space. The
 *  personal-mirror check fails OPEN on missing owner facts, exactly like the share gate (a UX
 *  tiering decision, not a security boundary: the manage gate still decided who got in). */
async function resolveHostSpaceStewardship(
  viewerProfileId: string | null,
  hostSpaceId: string | null,
): Promise<{ steward: boolean; plan: string | null }> {
  if (!viewerProfileId || !hostSpaceId) return { steward: false, plan: null }
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('spaces')
      .select('id, type, plan, name, brand_name, slug, owner_profile_id')
      .eq('id', hostSpaceId)
      .maybeSingle()
    const space = data as HostSpaceRow | null
    if (!space) return { steward: false, plan: null }

    // A real console Space only: 'root' (the platform host) never confers business tier.
    if (!isConsoleSpaceType(normalizeSpaceType(space.type))) return { steward: false, plan: space.plan }

    // A member's personal-mirror space is not a business account (ADR-834's identity rule).
    let ownerDisplayName: string | null = null
    let ownerHandle: string | null = null
    if (space.owner_profile_id) {
      const { data: owner } = await admin
        .from('profiles')
        .select('display_name, handle')
        .eq('id', space.owner_profile_id)
        .maybeSingle()
      ownerDisplayName = (owner as { display_name: string | null } | null)?.display_name ?? null
      ownerHandle = (owner as { handle: string | null } | null)?.handle ?? null
    }
    if (
      isPersonalMemberSpace({
        type: space.type,
        name: space.name,
        brandName: space.brand_name,
        slug: space.slug,
        ownerDisplayName,
        ownerHandle,
      })
    ) {
      return { steward: false, plan: space.plan }
    }

    const spaceCaps = await getSpaceCapabilities(
      { id: space.id, ownerProfileId: space.owner_profile_id },
      viewerProfileId,
    )
    return { steward: spaceCaps.canEditProfile, plan: space.plan }
  } catch {
    return { steward: false, plan: null }
  }
}

/**
 * Resolve the signed-in viewer's event CRM access for one event. The one IO front door both the
 * server actions (the authority) and the manage-page sections call; cache() dedupes the reads
 * within a render. FAIL-SAFE: an unreadable event resolves as a personal-tier event with no
 * dates, i.e. visible and unlocked; the ACTION gates ('event.editSettings' / cohost) still
 * decide who can call anything at all.
 */
export const loadEventCrmAccess = cache(async (eventId: string): Promise<EventCrmAccess> => {
  const viewerProfileId = await getMyProfileId()

  let event: EventRow | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select('id, host_id, space_id, host_space_id, starts_at, ends_at')
      .eq('id', eventId)
      .maybeSingle()
    event = data as EventRow | null
  } catch {
    event = null
  }

  // 🔴 Root EXCLUDED: this id decides who inherits CRM access to the event's ATTENDEES through
  // Space stewardship. With the root stamp, a steward of the platform tenant inherited it on every
  // personal event. Operators still reach it — through the explicit staff check below, which is
  // where that authority belongs and where it can be seen.
  const hostSpaceId = await resolveHostingSpaceIdFromRow(event)
  const [staff, hostSpace] = await Promise.all([
    isStaffProfile(viewerProfileId),
    resolveHostSpaceStewardship(viewerProfileId, hostSpaceId),
  ])

  return resolveEventCrmAccess({
    viewerProfileId,
    event: {
      id: eventId,
      hostSpaceId,
      startsAt: event?.starts_at ?? null,
      endsAt: event?.ends_at ?? null,
    },
    caps: { staff, hostSpaceSteward: hostSpace.steward },
    hostSpacePlan: hostSpace.plan,
  })
})

// ── IO: the re-invite target list + validation ────────────────────────────────────────────

/** An upcoming event the viewer may invite a list to (they host it or cohost it). */
export interface ReinviteTarget {
  id: string
  slug: string
  title: string
  startsAt: string | null
}

interface TargetRow {
  id: string
  slug: string | null
  title: string | null
  starts_at: string | null
}

function toTarget(r: TargetRow): ReinviteTarget | null {
  if (!r.id || !r.slug || !r.title) return null
  return { id: r.id, slug: r.slug, title: r.title, startsAt: r.starts_at }
}

/** The accepted-cohost event ids for a profile. Fail-safe to empty. */
async function listCohostedEventIds(profileId: string): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('event_cohosts')
      .select('event_id')
      .eq('profile_id', profileId)
      .eq('status', 'accepted')
    return ((data ?? []) as { event_id: string | null }[])
      .map((r) => r.event_id)
      .filter((id): id is string => !!id)
  } catch {
    return []
  }
}

const TARGET_COLS = 'id, slug, title, starts_at'
const MAX_TARGETS = 12

/**
 * The signed-in viewer's upcoming published events (hosted or cohosted), soonest first, for the
 * re-invite picker. Excludes the event whose list is being re-invited. Fail-safe to empty.
 */
export async function listMyReinviteTargets(excludeEventId: string): Promise<ReinviteTarget[]> {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) return []
  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const cohostedIds = await listCohostedEventIds(viewerProfileId)

    const hostedRead = admin
      .from('events')
      .select(TARGET_COLS)
      .eq('host_id', viewerProfileId)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(MAX_TARGETS)
    const cohostedRead =
      cohostedIds.length > 0
        ? admin
            .from('events')
            .select(TARGET_COLS)
            .in('id', cohostedIds)
            .eq('status', 'published')
            .eq('is_cancelled', false)
            .gte('starts_at', nowIso)
            .order('starts_at', { ascending: true })
            .limit(MAX_TARGETS)
        : Promise.resolve({ data: [] as unknown })
    const results = await Promise.all([hostedRead, cohostedRead])

    const byId = new Map<string, ReinviteTarget>()
    for (const res of results) {
      for (const row of ((res.data ?? []) as TargetRow[])) {
        const t = toTarget(row)
        if (t && t.id !== excludeEventId) byId.set(t.id, t)
      }
    }
    return [...byId.values()]
      .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
      .slice(0, MAX_TARGETS)
  } catch {
    return []
  }
}

/**
 * Validate a re-invite target server-side (never trust the picker): the event must exist, be
 * published, not cancelled, still upcoming, and the viewer must host or cohost it. Returns the
 * target or null (fail-closed).
 */
export async function resolveReinviteTarget(
  viewerProfileId: string,
  targetEventId: string,
): Promise<ReinviteTarget | null> {
  if (!viewerProfileId || !targetEventId) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select(`${TARGET_COLS}, host_id, status, is_cancelled`)
      .eq('id', targetEventId)
      .maybeSingle()
    const row = data as (TargetRow & { host_id: string | null; status: string | null; is_cancelled: boolean | null }) | null
    if (!row) return null
    if ((row.status ?? 'published') !== 'published' || row.is_cancelled) return null
    if (!row.starts_at || Date.parse(row.starts_at) < Date.now()) return null

    if (row.host_id !== viewerProfileId) {
      const { data: cohost } = await admin
        .from('event_cohosts')
        .select('id')
        .eq('event_id', targetEventId)
        .eq('profile_id', viewerProfileId)
        .eq('status', 'accepted')
        .maybeSingle()
      if (!cohost) return null
    }
    return toTarget(row)
  } catch {
    return null
  }
}
