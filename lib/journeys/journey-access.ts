// THE Journey role/tier access seam (ADR-838, Journeys lane J1). ONE resolver answers, for a
// viewer (optionally against one Journey), every capability + allotment question the Journey
// surfaces ask: the creation wizard (lane 2), the editor, the publish chokepoint
// (setJourneyVisibility -> checkJourneyPublish), and the launch/campaign builder (lane 3) all
// consume THIS and never re-derive tier math of their own. Replaces the lane-3 permissive stub.
//
// The access model (owner approved):
//   * Personal FREE     — draft freely, publish 1 (the live 2026-07-18 cap), no cohort Runs,
//     basic drip, no launch campaigns. Enroll allotment 10 active enrollees.
//   * Personal CREW/paid (or a crew+ community steward, for cohorts) — a higher publish cap,
//     cohort Runs (the ADR-252 Circle-host path), unlimited enrollees. Still no Space-grade
//     launch campaigns.
//   * SPACE editor, free Space — publish 1 under the Space, 10 enrollees, no cohorts/launch.
//   * SPACE editor, Business   — publish unlimited under the Space, cohort Runs, launch
//     campaigns, unlimited enrollees.
//   * COLLECTIVE (and Non Profit / Independent, which rank at/above Business on the plan
//     ladder) — everything, top caps.
//   * STAFF (web_role admin/janitor) — everything, no caps.
//
// EVERY quantity comes from PLACEHOLDER_METER_LIMITS via allowanceAt (ADR-837: one map of
// quantities; the rows are journey_publish / journey_enrollees on the tier axis and
// space_journey_publish / space_journey on the plan axis). No number is hardcoded here.
//
// PURE + framework-independent (no Supabase/Next imports), like lib/journeys/publish-limits.ts:
// the caller resolves the IO (the viewer's tier/role, whether they edit the owning Space, the
// Journey row) and passes plain data in. Caps describe the OWNING context's allotment; the
// boolean capabilities describe what THIS viewer may do. Copy follows docs/CONTENT-VOICE.md
// (plain, no em dashes, never narrates the reader's feelings).

import { isPaid, type EntitlementTier } from '@/lib/core/access-matrix'
import {
  atLeastRole,
  isStaff as webIsStaff,
  type CommunityRole,
  type WebRole,
} from '@/lib/core/roles'
import { asSpacePlan } from '@/lib/pricing/plans'
import { allowanceAt } from '@/lib/pricing/feature-meters'

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────

/** The Space context the viewer is acting under, when the Journey belongs to (or is being created
 *  for) a Space. `canEdit` = the viewer is on the Space's team with editor+ standing (resolved by
 *  the caller via the Space role ladder — never inferred here). */
export interface JourneyAccessSpace {
  /** spaces.plan (any raw label; normalized via asSpacePlan). */
  plan: string | null
  /** Does the viewer edit this Space (editor/admin/owner on the Space team)? */
  canEdit: boolean
}

export interface JourneyAccessViewer {
  /** profiles.id, or null when anonymous. */
  profileId: string | null
  /** Community trust role (member < crew < host < guide < mentor). Omitted = 'member'. */
  role?: CommunityRole | null
  /** Staff axis (web_role): admin/janitor hold everything. Omitted = 'none'. */
  webRole?: WebRole | null
  /** Effective billing tier (may carry the beta open-access override). */
  tier?: EntitlementTier | null
  /** The REAL billing tier before any beta override — caps and paid gates read this,
   *  falling back to `tier` (same convention as lib/core/capabilities.ts). */
  realTier?: EntitlementTier | null
  /** The owning Space's plan + the viewer's standing on it, when acting under a Space. */
  space?: JourneyAccessSpace | null
}

/** The Journey being asked about (omit for the "may I create one?" question). `spaceId` null =
 *  a personal Journey; callers must normalize the platform root space to null first (the same
 *  root-is-personal rule as lib/journeys/publish-gate.ts). Pass `authorId` whenever known — the
 *  author's own edit rights hang on it. */
export interface JourneyAccessJourney {
  /** journey_plans.id (informational; no capability keys on it). */
  planId?: string
  /** journey_plans.author_id. */
  authorId?: string | null
  /** journey_plans.space_id, with the root space normalized to null (= personal). */
  spaceId: string | null
}

// ── Output ──────────────────────────────────────────────────────────────────────────────────────

export interface JourneyAccess {
  /** May the viewer create a Journey draft in this context? Drafts are free for any signed-in
   *  member personally; under a Space it takes Space editor standing. */
  canCreate: boolean
  /** May the viewer edit THIS Journey (author, Space editor, or staff)? Equals canCreate when no
   *  Journey is passed (creation context). */
  canEdit: boolean
  /** May the viewer publish this Journey at all? The COUNT check against publishCap stays at the
   *  publish chokepoint (checkJourneyPublish), where the live count is known. */
  canPublish: boolean
  /** May the viewer run cohorts (Runs) of this Journey? */
  canRunCohorts: boolean
  /** The OWNING context's published-Journey allotment. null = unlimited. */
  publishCap: number | null
  /** The owning context's active-enrollee allotment per Journey. null = unlimited. This is the
   *  TIER ceiling; the author-set seat count is journey_plans.enroll_cap (see journeyHasRoom). */
  enrollCap: number | null
  /** May this Journey drip content on a schedule? Basic drip is core: every signed-in tier. */
  dripAllowed: boolean
  /** May the viewer build launch campaigns for this Journey (lane 3)? Paid-Space editors only. */
  launchCampaignsAllowed: boolean
  /** Why the load-bearing capability is missing, when one is. Plain member-facing copy. */
  reason?: string
}

// ── Copy (CONTENT-VOICE: plain, no em dashes, no narrated feelings) ─────────────────────────────

export const JOURNEY_SIGN_IN_REASON = 'Sign in to build and take Journeys.'
export const JOURNEY_NOT_YOURS_REASON = 'Only the author or the Space team can change this Journey.'

/** Copy for a full Journey at the enrollment write path (ADR-838). */
export const JOURNEY_FULL_MESSAGE =
  'This Journey is full. Check back soon, or ask its author to open more spots.'

// ── The resolver ────────────────────────────────────────────────────────────────────────────────

const NO_ACCESS: JourneyAccess = {
  canCreate: false,
  canEdit: false,
  canPublish: false,
  canRunCohorts: false,
  publishCap: 0,
  enrollCap: 0,
  dripAllowed: false,
  launchCampaignsAllowed: false,
  reason: JOURNEY_SIGN_IN_REASON,
}

const STAFF_ACCESS: JourneyAccess = {
  canCreate: true,
  canEdit: true,
  canPublish: true,
  canRunCohorts: true,
  publishCap: null,
  enrollCap: null,
  dripAllowed: true,
  launchCampaignsAllowed: true,
}

/**
 * Resolve what `viewer` may do with Journeys — against one Journey when `journey` is passed, else
 * in the creation context (personal, or under `viewer.space` when provided). PURE and
 * deterministic (safe to `await`; it never does IO). See the module header for the full
 * tier x capability matrix.
 */
export function resolveJourneyAccess(
  viewer: JourneyAccessViewer,
  journey?: JourneyAccessJourney | null,
): JourneyAccess {
  if (!viewer.profileId) return { ...NO_ACCESS }
  if (webIsStaff(viewer.webRole)) return { ...STAFF_ACCESS }

  const realTier: EntitlementTier = viewer.realTier ?? viewer.tier ?? 'free'
  const isAuthor = journey ? !!journey.authorId && journey.authorId === viewer.profileId : false
  // Space context: the Journey is Space-owned, or (creation) the viewer is acting under a Space.
  const spaceOwned = journey ? journey.spaceId != null : viewer.space != null

  if (spaceOwned) {
    const editsSpace = viewer.space?.canEdit === true
    const plan = asSpacePlan(viewer.space?.plan)
    const paidSpace = plan !== 'free'
    const canEdit = editsSpace || isAuthor
    return {
      canCreate: editsSpace,
      canEdit,
      canPublish: canEdit,
      canRunCohorts: canEdit && paidSpace,
      publishCap: allowanceAt('space_journey_publish', plan),
      enrollCap: allowanceAt('space_journey', plan),
      dripAllowed: true,
      launchCampaignsAllowed: canEdit && paidSpace,
      ...(canEdit ? {} : { reason: JOURNEY_NOT_YOURS_REASON }),
    }
  }

  // Personal (root / no-space) Journey. Drafting is free for every signed-in member (ADR-838
  // supersedes the crew-only journey.create wall for DRAFTS; publishing carries the caps).
  // Cohort Runs keep the ADR-252 shape: a paid member or a crew+ community steward hosts them.
  const crewStanding = isPaid(realTier) || atLeastRole(viewer.role ?? 'member', 'crew')
  const canEdit = journey ? isAuthor : true
  return {
    canCreate: true,
    canEdit,
    canPublish: canEdit,
    canRunCohorts: crewStanding,
    publishCap: allowanceAt('journey_publish', realTier),
    enrollCap: allowanceAt('journey_enrollees', realTier),
    dripAllowed: true,
    launchCampaignsAllowed: false,
    ...(canEdit ? {} : { reason: JOURNEY_NOT_YOURS_REASON }),
  }
}

// ── Enrollment seats (the journey_plans.enroll_cap write-path check, ADR-838) ───────────────────

/** Is there room for one more enrollee? `enrollCap` is the author-set seat count
 *  (journey_plans.enroll_cap, or a run's own cap once v3 applies); `activeEnrollmentCount` is the
 *  live count of enrollments not yet completed. Fail-safe: no cap (null) or a nonsense cap (<= 0)
 *  never blocks, and a negative count reads as 0. PURE. */
export function journeyHasRoom(input: {
  enrollCap: number | null
  activeEnrollmentCount: number
}): boolean {
  if (input.enrollCap == null || input.enrollCap <= 0) return true
  return Math.max(0, input.activeEnrollmentCount) < input.enrollCap
}
