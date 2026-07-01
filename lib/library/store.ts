import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-only data access for The Loom. `library_assets` isn't in lib/database.types.ts
// yet (the migration is applied but types aren't regenerated), so we use an untyped admin
// handle — the repo's standard pattern for a freshly-added table (see the space_segments /
// questionnaire actions). Service-role only; callers gate access. See docs/LIBRARY.md.

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

/** A gallery row — the subset the browser needs. */
export type LibraryGalleryItem = {
  id: string
  kind: string
  title: string
  url: string | null
  mime: string | null
  bytes: number | null
  createdAt: string
}

/** List a space's assets, newest first. */
export async function listLibraryAssets(spaceId: string, limit = 200): Promise<LibraryGalleryItem[]> {
  const { data } = await db()
    .from('library_assets')
    .select('id, kind, title, url, mime, bytes, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    title: String(r.title ?? ''),
    url: (r.url as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    bytes: (r.bytes as number | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  }))
}
