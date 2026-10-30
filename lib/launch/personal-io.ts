import 'server-only'

// THE PERSONAL SPOTLIGHT STEP (LIVE-1918), the IO half. Reads the person's own profile and saves the three answers
// through the one profile writer (settings/profile/actions), so there is no second writer. Read and written under the
// person's own session.

import { updateProfile } from '@/app/(main)/settings/profile/actions'
import { createClient } from '@/lib/supabase/server'
import { personalProfileWrite, type StoredProfile } from './personal'
import type { SpotlightAnswers } from './spotlight-step'

export async function loadStoredProfile(profileId: string): Promise<StoredProfile | null> {
  try {
    const db = await createClient()
    const { data } = await db.from('profiles').select('display_name, handle, bio, website, phone, city').eq('id', profileId).maybeSingle()
    return data ? { displayName: data.display_name, handle: data.handle, bio: data.bio, website: data.website, phone: data.phone, city: data.city } : null
  } catch {
    return null
  }
}

/** Saves the answers onto the profile. True when saved; false when there was nothing to save onto or the writer refused. */
export async function savePersonalSpotlight(profileId: string, answers: SpotlightAnswers): Promise<boolean> {
  const write = personalProfileWrite(await loadStoredProfile(profileId), answers)
  if (!write) return false
  try {
    await updateProfile(write)
    return true
  } catch {
    return false
  }
}
