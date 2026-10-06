import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// A member's PUBLIC profile by handle (LIVE-716, GET /api/v1/profile/{handle}). Service role, the
// same read the web's /people/[handle] page makes: the profiles select policy only lets a member
// read people in their own region, and a public profile is public. So the column list IS the gate:
// public fields only, never phone, city, email, location or meta. An inactive profile is null.

const PUBLIC_COLUMNS =
  'id, handle, display_name, avatar_url, header_image_url, bio, website, community_role, membership_tier, created_at'

export interface PublicProfileRow {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  header_image_url: string | null
  bio: string | null
  website: string | null
  community_role: string | null
  membership_tier: string | null
  created_at: string | null
}

export async function getPublicProfileByHandle(handle: string): Promise<PublicProfileRow | null> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select(PUBLIC_COLUMNS)
    .eq('handle', handle)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error('profile read failed')
  return (data as PublicProfileRow | null) ?? null
}
