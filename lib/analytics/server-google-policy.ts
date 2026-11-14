import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyticsAllowed, parseConsentChoice, CONSENT_COOKIE, CONSENT_REGION_COOKIE } from '@/lib/consent/cookie-consent'
import { hasConsent } from '@/lib/consent/consent'
import { asWebRole, isStaff } from '@/lib/core/roles'

/** Request-backed Google mirrors use the verified account, never an attributed actor or preview role. */
export async function requestGoogleAllowed(): Promise<boolean> {
  try {
    const jar = await cookies()
    if (!analyticsAllowed({
      choice: parseConsentChoice(jar.get(CONSENT_COOKIE)?.value),
      priorConsentRegion: jar.get(CONSENT_REGION_COOKIE)?.value === '1',
    })) return false

    const session = await createClient()
    const { data: { user }, error: authError } = await session.auth.getUser()
    // Supabase reports an ordinary anonymous request with this explicit missing-session error.
    // Transport/auth failures are unknown account evidence and must never become anonymous consent.
    if (authError) return authError.name === 'AuthSessionMissingError' && !user
    if (!user) return true

    const { data: profile, error: profileError } = await session.from('profiles')
      .select('id, web_role').eq('auth_user_id', user.id).maybeSingle()
    if (profileError || !profile?.id) return false
    if (isStaff(asWebRole(profile.web_role))) return false
    if (profile.web_role !== null && profile.web_role !== 'none' && profile.web_role !== 'moderator') return false

    // This bounded read is intentionally service-side: session RLS may hide the staff row.
    // A role preview cannot strip actual team membership, and a failed read is not non-staff proof.
    const { data: team, error: teamError } = await createAdminClient().from('team_members')
      .select('profile_id').eq('profile_id', profile.id).maybeSingle()
    if (teamError || team) return false
    return await hasConsent(profile.id, 'analytics')
  } catch {
    return false
  }
}
