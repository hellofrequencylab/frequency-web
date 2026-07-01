import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-only data access for The Loom / Loom Studio. `library_assets` isn't in
// lib/database.types.ts yet (the migration is applied but types aren't regenerated), so we
// use an untyped admin handle — the repo's standard pattern for a freshly-added table (see
// the space_segments / questionnaire actions). Service-role only; callers gate access.
// See docs/LIBRARY.md.

function db(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  return createAdminClient() as unknown as SupabaseClient
}

/** The root space owns the Frequency shared/master library (space_id is NOT NULL). */
export async function getRootSpaceId(): Promise<string | null> {
  const { data } = await db()
    .from('spaces')
    .select('id')
    .eq('type', 'root')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** A gallery row — the fields Loom Studio's grid + detail drawer need. */
export type LibraryGalleryItem = {
  id: string
  kind: string
  status: string
  title: string
  slug: string
  alt: string | null
  category: string | null
  tags: string[]
  url: string | null
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  storagePath: string | null
  /** Parametric payload for non-file kinds (e.g. element → {registry,name}). */
  config: Record<string, unknown> | null
  createdAt: string
}

const SELECT =
  'id, kind, status, title, slug, alt, category, tags, url, mime, bytes, width, height, storage_path, config, created_at'

function toItem(r: Record<string, unknown>): LibraryGalleryItem {
  return {
    id: String(r.id),
    kind: String(r.kind),
    status: String(r.status ?? 'approved'),
    title: String(r.title ?? ''),
    slug: String(r.slug ?? ''),
    alt: (r.alt as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    url: (r.url as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    bytes: (r.bytes as number | null) ?? null,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    config: (r.config as Record<string, unknown> | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  }
}

export type LibrarySort = 'new' | 'old' | 'title' | 'size' | 'relevant'

export type LibraryQuery = {
  spaceId: string
  q?: string
  kind?: string
  category?: string
  /** Filter to assets that belong to this collection. */
  collectionId?: string
  sort?: LibrarySort
  includeArchived?: boolean
  /** 1-based page. */
  page?: number
  pageSize?: number
}

export type LibraryPage = { items: LibraryGalleryItem[]; total: number }

/** Asset ids that belong to a collection (membership lookup for the collection filter). */
async function collectionAssetIds(collectionId: string): Promise<string[]> {
  const { data } = await db()
    .from('library_collection_items')
    .select('asset_id')
    .eq('collection_id', collectionId)
    .limit(5000)
  return ((data as Array<{ asset_id: string }> | null) ?? []).map((r) => r.asset_id)
}

/** Search + filter + PAGE a space's assets. Text search is a safe substring match over
 *  title/description/category (FTS ranking + trigram is a follow-up, D7); kind/category are
 *  exact facets; collectionId scopes to a folder. Archived assets are hidden unless asked
 *  for. Returns the page + the exact total (for pagination). */
export async function searchLibraryAssets(opts: LibraryQuery): Promise<LibraryPage> {
  let query = db()
    .from('library_assets')
    .select(SELECT, { count: 'exact' })
    .eq('space_id', opts.spaceId)

  if (!opts.includeArchived) query = query.neq('status', 'archived')
  if (opts.kind) query = query.eq('kind', opts.kind)
  if (opts.category) query = query.eq('category', opts.category)

  if (opts.collectionId) {
    const ids = await collectionAssetIds(opts.collectionId)
    if (ids.length === 0) return { items: [], total: 0 }
    query = query.in('id', ids)
  }

  const q = (opts.q ?? '').replace(/[,()*]/g, ' ').trim()
  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
  }

  switch (opts.sort ?? 'new') {
    case 'old':
      query = query.order('created_at', { ascending: true })
      break
    case 'title':
      query = query.order('title', { ascending: true })
      break
    case 'size':
      query = query.order('bytes', { ascending: false, nullsFirst: false })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  const pageSize = Math.min(Math.max(opts.pageSize ?? 48, 1), 200)
  const page = Math.max(opts.page ?? 1, 1)
  const from = (page - 1) * pageSize
  const { data, count } = await query.range(from, from + pageSize - 1)

  return {
    items: ((data as Array<Record<string, unknown>> | null) ?? []).map(toItem),
    total: count ?? 0,
  }
}

/** Hydrate a list of asset ids into gallery items, PRESERVING the given order (e.g. a
 *  similarity ranking from a match RPC). Archived rows are included only if present in `ids`. */
export async function fetchLibraryItemsByIds(spaceId: string, ids: string[]): Promise<LibraryGalleryItem[]> {
  if (ids.length === 0) return []
  const { data } = await db().from('library_assets').select(SELECT).eq('space_id', spaceId).in('id', ids)
  const byId = new Map(((data as Array<Record<string, unknown>> | null) ?? []).map((r) => [String(r.id), toItem(r)]))
  return ids.map((id) => byId.get(id)).filter((x): x is LibraryGalleryItem => !!x)
}

/** One asset by id (any status), scoped to a space. */
export async function getLibraryAsset(spaceId: string, id: string): Promise<LibraryGalleryItem | null> {
  const { data } = await db()
    .from('library_assets')
    .select(SELECT)
    .eq('space_id', spaceId)
    .eq('id', id)
    .maybeSingle()
  return data ? toItem(data as Record<string, unknown>) : null
}

/** Counts by kind (excludes archived), for the Studio stat row. */
export async function kindCounts(spaceId: string): Promise<{ total: number; byKind: Record<string, number> }> {
  const { data } = await db()
    .from('library_assets')
    .select('kind')
    .eq('space_id', spaceId)
    .neq('status', 'archived')
    .limit(5000)
  const rows = (data as Array<{ kind: string }> | null) ?? []
  const byKind: Record<string, number> = {}
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  return { total: rows.length, byKind }
}

/** Category folders with live counts (excludes archived + uncategorized), busiest first. */
export async function categoryFacets(spaceId: string): Promise<{ category: string; count: number }[]> {
  const { data } = await db()
    .from('library_assets')
    .select('category')
    .eq('space_id', spaceId)
    .neq('status', 'archived')
    .limit(5000)
  const counts: Record<string, number> = {}
  for (const r of (data as Array<{ category: string | null }> | null) ?? []) {
    const c = r.category?.trim()
    if (c) counts[c] = (counts[c] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}

export type LibraryCollection = {
  id: string
  title: string
  slug: string
  description: string | null
  count: number
}

/** A space's collections (custom folders) with member counts, alphabetical. */
export async function listCollections(spaceId: string): Promise<LibraryCollection[]> {
  const { data: cols } = await db()
    .from('library_collections')
    .select('id, title, slug, description')
    .eq('space_id', spaceId)
    .order('title', { ascending: true })
  const collections =
    (cols as Array<{ id: string; title: string; slug: string; description: string | null }> | null) ?? []
  if (collections.length === 0) return []

  const { data: items } = await db()
    .from('library_collection_items')
    .select('collection_id')
    .in(
      'collection_id',
      collections.map((c) => c.id),
    )
    .limit(20000)
  const counts: Record<string, number> = {}
  for (const it of (items as Array<{ collection_id: string }> | null) ?? []) {
    counts[it.collection_id] = (counts[it.collection_id] ?? 0) + 1
  }
  return collections.map((c) => ({ ...c, count: counts[c.id] ?? 0 }))
}
