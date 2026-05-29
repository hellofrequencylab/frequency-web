// Caller-identity helpers for server actions and server components.
//
// Both resolve the *profile* id (profiles.id) for the currently authenticated
// auth user. They use the admin client for the profile lookup because RLS on
// `profiles` would otherwise require an active session policy for the read.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** The caller's profile id, or null if not signed in / no profile row. */
export async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * The caller's profile id, or redirect. Use in actions/pages that must not
 * proceed for anonymous or un-onboarded users.
 * - no session  → /sign-in
 * - no profile  → /onboarding
 */
export async function requireProfileId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')
  return profile.id as string
}
