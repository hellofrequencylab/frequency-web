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
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { applyViewAs } from '@/lib/view-as'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { asWebRole, isStaff, type WebRole } from '@/lib/core/roles'

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
    webRole: WebRole
    realWebRole: WebRole
    membershipTier: EntitlementTier
  } | null> => {
    const user = await getCachedUser()
    if (!user) return null

    // Own-row read: RLS lets a signed-in user read their own profile, so the
    // session client suffices (no service-role bypass). web_role is selected via
    // the untyped cast (column not yet in the generated types).
    const supabase = await createClient()
    const { data } = await (supabase as unknown as SupabaseClient)
      .from('profiles')
      .select('id, community_role, web_role, membership_tier')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!data) return null
    const realRole = (data.community_role ?? 'member') as CommunityRole
    const realWebRole = asWebRole(data.web_role)
    const effectiveRole = await applyViewAs(realRole)
    // View-as is a DOWNGRADE preview of the trust ladder; when it's active the staff
    // axis is stripped too, so the preview faithfully hides staff surfaces.
    const previewing = effectiveRole !== realRole
    return {
      id: data.id as string,
      community_role: effectiveRole,
      realRole,
      webRole: previewing ? 'none' : realWebRole,
      realWebRole,
      // Billing entitlement (orthogonal to role). The check constraint guarantees the union.
      membershipTier: (data.membership_tier ?? 'free') as EntitlementTier,
    }
  },
)

/**
 * The caller's profile id + effective community role + STAFF web_role, or null if
 * not signed in / no profile row. Use when an action needs to make a role-based
 * authz decision. `webRole` is the effective staff axis (preview-aware, ADR-208).
 */
export async function getCallerProfile(): Promise<{
  id: string
  community_role: CommunityRole
  webRole: WebRole
  membershipTier: EntitlementTier
} | null> {
  const c = await resolveCaller()
  if (!c) return null
  return { id: c.id, community_role: c.community_role, webRole: c.webRole, membershipTier: c.membershipTier }
}

/**
 * The caller's REAL community role (ignoring any active "view as" override), or
 * null. Use to decide whether to show the janitor-only view-as control, and to
 * gate the action that sets it.
 */
export async function getRealCallerRole(): Promise<CommunityRole | null> {
  return (await resolveCaller())?.realRole ?? null
}

/**
 * The caller's REAL staff web_role (ignoring any active "view as" downgrade), or
 * null. The true STAFF axis (ADR-208) — use it to gate the staff-only controls
 * themselves irrespective of preview.
 */
export async function getRealCallerWebRole(): Promise<WebRole | null> {
  return (await resolveCaller())?.realWebRole ?? null
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
