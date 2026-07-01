'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId, searchLibraryAssets } from '@/lib/library/store'

// Server actions behind the Loom-backed image field (lib/page-editor/loom-image-field.tsx). A
// 'use server' module exports ONLY async functions, so the pure field component + its Puck config
// import THESE, never a server-only module (the build trap: the editor bundle stays client-safe and
// the public profile ships no editor runtime).
//
// Two capabilities, both scoped to Frequency's shared/master Loom (the root space's library, the same
// catalog Loom Studio browses):
//   listLoomImages(): the operator PICKS an existing Loom image asset.
//   uploadToLoom():    the operator UPLOADS a new image, which FILES INTO the Loom (a library_assets
//                      row) so it is catalogued + reusable, then returns its served URL.
// Both resolve images through the Loom asset `url` (the library-media public URL the ingest pipeline
// stamps, which is the rendition-served address), so an image picked or uploaded here resolves the
// same way it does everywhere the Loom is used. Staff-gated (marketer), matching the site-media field.

/** One pickable Loom image: the served URL plus the label the picker grid shows. */
export type LoomImagePick = {
  id: string
  title: string
  url: string
  alt: string | null
}

/** The most-recent image assets in the shared Loom, optionally filtered by a text query. FAIL-SAFE
 *  to [] (a missing root space, an empty catalog, or any error). Only file-backed images with a
 *  resolvable URL ride through, so every result renders. */
export async function listLoomImages(query?: string): Promise<LoomImagePick[]> {
  try {
    await requireStaff('marketer')
    const spaceId = await getRootSpaceId()
    if (!spaceId) return []
    const { items } = await searchLibraryAssets({
      spaceId,
      kind: 'image',
      q: query?.trim() || undefined,
      sort: 'new',
      pageSize: 60,
    })
    return items
      .filter((i) => typeof i.url === 'string' && i.url.length > 0)
      .map((i) => ({ id: i.id, title: i.title || 'Untitled', url: i.url as string, alt: i.alt }))
  } catch {
    return []
  }
}

const MAX_BYTES = 20 * 1024 * 1024 // matches the Loom uploader ceiling

/** Upload an image and FILE IT INTO the shared Loom (a `library_assets` row, kind='image'), then
 *  return its served public URL. The block stores that URL (the same address the Loom serves it at),
 *  so a picked asset + an uploaded asset resolve identically. Staff-gated. Rolls back the stored file
 *  if the catalog insert fails, so a failed upload never litters storage. */
export async function uploadToLoom(
  formData: FormData,
): Promise<{ url: string; id: string } | { error: string }> {
  await requireStaff('marketer')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No image chosen.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > MAX_BYTES) {
    return { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.` }
  }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'The shared library is not available right now.' }

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
  const { data: inserted, error: insErr } = await dbh
    .from('library_assets')
    .insert({
      space_id: spaceId,
      kind: 'image',
      title: base,
      slug,
      status: 'approved',
      visibility: 'public',
      storage_bucket: 'library-media',
      storage_path: path,
      url: pub.publicUrl,
      mime: file.type || 'image/jpeg',
      bytes: file.size,
    })
    .select('id')
    .maybeSingle()
  if (insErr) {
    // Roll back the orphaned file so a failed insert doesn't leave litter in storage.
    await admin.storage.from('library-media').remove([path])
    return { error: insErr.message }
  }

  return { url: pub.publicUrl, id: String((inserted as { id?: unknown } | null)?.id ?? '') }
}
