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

import { type CommunityRole, atLeastRole } from './roles'
import { isPaid, type EntitlementTier } from './access-matrix'

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

export interface Viewer {
  /** profiles.id, or null when anonymous. */
  profileId: string | null
  /** Global community role; 'member' for a signed-in user with no elevation. */
  role: CommunityRole
  /** Billing entitlement tier. Paid (Crew/Supporter) unlocks the membership-gated
   *  capabilities (e.g. task volunteering). Omitted ⇒ free. */
  tier?: EntitlementTier | null
}

/**
 * Resolve the viewer's capabilities within a scope. Pure and deterministic —
 * same inputs always yield the same set.
 */
export function resolveCapabilities(viewer: Viewer, scope: Scope): Set<Capability> {
  const caps = new Set<Capability>()
  const { profileId, role } = viewer
  const isJanitor = role === 'janitor'
  // Platform staff = admin or janitor. Admin sits just below janitor on the ladder
  // and shares its operational keys (it lacks only the most sensitive ones), so it
  // manages any circle alongside janitor.
  const isStaff = atLeastRole(role, 'admin')

  switch (scope.kind) {
    case 'global': {
      // Host+ can reach the Admin tab; janitor gets deep admin everywhere.
      if (atLeastRole(role, 'host')) caps.add('admin.access')
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

      const isHost = !!profileId && scope.hostId === profileId
      // Leadership over THIS circle: its host, platform staff (admin/janitor), or
      // the guide/mentor who manages its parent hub/nexus (caller-computed to avoid
      // granting every guide rights on every circle).
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
        scope.viewerManagesParent === true ||
        isJanitor
      if (leadsHub) caps.add('hub.manage')
      break
    }

    case 'nexus': {
      const leadsNexus = (!!profileId && scope.mentorId === profileId) || isJanitor
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
  }

  return caps
}

/** Convenience predicate for render-time checks. */
export function can(caps: ReadonlySet<Capability>, cap: Capability): boolean {
  return caps.has(cap)
}
