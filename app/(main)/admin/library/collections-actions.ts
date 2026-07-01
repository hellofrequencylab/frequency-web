'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/library/store'

// Loom Studio — collections (custom folders) + bulk asset edits. All janitor-gated and
// service-role (library_* isn't in database.types yet — the repo's untyped-table pattern).
// See docs/LIBRARY.md. Collections use library_collections + library_collection_items
// (ADR-480); membership is many-to-many so an asset can live in several folders.

// eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const dbh = () => createAdminClient() as unknown as SupabaseClient

const MAX_BATCH = 500

/** Trim + validate a list of asset ids. */
function cleanIds(ids: string[]): string[] {
  return Array.from(new Set((ids ?? []).filter((s) => typeof s === 'string' && s.length > 0))).slice(0, MAX_BATCH)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

/** Create a collection (folder) in the shared library. Returns its id. */
export async function createCollection(
  title: string,
  description?: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')

  const t = (title || '').trim().slice(0, 120)
  if (!t) return { error: 'Give the collection a name.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found; cannot scope the collection.' }

  const base = slugify(t) || 'collection'
  const row = {
    space_id: spaceId,
    title: t,
    description: (description || '').trim().slice(0, 400) || null,
    created_by: ctx.profileId,
  }

  // Retry once with a random suffix if the (space_id, slug) unique index collides.
  let { data, error } = await dbh().from('library_collections').insert({ ...row, slug: base }).select('id').maybeSingle()
  if (error && (error.code === '23505' || /duplicate|unique/i.test(error.message))) {
    ;({ data, error } = await dbh()
      .from('library_collections')
      .insert({ ...row, slug: `${base}-${Math.round(Math.random() * 1e6).toString(36)}` })
      .select('id')
      .maybeSingle())
  }
  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  return { ok: true, id: String((data as { id: string }).id) }
}

/** Rename a collection. */
export async function renameCollection(id: string, title: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!id) return { error: 'Missing collection id.' }
  const t = (title || '').trim().slice(0, 120)
  if (!t) return { error: 'Name cannot be empty.' }

  const { error } = await dbh().from('library_collections').update({ title: t }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Delete a collection (its membership rows cascade; the assets themselves stay). */
export async function deleteCollection(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!id) return { error: 'Missing collection id.' }
  const { error } = await dbh().from('library_collections').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Add assets to a collection (idempotent — ignores ones already in it). */
export async function addAssetsToCollection(
  collectionId: string,
  assetIds: string[],
): Promise<{ ok: true; added: number } | { error: string }> {
  await requireAdmin('janitor')
  if (!collectionId) return { error: 'Missing collection.' }
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }

  const rows = ids.map((asset_id) => ({ collection_id: collectionId, asset_id }))
  const { error } = await dbh()
    .from('library_collection_items')
    .upsert(rows, { onConflict: 'collection_id,asset_id', ignoreDuplicates: true })
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true, added: ids.length }
}

/** Remove assets from a collection. */
export async function removeAssetsFromCollection(
  collectionId: string,
  assetIds: string[],
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!collectionId) return { error: 'Missing collection.' }
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }

  const { error } = await dbh()
    .from('library_collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .in('asset_id', ids)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Bulk set the category (folder) on many assets at once. */
export async function bulkSetCategory(
  assetIds: string[],
  category: string,
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }
  const cat = (category || '').trim().slice(0, 80)

  const { error } = await dbh()
    .from('library_assets')
    .update({ category: cat || null, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Bulk add tags (union with each asset's existing tags). Tags arrive comma-separated. */
export async function bulkAddTags(assetIds: string[], tags: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }
  const add = (tags || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (add.length === 0) return { error: 'No tags to add.' }

  const { data, error: readErr } = await dbh().from('library_assets').select('id, tags').in('id', ids)
  if (readErr) return { error: readErr.message }

  const now = new Date().toISOString()
  for (const r of (data as Array<{ id: string; tags: string[] | null }> | null) ?? []) {
    const merged = Array.from(new Set([...(r.tags ?? []), ...add])).slice(0, 40)
    const { error } = await dbh().from('library_assets').update({ tags: merged, updated_at: now }).eq('id', r.id)
    if (error) return { error: error.message }
  }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Bulk archive (soft-remove) many assets. */
export async function bulkArchive(assetIds: string[]): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }
  const { error } = await dbh()
    .from('library_assets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Bulk permanent delete: remove stored files, then the rows (membership cascades). */
export async function bulkDelete(assetIds: string[]): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  const ids = cleanIds(assetIds)
  if (ids.length === 0) return { error: 'No assets selected.' }

  const admin = createAdminClient()
  // eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  const handle = admin as unknown as SupabaseClient

  const { data } = await handle.from('library_assets').select('storage_bucket, storage_path').in('id', ids)
  const byBucket: Record<string, string[]> = {}
  for (const r of (data as Array<{ storage_bucket: string | null; storage_path: string | null }> | null) ?? []) {
    if (r.storage_bucket && r.storage_path) (byBucket[r.storage_bucket] ??= []).push(r.storage_path)
  }
  for (const [bucket, paths] of Object.entries(byBucket)) {
    if (paths.length) await admin.storage.from(bucket).remove(paths)
  }

  const { error } = await handle.from('library_assets').delete().in('id', ids)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}
