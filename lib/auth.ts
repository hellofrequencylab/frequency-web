// Caller-identity helpers for server actions and server components.
//
// They resolve the *profile* (profiles.id + community_role) for the currently
// authenticated auth user. The profile lookup runs through the session client
// (RLS-respecting): a user reading their own row is covered by the
// "profiles: read own or crew+ reads in-region" policy via its
// `auth_user_id = auth.uid()` clause, so no service-role bypass is needed for
// the single most-trafficked read in the app. This is the anchor of the RLS
// convergence effort (BACKLOG section A) — see ADR-042.
//
// The auth-user fetch and the profile lookup are each wrapped in React `cache()`,
// so when a single render composes several of these helpers (e.g. a page calls
// getMyProfileId() and getViewerGamStats(), plus the layout calls
// getCallerProfile()) they share one `auth.getUser()` round-trip and one profiles
// query instead of repeating them.

import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { applyViewAs } from '@/lib/view-as'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { BETA_OPEN_ACCESS, BETA_GRANTED_TIER } from '@/lib/core/beta'
import { asWebRole, isStaff, type WebRole } from '@/lib/core/roles'
import { communityRoleToLevel, levelRank, type CommunityLevel } from '@/lib/core/stewardship'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

/** The authenticated auth user (or null), memoized per request. */
export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * The caller's profile core fields (or null), memoized per request.
 *
 * `community_role` is the *effective* role: for a janitor using "view as" it is
 * the impersonated (downgraded) role, so the capability resolver and server
 * enforcement preview faithfully. `realRole` is always the true DB role — use it
 * to gate the view-as control itself. See lib/view-as.ts.
 *
 * `webRole` is the operational STAFF axis (profiles.web_role, ADR-208) —
 * INDEPENDENT of community_role. It is `realWebRole` normally, but is stripped to
 * 'none' while previewing a downgraded role via "view as", so a janitor previewing
 * as a member faithfully loses the staff surfaces too. `realWebRole` is the true
 * DB value (use it to gate staff-only affordances irrespective of preview).
 *
 * NOTE: `web_role` is read through the untyped cast — the generated
 * lib/database.types.ts is stale until migration 20260613000050 applies.
 */
const resolveCaller = cache(
  async (): Promise<{
    id: string
    community_role: CommunityRole
    realRole: CommunityRole
    communityLevel: CommunityLevel
    webRole: WebRole
    realWebRole: WebRole
    membershipTier: EntitlementTier
    realMembershipTier: EntitlementTier
  } | null> => {
    const user = await getCachedUser()
    if (!user) return null

    // Own-row read: RLS lets a signed-in user read their own profile, so the
    // session client suffices (no service-role bypass). web_role + community_level
    // are selected via the untyped cast (columns not yet in the generated types).
    const supabase = await createClient()
    const { data } = await (supabase)
      .from('profiles')
      .select('id, community_role, community_level, web_role, membership_tier')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!data) return null
    const realRole = (data.community_role ?? 'member') as CommunityRole
    const realWebRole = asWebRole(data.web_role)
    const effectiveRole = await applyViewAs(realRole)
    // View-as is a DOWNGRADE preview of the trust ladder; when it's active the staff
    // axis is stripped too, so the preview faithfully hides staff surfaces.
    const previewing = effectiveRole !== realRole
    // The derived global Community level (ADR-218, floored by community_role so a
    // global role never regresses; live in prod). Under a view-as DOWNGRADE we floor
    // it to the impersonated role's level so a janitor-viewing-as-member faithfully
    // loses elevated standing — mirrors the webRole strip above. (ADR-221.)
    const realLevel = asCommunityLevel(data.community_level, realRole)
    const previewLevel = communityRoleToLevel(effectiveRole)
    return {
      id: data.id as string,
      community_role: effectiveRole,
      realRole,
      communityLevel: previewing
        ? COMMUNITY_LEVEL_FLOOR(realLevel, previewLevel)
        : realLevel,
      webRole: previewing ? 'none' : realWebRole,
      realWebRole,
      // Billing entitlement (orthogonal to role). The check constraint guarantees the union.
      // BETA: while open access is on, every signed-in member is granted the paid Crew tier so
      // all premium features unlock (lib/core/beta.ts). The DB value is untouched — flip the flag
      // off to restore real tiers. Staff (web_role) is unaffected; admin surfaces stay locked.
      membershipTier: BETA_OPEN_ACCESS
        ? BETA_GRANTED_TIER
        : ((data.membership_tier ?? 'free') as EntitlementTier),
      // The TRUE DB tier, never beta-overridden. The creation gates read this so the
      // free-beta upgrade popup still fires for a genuinely free member (ADR-414).
      realMembershipTier: (data.membership_tier ?? 'free') as EntitlementTier,
    }
  },
)

/** Narrow the untyped `profiles.community_level` read to a CommunityLevel, never
 *  below the floor the legacy `community_role` contributes (additive — ADR-218/221). */
function asCommunityLevel(
  raw: unknown,
  floorRole: CommunityRole | null | undefined,
): CommunityLevel {
  const floor = communityRoleToLevel(floorRole)
  const known: readonly CommunityLevel[] = ['member', 'crew', 'host', 'guide', 'mentor']
  const v = known.includes(raw as CommunityLevel) ? (raw as CommunityLevel) : 'member'
  return COMMUNITY_LEVEL_FLOOR(v, floor)
}

/** The HIGHER of two levels — used to floor (never downgrade) the standing. */
function COMMUNITY_LEVEL_FLOOR(a: CommunityLevel, b: CommunityLevel): CommunityLevel {
  return levelRank(a) >= levelRank(b) ? a : b
}

/**
 * The caller's profile id + effective community role + STAFF web_role, or null if
 * not signed in / no profile row. Use when an action needs to make a role-based
 * authz decision. `webRole` is the effective staff axis (preview-aware, ADR-208).
 */
export async function getCallerProfile(): Promise<{
  id: string
  community_role: CommunityRole
  /** The derived global Community level (ADR-218): the highest stewardship edge a
   *  person holds anywhere, floored by `community_role` so a global role never
   *  regresses, and floored to the impersonated role under a view-as downgrade. The
   *  surface matrix sources its community standing from this (ADR-221). */
  communityLevel: CommunityLevel
  webRole: WebRole
  membershipTier: EntitlementTier
  /** The TRUE DB tier, never beta-overridden (ADR-414) — the creation gates read this. */
  realMembershipTier: EntitlementTier
} | null> {
  const c = await resolveCaller()
  if (!c) return null
  return {
    id: c.id,
    community_role: c.community_role,
    communityLevel: c.communityLevel,
    webRole: c.webRole,
    membershipTier: c.membershipTier,
    realMembershipTier: c.realMembershipTier,
  }
}

/**
 * The caller's REAL community role (ignoring any active "view as" override), or
 * null. Use to decide whether to show the janitor-only view-as control, and to
 * gate the action that sets it.
 */
export async function getRealCallerRole(): Promise<CommunityRole | null> {
  return (await resolveCaller())?.realRole ?? null
}

/** The caller's profile id, or null if not signed in / no profile row. */
export async function getMyProfileId(): Promise<string | null> {
  return (await resolveCaller())?.id ?? null
}

/**
 * True when the caller is platform staff — admin or janitor on the STAFF axis
 * (web_role, ADR-208), INDEPENDENT of the community ladder. Drives the site-wide
 * staff affordances (e.g. the "Edit" button on any entity), which let staff manage
 * content they don't personally own. Preview-aware (a janitor viewing as a member
 * reads false). Cheap (shares the cached profile lookup).
 */
export async function isPlatformStaff(): Promise<boolean> {
  return isStaff((await resolveCaller())?.webRole)
}

/**
 * The caller's profile id, or redirect. Use in actions/pages that must not
 * proceed for anonymous or un-onboarded users.
 * - no session  -> /sign-in
 * - no profile  -> /onboarding
 */
export async function requireProfileId(): Promise<string> {
  const user = await getCachedUser()
  if (!user) redirect('/sign-in')

  const caller = await resolveCaller()
  if (!caller) redirect('/onboarding')
  return caller.id
}
