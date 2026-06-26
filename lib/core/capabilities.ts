// THE policy layer — one pure function answers "what can this user do here?"
// for a given scope. See docs/CAPABILITIES-AND-MOBILE.md.
//
// Consumed by BOTH:
//   • the SERVER, to ENFORCE — re-check before every mutation, and
//   • CLIENTS (web + future mobile), to RENDER affordances (show/hide).
//
// Capabilities are *UX* for the client and *law* for the server. NEVER trust the
// client's capability set for authorization — the server recomputes and enforces
// (the admin client bypasses RLS; see docs/ARCHITECTURE.md). This module exists
// so both consumers project the SAME policy and never drift.
//
// Framework-independent: no Next/Supabase imports. The caller fetches the inputs
// (role, membership, entity ownership/state) and passes them in. That keeps this
// testable in isolation and reusable from web, mobile, and DB-adjacent code.
//
// The rules below are a faithful first cut of today's scattered checks
// (host_id === me, the host+ admin gate, crew-can-take-tasks). Tune against
// product as the inline-admin work (Phase 1) lands.

import { type CommunityRole, type WebRole, isStaff as webIsStaff, isJanitor as webIsJanitor } from './roles'
import { isPaid, type EntitlementTier } from './access-matrix'
import { type ScopeType } from './stewardship'

export type Capability =
  // circle
  | 'circle.view'
  | 'circle.post'
  | 'circle.editSettings'
  | 'circle.moderate'
  | 'circle.assignTask'
  | 'circle.broadcast'
  // event
  | 'event.editSettings'
  // practice
  | 'practice.editSettings'
  // topical channel (platform-curated — staff only)
  | 'channel.manage'
  // tasks (crew engagement inside a circle)
  | 'task.volunteer'
  | 'task.claim'
  // profile
  | 'profile.edit'
  // structural management (admin-side)
  | 'hub.manage'
  | 'nexus.manage'
  // app
  | 'admin.access'

export type Scope =
  | { kind: 'global' }
  | {
      kind: 'circle'
      circleId: string
      hostId: string | null
      /** The viewer's membership in THIS circle, if any. */
      membership?: { status: string; volunteerRole?: CommunityRole | null } | null
      /** Open, unassigned host tasks in this circle. */
      openTaskCount?: number
      /** True if the viewer is the guide/mentor who oversees this circle's
       *  hub/nexus (computed by the caller — avoids over-granting all guides). */
      viewerManagesParent?: boolean
    }
  | { kind: 'profile'; ownerId: string }
  | { kind: 'channel'; channelId: string }
  | { kind: 'hub'; hubId: string; guideId?: string | null; viewerManagesParent?: boolean }
  | { kind: 'nexus'; nexusId: string; mentorId?: string | null }
  | {
      kind: 'event'
      eventId: string
      hostId: string | null
      /** True if the viewer manages the event's parent scope (e.g. its circle) —
       *  computed by the caller (avoids over-granting). */
      viewerManagesScope?: boolean
    }
  | {
      kind: 'practice'
      practiceId: string
      /** practices.created_by — the practice's owner. */
      ownerId: string | null
      /** True if the viewer manages the practice's parent space (caller-computed). */
      viewerManagesScope?: boolean
    }

export interface Viewer {
  /** profiles.id, or null when anonymous. */
  profileId: string | null
  /** Community TRUST role on the aspirational ladder (member < crew < host <
   *  guide < mentor); 'member' for a signed-in user with no elevation. Gates
   *  circle/hub/nexus leadership and the paid-tier perks. NOT the staff axis. */
  role: CommunityRole
  /** Operational STAFF axis (web_role, ADR-208): 'none' | 'admin' | 'janitor'.
   *  Independent of `role`. Drives admin.access, channel.manage, profile.edit by
   *  a janitor, and the staff override on circle/event leadership. Omitted ⇒ 'none'. */
  webRole?: WebRole | null
  /** Billing entitlement tier. Paid (Crew/Supporter) unlocks the membership-gated
   *  capabilities (e.g. task volunteering). Omitted ⇒ free. */
  tier?: EntitlementTier | null
  /** SCOPED stewardship predicate (P1.6, ADR-218→220): does the viewer hold an
   *  ACTIVE stewardship edge on `(scopeType, scopeId)`? Supplied by the server seam
   *  from the `stewardships` table; OR'd with the legacy leader-FK identity match so
   *  a scoped leader recorded only as an edge (P1.7 direct grants, with no FK) is
   *  still recognized. Omitted ⇒ no edges, i.e. pure FK behavior (unchanged). Because
   *  every leader FK was backfilled to a matching edge (ADR-218) and no edge exists
   *  without an FK yet, this is provably a no-op on today's data. */
  leadsScope?: (scopeType: ScopeType, scopeId: string) => boolean
}

/**
 * Resolve the viewer's capabilities within a scope. Pure and deterministic —
 * same inputs always yield the same set.
 */
export function resolveCapabilities(viewer: Viewer, scope: Scope): Set<Capability> {
  const caps = new Set<Capability>()
  const { profileId } = viewer
  // The STAFF axis (web_role, ADR-208) — INDEPENDENT of the community ladder.
  // 'janitor' = Executive Admin (crown jewels); staff = admin OR janitor (admin
  // shares the operational keys, so it manages any circle/event alongside janitor).
  const isJanitor = webIsJanitor(viewer.webRole)
  const isStaff = webIsStaff(viewer.webRole)

  switch (scope.kind) {
    case 'global': {
      // Staff (admin/janitor) reach the Admin tab. Admin entry is the STAFF axis,
      // not the community ladder (host+ stewardship lives in per-scope caps below).
      if (isStaff) caps.add('admin.access')
      break
    }

    case 'profile': {
      // Owners edit their own profile; janitors may edit any (moderation).
      if (profileId && (scope.ownerId === profileId || isJanitor)) {
        caps.add('profile.edit')
      }
      break
    }

    case 'circle': {
      caps.add('circle.view')

      const isHost =
        (!!profileId && scope.hostId === profileId) ||
        (viewer.leadsScope?.('circle', scope.circleId) ?? false)
      // Leadership over THIS circle: its host (by FK or stewardship edge), platform
      // staff (admin/janitor), or the guide/mentor who manages its parent hub/nexus
      // (caller-computed to avoid granting every guide rights on every circle).
      const leads = isHost || isStaff || scope.viewerManagesParent === true
      const activeMember = scope.membership?.status === 'active' || leads

      if (activeMember) caps.add('circle.post')
      if (leads) {
        caps.add('circle.editSettings')
        caps.add('circle.moderate')
        caps.add('circle.assignTask')
        caps.add('circle.broadcast')
      }

      // Paid (Crew) active members can take on host-assigned tasks when any are open.
      // Task volunteering is a membership perk → gate on the TIER, not the role.
      const openTasks = scope.openTaskCount ?? 0
      if (activeMember && isPaid(viewer.tier) && openTasks > 0) {
        caps.add('task.volunteer')
        caps.add('task.claim')
      }
      break
    }

    case 'channel': {
      // Topical channels are platform-curated (no per-channel owner) — staff only.
      if (isStaff) caps.add('channel.manage')
      break
    }

    case 'hub': {
      const leadsHub =
        (!!profileId && scope.guideId === profileId) ||
        (viewer.leadsScope?.('hub', scope.hubId) ?? false) ||
        scope.viewerManagesParent === true ||
        isJanitor
      if (leadsHub) caps.add('hub.manage')
      break
    }

    case 'nexus': {
      const leadsNexus =
        (!!profileId && scope.mentorId === profileId) ||
        (viewer.leadsScope?.('nexus', scope.nexusId) ?? false) ||
        isJanitor
      if (leadsNexus) caps.add('nexus.manage')
      break
    }

    case 'event': {
      // The event's host, platform staff, or whoever manages its parent scope
      // (e.g. the circle the event belongs to — caller-computed) may edit it.
      const leadsEvent =
        (!!profileId && scope.hostId === profileId) || isStaff || scope.viewerManagesScope === true
      if (leadsEvent) caps.add('event.editSettings')
      break
    }

    case 'practice': {
      // A practice is owned by its creator; the owner, platform staff, or whoever manages
      // its parent space (caller-computed) may edit it.
      const leadsPractice =
        (!!profileId && scope.ownerId === profileId) || isStaff || scope.viewerManagesScope === true
      if (leadsPractice) caps.add('practice.editSettings')
      break
    }
  }

  return caps
}

/** Convenience predicate for render-time checks. */
export function can(caps: ReadonlySet<Capability>, cap: Capability): boolean {
  return caps.has(cap)
}

// ─── Capability GAPS — why is a capability absent? (PB.1g) ─────────────────────
//
// Additive companion to `resolveCapabilities` (whose signature and behavior are
// untouched): for capabilities the viewer does NOT hold in a scope, report the
// actionable reason — the upsell layer renders "join this circle" / "upgrade to
// unlock" / "host a circle to unlock" from it.

export type CapabilityGapReason = 'needs-membership' | 'needs-paid-tier' | 'needs-role'

/**
 * For each capability ABSENT from `resolveCapabilities(viewer, scope)`, the reason
 * it's missing — probed by re-resolving along the cumulative counterfactual ladder
 * **membership → paid tier → role** and attributing each capability to the rung at
 * which it first appears:
 *
 *   • 'needs-membership' — an active membership in the scope would unlock it.
 *   • 'needs-paid-tier'  — the paid tier (Crew/Supporter) would unlock it, assuming
 *     membership (so a free non-member's `task.volunteer` reads 'needs-paid-tier':
 *     the upgrade is the gate the upsell UI sells; joining is its own affordance).
 *   • 'needs-role'       — only stewardship/staff standing unlocks it (e.g.
 *     `circle.editSettings`, `admin.access`).
 *
 * Capabilities unreachable even at the top of the ladder (e.g. another member's
 * `profile.edit` for an anonymous viewer — the real gap is signing in) get no
 * entry. Pure and deterministic, like the resolver it wraps.
 */
export function capabilityGaps(
  viewer: Viewer,
  scope: Scope,
): Partial<Record<Capability, CapabilityGapReason>> {
  const have = resolveCapabilities(viewer, scope)
  const gaps: Partial<Record<Capability, CapabilityGapReason>> = {}

  const attribute = (caps: ReadonlySet<Capability>, reason: CapabilityGapReason) => {
    for (const c of caps) {
      if (!have.has(c) && !(c in gaps)) gaps[c] = reason
    }
  }

  // Rung 1 — an active membership in the scope (circles are the only
  // membership-bearing scope today).
  let scopeAsMember = scope
  if (scope.kind === 'circle' && scope.membership?.status !== 'active') {
    scopeAsMember = { ...scope, membership: { status: 'active' } }
    attribute(resolveCapabilities(viewer, scopeAsMember), 'needs-membership')
  }

  // Rung 2 — the paid tier (Crew/Supporter), on top of membership.
  let viewerPaid = viewer
  if (!isPaid(viewer.tier)) {
    viewerPaid = { ...viewer, tier: 'crew' }
    attribute(resolveCapabilities(viewerPaid, scopeAsMember), 'needs-paid-tier')
  }

  // Rung 3 — elevated standing (probed at the top rung: anything still missing that
  // a mentor + janitor would hold is "role"-gated). 'needs-role' covers BOTH axes —
  // community stewardship (e.g. circle.editSettings) and STAFF (e.g. admin.access,
  // profile.edit-by-janitor) — since the upsell layer treats both as "you need
  // standing you don't have". Probe the apex of each axis together.
  if (viewer.role !== 'mentor' || !webIsJanitor(viewer.webRole)) {
    attribute(
      resolveCapabilities({ ...viewerPaid, role: 'mentor', webRole: 'janitor' }, scopeAsMember),
      'needs-role',
    )
  }

  return gaps
}
