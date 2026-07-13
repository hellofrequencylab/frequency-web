'use server'

// The Loom — replace an asset's underlying file, keeping the SAME asset id (Airwaves P2, ADR-608 §7e).
// This is what lets an operator swap a Recording's audio/video (a re-cut, a louder master, a fixed export)
// without breaking a single reference: recordings.loom_asset_id, every recording_attachment, and every
// embedded block all point at this asset id, so they all follow the new file automatically. The prior file
// is snapshotted into library_versions (reuse lib/library/versions.recordVersion) BEFORE the swap, so the
// change is reversible (rollbackToVersion). Janitor-gated. Image behavior is intact: an image replaced with
// an image lands in library-media exactly as an upload would; the classifier decides the bucket.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordVersion } from '@/lib/library/versions'
import { classifyLoomUpload, fallbackMimeFor } from '@/lib/library/upload-kinds'

/** Replace the file behind a Loom asset. The asset id (and every reference to it) is preserved; only the
 *  stored file + its metadata (url / path / bucket / mime / bytes) change. The previous file is versioned
 *  first. Returns the new public url on success. */
export async function replaceLibraryAssetFile(
  assetId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { error: string }> {
  await requireAdmin('janitor')
  const id = (assetId ?? '').trim()
  if (!id) return { error: 'Missing asset id.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  const target = classifyLoomUpload(file.type)
  if (!target) return { error: 'Only image, audio, or video files.' }
  if (file.size > target.maxBytes) {
    const limitMb = Math.round(target.maxBytes / 1024 / 1024)
    return { error: `File must be under ${limitMb}MB.` }
  }

  const admin = createAdminClient()
  // eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (untyped seam, ADR-246)
  const handle = admin as unknown as SupabaseClient

  // Load the current asset so the replacement stays scoped to its Space and we know its current kind.
  const { data: assetRow } = await handle
    .from('library_assets')
    .select('id, space_id, kind')
    .eq('id', id)
    .maybeSingle()
  const asset = assetRow as { id: string; space_id: string; kind: string } | null
  if (!asset) return { error: 'That asset no longer exists.' }

  // Snapshot the CURRENT file into a version BEFORE the swap, so the replace is reversible.
  await recordVersion(id, `Replaced file (${target.kind})`)

  // Upload the new file to a fresh path (the old file is preserved for the version snapshot).
  const ext = (file.name.split('.').pop() || target.kind).toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${asset.space_id}/${stamp}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = file.type || fallbackMimeFor(target.kind)

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, bytes, { contentType, upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)

  const { error: updErr } = await handle
    .from('library_assets')
    .update({
      storage_bucket: target.bucket,
      storage_path: path,
      url: pub.publicUrl,
      mime: contentType,
      bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updErr) {
    // Roll back the orphaned upload so a failed update leaves no litter.
    await admin.storage.from(target.bucket).remove([path])
    return { error: updErr.message }
  }

  revalidatePath('/admin/library')
  return { ok: true, url: pub.publicUrl }
}
