// Per-Space ENTITLEMENTS + CAPABILITIES (ENTITY-SPACES-BUILD §0, Epic 0.1; ENTITY-SPACES-SYSTEM
// §1.4 / §3.2). Two concerns, both PURE + testable (no Supabase/Next imports except the membership
// seam at the very bottom):
//   1. ENTITLEMENTS — what the Space's PLAN grants. Read from the `spaces.entitlements` jsonb
//      ({ "crm": true, "email": true, … }). DEFAULT-DENY: a missing key (or a non-`true` value, or
//      a malformed blob) reads as OFF. A new capability is one jsonb key, never a code change (P4).
//   2. CAPABILITIES — what a PERSON may do on a Space. Combines the Space OWNER
//      (spaces.owner_profile_id) with their `space_members` role into a small capability set
//      (canEditProfile / canManageMembers / canInvite). The owner is all-powerful on their own
//      Space; member roles map onto the ladder (lib/spaces/membership.ts).
//
// `spaces.entitlements` is not in the generated DB types yet, so the Space the resolver hands us
// may not carry it on the typed `Space` interface — these readers accept the field loosely
// (`SpaceLike`) and reach it without a typed cast on the row (ADR-246). Keeping the entitlement
// readers pure (a plain object in, a boolean out) makes them trivially unit-testable.

import { atLeastSpaceRole, getSpaceMembership, type SpaceRole } from './membership'
import { isJanitor, type WebRole } from '@/lib/core/roles'

// ── Entitlements (pure: jsonb in, boolean out, default-deny) ─────────────────────────────

/** A normalized entitlement map: capability key -> granted. */
export type Entitlements = Record<string, boolean>

/** The minimum shape these readers need from a Space: who owns it and its raw entitlements blob.
 *  `entitlements` is `unknown` because the column isn't in the generated types yet (ADR-246) — it
 *  arrives as whatever the jsonb holds, and is normalized here. */
export interface SpaceLike {
  ownerProfileId?: string | null
  entitlements?: unknown
  /** The Space id — only needed by getSpaceCapabilities to look up membership. */
  id?: string
}

/** Normalize the raw `spaces.entitlements` jsonb to a clean `{ key: boolean }` map. DEFAULT-DENY
 *  is the whole contract: anything that isn't an object of booleans collapses to {} (or drops the
 *  bad keys), so a missing/garbage blob grants NOTHING. Only an explicit `true` counts as granted;
 *  any other value for a key reads as `false`. */
export function spaceEntitlements(space: SpaceLike | null | undefined): Entitlements {
  const raw = space?.entitlements
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Entitlements = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value === true
  }
  return out
}

/** Whether a Space's plan grants a capability. DEFAULT-DENY: a missing key, a non-`true` value, a
 *  malformed blob, or a null Space all read as `false`. The one entitlement gate primitive. */
export function spaceHasEntitlement(space: SpaceLike | null | undefined, key: string): boolean {
  return spaceEntitlements(space)[key] === true
}

// ── Per-Space autonomy slider (Resonance Engine Phase 3 · ADR-384) ───────────────────────────
// How much the playbook engine may DO on its own for a Space. The single source of truth the
// execute + Today paths consult to decide whether an `auto`-tier playbook actually auto-runs, or is
// downgraded to a Suggest a human approves. FAIL-CLOSED: the default everywhere (a missing/garbage
// value, a null Space, the platform root) is `suggest_only` until an owner/operator explicitly
// raises it, so nothing auto-executes by surprise. It is read off the same `spaces.entitlements`
// jsonb (key `crm.autonomy`), so a new setting is one jsonb key, not a schema change (ADR-246).

/** The autonomy levels, low to high. `suggest_only` = Vera drafts, a human approves everything (the
 *  safe default). `safe_auto` = the in-product, reversible `auto` playbooks (e.g. the streak save)
 *  may run on their own; member-facing sends still stay Suggest (outbound is never auto, ever). */
export type AutonomyLevel = 'suggest_only' | 'safe_auto'

/** The platform (root) default + the per-Space default: suggest only, until explicitly raised. */
export const DEFAULT_AUTONOMY: AutonomyLevel = 'suggest_only'

const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ['suggest_only', 'safe_auto']

/** Normalize an arbitrary value to an AutonomyLevel, FAIL-CLOSED to `suggest_only`. PURE. Only an
 *  exact, known string raises it; anything else (a typo, a number, null) reads as suggest_only. */
export function asAutonomyLevel(value: unknown): AutonomyLevel {
  return typeof value === 'string' && (AUTONOMY_LEVELS as readonly string[]).includes(value)
    ? (value as AutonomyLevel)
    : DEFAULT_AUTONOMY
}

/**
 * The autonomy level for a Space. PURE: reads the `crm.autonomy` key off the entitlements blob.
 * FAIL-CLOSED: a null Space, a missing key, or a malformed value all read as `suggest_only`. This is
 * the single gate the execute + Today paths consult; raising it is the only way an `auto` playbook
 * actually auto-runs for that Space.
 */
export function spaceAutonomyLevel(space: SpaceLike | null | undefined): AutonomyLevel {
  if (!space) return DEFAULT_AUTONOMY
  const raw = space.entitlements
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_AUTONOMY
  return asAutonomyLevel((raw as Record<string, unknown>)['crm.autonomy'])
}

/**
 * Whether a Space (or the platform root, when no Space is passed) may AUTO-EXECUTE an `auto`-tier
 * playbook. PURE. True ONLY when the resolved autonomy level is `safe_auto`. Everything else (the
 * default, a missing setting, a null Space, the platform root) is false, so the engine downgrades
 * even `auto` playbooks to Suggest. Member-facing/outbound playbooks are never auto regardless; this
 * gate only governs the in-product reversible ones.
 */
export function autoExecutionAllowed(space: SpaceLike | null | undefined): boolean {
  return spaceAutonomyLevel(space) === 'safe_auto'
}

// ── AI-depth capability ladder (Resonance Engine Phase 6 · ADR-387) ──────────────────────────
// What DEPTH of the Resonance Engine a Space's plan unlocks, surfaced contextually at the ceiling.
// Three additive entitlement keys read off the SAME `spaces.entitlements` jsonb (no schema change,
// ADR-246), each DEFAULT-DENY through the existing spaceHasEntitlement primitive:
//   • crm.playbooks    — governed AUTO-EXECUTION of safe playbooks + larger action volume + the
//                        advanced (resonance / engagement-depth) segment facets. Practitioner+.
//   • crm.resonance    — read-only resonance scoring beyond the free wedge (the Resonance tab, the
//                        match shortlist as suggestions). The mid rung.
//   • crm.resonance_ai — predictive churn/advocacy ALERTS + the full Resonance Graph + managed
//                        matching. The top rung.
//
// THE WEDGE IS NEVER PAYWALLED. A Space with NONE of these keys still gets the free wedge: Vera
// Today in suggest-only, summaries, and read-only scoring. So a missing key NEVER locks a member
// out of the loop. It only withholds the deeper, operator-facing automation. This is the
// resonate-not-extract posture: the value that helps a member is free; the leverage that scales an
// operator is the paid lever.
//
// FAIL-CLOSED: a null Space, a missing key, or a malformed blob all read as the free wedge (no
// depth). `crm.autonomy` (Phase 3 · ADR-384) is INTACT and orthogonal: it is the per-Space dial for
// HOW MUCH the engine acts on its own; these keys are WHAT DEPTH the plan unlocks. Auto-execution
// requires BOTH (the depth key crm.playbooks AND the autonomy level safe_auto).

/** The AI-depth ladder, low to high. `wedge` is the free, never-paywalled floor (Today suggest-only
 *  + summaries + read-only scoring). `playbooks` adds governed auto-execution + advanced segments.
 *  `resonance` adds the read-only resonance surface. `resonance_ai` adds predictive alerts + the full
 *  Resonance Graph + managed matching. */
export type AiDepthTier = 'wedge' | 'playbooks' | 'resonance' | 'resonance_ai'

/** The free floor every Space gets, with or without an AI-depth entitlement. Never paywalled. */
export const FREE_AI_DEPTH: AiDepthTier = 'wedge'

/** The AI-depth entitlement keys, in ladder order (low to high). Each is one `spaces.entitlements`
 *  jsonb key, read DEFAULT-DENY by spaceHasEntitlement. */
export const AI_DEPTH_KEYS = {
  /** Governed auto-execution of safe playbooks + larger volume + advanced segment facets. */
  playbooks: 'crm.playbooks',
  /** Read-only resonance scoring + the match shortlist beyond the free wedge. */
  resonance: 'crm.resonance',
  /** Predictive alerts + the full Resonance Graph + managed matching (the top rung). */
  resonanceAi: 'crm.resonance_ai',
} as const

/** Every AI-depth capability key (the values), for iteration / validation. */
export const AI_DEPTH_CAPABILITY_KEYS: readonly string[] = [
  AI_DEPTH_KEYS.playbooks,
  AI_DEPTH_KEYS.resonance,
  AI_DEPTH_KEYS.resonanceAi,
]

/** The numeric rank of each AI-depth tier on the ladder (the free wedge is the floor at 0). */
const AI_DEPTH_RANK: Record<AiDepthTier, number> = {
  wedge: 0,
  playbooks: 1,
  resonance: 2,
  resonance_ai: 3,
}

/**
 * The AI-depth tier a Space's plan unlocks. PURE: reads the three depth keys off the entitlements
 * blob through the existing DEFAULT-DENY primitive. FAIL-CLOSED: a null Space, no keys, or a
 * malformed blob all read as the free `wedge` (never a lockout, never an over-grant). The TOP key
 * present wins, so a Space with `crm.resonance_ai` reads `resonance_ai` even if the lower keys are
 * absent (the plan map sets them cumulatively, but the reader does not depend on that).
 */
export function spaceAiDepth(space: SpaceLike | null | undefined): AiDepthTier {
  if (spaceHasEntitlement(space, AI_DEPTH_KEYS.resonanceAi)) return 'resonance_ai'
  if (spaceHasEntitlement(space, AI_DEPTH_KEYS.resonance)) return 'resonance'
  if (spaceHasEntitlement(space, AI_DEPTH_KEYS.playbooks)) return 'playbooks'
  return FREE_AI_DEPTH
}

/** Does a Space reach AT LEAST an AI-depth tier? PURE, fail-closed. The free `wedge` is always met
 *  (it is the floor every Space gets), so `spaceMeetsAiDepth(space, 'wedge')` is always true. */
export function spaceMeetsAiDepth(space: SpaceLike | null | undefined, min: AiDepthTier): boolean {
  return AI_DEPTH_RANK[spaceAiDepth(space)] >= AI_DEPTH_RANK[min]
}

/** May a Space run GOVERNED AUTO-EXECUTION of safe playbooks (the Practitioner+ lever)? PURE,
 *  fail-closed. This is the DEPTH half only: it requires the `crm.playbooks` entitlement. The
 *  AUTONOMY half (Phase 3 · ADR-384, `autoExecutionAllowed`) still gates HOW MUCH actually runs;
 *  auto-execution needs BOTH (this AND `safe_auto`). The free wedge never reaches this. */
export function spaceCanRunPlaybooks(space: SpaceLike | null | undefined): boolean {
  return spaceHasEntitlement(space, AI_DEPTH_KEYS.playbooks)
}

/** May a Space see the read-only RESONANCE surface (the Resonance tab + the match shortlist as
 *  suggestions), beyond the free wedge's read-only scoring? PURE, fail-closed. The top rung
 *  (`crm.resonance_ai`) implies it. */
export function spaceCanSeeResonance(space: SpaceLike | null | undefined): boolean {
  return spaceMeetsAiDepth(space, 'resonance')
}

/** May a Space use the FULL Resonance Graph + predictive alerts + managed matching (the top rung)?
 *  PURE, fail-closed. Requires the `crm.resonance_ai` entitlement. */
export function spaceCanUseResonanceAi(space: SpaceLike | null | undefined): boolean {
  return spaceHasEntitlement(space, AI_DEPTH_KEYS.resonanceAi)
}

/** May a Space use the ADVANCED (resonance / engagement-depth) segment facets in its audience
 *  builder, beyond the free tag/consent facets? PURE, fail-closed. Rides the `crm.playbooks` lever
 *  (advanced segments are part of the Practitioner+ depth, per the tier ladder). The audience
 *  grammar still ACCEPTS the facets for everyone (additive, never a throw); this gates whether the
 *  builder SURFACES them as a paid capability. */
export function spaceCanUseAdvancedSegments(space: SpaceLike | null | undefined): boolean {
  return spaceCanRunPlaybooks(space)
}

// ── Capabilities (owner + member role -> a capability set) ───────────────────────────────

/** What a person may do on a Space. Derived from owner + their space-member role; consumed by the
 *  profile/settings surfaces (the profile agents read this). */
export interface SpaceCapabilities {
  /** Is the viewer the Space owner? (spaces.owner_profile_id). */
  isOwner: boolean
  /** Is the viewer a Space admin? (owner, OR an active `admin` member). */
  isAdmin: boolean
  /** Their effective space role (null if neither owner nor a member). Owners report 'admin'. */
  role: SpaceRole | null
  /** May they edit the Space profile (copy, theme, layout)? owner / admin / editor. */
  canEditProfile: boolean
  /** May they add/remove/role-change members? owner / admin only. */
  canManageMembers: boolean
  /** May they invite teammates? owner / admin / moderator. */
  canInvite: boolean
}

const NO_CAPABILITIES: SpaceCapabilities = {
  isOwner: false,
  isAdmin: false,
  role: null,
  canEditProfile: false,
  canManageMembers: false,
  canInvite: false,
}

/** Build the capability set from the resolved owner-ness + an effective space role. Pure (no IO),
 *  so it's unit-testable on its own and reused by getSpaceCapabilities. An owner is treated as
 *  'admin' (the top rung) regardless of any member row. */
export function spaceCapabilitiesFor(isOwner: boolean, memberRole: SpaceRole | null): SpaceCapabilities {
  const role: SpaceRole | null = isOwner ? 'admin' : memberRole
  const isAdmin = isOwner || atLeastSpaceRole(role, 'admin')
  return {
    isOwner,
    isAdmin,
    role,
    canEditProfile: isOwner || atLeastSpaceRole(role, 'editor'),
    canManageMembers: isAdmin,
    canInvite: isOwner || atLeastSpaceRole(role, 'moderator'),
  }
}

/** The full capability set for a person on a Space — the IO entry point the profile agents call.
 *  Folds the Space OWNER (spaces.owner_profile_id) together with their `space_members` role (only
 *  an ACTIVE membership grants authority; invited/suspended do not). FAIL-SAFE: an anonymous
 *  caller or a lookup error yields the no-capabilities set. */
export async function getSpaceCapabilities(
  space: SpaceLike | null | undefined,
  profileId: string | null | undefined,
): Promise<SpaceCapabilities> {
  if (!space || !profileId) return NO_CAPABILITIES
  const isOwner = !!space.ownerProfileId && space.ownerProfileId === profileId
  let memberRole: SpaceRole | null = null
  if (space.id) {
    const membership = await getSpaceMembership(space.id, profileId)
    // Only an ACTIVE membership confers a role (invited/suspended carry none).
    if (membership && membership.status === 'active') memberRole = membership.role
  }
  // An anonymous-to-this-space caller (not owner, no active membership) gets nothing.
  if (!isOwner && !memberRole) return NO_CAPABILITIES
  return spaceCapabilitiesFor(isOwner, memberRole)
}

// ── Manage access: "can manage" (owner/admin/editor) vs "staff viewing" (a janitor, not a member) ──

/** Whether a viewer may open a Space's owner back-end, and in which mode. TWO distinct grants:
 *  - `canManage`  — the viewer may EDIT (owner / admin / editor; the canEditProfile gate, unchanged).
 *  - `staffViewing` — the viewer is platform STAFF previewing a Space they do NOT manage (a janitor
 *    who is not the owner / an active editor+ member). VIEW only: every owner WRITE action stays
 *    gated on canEditProfile server-side, so a staff viewer can read the surfaces but never write
 *    through them. The two are mutually exclusive (a janitor who genuinely owns/edits this Space
 *    reads as `canManage`, not `staffViewing`).
 *
 *  An owner surface renders when `canManage || staffViewing`, and 404s for everyone else (no
 *  existence leak). Only the EXECUTIVE admin (janitor / web_role) gets the staff preview — a Site
 *  Admin does not reach into another operator's owner back-end. */
export interface SpaceManageAccess {
  /** May the viewer edit (owner / admin / editor). The existing canEditProfile authority. */
  canManage: boolean
  /** Is the viewer a janitor PREVIEWING a Space they do not manage (read-only)? */
  staffViewing: boolean
}

const NO_MANAGE_ACCESS: SpaceManageAccess = { canManage: false, staffViewing: false }

/** Resolve a viewer's owner-back-end access for a Space. Combines the per-Space capability gate
 *  (canEditProfile, the unchanged write authority) with the platform STAFF axis (web_role): a
 *  janitor who is NOT an editor+ of the Space is granted a READ-ONLY staff preview. FAIL-SAFE: an
 *  anonymous caller (or a missing Space) yields no access. This is the entry the three owner
 *  surfaces gate their RENDER on; the WRITE actions keep gating on canEditProfile independently, so
 *  the staff preview never confers a write. */
export async function resolveSpaceManageAccess(
  space: SpaceLike | null | undefined,
  profileId: string | null | undefined,
  webRole: WebRole | null | undefined,
): Promise<SpaceManageAccess> {
  if (!space) return NO_MANAGE_ACCESS
  const caps = await getSpaceCapabilities(space, profileId)
  if (caps.canEditProfile) return { canManage: true, staffViewing: false }
  // Not an editor of this Space: an Executive Admin (janitor) still gets a read-only preview.
  return { canManage: false, staffViewing: isJanitor(webRole) }
}
