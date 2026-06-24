import type { Data } from '@measured/puck'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'

// `pages` is untyped in the generated DB types -> cast (same as lib/studio/*).
//
// SPACE-SCOPED (Phase 0.5e, ENTITY-SPACES-BUILD §0.5.13): the Puck `pages` table gains a
// nullable `space_id`. Every read/write carries a spaceId, DEFAULTING to the ROOT space via
// loadRootSpaceId (the canary: single-tenant callers keep reading/writing the root's rows,
// exactly as today). The new column is reached with an untyped cast (the codebase pattern for
// not-yet-typed columns, ADR-246) until lib/database.types.ts is regenerated, and the reads are
// fail-safe so they degrade to the coded design before the migration is applied.
//
// NOTE: the Puck editor is still GATED to the `isEditableSlug` allowlist below. This seam only
// makes the storage space-aware so per-Space micro-site pages are possible later. Full un-gating
// to per-Space authoring (and offering the editor on a Space's own slugs) is Phase 5 white-label.

// The splash (`/`, slug `home`) AND `about` are deliberately NOT here. They are
// bespoke coded experiences (the splash's live counts/parallax; the About story's
// crafted rhythm) that the generic Puck block set can't reproduce — and being in
// this list is exactly what let a published draft *shadow* the coded design (the
// trap we hit: About rendered a duplicated, garbled draft over the clean code).
// Keeping them out is the guard: every editor route, the Pages directory, and
// publish/draft/unpublish gate on `isEditableSlug`, so the coded page is the single
// source of truth.
// Only pages with a faithful editor template (so the editor matches what's live)
// belong here. `how-it-works` was a retired server redirect (→ /the-community), so
// editing it did nothing — removed. The Lab, The Community, The Quest, and Pricing
// have all been ported into the block library ("editor = live"). Pricing relies on
// the standardized `Tiers` block (added with this port) for its membership cards.
export const EDITABLE_PAGES = [
  { slug: 'the-lab', title: 'The Lab', path: '/the-lab' },
  { slug: 'the-community', title: 'The Community', path: '/the-community' },
  { slug: 'the-quest', title: 'The Quest', path: '/the-quest' },
  { slug: 'pricing', title: 'Pricing', path: '/pricing' },
  { slug: 'lead', title: 'Lead', path: '/lead' },
  { slug: 'practice', title: 'Practice', path: '/practice' },
  { slug: 'spread', title: 'Spread', path: '/spread' },
] as const

export type EditableSlug = (typeof EDITABLE_PAGES)[number]['slug']

export function pathForSlug(slug: string): string {
  return EDITABLE_PAGES.find((p) => p.slug === slug)?.path ?? '/'
}

export function isEditableSlug(slug: string): slug is EditableSlug {
  return EDITABLE_PAGES.some((p) => p.slug === slug)
}

export interface PageRow {
  slug: string
  title: string
  data: Data | null
  published_data: Data | null
  status: string
  updated_at: string | null
  published_at: string | null
}

const SELECT = 'slug, title, data, published_data, status, updated_at, published_at'

/** Resolve the effective tenant for a read/write: the explicit spaceId, else the root space.
 *  Returns null only if even the root space is missing (pre-migration), so callers fail-safe. */
export async function resolveSpaceId(spaceId?: string | null): Promise<string | null> {
  return spaceId ?? (await loadRootSpaceId())
}

// `pages.space_id` isn't in the generated types yet, so reach the .eq('space_id', …) filter with
// an untyped client (ADR-246), like lib/page-settings/store.ts. Casting the builder, not the row.
function pagesQuery() {
  return createAdminClient().from('pages') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> }
      } & Promise<{ data: unknown }>
    }
  }
}

export async function getPage(slug: string, spaceId?: string | null): Promise<PageRow | null> {
  const sid = await resolveSpaceId(spaceId)
  if (!sid) return null
  const { data } = await pagesQuery().select(SELECT).eq('space_id', sid).eq('slug', slug).maybeSingle()
  return (data as PageRow | null) ?? null
}

// The live document the public site renders, or null (→ legacy fallback).
// Catches missing-credentials errors at build time so static pages degrade cleanly.
export async function getPublishedData(slug: string, spaceId?: string | null): Promise<Data | null> {
  const page = await getPage(slug, spaceId).catch(() => null)
  return (page?.published_data as Data | null) ?? null
}

export async function listPages(spaceId?: string | null): Promise<Record<string, PageRow>> {
  const sid = await resolveSpaceId(spaceId)
  const map: Record<string, PageRow> = {}
  if (!sid) return map
  const { data } = await pagesQuery().select(SELECT).eq('space_id', sid)
  for (const r of (data as PageRow[]) ?? []) map[r.slug] = r
  return map
}
