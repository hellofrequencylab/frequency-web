import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// A member's email address lives in `auth.users`, NOT in `public.profiles`. There is no
// `profiles.email` column and there never has been — the link is `profiles.auth_user_id`, and the
// address is read with the service role via `auth.admin.getUserById`.
//
// This matters more than a naming quibble because of how PostgREST fails: selecting a column that
// does not exist is a request-level error (42703), not a null field. The whole row comes back as
// null, taking every OTHER column in the same select with it. So `.select('id, is_demo, email')`
// does not return a profile with a missing email — it returns NO PROFILE, and the caller's
// "member not found" branch fires for every signed-in member. Five call sites had drifted onto the
// non-existent column and were silently dead in exactly that way.
//
// The lookup is inlined at roughly a dozen sites across events, comms, rewards, and cron. This is
// the shared version; prefer it over a fresh inline copy, and never reach for `profiles.email`.

/** The account email for a profile id, or null when the profile, its auth user, or the email is
 *  missing. FAIL-SAFE: never throws, so a caller composing a checkout or a notification can fall
 *  back rather than break. */
export async function profileAccountEmail(profileId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    const authUserId = (profile as { auth_user_id?: string | null } | null)?.auth_user_id
    if (!authUserId) return null
    const { data } = await admin.auth.admin.getUserById(authUserId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}
