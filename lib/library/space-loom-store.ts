import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadRootSpaceId } from '@/lib/spaces/store'
import type { Database } from '@/lib/database.types'
import { mergeCandidates, rankLibraryMatches } from './search-rank'
import { isLibraryAssetExpired } from './types'
import { armRows, notExpiredOr, toPickAsset, trigramOr, type LoomPickAsset, type LoomSharedMode } from './store'

// THE SPACE LOOM ON THE CALLER'S SESSION (LIVE-571, ADR-1613; child 6 of PROG-D5 under ADR-1559).
//
// 20270345009500 (LIVE-570, ADR-1594) walled the Loom tables by Space: a Space's active members read
// its rows, any signed-in caller reads `visibility = 'public'` rows, platform staff read everything,
// and a write needs private.can_write_space_content. A wall nothing reads through is documentation,
// so the Space Loom's reads and its metadata write live here, on createClient() from
// lib/supabase/server, and this file never imports the service-role client. What a Space's Loom may
// show a caller is now what the policies let that caller read. The action's Space check
// (canEditProfile for the picker, canManageSpaceLoom for the Studio) is the SECOND wall, and every
// query below still binds to the Space by id, so a wrong id in one action is refused twice.
//
// The house precedent is LIVE-335 (lib/feed/community-board.ts, ADR-1555): same fail-safe, same test
// proving the module never imports @/lib/supabase/admin.
//
// NOT HERE, and why they stay on the service role (lib/library/store.ts, lib/loom/picker-actions.ts):
//   • the picker's personal scope ('mine'): a union over the caller's own uploads and every Space
//     they OWN. A personal upload lands in the ROOT Space with visibility 'space', and the policies
//     have no created_by arm, so on the session a person could not read their own uploads;
//   • the UPLOAD, the fork copy and the delete: each is half a storage.objects write, and storage
//     policies are PROG-D6;
//   • the admin Studio: it manages the root Space for the platform.
// The root Space's id (for the shared shelf) comes from lib/spaces/store: it names which Space is the
// shared library, not any Loom row, so no Loom row is read around the policies.
//
// FAIL-SAFE, never an error: a failed or refused session read is [] (or false), exactly as the admin
// reads were, so the Studio renders its empty state rather than an error page.

type LibraryAssetUpdate = Database['public']['Tables']['library_assets']['Update']

/** The columns a Space-scope pick reads. `space_id` and `visibility` ride along for the shelf's
 *  second wall (only the root's public rows) and nothing else; `storage_path` is kept on a row only
 *  when the caller asked for protected rows, to sign their proofs (LIVE-580). */
const PICK_COLUMNS =
  'id, title, url, alt, kind, tags, config, category, is_protected, expires_at, blurhash, space_id, visibility, storage_path'

/**
 * IMAGE assets in ONE Space's Loom, on the caller's session: RANKED when a query is given (stemmed
 * FTS ∪ trigram, ordered by lib/library/search-rank.ts) and newest-first when it is not, optionally
 * filtered by one tag and to AI-generated "Elements". `shared` widens the scope to the Frequency
 * shared library (LIVE-569, ADR-1587): omitted = the Space's own rows; 'with' = its own rows first,
 * then the root Space's PUBLIC rows; 'only' = the root's public rows alone (the Studio's Frequency
 * shelf). Every pick carries `ownedByViewer`, so the two sets are badged apart. FAIL-SAFE to [].
 */
export async function listSpaceLoomImages(
  spaceId: string,
  opts: {
    q?: string
    tag?: string
    kinds?: string[]
    generatedOnly?: boolean
    limit?: number
    shared?: LoomSharedMode
    /** Keep a protected row whose file is private (no url) so the caller can show its proof
     *  (LIVE-580). A caller that sets this MUST pass the list through withLoomProofs before it
     *  reaches a browser; without it such a row is dropped, as every pick reader always did. */
    includeProtected?: boolean
  } = {},
): Promise<LoomPickAsset[]> {
  if (!spaceId) return []
  // 'with' is the two sets, each read and ranked on its own, the Space's own first.
  if (opts.shared === 'with') {
    const [own, shelf] = await Promise.all([
      listSpaceLoomImages(spaceId, { ...opts, shared: undefined }),
      listSpaceLoomImages(spaceId, { ...opts, shared: 'only' }),
    ])
    return [...own, ...shelf]
  }
  // The shared library is the ROOT Space's public rows, so the root is resolved only when asked. The
  // root's own Studio has no separate shelf (its rows ARE the shared library), and a missing root
  // reads as "no shared library", never as a wider query.
  let sharedRoot: string | null = null
  if (opts.shared === 'only') {
    let rootId: string | null = null
    try {
      rootId = await loadRootSpaceId()
    } catch {
      rootId = null
    }
    if (!rootId || rootId === spaceId) return []
    sharedRoot = rootId
  }
  /** The second wall on every returned row: the shelf holds only the root's public rows. */
  const inScope = (r: Record<string, unknown>) =>
    !sharedRoot || (r.space_id === sharedRoot && r.visibility === 'public')

  try {
    const supabase = await createClient()
    // Every arm shares one scope; only the text predicate differs, so the scope is built per call
    // rather than reused: a PostgREST builder is not re-runnable once awaited.
    const scoped = () => {
      const kinds = opts.kinds && opts.kinds.length ? opts.kinds : ['image']
      let query = supabase
        .from('library_assets')
        .select(PICK_COLUMNS)
        .in('kind', kinds)
        .neq('status', 'archived')
        // A licensed asset whose expires_at has passed is not offered for placement (LIVE-576).
        .or(notExpiredOr())
      // The root BY ID and public: a third Space that marked a row public is still not offered here.
      query = sharedRoot ? query.eq('space_id', sharedRoot).eq('visibility', 'public') : query.eq('space_id', spaceId)
      if (opts.tag) query = query.contains('tags', [opts.tag])
      return query
    }

    const text = (opts.q ?? '').replace(/[,()*]/g, ' ').trim()
    const limit = Math.min(opts.limit ?? 120, 200)
    const shape = (data: unknown) => {
      let rows = ((data as Array<Record<string, unknown>> | null) ?? [])
        // The SQL predicate is the gate; this is the second wall, so an arm added later without
        // `.or(notExpiredOr())` still cannot hand the picker a licence that ran out.
        .filter((r) => !isLibraryAssetExpired((r.expires_at as string | null) ?? null))
        .filter(inScope)
        .map((r) => {
          const a: LoomPickAsset = { ...toPickAsset(r), ownedByViewer: !sharedRoot }
          // The key rides only for a caller that asked for protected rows (it signs their proofs).
          if (opts.includeProtected === true && typeof r.storage_path === 'string' && r.storage_path.length > 0) {
            a.storagePath = r.storage_path
          }
          return a
        })
        .filter((a) => a.url.length > 0 || (a.isProtected && !!a.storagePath))
      if (opts.generatedOnly) rows = rows.filter((a) => a.generated)
      return rows
    }

    // No query: the plain newest-first browse.
    if (!text) {
      const { data } = await scoped().order('created_at', { ascending: false }).limit(limit)
      return shape(data)
    }

    // A query: the two indexed arms (stemmed FTS ∪ trigram substring), ranked in process.
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

/** The distinct TAGS on one Space's Loom assets of the given kinds (busiest first), for the Tags
 *  facet, on the caller's session. FAIL-SAFE to []. */
export async function listSpaceLoomTags(spaceId: string, kinds: string[] = ['image']): Promise<string[]> {
  if (!spaceId) return []
  try {
    const supabase = await createClient()
    const wanted = kinds.length ? kinds : ['image']
    const { data } = await supabase
      .from('library_assets')
      .select('tags')
      .in('kind', wanted)
      .neq('status', 'archived')
      .eq('space_id', spaceId)
      .limit(2000)
    const counts = new Map<string, number>()
    for (const r of (data as Array<{ tags: unknown }> | null) ?? []) {
      if (Array.isArray(r.tags)) for (const t of r.tags) if (typeof t === 'string' && t.trim()) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  } catch {
    return []
  }
}

/** Is `assetId` one of this Space's own Loom rows, as the caller's session sees it? A read bound to
 *  space_id; a failed or refused read is NO. The Studio asks it before a usage read or a delete, so a
 *  Space never learns where another Space's image is placed. */
export async function spaceLoomHoldsAsset(spaceId: string, assetId: string): Promise<boolean> {
  if (!spaceId || !assetId) return false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('library_assets')
      .select('id')
      .eq('space_id', spaceId)
      .eq('id', assetId)
      .maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}

/**
 * Write a validated patch (title, alt, tags: LIVE-568) onto ONE asset of ONE Space, on the caller's
 * session. The update is bound to `space_id` as well as `id`, and the update policy asks
 * private.can_write_space_content, so the database refuses a caller the Space would not let write.
 * A policy-filtered update is not an error in PostgREST, it matches no row, so an empty answer is
 * told apart by one more read: a row the caller can SEE but not change is 'refused' (their role in
 * the Space does not write content: a viewer, or platform staff outside the Space); a row they cannot
 * see is 'missing' (another Space's id). 'failed' is a database error.
 */
export async function updateSpaceLoomAssetMeta(
  spaceId: string,
  assetId: string,
  patch: Pick<LibraryAssetUpdate, 'title' | 'alt' | 'tags'>,
): Promise<'ok' | 'missing' | 'refused' | 'failed'> {
  if (!spaceId || !assetId) return 'missing'
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('library_assets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', assetId)
      .eq('space_id', spaceId)
      .select('id')
      .maybeSingle()
    if (error) return 'failed'
    if (data) return 'ok'
    return (await spaceLoomHoldsAsset(spaceId, assetId)) ? 'refused' : 'missing'
  } catch {
    return 'failed'
  }
}
