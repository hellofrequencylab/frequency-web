'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/library/store'

// Upload an image into The Loom: store the file in the `library-media` bucket and write a
// `library_assets` row (kind='image', scoped to the root/shared library). Janitor-gated.
// Minimal D1 slice — dedupe / renditions / EXIF-strip come next (docs/BUILD-LIST.md → The Loom).
export async function uploadLibraryImage(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')

  const file = formData.get('file')
  const rawTitle = (formData.get('title') as string | null)?.trim()
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (!file.type.startsWith('image/')) return { error: 'Only image files for now.' }
  if (file.size > 20 * 1024 * 1024) return { error: 'Image must be under 20MB.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found; cannot scope the asset.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${spaceId}/${stamp}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('library-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from('library-media').getPublicUrl(path)

  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 120)
  const slug = `${base}-${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  const dbh = admin as unknown as SupabaseClient
  const { error: insErr } = await dbh.from('library_assets').insert({
    space_id: spaceId,
    kind: 'image',
    title: rawTitle || base,
    slug,
    status: 'approved',
    visibility: 'public',
    storage_bucket: 'library-media',
    storage_path: path,
    url: pub.publicUrl,
    mime: file.type || 'image/jpeg',
    bytes: file.size,
  })
  if (insErr) {
    // Roll back the orphaned file so a failed insert doesn't leave litter in storage.
    await admin.storage.from('library-media').remove([path])
    return { error: insErr.message }
  }

  revalidatePath('/admin/library')
  return { ok: true }
}

// eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const dbh = () => createAdminClient() as unknown as SupabaseClient

/** Edit an asset's metadata. Tags arrive as a comma-separated string. Janitor-gated. */
export async function updateLibraryAssetMeta(
  id: string,
  fields: { title?: string; alt?: string; category?: string; tags?: string },
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!id) return { error: 'Missing asset id.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) {
    const t = fields.title.trim()
    if (!t) return { error: 'Title cannot be empty.' }
    patch.title = t.slice(0, 200)
  }
  if (fields.alt !== undefined) patch.alt = fields.alt.trim().slice(0, 500) || null
  if (fields.category !== undefined) patch.category = fields.category.trim().slice(0, 80) || null
  if (fields.tags !== undefined) {
    patch.tags = fields.tags
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
  }

  const { error } = await dbh().from('library_assets').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Soft-remove: hide from the library without destroying the file or breaking references. */
export async function archiveLibraryAsset(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!id) return { error: 'Missing asset id.' }
  const { error } = await dbh()
    .from('library_assets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Permanently delete: remove the stored file, then the row. Janitor-gated. */
export async function deleteLibraryAsset(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!id) return { error: 'Missing asset id.' }

  const admin = createAdminClient()
  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
  const handle = admin as unknown as SupabaseClient
  const { data } = await handle
    .from('library_assets')
    .select('storage_bucket, storage_path')
    .eq('id', id)
    .maybeSingle()
  const row = data as { storage_bucket: string | null; storage_path: string | null } | null
  if (row?.storage_bucket && row.storage_path) {
    await admin.storage.from(row.storage_bucket).remove([row.storage_path])
  }

  const { error } = await handle.from('library_assets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}
