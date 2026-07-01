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
  alt: string | null
  category: string | null
  tags: string[]
  url: string | null
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  storagePath: string | null
  createdAt: string
}

const SELECT =
  'id, kind, status, title, alt, category, tags, url, mime, bytes, width, height, storage_path, created_at'

function toItem(r: Record<string, unknown>): LibraryGalleryItem {
  return {
    id: String(r.id),
    kind: String(r.kind),
    status: String(r.status ?? 'approved'),
    title: String(r.title ?? ''),
    alt: (r.alt as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    url: (r.url as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    bytes: (r.bytes as number | null) ?? null,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  }
}

export type LibrarySort = 'new' | 'old' | 'title' | 'size'

export type LibraryQuery = {
  spaceId: string
  q?: string
  kind?: string
  sort?: LibrarySort
  includeArchived?: boolean
  limit?: number
}

/** Search + filter a space's assets. Text search is a safe substring match over
 *  title/description/category (FTS ranking + trigram is a follow-up, D7); tags/kind are
 *  exact facets. Archived assets are hidden unless asked for. */
export async function searchLibraryAssets(opts: LibraryQuery): Promise<LibraryGalleryItem[]> {
  let query = db().from('library_assets').select(SELECT).eq('space_id', opts.spaceId)

  if (!opts.includeArchived) query = query.neq('status', 'archived')
  if (opts.kind) query = query.eq('kind', opts.kind)

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

  const { data } = await query.limit(opts.limit ?? 200)
  return ((data as Array<Record<string, unknown>> | null) ?? []).map(toItem)
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
