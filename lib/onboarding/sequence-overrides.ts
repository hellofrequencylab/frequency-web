import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SequenceSplash } from './beta-sequences'

// DB override layer for the code-first onboarding sequences (build §9.1). Merged
// over the code splash at render so the owner can edit splash copy without a deploy.
// `sequence_overrides` predates the generated types — loosely-typed client.
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export async function getSplashOverride(slug: string): Promise<Partial<SequenceSplash> | null> {
  const { data } = await db().from('sequence_overrides').select('splash').eq('slug', slug).maybeSingle()
  const row = data as { splash: Partial<SequenceSplash> } | null
  return row?.splash ?? null
}

export async function saveSplashOverride(
  slug: string,
  splash: Partial<SequenceSplash>,
  by: string | null,
): Promise<void> {
  await db()
    .from('sequence_overrides')
    .upsert({ slug, splash, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'slug' })
}
