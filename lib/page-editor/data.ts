import type { Data } from '@/lib/page-editor/types'
import { refreshAssetRefUrls } from '@/lib/library/resolve-refs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'

// SPACE-SCOPED (Phase 0.5e, ENTITY-SPACES-BUILD §0.5.13): the Puck `pages` table has a
// nullable `space_id`. Every read/write carries a spaceId, DEFAULTING to the ROOT space via
// loadRootSpaceId (the canary: single-tenant callers keep reading/writing the root's rows,
// exactly as today). `pages` (including `space_id`) is in the generated DB types, so reads go
// through the typed client; only the jsonb documents are narrowed to the editor's Data shape.
// The reads stay fail-safe so they degrade to the coded design on any error.
//
// NOTE: the Puck editor is still GATED to the `isEditableSlug` allowlist below. This seam only
// makes the storage space-aware so per-Space micro-site pages are possible later. Full un-gating
// to per-Space authoring (and offering the editor on a Space's own slugs) is Phase 5 white-label.

// Marketing-site rebuild: every PRIMARY public page is editor-backed and renders the
// getPublishedData -> getTemplate -> legacy chain. The six primaries (Home, The
// Community, The Quest, The Lab, Spaces, About) each ship a designed template as the
// default; where a route still has one, the bespoke coded experience sits under it as
// the legacy fallback, so nothing breaks before a template publishes.
//
// ⚠️ THAT THIRD RUNG IS BEING RETIRED, one slug per PR (UX-MATURITY-PLAN Lift 5c,
// ADR-1068). `circles`, `about` and `spaces` have none: their template is the LAST rung, and
// lib/page-editor/templates/templates.test.ts reads THIS constant to make sure every
// gated slug still has a template the current block config can render. The live
// scoreboard is scripts/render-path-bodies.txt, not this comment.
//
// Home keeps its live counts OFF (honest
// empty state): the home template ships the qualitative founding framing, never invented
// numbers. Pricing keeps its template (linked from Spaces; off the primary nav).
// Every editor route, the Pages directory, and publish/draft/unpublish gate on
// `isEditableSlug`. Only pages with a faithful editor template (so the editor matches
// what's live) belong here. `how-it-works` was a retired server redirect (→
// /the-community); `build` / `practice` / `spread` were FOLDED into the six primaries
// and are now 308 redirect stubs, so editing them did nothing — removed.
export const EDITABLE_PAGES = [
  { slug: 'home', title: 'Home', path: '/' },
  { slug: 'about', title: 'About', path: '/about' },
  { slug: 'spaces', title: 'Spaces', path: '/spaces' },
  { slug: 'the-lab', title: 'The Lab', path: '/the-lab' },
  { slug: 'the-community', title: 'The Community', path: '/the-community' },
  { slug: 'the-quest', title: 'The Quest', path: '/the-quest' },
  { slug: 'pricing', title: 'Pricing', path: '/pricing' },
  { slug: 'circles', title: 'Circles', path: '/circles' },
  // The SEEKER ARTICLES (UX-MATURITY-PLAN Lift 5d, ADR-1068). Informational routes, not
  // product surfaces: each is one instance of the CONTENT-VOICE §10.9 article grammar,
  // seeded by `articleTemplate` from a spec beside it rather than by a hand-built
  // document. They enroll ONE PER PR, because each enrolment is also a route change.
  { slug: 'how-to-start-a-circle', title: 'How to start a Circle', path: '/how-to-start-a-circle' },
  { slug: 'how-to-build-community', title: 'How to build community', path: '/how-to-build-community' },
  { slug: 'loneliness', title: 'Loneliness', path: '/loneliness' },
  { slug: 'friendship-as-an-adult', title: 'Adult friendship', path: '/friendship-as-an-adult' },
  { slug: 'calm-down-fast', title: 'Calm down fast', path: '/calm-down-fast' },
  { slug: 'how-to-be-more-social', title: 'How to be more social', path: '/how-to-be-more-social' },
  { slug: 'tools-for-community-builders', title: 'Tools for community builders', path: '/tools-for-community-builders' },
  { slug: 'what-is-frequency', title: 'What is Frequency', path: '/what-is-frequency' },
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

// Typed row → the editor's PageRow: the jsonb documents are stored as Json and narrowed to the
// Puck Data shape here (the one remaining cast — jsonb payloads have no generated shape).
type DbPageRow = {
  slug: string
  title: string
  data: unknown
  published_data: unknown
  status: string
  updated_at: string | null
  published_at: string | null
}

function toPageRow(row: DbPageRow): PageRow {
  return {
    slug: row.slug,
    title: row.title,
    data: (row.data as Data | null) ?? null,
    published_data: (row.published_data as Data | null) ?? null,
    status: row.status,
    updated_at: row.updated_at,
    published_at: row.published_at,
  }
}

function pagesQuery() {
  return createAdminClient().from('pages')
}

export async function getPage(slug: string, spaceId?: string | null): Promise<PageRow | null> {
  const sid = await resolveSpaceId(spaceId)
  if (!sid) return null
  const { data } = await pagesQuery().select(SELECT).eq('space_id', sid).eq('slug', slug).maybeSingle()
  return data ? toPageRow(data) : null
}

// The live document the public site renders, or null (→ legacy fallback).
// Catches missing-credentials errors at build time so static pages degrade cleanly.
// AssetRefs are refreshed here (reference → current CDN url, ADR-1130) so a Loom edit
// that re-points an asset reaches every published page without re-saving documents;
// the refresh fails open to each ref's cached url, and a ref-free document costs no query.
export async function getPublishedData(slug: string, spaceId?: string | null): Promise<Data | null> {
  const page = await getPage(slug, spaceId).catch(() => null)
  const doc = (page?.published_data as Data | null) ?? null
  return doc ? refreshAssetRefUrls(doc) : null
}

export async function listPages(spaceId?: string | null): Promise<Record<string, PageRow>> {
  const sid = await resolveSpaceId(spaceId)
  const map: Record<string, PageRow> = {}
  if (!sid) return map
  const { data } = await pagesQuery().select(SELECT).eq('space_id', sid)
  for (const r of data ?? []) map[r.slug] = toPageRow(r)
  return map
}
