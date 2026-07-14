import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SequenceSplash,
  BetaSequence,
  FunnelFeature,
  FunnelCoreFeature,
  FunnelDestination,
} from './beta-sequences'

// DB override layer for the code-first onboarding sequences (build §9.1 → ADR-162).
// `data` holds a FULL sequence override (any subset of a BetaSequence); a row with a
// brand-new slug is a CREATED version built in the wizard. The legacy `splash` column
// is kept in sync for the original splash-only reader. `sequence_overrides` predates
// the generated types — loosely-typed client.
function db(): SupabaseClient {
  return createAdminClient()
}

/** Publish state for a splash funnel. Stored INSIDE the `data` jsonb (no schema
 *  change): a missing value reads as 'published', so every funnel created before
 *  this shipped stays live exactly as before. Only the public induction route gates
 *  on it — a 'draft' funnel falls back to the default flow for visitors, while the
 *  editor + preview always see its real content. */
export type SequenceStatus = 'draft' | 'published'

/** Any subset of a sequence the owner has overridden (or authored, for a new version).
 *  Splash + voiced beats are partial so a legacy splash-only row still merges cleanly. */
export interface SequenceOverride {
  audience?: string
  marketingTag?: string
  /** Draft funnels are not served live (see resolveSequence). Undefined = published. */
  status?: SequenceStatus
  splash?: Partial<SequenceSplash>
  vera?: Partial<BetaSequence['vera']>
  oaths?: BetaSequence['oaths']
  heardAbout?: BetaSequence['heardAbout']
  /** Niche-funnel config (ADR-funnels): Slide 2 features, Slide 3 core features + art, and the
   *  completion destination (waitlist vs a direct in-app link). Absent = the General funnel behaviour. */
  slide2Features?: FunnelFeature[]
  slide3Core?: FunnelCoreFeature[]
  destination?: FunnelDestination
}

/** A funnel's publish state, defaulting a missing/legacy value to 'published'. */
export function sequenceStatus(o: SequenceOverride | null | undefined): SequenceStatus {
  return o?.status === 'draft' ? 'draft' : 'published'
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

/** Every DB-backed sequence row (overrides of code sequences + created versions),
 *  with its publish state read out of the `data` jsonb (legacy rows → 'published'). */
export async function listSequenceVersions(): Promise<
  { slug: string; audience: string | null; status: SequenceStatus }[]
> {
  const { data } = await db()
    .from('sequence_overrides')
    .select('slug, audience, data')
    .order('created_at', { ascending: true })
  const rows = (data as { slug: string; audience: string | null; data: SequenceOverride | null }[] | null) ?? []
  return rows.map((r) => ({ slug: r.slug, audience: r.audience, status: sequenceStatus(r.data) }))
}

/** Flip a funnel's publish state without disturbing the rest of its content. Reads
 *  the current override, sets `status`, and writes it back through the full upsert so
 *  the mirrored splash/audience columns stay in sync. */
export async function setSequenceStatus(
  slug: string,
  status: SequenceStatus,
  by: string | null,
): Promise<void> {
  const current = (await getSequenceOverride(slug)) ?? {}
  await saveSequenceOverride(slug, { ...current, status }, by)
}

/** Copy an existing funnel (or the default template) into a NEW slug as a draft. The
 *  source override is cloned verbatim, then re-stamped with the new audience, a fresh
 *  marketing tag, and `status: 'draft'` so the copy never goes live until published. */
export async function duplicateSequence(
  fromSlug: string,
  toSlug: string,
  audience: string,
  by: string | null,
): Promise<void> {
  const source = (await getSequenceOverride(fromSlug)) ?? {}
  const override: SequenceOverride = {
    ...source,
    audience,
    marketingTag: `beta_${toSlug.replace(/-/g, '_')}`,
    status: 'draft',
  }
  await saveSequenceOverride(toSlug, override, by)
}

export async function deleteSequenceVersion(slug: string): Promise<void> {
  await db().from('sequence_overrides').delete().eq('slug', slug)
}
