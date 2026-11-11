// PAGE VERSIONS, the server side of the E0 writer (PROG-E0, docs/EDITOR-E0.md section 3).
//
// publishVersioned and revertToVersion call the two SQL functions from migration 20270346043000, which do the
// whole job in one transaction: lock the page, take the next revision, insert the immutable version row, swap
// the published_version_id pointer, and dual-write published_data. This file only shapes the call and the
// failure. A page's versions are listed newest first, bodies left out, so a history list stays small.
//
// Dark: nothing reaches it unless EDITOR_CANVAS is on (see app/(main)/edit/actions.ts). Server only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

export interface PageVersionMeta {
  id: string
  revision: number
  title: string | null
  note: string | null
  createdAt: string
  createdBy: string | null
}

export interface PublishArgs {
  spaceId: string
  slug: string
  title: string
  data: unknown
  profileId: string | null
  note?: string | null
}

export async function publishVersioned(args: PublishArgs): Promise<{ versionId: string; revision: number }> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('publish_page_version', {
    p_space_id: args.spaceId,
    p_slug: args.slug,
    p_title: args.title,
    p_data: args.data as Json,
    ...(args.profileId ? { p_by: args.profileId } : {}),
    ...(args.note ? { p_note: args.note.slice(0, 200) } : {}),
  })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('Publish returned no version.')
  return { versionId: row.version_id, revision: row.revision }
}

export async function revertToVersion(args: {
  spaceId: string
  slug: string
  versionId: string
  profileId: string | null
}): Promise<{ revision: number }> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('revert_page_to_version', {
    p_space_id: args.spaceId,
    p_slug: args.slug,
    p_version_id: args.versionId,
    ...(args.profileId ? { p_by: args.profileId } : {}),
  })
  if (error) throw new Error(error.message)
  return { revision: data as number }
}

async function pageId(spaceId: string, slug: string): Promise<string | null> {
  const db = createAdminClient()
  const { data, error } = await db.from('pages').select('id').eq('space_id', spaceId).eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/** Newest first, document bodies left out. Empty for a page that has never been published versioned. */
export async function listPageVersions(spaceId: string, slug: string, limit = 50): Promise<PageVersionMeta[]> {
  const id = await pageId(spaceId, slug)
  if (!id) return []
  const db = createAdminClient()
  const { data, error } = await db
    .from('page_versions')
    .select('id, revision, title, note, created_at, created_by')
    .eq('page_id', id)
    .order('revision', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200))
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    revision: r.revision,
    title: r.title,
    note: r.note,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }))
}

/** One version's document, only if it belongs to the page. */
export async function readPageVersion(spaceId: string, slug: string, versionId: string): Promise<unknown | null> {
  const id = await pageId(spaceId, slug)
  if (!id) return null
  const db = createAdminClient()
  const { data, error } = await db.from('page_versions').select('data').eq('id', versionId).eq('page_id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.data ?? null
}
