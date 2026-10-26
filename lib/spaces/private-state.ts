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
