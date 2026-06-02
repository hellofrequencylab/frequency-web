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
 */
const resolveCaller = cache(
  async (): Promise<{ id: string; community_role: CommunityRole; realRole: CommunityRole } | null> => {
    const user = await getCachedUser()
    if (!user) return null

    // Own-row read: RLS lets a signed-in user read their own profile, so the
    // session client suffices (no service-role bypass).
    const supabase = await createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!data) return null
    const realRole = (data.community_role ?? 'member') as CommunityRole
    return { id: data.id as string, community_role: await applyViewAs(realRole), realRole }
  },
)

/**
 * The caller's profile id + effective community role, or null if not signed in /
 * no profile row. Use when an action needs to make a role-based authz decision.
 */
export async function getCallerProfile(): Promise<{ id: string; community_role: CommunityRole } | null> {
  return resolveCaller()
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
