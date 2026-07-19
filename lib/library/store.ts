import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALL_ELEMENTS } from './element-catalog'

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

/**
 * Reconcile the code element catalog (element-catalog.ALL_ELEMENTS) into `library_assets` for the
 * master/shared library, so every code-drawn element shows in Loom Studio WITHOUT a hand-written
 * seed migration. This is the auto-add path: adding art to a catalog registry array is all it takes
 * — the next time a manager opens the master Loom, the missing rows self-heal in.
 *
 * Idempotent: inserts only catalog elements missing from the space, matched by (registry, name), as
 * public + approved rows. Resilient: never throws (a sync hiccup must never break the Loom page).
 * Returns how many rows it added (0 on a no-op or any error). Call with the ROOT space id.
 */
export async function ensureCatalogElements(spaceId: string): Promise<number> {
  try {
    const { data } = await db()
      .from('library_assets')
      .select('config')
      .eq('space_id', spaceId)
      .eq('kind', 'element')
    const have = new Set(
      ((data ?? []) as { config: { registry?: string; name?: string } | null }[]).map(
        (r) => `${r.config?.registry ?? ''}:${r.config?.name ?? ''}`,
      ),
    )
    const missing = ALL_ELEMENTS.filter((e) => !have.has(`${e.registry}:${e.name}`))
    if (missing.length === 0) return 0
    const rows = missing.map((e) => ({
      kind: 'element',
      title: e.title,
      slug: e.name,
      category: e.category,
      tags: e.tags,
      config: { registry: e.registry, name: e.name },
      space_id: spaceId,
      visibility: 'public',
      status: 'approved',
    }))
    const { error } = await db().from('library_assets').insert(rows)
    return error ? 0 : rows.length
  } catch {
    return 0
  }
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
  /** For a CROSS-SPACE collection (e.g. the master "Spaces" folder that groups seeded Spaces' own
   *  assets, Importer v2 #6): drop the space_id scope so a root collection can surface assets that live
   *  in OTHER spaces. Only honoured together with `collectionId`; ignored otherwise. */
  crossSpace?: boolean
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
  // A cross-space collection browse (Importer v2 #6) drops the space_id scope so a root collection can
  // group assets that live in OTHER spaces; membership is enforced by the collection filter below.
  const crossSpace = !!opts.crossSpace && !!opts.collectionId

  let query = db().from('library_assets').select(SELECT, { count: 'exact' })
  if (!crossSpace) query = query.eq('space_id', opts.spaceId)

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

/** A pickable image for the Loom-backed Puck image field. */
export type LibraryImagePick = { id: string; title: string; url: string; alt: string | null }

/** Search IMAGE assets a SPACE OPERATOR may reuse: the space's OWN images (any visibility) UNIONED
 *  with the shared/public library (the root space's public images), newest first. NEVER widens into
 *  another space's private assets: the OR is (space_id = thisSpace) OR (visibility = 'public'). Text
 *  search is a safe substring over title/description/category. Only file-backed images with a
 *  resolvable URL ride through. FAIL-SAFE to [] on any error. */
export async function searchSpaceLibraryImages(
  spaceId: string,
  q?: string,
  limit = 60,
): Promise<LibraryImagePick[]> {
  try {
    let query = db()
      .from('library_assets')
      .select('id, title, url, alt, space_id, visibility')
      .eq('kind', 'image')
      .neq('status', 'archived')
      // The space's own assets OR any public shared-library asset. A PostgREST `or` with an
      // `and(...)` group keeps the public branch scoped to visibility='public'.
      .or(`space_id.eq.${spaceId},visibility.eq.public`)

    const text = (q ?? '').replace(/[,()*]/g, ' ').trim()
    if (text) query = query.or(`title.ilike.%${text}%,description.ilike.%${text}%,category.ilike.%${text}%`)

    const { data } = await query.order('created_at', { ascending: false }).limit(limit)
    return ((data as Array<Record<string, unknown>> | null) ?? [])
      .filter((r) => typeof r.url === 'string' && (r.url as string).length > 0)
      .map((r) => ({
        id: String(r.id),
        title: String(r.title ?? '') || 'Untitled',
        url: r.url as string,
        alt: (r.alt as string | null) ?? null,
      }))
  } catch {
    return []
  }
}

/** Insert a newly-uploaded file into a SPACE'S OWN Loom (space_id = thisSpace, visibility='space',
 *  NEVER the shared root/public library). Returns the new asset id, or null on error. The caller has
 *  already gated on per-space edit permission and uploaded the file. `kind` defaults to 'image' so
 *  every existing caller is byte-identical; the Airwaves uploaders pass 'audio' | 'video' (ADR-608). */
export async function insertSpaceLibraryImage(input: {
  spaceId: string
  title: string
  slug: string
  storageBucket: string
  storagePath: string
  url: string
  mime: string
  bytes: number
  kind?: 'image' | 'audio' | 'video'
  /** The uploader (library_assets.created_by): the spine of the PERSONAL Loom ("everything I uploaded,
   *  in any context, is in my Loom"). Set on every picker upload so a person's own assets resolve across
   *  spaces; omitted for legacy callers (the column stays null). */
  createdBy?: string | null
}): Promise<string | null> {
  const { data, error } = await db()
    .from('library_assets')
    .insert({
      space_id: input.spaceId,
      kind: input.kind ?? 'image',
      title: input.title,
      slug: input.slug,
      status: 'approved',
      visibility: 'space',
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      url: input.url,
      mime: input.mime,
      bytes: input.bytes,
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
    })
    .select('id')
    .maybeSingle()
  if (error) return null
  return (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null
}

/** One pickable Loom asset for the universal image picker: the served URL + the label + whether it was
 *  AI-generated (an "Element") + its tags (for the Tags facet). */
export type LoomPickAsset = { id: string; title: string; url: string; alt: string | null; generated: boolean; tags: string[] }

/** Shape a raw library_assets row into a LoomPickAsset. AI-generated ("Element") is derived from the
 *  Recraft/Vera provenance the generators stamp (tags include 'generated', or config.source is set). */
function toPickAsset(r: Record<string, unknown>): LoomPickAsset {
  const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []
  const cfg = (r.config && typeof r.config === 'object' ? (r.config as Record<string, unknown>) : {}) as Record<string, unknown>
  const generated = tags.includes('generated') || typeof cfg.source === 'string'
  return {
    id: String(r.id),
    title: String(r.title ?? '') || 'Untitled',
    url: String(r.url ?? ''),
    alt: (r.alt as string | null) ?? null,
    generated,
    tags,
  }
}

/** IMAGE assets in one Loom SCOPE, newest first, optionally filtered by a text query, a single tag, and
 *  whether to keep only AI-generated "Elements". A scope is either the caller's PERSONAL Loom
 *  (`createdBy` = them, any space) or ONE space's own assets (`spaceId`). FAIL-SAFE to []. */
export async function listLoomScopeImages(
  scope: { createdBy: string } | { spaceId: string },
  opts: { q?: string; tag?: string; generatedOnly?: boolean; limit?: number } = {},
): Promise<LoomPickAsset[]> {
  try {
    let query = db()
      .from('library_assets')
      .select('id, title, url, alt, tags, config')
      .eq('kind', 'image')
      .neq('status', 'archived')
    query = 'createdBy' in scope ? query.eq('created_by', scope.createdBy) : query.eq('space_id', scope.spaceId)
    const text = (opts.q ?? '').replace(/[,()*]/g, ' ').trim()
    if (text) query = query.or(`title.ilike.%${text}%,description.ilike.%${text}%,category.ilike.%${text}%`)
    if (opts.tag) query = query.contains('tags', [opts.tag])
    const { data } = await query.order('created_at', { ascending: false }).limit(Math.min(opts.limit ?? 120, 200))
    let rows = ((data as Array<Record<string, unknown>> | null) ?? []).map(toPickAsset).filter((a) => a.url.length > 0)
    if (opts.generatedOnly) rows = rows.filter((a) => a.generated)
    return rows
  } catch {
    return []
  }
}

/** The distinct image TAGS present in a Loom scope (busiest first), for the picker's Tags facet.
 *  FAIL-SAFE to []. */
export async function listLoomScopeTags(scope: { createdBy: string } | { spaceId: string }): Promise<string[]> {
  try {
    let query = db().from('library_assets').select('tags').eq('kind', 'image').neq('status', 'archived')
    query = 'createdBy' in scope ? query.eq('created_by', scope.createdBy) : query.eq('space_id', scope.spaceId)
    const { data } = await query.limit(2000)
    const counts = new Map<string, number>()
    for (const r of (data as Array<{ tags: unknown }> | null) ?? []) {
      if (Array.isArray(r.tags)) for (const t of r.tags) if (typeof t === 'string' && t.trim()) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  } catch {
    return []
  }
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

// ── The master "Spaces" collection (Importer v2 #6, ADR-606) ────────────────────────────────
// A single root-space collection that groups every seeded Space's own images, so the admin (master)
// Loom has one folder to browse all space-scoped assets. It uses the EXISTING collections infra (no new
// schema): the collection row lives on the root space; its members are assets whose own space_id is the
// seeded Space. The admin Loom surfaces it in the rail (listCollections) and, when it is the active
// folder, browses it CROSS-SPACE (searchLibraryAssets crossSpace) so those other-space assets appear.

/** The stable slug of the master "Spaces" collection on the root Loom. */
export const SPACES_COLLECTION_SLUG = 'spaces'
/** The display title of the master "Spaces" collection. */
export const SPACES_COLLECTION_TITLE = 'Spaces'

/** Ensure the root Loom's "Spaces" collection exists (idempotent, keyed by the stable slug), returning
 *  its id. Creates it on first use so the folder appears the moment the first seeded image is filed.
 *  Fail-safe to null on any error. */
export async function ensureSpacesCollection(rootSpaceId: string): Promise<string | null> {
  try {
    const { data: existing } = await db()
      .from('library_collections')
      .select('id')
      .eq('space_id', rootSpaceId)
      .eq('slug', SPACES_COLLECTION_SLUG)
      .maybeSingle()
    const existingId = (existing as { id?: string } | null)?.id
    if (existingId) return String(existingId)

    const { data, error } = await db()
      .from('library_collections')
      .insert({
        space_id: rootSpaceId,
        slug: SPACES_COLLECTION_SLUG,
        title: SPACES_COLLECTION_TITLE,
        description: 'Images from seeded business Spaces, grouped for the master Loom.',
      })
      .select('id')
      .maybeSingle()
    if (error) {
      // A concurrent insert may have won the (space_id, slug) unique index — re-read.
      const { data: raced } = await db()
        .from('library_collections')
        .select('id')
        .eq('space_id', rootSpaceId)
        .eq('slug', SPACES_COLLECTION_SLUG)
        .maybeSingle()
      return (raced as { id?: string } | null)?.id ? String((raced as { id: string }).id) : null
    }
    return (data as { id?: string } | null)?.id ? String((data as { id: string }).id) : null
  } catch {
    return null
  }
}

/** Add asset ids to a collection (idempotent membership upsert). Fail-safe to false. Used by the seeder
 *  to file each seeded Space's image into the master "Spaces" collection. */
export async function addAssetsToCollection(collectionId: string, assetIds: string[]): Promise<boolean> {
  const ids = Array.from(new Set(assetIds.filter((s) => typeof s === 'string' && s.length > 0)))
  if (!collectionId || ids.length === 0) return false
  try {
    const rows = ids.map((asset_id) => ({ collection_id: collectionId, asset_id }))
    const { error } = await db()
      .from('library_collection_items')
      .upsert(rows, { onConflict: 'collection_id,asset_id', ignoreDuplicates: true })
    return !error
  } catch {
    return false
  }
}

/** File the given (already-inserted) asset ids into the root Loom's master "Spaces" collection. Ensures
 *  the collection exists first. Best-effort: a filing miss never fails the caller. Returns whether it
 *  grouped anything. */
export async function fileAssetsIntoSpacesCollection(rootSpaceId: string, assetIds: string[]): Promise<boolean> {
  if (!rootSpaceId || assetIds.length === 0) return false
  const collectionId = await ensureSpacesCollection(rootSpaceId)
  if (!collectionId) return false
  return addAssetsToCollection(collectionId, assetIds)
}
