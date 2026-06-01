// Caller-identity helpers for server actions and server components.
//
// They resolve the *profile* (profiles.id + community_role) for the currently
// authenticated auth user, using the admin client for the profile lookup because
// RLS on `profiles` would otherwise require an active-session policy for the read.
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
import { createAdminClient } from '@/lib/supabase/admin'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

/** The authenticated auth user (or null), memoized per request. */
export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** The caller's profile core fields (or null), memoized per request. */
const resolveCaller = cache(
  async (): Promise<{ id: string; community_role: CommunityRole } | null> => {
    const user = await getCachedUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    return data as { id: string; community_role: CommunityRole } | null
  },
)

/**
 * The caller's profile id + community role, or null if not signed in / no
 * profile row. Use when an action needs to make a role-based authz decision.
 */
export async function getCallerProfile(): Promise<{ id: string; community_role: CommunityRole } | null> {
  return resolveCaller()
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
