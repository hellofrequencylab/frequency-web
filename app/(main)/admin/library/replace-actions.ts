'use server'

// The Loom — replace an asset's underlying file, keeping the SAME asset id (Airwaves P2, ADR-608 §7e).
// This is what lets an operator swap a Recording's audio/video (a re-cut, a louder master, a fixed export)
// without breaking a single reference: recordings.loom_asset_id, every recording_attachment, and every
// embedded block all point at this asset id, so they all follow the new file automatically. The prior file
// is snapshotted into library_versions (reuse lib/library/versions.recordVersion) BEFORE the swap, so the
// change is reversible (rollbackToVersion). Studio-gated. Image behavior is intact: an image replaced with
// an image lands in library-media exactly as an upload would; the classifier decides the bucket.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordVersion } from '@/lib/library/versions'
import { classifyLoomUpload, fallbackMimeFor } from '@/lib/library/upload-kinds'
import { ingestImageBytes } from '@/lib/library/ingest'

// Studio-gated: every action below carries the page's OWN gate —
// `requireAdmin('janitor', { staff: 'marketing' })`, the same call `page.tsx` makes. See the door
// note at the top of `./actions.ts` for the defect that came of not doing this (LIVE-289).

/** Replace the file behind a Loom asset. The asset id (and every reference to it) is preserved; only the
 *  stored file + its metadata (url / path / bucket / mime / bytes) change. The previous file is versioned
 *  first. Returns the new public url on success.
 *
 *  This is also the save path of the Loom crop/rotate editor (HYG-109, ADR-1592): the browser redraws
 *  the image and posts the result here with an optional `note` ("Cropped (Square (1:1)), rotated 90°")
 *  that labels the version, so a crop is versioned, ingested and rolled back exactly like a replace. */
export async function replaceLibraryAssetFile(
  assetId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { error: string }> {
  const ctx = await requireAdmin('janitor', { staff: 'marketing' })
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
    .select('id, space_id, kind, is_protected')
    .eq('id', id)
    .maybeSingle()
  const asset = assetRow as { id: string; space_id: string; kind: string; is_protected: boolean } | null
  if (!asset) return { error: 'That asset no longer exists.' }
  // A protected asset's file lives in the private bucket (LIVE-577, ADR-1595). The upload below writes
  // to the PUBLIC bucket the classifier names, so a replace here would quietly put a new original on
  // the open web under a Protected row. Refuse instead; the operator releases it first.
  if (asset.is_protected) return { error: 'This asset is protected. Switch Protected off to replace its file.' }

  // Snapshot the CURRENT file into a version BEFORE the swap, so the replace is reversible.
  const rawNote = formData.get('note')
  const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 120) : ''
  await recordVersion(id, note || `Replaced file (${target.kind})`, ctx.profileId)

  // Upload the new file to a fresh path (the old file is preserved for the version snapshot).
  const ext = (file.name.split('.').pop() || target.kind).toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${asset.space_id}/${stamp}.${ext}`
  const contentType = file.type || fallbackMimeFor(target.kind)
  // INGEST (ADR-1121, LIVE-579): a replacement is an upload, so it strips private metadata and the
  // row's checksum and dimensions follow the NEW file. Audio/video pass through untouched (no strip
  // exists for them) and keep only the checksum; ingest-coverage.test.ts holds this.
  const ingested = ingestImageBytes(new Uint8Array(await file.arrayBuffer()), file.type)

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, ingested.bytes, { contentType, upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)

  const { error: updErr } = await handle
    .from('library_assets')
    .update({
      storage_bucket: target.bucket,
      storage_path: path,
      url: pub.publicUrl,
      mime: contentType,
      bytes: ingested.bytes.byteLength,
      sha256: ingested.sha256,
      ...(target.kind === 'image' ? { width: ingested.width, height: ingested.height } : {}),
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
