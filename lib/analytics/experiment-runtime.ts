import 'server-only'
import { cookies } from 'next/headers'
import { analyticsAllowed, parseConsentChoice, CONSENT_COOKIE, CONSENT_REGION_COOKIE } from '@/lib/consent/cookie-consent'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId, getRealCallerWebRole } from '@/lib/auth'
import { hasConsent } from '@/lib/consent/consent'
import { isStaff } from '@/lib/core/roles'
import { isExperimentKey, type ExperimentKey, type ExperimentVariant } from './experiments'

async function rpc(name: string, args: Record<string, unknown>) {
  const db = createAdminClient()
  const invoke = (db.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>).bind(db)
  const result = await invoke(name, args)
  if (result.error) throw new Error('Experiment data unavailable')
  return result.data
}

/** Staff membership is checked without view-as, which deliberately strips staff UI capabilities. */
async function eligibleMember(profileId: string): Promise<boolean> {
  try {
    const jar = await cookies()
    if (!analyticsAllowed({ choice: parseConsentChoice(jar.get(CONSENT_COOKIE)?.value), priorConsentRegion: jar.get(CONSENT_REGION_COOKIE)?.value === '1' })) return false
  } catch { return false }
  if (isStaff(await getRealCallerWebRole())) return false
  const db = createAdminClient()
  const { data, error } = await db.from('team_members').select('profile_id').eq('profile_id', profileId).maybeSingle()
  if (error || data) return false
  return hasConsent(profileId, 'analytics')
}

/** Signed-in non-staff audience allowed by browser policy AND account settings. No assignment is an exposure. */
export async function memberExperiment(key: ExperimentKey): Promise<{ id: string; variant: ExperimentVariant } | null> {
  try {
    if (!isExperimentKey(key)) return null
    const profile = await getCallerProfile()
    if (!profile || !(await eligibleMember(profile.id))) return null
    const data = await rpc('analytics_experiment_assign', { _key: key, _profile: profile.id })
    if (!data || typeof data !== 'object') return null
    const row = data as Record<string, unknown>
    return typeof row.id === 'string' && (row.variant === 'control' || row.variant === 'treatment') ? { id: row.id, variant: row.variant } : null
  } catch { return null }
}

/** Caller owns their exposure. The server never accepts a profile or a variant from the client. */
export async function exposeMemberExperiment(id: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || !(await eligibleMember(profileId))) return
  await rpc('analytics_experiment_expose', { _experiment: id, _profile: profileId })
}

/** Invoked only after an authoritative ledger write. No client outcome route exists. */
export async function recordExperimentOutcomes(event: string, profileId: string | null): Promise<void> {
  if (!profileId || event !== 'event.rsvp') return
  try {
    const caller = await getMyProfileId()
    if (caller !== profileId || !(await eligibleMember(profileId))) return
    await rpc('analytics_experiment_outcome', { _event: event, _profile: profileId })
  } catch { /* A measurement failure must not affect the completed member action. */ }
}
