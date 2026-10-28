// WHICH SPACE THE LAUNCH IS FOR (the read half). The Spaces the signed-in person owns, read under their own session,
// with just what the choice needs: the name, the handle and whether the Spotlight is published. Server-only.

import { readSpaceSpotlight } from '@/lib/spaces/spotlight'
import { createClient } from '@/lib/supabase/server'
import type { OwnedSpace } from './space-choice'

export async function listOwnedSpaces(profileId: string): Promise<OwnedSpace[]> {
  const db = await createClient()
  const { data } = await db.from('spaces').select('id, slug, name, preferences').eq('owner_profile_id', profileId).eq('status', 'active').order('created_at')
  return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, name: r.name, spotlightLive: readSpaceSpotlight(r.preferences).published }))
}
