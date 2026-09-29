import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText, EMBED_DIM } from '@/lib/ai/embed'
import { fetchLibraryItemsByIds, type LibraryGalleryItem } from './store'

// The Loom — semantic search Phase 1 (docs/RESEARCH-ASSET-GEN.md). Reuses the gte-small `embed`
// edge function (384-d, key-free) + the match_room_messages pattern. A cron backfills embeddings
// (content-hash gated, so unchanged assets are skipped). "Most relevant" ranks through
// lib/library/hybrid-search.ts, which fuses this embedding with the word arms in one RPC
// (LIVE-586); "Find similar" stays here. Service-role only.

const db = () => createAdminClient()

/** pgvector wants a bracketed literal for a vector parameter over PostgREST. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

type EmbedRow = {
  id: string
  title: string | null
  description: string | null
  category: string | null
  tags: string[] | null
  kind: string | null
  embedding_hash: string | null
}

/** The text an asset is embedded from — what a person would search for. */
function embedSource(r: EmbedRow): string {
  return [r.title, r.description, r.category, (r.tags ?? []).join(' '), r.kind]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' \n ')
    .slice(0, 2000)
}

function hashOf(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

/** Embed library assets whose text is new or changed (content-hash gated). Driven by the cron;
 *  best-effort per row. Returns how many were (re)embedded and how many were scanned. */
export async function reindexLibraryEmbeddings(batch = 500): Promise<{ embedded: number; scanned: number }> {
  const client = db()
  const { data } = await client
    .from('library_assets')
    .select('id, title, description, category, tags, kind, embedding_hash')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(batch)

  const rows = (data as EmbedRow[] | null) ?? []
  let embedded = 0
  for (const r of rows) {
    const text = embedSource(r)
    const hash = text ? hashOf(text) : 'empty'
    if (r.embedding_hash === hash) continue // unchanged since last embed
    try {
      const v = text ? await embedText(text) : new Array(EMBED_DIM).fill(0)
      await client
        .from('library_assets')
        .update({ embedding: toVectorLiteral(v), embedding_hash: hash })
        .eq('id', r.id)
      embedded++
    } catch {
      /* skip; the next run retries */
    }
  }
  return { embedded, scanned: rows.length }
}

/** Assets most similar to a given one (visual/semantic neighbours by embedding). */
export async function similarLibraryAssets(
  spaceId: string,
  assetId: string,
  limit = 24,
): Promise<LibraryGalleryItem[]> {
  try {
    const { data, error } = await db().rpc('similar_library_assets', {
      p_asset_id: assetId,
      match_count: limit,
    })
    if (error) throw new Error(error.message)
    const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id)
    return fetchLibraryItemsByIds(spaceId, ids)
  } catch {
    return []
  }
}
