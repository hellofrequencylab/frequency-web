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

import { type CommunityRole, type WebRole, isStaff as webIsStaff, isJanitor as webIsJanitor, atLeastRole } from './roles'
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
  // journey (the guided plan a member authors — its core editable functions on the admin rail, ADR-515 Phase 6)
  | 'journey.editSettings'
  // creation gates (global) — who may AUTHOR a new entity. Real-Crew (paid) or a
  // community steward (crew+ on the trust ladder). Everyone else is sold the
  // one-tap free-beta upgrade. See docs/RESONANCE-FEED-ARCHITECTURE.md §"Access".
  | 'event.create'
  | 'circle.create'
  | 'journey.create'
  | 'practice.create'
  // topical channel (platform-curated — staff only)
  | 'channel.manage'
  // tasks (crew engagement inside a circle)
  | 'task.volunteer'
  | 'task.claim'
  // profile
  | 'profile.edit'
  // account — every signed-in member manages their OWN account (the "You" personal
  // settings: appearance, notifications, connections, …). Resolved on the GLOBAL scope
  // for any authenticated viewer (self-account only); it gates the standardized admin
  // bar's personal "You" section (docs/ADMIN-RAIL.md Phase 4). UX on the client; each
  // underlying settings action still enforces auth server-side via the (main) layout.
  | 'account.manage'
  // spotlight — a member's opt-in public mini-site (docs/NAMING.md "Spotlight page").
  // OFF for everyone by default. `enable` = a Crew+ OWNER may turn their OWN Spotlight
  // on (self-serve setup); `manage` = the owner of an enabled Spotlight (or a janitor)
  // may build/arrange it; `view` = a Crew+ viewer may see a published Spotlight page.
  // All three are resolved in the 'profile' scope below.
  | 'spotlight.enable'
  | 'spotlight.manage'
  | 'spotlight.view'
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
  | {
      kind: 'profile'
      ownerId: string
      /** The OWNER's Spotlight flags (read from their profiles.meta by the server
       *  seam). Opt-in is owner state, not a viewer-global flag. Omitted ⇒ off. */
      ownerSpotlightEnabled?: boolean
      ownerSpotlightPublished?: boolean
    }
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
  | {
      kind: 'journey'
      journeyId: string
      /** journey_plans.author_id — the Journey's author (owner). */
      authorId: string | null
      /** True if the viewer manages the Journey's parent scope (caller-computed). */
      viewerManagesScope?: boolean
    }
  | {
      // A Space (lib/spaces/*) is a scope KIND for placement + the admin rail, but it lives OUTSIDE
      // the community Capability world: its authority is the per-Space role ladder + spaceFunctionAccess
      // (SpaceRole + spaces.entitlements/feature_roles), never a `Capability`. So this scope carries only
      // its id and the resolver grants an EMPTY capability set for it (the Space rail gates on spaceFns,
      // carried on the AdminBar detail, not on this set). See lib/admin/entities/registry.ts SPACE_SURFACES.
      kind: 'space'
      /** The Space's DB id (spaces.id). */
      id: string
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
  /** The REAL billing tier from the DB, BEFORE any beta open-access override
   *  (lib/core/beta.ts grants everyone Crew while the beta is open, which `tier`
   *  reflects). The CREATION gates read this so the free-beta upgrade popup still
   *  fires for a genuinely free member during the beta — "real Crew to create".
   *  Omitted ⇒ falls back to `tier` (i.e. no beta override in play). */
  realTier?: EntitlementTier | null
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
      // Every signed-in member may manage their OWN account (the "You" personal settings).
      // Self-account only — an anonymous viewer (no profileId) never holds it, so the
      // admin bar's personal section is fail-closed for signed-out visitors (Phase 4).
      if (profileId) caps.add('account.manage')

      // Staff (admin/janitor) reach the Admin tab. Admin entry is the STAFF axis,
      // not the community ladder (host+ stewardship lives in per-scope caps below).
      if (isStaff) caps.add('admin.access')

      // CREATION gates: who may author a new event / circle / journey / practice.
      // Real-Crew (paid tier) OR a community steward (crew+ on the trust ladder).
      // We read `realTier` (the DB tier BEFORE the beta open-access override) so a
      // genuinely free member still meets the upgrade popup during the beta —
      // "real Crew to create, free one-tap" (ADR-414). Staff create too (they run
      // the platform). Plain free members get none of these, by design.
      const realTier = viewer.realTier ?? viewer.tier
      if (isPaid(realTier) || atLeastRole(viewer.role, 'crew') || isStaff) {
        caps.add('event.create')
        caps.add('circle.create')
        caps.add('journey.create')
        caps.add('practice.create')
      }
      break
    }

    case 'profile': {
      // All require sign-in (the outer `profileId &&`, preserved from the original gate
      // so the gap-prober's hypothetical anon+staff never grants them).
      const isOwner = !!profileId && scope.ownerId === profileId
      // profile.edit (basic moderation: name/bio): the owner, or platform STAFF
      // (admin OR janitor) — admins get basic profile control, janitors get it too.
      if (isOwner || (!!profileId && isStaff)) {
        caps.add('profile.edit')
      }

      // Spotlight (opt-in public mini-site). MANAGE goes to the owner of an ENABLED
      // Spotlight (or a janitor, for moderation) — turning it on is an admin/owner
      // act recorded in the owner's meta, never inferred from the viewer.
      if ((isOwner || (!!profileId && isJanitor)) && scope.ownerSpotlightEnabled === true) {
        caps.add('spotlight.manage')
      }
      // VIEW is a Crew+ entitlement read from the REAL tier (pre beta-override,
      // ADR-414) so the beta's open-access grant can't widen who reaches the public
      // page — the SAME gate shape as the creation caps. Whether a given page is
      // actually PUBLISHED is enforced at the route; this caps the affordance.
      const spotlightTier = viewer.realTier ?? viewer.tier
      const spotlightCrewPlus = isPaid(spotlightTier) || atLeastRole(viewer.role, 'crew') || isStaff
      if (spotlightCrewPlus) {
        caps.add('spotlight.view')
      }
      // ENABLE: a Crew+ OWNER may turn their OWN Spotlight on — the self-serve switch
      // that replaces the janitor-only toggle for setup (the owner still publishes
      // explicitly). Same Crew+ bar as view / the creation caps (realTier, so the beta
      // open-access grant can't widen who gets the affordance). A janitor can still flip
      // it for anyone via the admin path (spotlight.manage / member-admin).
      if (isOwner && spotlightCrewPlus) {
        caps.add('spotlight.enable')
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

    case 'journey': {
      // A Journey is owned by its author; the author, platform staff, or whoever manages its parent
      // scope (caller-computed) may edit its settings. Mirrors the event / practice cases precisely.
      const leadsJourney =
        (!!profileId && scope.authorId === profileId) || isStaff || scope.viewerManagesScope === true
      if (leadsJourney) caps.add('journey.editSettings')
      break
    }

    case 'space': {
      // A Space's authority is its per-Space role ladder + spaceFunctionAccess (lib/spaces/*), NOT a
      // community Capability — so the community resolver grants NOTHING here. The standardized admin rail
      // gates the Space's surfaces on spaceFns (SpaceRole + entitlements), carried on the AdminBar detail,
      // never on this empty set. Present as an explicit case so this switch stays exhaustive (no default).
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

  // Rung 2 — the paid tier (Crew/Supporter), on top of membership. Bump BOTH the
  // effective tier and the real tier so the creation gates (which read realTier)
  // attribute to 'needs-paid-tier' — that is exactly the rung the upgrade popup sells.
  let viewerPaid = viewer
  if (!isPaid(viewer.tier) || !isPaid(viewer.realTier ?? viewer.tier)) {
    viewerPaid = { ...viewer, tier: 'crew', realTier: 'crew' }
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
