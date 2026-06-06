import { getVeraConfig } from '@/lib/ai/vera/config'
import { createAdminClient } from '@/lib/supabase/admin'

export type VeraConfig = Awaited<ReturnType<typeof getVeraConfig>>

export type FeaturedRow = {
  id: string
  body: string
  featured_at: string
  author_display_name: string | null
  author_handle: string | null
  author_avatar_url: string | null
}

// "Manage Vera" data for the /admin/vera page and the in-place Platform·Vera module
// (ADR-149): the live vera_config (voice + induction copy) plus Vera's auto-curated
// splash feed (the janitor can veto picks).
export async function getVeraAdminData() {
  const [cfg, featuredRaw] = await Promise.all([
    getVeraConfig(),
    createAdminClient().rpc('public_featured_posts', { _limit: 12 }),
  ])
  const featured = (featuredRaw.data ?? []) as FeaturedRow[]
  return { cfg, featured }
}
