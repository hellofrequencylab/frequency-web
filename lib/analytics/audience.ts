import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { getMyProfileId, getRealCallerWebRole } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { hasConsent } from '@/lib/consent/consent'
import { createAdminClient } from '@/lib/supabase/admin'

interface RequestAnalyticsAudience { allowed: boolean; staff: boolean }

/** Current verified request only. View-as must never make real staff into analytics traffic. */
export const currentAnalyticsAudience = cache(async (): Promise<RequestAnalyticsAudience> => {
  const profileId = await getMyProfileId()
  if (!profileId) {
    // A session cookie with an unresolved/absent profile is unknown, not anonymous.
    // Inspect names only; a stale or chunked token must not bypass account consent.
    const jar = await cookies()
    const pendingAccount = jar.getAll().some(({ name }) => /^sb-[^=;\s]+-auth-token(?:\.\d+)?$/.test(name))
    return { allowed: !pendingAccount, staff: false }
  }
  if (isStaff(await getRealCallerWebRole())) return { allowed: false, staff: true }
  const db = createAdminClient()
  const { data, error } = await db.from('team_members').select('profile_id').eq('profile_id', profileId).maybeSingle()
  if (error) return { allowed: false, staff: false } // Unknown must not permanently mark a browser as staff.
  if (data) return { allowed: false, staff: true }
  return { allowed: await hasConsent(profileId, 'analytics'), staff: false }
})

export async function currentViewerAllowsAnalytics(): Promise<boolean> {
  return (await currentAnalyticsAudience()).allowed
}
