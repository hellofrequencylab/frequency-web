import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SequenceSplash, BetaSequence } from './beta-sequences'

// DB override layer for the code-first onboarding sequences (build §9.1 → ADR-162).
// `data` holds a FULL sequence override (any subset of a BetaSequence); a row with a
// brand-new slug is a CREATED version built in the wizard. The legacy `splash` column
// is kept in sync for the original splash-only reader. `sequence_overrides` predates
// the generated types — loosely-typed client.
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Any subset of a sequence the owner has overridden (or authored, for a new version).
 *  Splash + voiced beats are partial so a legacy splash-only row still merges cleanly. */
export interface SequenceOverride {
  audience?: string
  marketingTag?: string
  splash?: Partial<SequenceSplash>
  vera?: Partial<BetaSequence['vera']>
  oaths?: BetaSequence['oaths']
  heardAbout?: BetaSequence['heardAbout']
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
    .upsert({ slug, splash, data: { splash }, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'slug' })
}

/** The full override for a slug (data column, with the legacy splash folded in). */
export async function getSequenceOverride(slug: string): Promise<SequenceOverride | null> {
  const { data } = await db().from('sequence_overrides').select('data, splash').eq('slug', slug).maybeSingle()
  const row = data as { data: SequenceOverride | null; splash: Partial<SequenceSplash> | null } | null
  if (!row) return null
  const merged: SequenceOverride = { ...(row.data ?? {}) }
  if (!merged.splash && row.splash && Object.keys(row.splash).length) merged.splash = row.splash
  return merged
}

/** Save a full sequence override / version. Mirrors splash + audience for fast reads. */
export async function saveSequenceOverride(
  slug: string,
  override: SequenceOverride,
  by: string | null,
): Promise<void> {
  await db().from('sequence_overrides').upsert(
    {
      slug,
      data: override,
      splash: override.splash ?? {},
      audience: override.audience ?? null,
      updated_at: new Date().toISOString(),
      updated_by: by,
    },
    { onConflict: 'slug' },
  )
}

/** Every DB-backed sequence row (overrides of code sequences + created versions). */
export async function listSequenceVersions(): Promise<{ slug: string; audience: string | null }[]> {
  const { data } = await db().from('sequence_overrides').select('slug, audience').order('created_at', { ascending: true })
  return (data as { slug: string; audience: string | null }[] | null) ?? []
}

export async function deleteSequenceVersion(slug: string): Promise<void> {
  await db().from('sequence_overrides').delete().eq('slug', slug)
}
