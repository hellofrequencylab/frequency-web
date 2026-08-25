import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALL_ELEMENTS } from './element-catalog'
import { SEARCH_CANDIDATE_CAP, mergeCandidates, rankLibraryMatches } from './search-rank'

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
  description: string | null
  tags: string[]
  url: string | null
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  storagePath: string | null
  /** Parametric payload for non-file kinds (e.g. element → {registry,name}). */
  config: Record<string, unknown> | null
  /** Tiny placeholder for instant grids (ingest, PROG-D1); null on rows ingested before it. */
  blurhash: string | null
  createdAt: string
}

const SELECT =
  'id, kind, status, title, slug, alt, category, description, tags, url, mime, bytes, width, height, storage_path, config, blurhash, created_at'

function toItem(r: Record<string, unknown>): LibraryGalleryItem {
  return {
    id: String(r.id),
    kind: String(r.kind),
    status: String(r.status ?? 'approved'),
    title: String(r.title ?? ''),
    slug: String(r.slug ?? ''),
    alt: (r.alt as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    url: (r.url as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    bytes: (r.bytes as number | null) ?? null,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    config: (r.config as Record<string, unknown> | null) ?? null,
    blurhash: (r.blurhash as string | null) ?? null,
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

/** The substring/trigram arm of a text search, as a PostgREST `or` expression. `ilike '%q%'` is what
 *  the `library_assets_title_trgm_idx` (gin_trgm_ops) index serves, so this arm is the trigram one:
 *  it survives typos and matches fragments, and it ranks nothing. */
function trigramOr(q: string): string {
  return `title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`
}

/** Await one retrieval arm, degrading to [] on ANY failure. One arm failing must not take the whole
 *  search down: an FTS hiccup should still return the trigram matches, and vice versa. */
async function armRows(query: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> {
  try {
    const { data } = await query
    return (data as Array<Record<string, unknown>> | null) ?? []
  } catch {
    return []
  }
}

/**
 * Search + filter + PAGE a space's assets.
 *
 * TEXT SEARCH IS RANKED (PROG-D1). A query runs BOTH retrieval arms the schema already indexes and
 * merges them: the FTS arm (`search_tsv @@ websearch_to_tsquery`, the generated column with its GIN
 * index) which is stemmed and word-oriented, and the trigram arm (`ilike '%q%'`, served by the title
 * `gin_trgm_ops` index) which catches fragments and misspellings. Neither is a superset of the
 * other. Ordering is then computed by `rankLibraryMatches` — see lib/library/search-rank.ts for why
 * ranking is in-process rather than an `order by ts_rank`, and what would replace it.
 *
 * kind/category are exact facets; collectionId scopes to a folder. Archived assets are hidden
 * unless asked for.
 *
 * PAGINATION, and the one honest caveat: without a query the page and the total come straight from
 * Postgres and are exact. WITH a query the ranked candidate set is capped at `SEARCH_CANDIDATE_CAP`
 * per arm, so `total` is the size of that capped set — a query matching more than the cap reports
 * the cap. An explicit non-default sort (title/old/size) keeps the DB-side ordering and the exact
 * count, because the caller has said they want that order rather than relevance.
 */
export async function searchLibraryAssets(opts: LibraryQuery): Promise<LibraryPage> {
  // A cross-space collection browse (Importer v2 #6) drops the space_id scope so a root collection can
  // group assets that live in OTHER spaces; membership is enforced by the collection filter below.
  const crossSpace = !!opts.crossSpace && !!opts.collectionId

  let collectionIds: string[] | null = null
  if (opts.collectionId) {
    collectionIds = await collectionAssetIds(opts.collectionId)
    if (collectionIds.length === 0) return { items: [], total: 0 }
  }

  // Every arm shares the same facet scope; only the text predicate differs.
  const scoped = (count: boolean) => {
    let query = count
      ? db().from('library_assets').select(SELECT, { count: 'exact' })
      : db().from('library_assets').select(SELECT)
    if (!crossSpace) query = query.eq('space_id', opts.spaceId)
    if (!opts.includeArchived) query = query.neq('status', 'archived')
    if (opts.kind) query = query.eq('kind', opts.kind)
    if (opts.category) query = query.eq('category', opts.category)
    if (collectionIds) query = query.in('id', collectionIds)
    return query
  }

  const q = (opts.q ?? '').replace(/[,()*]/g, ' ').trim()
  const sort = opts.sort ?? 'new'
  const pageSize = Math.min(Math.max(opts.pageSize ?? 48, 1), 200)
  const page = Math.max(opts.page ?? 1, 1)
  const from = (page - 1) * pageSize

  // ── Ranked text search: two arms, merged, scored, then paged in memory. ──
  if (q && (sort === 'new' || sort === 'relevant')) {
    const [fts, trgm] = await Promise.all([
      // websearch_to_tsquery parses the raw string itself (quotes, OR, -term) and never errors on
      // user input, so the query needs no escaping of its own.
      armRows(
        scoped(false)
          .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
          .limit(SEARCH_CANDIDATE_CAP),
      ),
      armRows(
        scoped(false).or(trigramOr(q)).order('created_at', { ascending: false }).limit(SEARCH_CANDIDATE_CAP),
      ),
    ])

    const ftsItems = fts.map(toItem)
    const ftsHitIds = new Set(ftsItems.map((i) => i.id))
    const merged = mergeCandidates<LibraryGalleryItem>(ftsItems, trgm.map(toItem))
    const ranked = rankLibraryMatches(merged, q, ftsHitIds)
    return { items: ranked.slice(from, from + pageSize), total: ranked.length }
  }

  let query = scoped(true)
  if (q) query = query.or(trigramOr(q))

  switch (sort) {
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

/** One already-catalogued asset, matched by CONTENT. */
export type LibraryDuplicate = { id: string; url: string | null; title: string }

/**
 * The asset in this space whose stored bytes hash to `sha256`, or null.
 *
 * This is the read half of ingest dedupe, and it rides the index that has been sitting unused since
 * the DAM migration: `library_assets_sha256_idx on (space_id, sha256)`
 * (20260920000000_library_dam.sql:33). Scoped to the space on purpose — two spaces uploading the
 * same stock photo each own their copy, because a shared row would let one space's delete or rename
 * reach into another's Loom.
 *
 * FAIL-SAFE to null: if the lookup errors, the upload proceeds and stores a second copy. A missed
 * dedupe costs disk; a false positive would hand the uploader somebody else's image.
 */
export async function findLibraryAssetBySha256(
  spaceId: string,
  sha256: string,
): Promise<LibraryDuplicate | null> {
  if (!sha256) return null
  try {
    const { data, error } = await db()
      .from('library_assets')
      .select('id, url, title')
      .eq('space_id', spaceId)
      .eq('sha256', sha256)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { id: unknown; url?: string | null; title?: string | null }
    return { id: String(row.id), url: row.url ?? null, title: String(row.title ?? '') }
  } catch {
    return null
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
  /** Stored size. `null` when the caller genuinely does not know it (a file already in storage that
   *  it never read) — NOT 0, which sorts and renders as a real "0 B" asset. */
  bytes: number | null
  kind?: 'image' | 'audio' | 'video'
  /** ── Ingest metadata (PROG-D1). Every field is optional so pre-ingest callers stay byte-identical.
   *  The SERVER-computed half comes from `ingestImageBytes` (lib/library/ingest.ts): a checksum of the
   *  bytes actually stored, and the dimensions read off the file header. */
  sha256?: string | null
  width?: number | null
  height?: number | null
  /** ── The BROWSER-computed half (lib/library/image-describe.ts), because it needs decoded pixels and
   *  a server-side decode would drag `sharp` into this seam. Validated by `readImageDescriptor`
   *  before it reaches here; a server-only caller simply omits it. */
  blurhash?: string | null
  colors?: readonly string[] | null
  /** The SOURCE file's dimensions before the browser's upload downscale — so `width/height` describe
   *  what is stored and `orig_*` describe what the person actually had. */
  origWidth?: number | null
  origHeight?: number | null
  /** Defaults to 'space' — a member upload belongs to ITS space and nothing else, and that default is
   *  the property `space-images.test.ts` locks. The ONE caller that passes 'public' is the Loom
   *  Studio's own upload into the ROOT space, i.e. the Frequency shared/master library, which is
   *  public by definition (docs/LIBRARY.md → Scoping). */
  visibility?: 'private' | 'space' | 'public'
  /** The uploader (library_assets.created_by): the spine of the PERSONAL Loom ("everything I uploaded,
   *  in any context, is in my Loom"). Set on every picker upload so a person's own assets resolve across
   *  spaces; omitted for legacy callers (the column stays null). */
  createdBy?: string | null
  /** Provenance (library_assets.source): 'upload' for a genuine member upload, 'seed'/'import' for
   *  importer content, 'event-claim' for images that arrived with a claimed event. Drives the Loom
   *  "My uploads" filter (only real uploads surface). Omitted = NULL = treated as a real upload. */
  source?: 'upload' | 'seed' | 'import' | 'event-claim' | 'recraft' | 'vera' | 'generated' | 'curated' | null
  /** Facets for the Loom's Tags view. A GENERATED asset must carry 'generated' here: it is what
   *  `toPickAsset` reads to mark an image as AI-made, so an unlabelled generation is not possible
   *  through this path. Omitted = no tags = a plain upload (ADR-993). */
  tags?: readonly string[] | null
  /** How the asset was made (the generator, the prompt, the entity it was drawn for). Stored as-is
   *  on library_assets.config, which is also a provenance signal `toPickAsset` reads. Omitted = {}. */
  config?: Record<string, unknown> | null
}): Promise<string | null> {
  const { data, error } = await db()
    .from('library_assets')
    .insert({
      space_id: input.spaceId,
      kind: input.kind ?? 'image',
      title: input.title,
      slug: input.slug,
      status: 'approved',
      visibility: input.visibility ?? 'space',
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      url: input.url,
      mime: input.mime,
      bytes: input.bytes,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
      ...(input.blurhash ? { blurhash: input.blurhash } : {}),
      ...(input.colors?.length ? { colors: [...input.colors] } : {}),
      ...(input.origWidth ? { orig_width: input.origWidth } : {}),
      ...(input.origHeight ? { orig_height: input.origHeight } : {}),
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.tags?.length ? { tags: [...input.tags] } : {}),
      ...(input.config ? { config: input.config } : {}),
    })
    .select('id')
    .maybeSingle()
  if (error) return null
  return (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null
}

/** Delete a library asset that belongs to a SPACE, bound to `space_id` so a caller authorized for one space
 *  can never delete another space's asset. Returns the stored object's bucket+path for best-effort storage
 *  cleanup, or null when nothing matched. Service-role; the CALLER must authorize the space first. */
export async function deleteSpaceLibraryAsset(
  spaceId: string,
  assetId: string,
): Promise<{ bucket: string | null; path: string | null } | null> {
  const { data, error } = await db()
    .from('library_assets')
    .delete()
    .eq('id', assetId)
    .eq('space_id', spaceId)
    .select('storage_bucket, storage_path')
    .maybeSingle()
  if (error || !data) return null
  const row = data as { storage_bucket?: string | null; storage_path?: string | null }
  return { bucket: row.storage_bucket ?? null, path: row.storage_path ?? null }
}

/** One pickable Loom asset for the universal image picker: the served URL + the label + its `kind`
 *  (image | icon | element | …, so the picker can render/scope by family) + whether it was
 *  AI-generated (an "Element") + its tags (for the Tags facet). */
export type LoomPickAsset = { id: string; title: string; url: string; alt: string | null; kind: string; generated: boolean; tags: string[]; category: string | null }

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
    kind: String(r.kind ?? 'image'),
    generated,
    tags,
    category: (r.category as string | null) ?? null,
  }
}

// The OWNER ("My uploads") provenance gate, as a PostgREST OR expression: show every source EXCEPT the
// business importer's seed/import placeholders (those belong to the space until it is claimed). Written as
// a POSITIVE `in.()` allowlist over the CHECK-constrained `source` vocabulary (library_assets_source_check)
// plus NULL legacy uploads — no negation, so the filter can never be a malformed query — and any source we
// don't list is hidden-by-default (the safe direction). `event-claim` (event photos) IS shown; only
// seed/import are held back. Keep in lockstep with the source CHECK constraint.
const OWNER_SCOPE_SOURCE_OR = 'source.is.null,source.in.(upload,event-claim,recraft,vera,generated,curated)'

/** IMAGE assets in one Loom SCOPE, RANKED when a query is given (stemmed FTS ∪ trigram, ordered by
 *  lib/library/search-rank.ts) and newest-first when it is not; optionally filtered by a single tag,
 *  and by whether to keep only AI-generated "Elements". A scope is either the OWNER's Loom
 *  (`createdBy` = them, UNIONED with the spaces they own via `spaceIds`) or ONE space's own assets
 *  (`spaceId`). FAIL-SAFE to []. */
export async function listLoomScopeImages(
  scope: { createdBy: string; spaceIds?: string[] } | { spaceId: string },
  opts: { q?: string; tag?: string; kinds?: string[]; generatedOnly?: boolean; limit?: number } = {},
): Promise<LoomPickAsset[]> {
  // Every arm shares one scope; only the text predicate differs, so the scope is built per call
  // rather than reused — a PostgREST builder is not re-runnable once awaited.
  const scoped = () => {
    // The asset families this view wants (purpose-scoped popups): a profile-photo picker asks for
    // ['image'], a logo picker ['image','icon'], an Airwaves field ['audio','video']. Default: images.
    const kinds = opts.kinds && opts.kinds.length ? opts.kinds : ['image']
    let query = db()
      .from('library_assets')
      .select('id, title, url, alt, kind, tags, config, category')
      .in('kind', kinds)
      .neq('status', 'archived')
    if ('createdBy' in scope) {
      // OWNER Loom ("My uploads") = every genuine upload across MY profile AND the Spaces I OWN. Ownership
      // is a UNION (created_by = me OR the asset lives in one of my owned spaces), so a page/space owner
      // sees every image uploaded to their pages, not only the ones they personally uploaded. The ONLY
      // thing held back is the business importer's SEED/IMPORT placeholder content — it belongs to the
      // space until someone claims it. Event photos, legacy NULL uploads, and everything else stay visible.
      // PostgREST ANDs separate `.or()` calls, so this is (ownership) AND (not a seed placeholder).
      const ownedIds = 'spaceIds' in scope ? scope.spaceIds ?? [] : []
      const ownership = ownedIds.length
        ? `created_by.eq.${scope.createdBy},space_id.in.(${ownedIds.join(',')})`
        : `created_by.eq.${scope.createdBy}`
      query = query.or(ownership).or(OWNER_SCOPE_SOURCE_OR)
    } else {
      query = query.eq('space_id', scope.spaceId)
    }
    if (opts.tag) query = query.contains('tags', [opts.tag])
    return query
  }

  try {
    const text = (opts.q ?? '').replace(/[,()*]/g, ' ').trim()
    const limit = Math.min(opts.limit ?? 120, 200)
    const shape = (data: unknown) => {
      let rows = ((data as Array<Record<string, unknown>> | null) ?? []).map(toPickAsset).filter((a) => a.url.length > 0)
      if (opts.generatedOnly) rows = rows.filter((a) => a.generated)
      return rows
    }

    // No query: the plain newest-first browse, unchanged.
    if (!text) {
      const { data } = await scoped().order('created_at', { ascending: false }).limit(limit)
      return shape(data)
    }

    // A query: the same two indexed arms the Studio uses (stemmed FTS ∪ trigram substring), ranked
    // by lib/library/search-rank.ts. The picker is where a member types a half-remembered word, so
    // it is the surface that gains most from the typo tolerance.
    const [fts, trgm] = await Promise.all([
      armRows(scoped().textSearch('search_tsv', text, { type: 'websearch', config: 'english' }).limit(limit)),
      armRows(scoped().or(trigramOr(text)).order('created_at', { ascending: false }).limit(limit)),
    ])
    const ftsAssets = shape(fts)
    const ftsHitIds = new Set(ftsAssets.map((a) => a.id))
    return rankLibraryMatches(mergeCandidates<LoomPickAsset>(ftsAssets, shape(trgm)), text, ftsHitIds).slice(0, limit)
  } catch {
    return []
  }
}

/** The distinct image TAGS present in a Loom scope (busiest first), for the picker's Tags facet.
 *  FAIL-SAFE to []. */
export async function listLoomScopeTags(
  scope: { createdBy: string; spaceIds?: string[] } | { spaceId: string },
  kinds: string[] = ['image'],
): Promise<string[]> {
  try {
    const wanted = kinds.length ? kinds : ['image']
    let query = db().from('library_assets').select('tags').in('kind', wanted).neq('status', 'archived')
    if ('createdBy' in scope) {
      // Match listLoomScopeImages: the owner Tags facet spans my uploads + my owned spaces, minus seeds.
      const ownedIds = 'spaceIds' in scope ? scope.spaceIds ?? [] : []
      const ownership = ownedIds.length
        ? `created_by.eq.${scope.createdBy},space_id.in.(${ownedIds.join(',')})`
        : `created_by.eq.${scope.createdBy}`
      query = query.or(ownership).or(OWNER_SCOPE_SOURCE_OR)
    } else {
      query = query.eq('space_id', scope.spaceId)
    }
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
