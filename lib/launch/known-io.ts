// WHAT THE PERSON ALREADY HAS (the read half): their own profile, read under their own session. Server-only. Never
// throws: a failed read just means the form has one fewer thing to fill from.

import { createClient } from '@/lib/supabase/server'
import type { KnownProfile } from './known'

export async function loadKnownProfile(profileId: string): Promise<KnownProfile | null> {
  try {
    const db = await createClient()
    const { data } = await db.from('profiles').select('display_name, bio, website').eq('id', profileId).maybeSingle()
    return data ? { displayName: data.display_name, bio: data.bio, website: data.website } : null
  } catch {
    return null
  }
}
