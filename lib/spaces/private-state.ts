import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'
import { log } from '@/lib/log'
import { parseSpaceCoachProfile, type SpaceCoachProfile } from './coach-profile'

/** The service-role-only row that holds website drafts and the Executive Overview (SCAN-827). */
export async function readSpacePrivateState(spaceId: string): Promise<{
  websiteEditor: unknown
  programOverview: string
}> {
  const { data, error } = await createAdminClient()
    .from('space_private_state')
    .select('website_editor, program_overview')
    .eq('space_id', spaceId)
    .maybeSingle()
  if (error) throw error
  return {
    websiteEditor: data?.website_editor ?? null,
    programOverview: typeof data?.program_overview === 'string' ? data.program_overview : '',
  }
}

// authz-delegated: callers resolve fresh Space editor access before reading or writing.
// Isolated from public Space preferences; missing migration fails closed, never falls back.
export async function loadSpaceCoachProfile(spaceId: string): Promise<{ available: true; profile: SpaceCoachProfile } | { available: false }> {
  try {
    const { data, error } = await createAdminClient().from('space_private_state')
      .select('coach_profile').eq('space_id', spaceId).maybeSingle()
    if (error) throw error
    return { available: true, profile: parseSpaceCoachProfile((data as { coach_profile?: unknown } | null)?.coach_profile) }
  } catch {
    log.warn('space.coach_profile.read_unavailable', { spaceId })
    return { available: false }
  }
}
// authz-delegated: server actions resolve fresh canEditProfile for this Space before any write.
export async function writeSpaceCoachProfile(spaceId: string, profile: SpaceCoachProfile | null): Promise<boolean> {
  try {
    // Only supplied columns participate in the conflict update. Never replace editor or overview.
    const db = createAdminClient()
    const { error } = await db.from('space_private_state').upsert({ space_id: spaceId, coach_profile: profile as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: 'space_id' })
    if (error) throw error
    return true
  } catch {
    log.warn('space.coach_profile.write_unavailable', { spaceId })
    return false
  }
}

// authz-delegated: fresh Space editor authorization is required before every call.
export async function loadSpaceDiscoveryConsent(spaceId: string): Promise<{ available: boolean; consent: import('./discovery-consent').SpaceDiscoveryConsent | null }> {
  try {
    const { parseDiscoveryConsent } = await import('./discovery-consent')
    const { data, error } = await createAdminClient().from('space_private_state').select('discovery_consent').eq('space_id', spaceId).maybeSingle()
    if (error) throw error
    return { available: true, consent: parseDiscoveryConsent((data as { discovery_consent?: unknown } | null)?.discovery_consent) }
  } catch {
    log.warn('space.discovery_consent.read_unavailable', { spaceId })
    return { available: false, consent: null }
  }
}
// Narrow write never reads/rewrites coach_profile, website_editor or program_overview. With `expectedId`
// (the consent id the caller read, or null for none) the write only lands if the stored consent is still
// that one, so a stale grant cannot overwrite a revocation that raced it. Without it, a plain upsert.
export async function writeSpaceDiscoveryConsent(spaceId: string, consent: import('./discovery-consent').SpaceDiscoveryConsent, expectedId?: string | null): Promise<boolean> {
  try {
    const db = createAdminClient()
    const value = consent as unknown as Json
    const updated_at = new Date().toISOString()
    if (expectedId === undefined) {
      const { error } = await db.from('space_private_state').upsert({ space_id: spaceId, discovery_consent: value, updated_at }, { onConflict: 'space_id' })
      if (error) throw error
      return true
    }
    const guard = db.from('space_private_state').update({ discovery_consent: value, updated_at }).eq('space_id', spaceId)
    const { data, error } = await (expectedId === null ? guard.is('discovery_consent', null) : guard.eq('discovery_consent->>id', expectedId)).select('space_id')
    if (error) throw error
    if (data && data.length > 0) return true
    if (expectedId !== null) return false
    // No row yet: a concurrent first write loses on the unique key instead of overwriting.
    const { error: insertError } = await db.from('space_private_state').insert({ space_id: spaceId, discovery_consent: value, updated_at })
    if (insertError) throw insertError
    return true
  } catch {
    log.warn('space.discovery_consent.write_unavailable', { spaceId })
    return false
  }
}
