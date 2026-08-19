import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  FunnelSplash,
  Funnel,
  FunnelFeature,
  FunnelCoreFeature,
  FunnelDestination,
  FeatureFunnelConfig,
} from './definitions'
import type { FunnelStyleId } from '@/lib/funnels/styles'

// DB override layer for the code-first Funnels (build §9.1 → ADR-162 → ADR-1090).
// `data` holds a FULL Funnel override (any subset of a Funnel); a row with a
// brand-new slug is a CREATED Funnel built in the wizard. The legacy `splash` column
// is kept in sync for the original splash-only reader.
//
// The TABLE stays `sequence_overrides` (its pre-rename name): it is live data —
// every authored Funnel and the owner's edited default flow are rows in it — and
// renaming a table buys nothing a comment can't (repo convention: beta_audit_log).
// It predates the generated types — loosely-typed client.
function db(): SupabaseClient {
  return createAdminClient()
}

/** Publish state for a splash funnel. Stored INSIDE the `data` jsonb (no schema
 *  change): a missing value reads as 'published', so every funnel created before
 *  this shipped stays live exactly as before. Only the public induction route gates
 *  on it — a 'draft' funnel falls back to the default flow for visitors, while the
 *  editor + preview always see its real content. */
export type FunnelPublishStatus = 'draft' | 'published'

/** Any subset of a Funnel the owner has overridden (or authored, for a new Funnel).
 *  Splash + voiced beats are partial so a legacy splash-only row still merges cleanly. */
export interface FunnelOverride {
  audience?: string
  marketingTag?: string
  /** The funnel STYLE (ADR-617). Absent = 'onboarding'. 'feature' needs `feature` below. */
  style?: FunnelStyleId
  /** FEATURE-style config (the playable demo). Present only when style === 'feature'. */
  feature?: FeatureFunnelConfig
  /** Draft funnels are not served live (see resolveFunnel). Undefined = published. */
  status?: FunnelPublishStatus
  splash?: Partial<FunnelSplash>
  vera?: Partial<Funnel['vera']>
  heardAbout?: Funnel['heardAbout']
  /** Niche-funnel config (ADR-funnels): Slide 2 features, Slide 3 core features + art, and the
   *  completion destination (waitlist vs a direct in-app link). Absent = the General funnel behaviour. */
  slide2Features?: FunnelFeature[]
  slide3Core?: FunnelCoreFeature[]
  destination?: FunnelDestination
}

/** A funnel's publish state, defaulting a missing/legacy value to 'published'. */
export function funnelPublishStatus(o: FunnelOverride | null | undefined): FunnelPublishStatus {
  return o?.status === 'draft' ? 'draft' : 'published'
}

export async function getSplashOverride(slug: string): Promise<Partial<FunnelSplash> | null> {
  const { data } = await db().from('sequence_overrides').select('splash').eq('slug', slug).maybeSingle()
  const row = data as { splash: Partial<FunnelSplash> } | null
  return row?.splash ?? null
}

export async function saveSplashOverride(
  slug: string,
  splash: Partial<FunnelSplash>,
  by: string | null,
): Promise<void> {
  await db()
    .from('sequence_overrides')
    .upsert({ slug, splash, data: { splash }, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'slug' })
}

/** The full override for a slug (data column, with the legacy splash folded in). */
export async function getFunnelOverride(slug: string): Promise<FunnelOverride | null> {
  const { data } = await db().from('sequence_overrides').select('data, splash').eq('slug', slug).maybeSingle()
  const row = data as { data: FunnelOverride | null; splash: Partial<FunnelSplash> | null } | null
  if (!row) return null
  const merged: FunnelOverride = { ...(row.data ?? {}) }
  if (!merged.splash && row.splash && Object.keys(row.splash).length) merged.splash = row.splash
  return merged
}

/** Save a full Funnel override / authored Funnel. Mirrors splash + audience for fast reads. */
export async function saveFunnelOverride(
  slug: string,
  override: FunnelOverride,
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

/** Every DB-backed Funnel row (overrides of code Funnels + created Funnels),
 *  with its publish state read out of the `data` jsonb (legacy rows → 'published'). */
export async function listFunnelVersions(): Promise<
  { slug: string; audience: string | null; status: FunnelPublishStatus }[]
> {
  const { data } = await db()
    .from('sequence_overrides')
    .select('slug, audience, data')
    .order('created_at', { ascending: true })
  const rows = (data as { slug: string; audience: string | null; data: FunnelOverride | null }[] | null) ?? []
  return rows.map((r) => ({ slug: r.slug, audience: r.audience, status: funnelPublishStatus(r.data) }))
}

/** Flip a funnel's publish state without disturbing the rest of its content. Reads
 *  the current override, sets `status`, and writes it back through the full upsert so
 *  the mirrored splash/audience columns stay in sync. */
export async function setFunnelPublishStatus(
  slug: string,
  status: FunnelPublishStatus,
  by: string | null,
): Promise<void> {
  const current = (await getFunnelOverride(slug)) ?? {}
  await saveFunnelOverride(slug, { ...current, status }, by)
}

/** Copy an existing funnel (or the default template) into a NEW slug as a draft. The
 *  source override is cloned verbatim, then re-stamped with the new audience, a fresh
 *  marketing tag, and `status: 'draft'` so the copy never goes live until published. */
export async function duplicateFunnel(
  fromSlug: string,
  toSlug: string,
  audience: string,
  by: string | null,
): Promise<void> {
  const source = (await getFunnelOverride(fromSlug)) ?? {}
  const override: FunnelOverride = {
    ...source,
    audience,
    // The tag PREFIX stays beta_ — cohort tags are stored member data and the
    // registered trait namespace (lib/traits/registry.ts) already carries it.
    marketingTag: `beta_${toSlug.replace(/-/g, '_')}`,
    status: 'draft',
  }
  await saveFunnelOverride(toSlug, override, by)
}

export async function deleteFunnelVersion(slug: string): Promise<void> {
  await db().from('sequence_overrides').delete().eq('slug', slug)
}
