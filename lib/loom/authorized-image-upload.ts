import 'server-only'
import { slugify } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertSpaceLibraryImage, findLibraryAssetBySha256 } from '@/lib/library/store'
import { ingestImageBytes } from '@/lib/library/ingest'
import { loomAdmits } from '@/lib/library/quota'
import { readImageDescriptor } from '@/lib/library/image-describe'
import { classifyLoomUpload, effectiveMime, fallbackExtFor, fallbackMimeFor } from '@/lib/library/upload-kinds'

/** Canonical upload pipeline. Callers must authorize the site/scope and profile first. */
export async function uploadAuthorizedLoomImage(spaceId: string, profileId: string, formData: FormData, websiteSafe = false): Promise<{ url: string; id: string } | { error: string }> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file chosen.' }
  // Recover a missing/misreported MIME from the filename (iPhone .heic photos often arrive with a blank
  // File.type), so a real image is classified + uploaded with a correct content-type instead of rejected.
  const mime = effectiveMime(file.type, file.name)
  const target = classifyLoomUpload(mime)
  if (!target || target.kind !== 'image') return { error: 'Choose an image file.' }
  if (file.size > target.maxBytes) {
    return { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(target.maxBytes / 1024 / 1024)} MB.` }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || fallbackExtFor(target.kind)).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${spaceId}/${stamp}.${ext}`

  // INGEST (PROG-D1): strip EXIF/XMP/IPTC, checksum the result, read the dimensions — before the
  // bytes reach storage, so what is stored is what was hashed.
  const ingested = ingestImageBytes(new Uint8Array(await file.arrayBuffer()), mime)

  // DEDUPE: the same photo, uploaded twice into the same Loom, is one asset. Answer with the row that
  // is already there rather than storing a second copy of identical bytes. Note this is now
  // METADATA-INSENSITIVE — two exports of one picture that differ only in their EXIF block hash the
  // same, because the hash is taken AFTER the strip.
  const existing = websiteSafe
    ? await findLibraryAssetBySha256(spaceId, ingested.sha256, true)
    : await findLibraryAssetBySha256(spaceId, ingested.sha256)
  if (existing?.url) return { url: existing.url, id: existing.id }

  // BUDGET (LIVE-567, ADR-1585): one bucket serves every Space, so a Space's Loom has a cap. Ask the
  // one gate (loomAdmits, LIVE-629 / ADR-1602: the owning Space's cap and what it already stores)
  // BEFORE storage; refuse past the cap. A failed Space read or a failed sum refuses too: a quota
  // that fails open is not a quota. The root Space (and so a personal upload) is uncapped and skips
  // the sum. A dedupe hit above stores nothing, so it is answered before the budget is asked.
  const verdict = await loomAdmits(spaceId, ingested.bytes.byteLength)
  if (!verdict.ok) return { error: verdict.error }

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, ingested.bytes, { contentType: mime || fallbackMimeFor(target.kind), upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)
  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 120)
  const slug = slugify(`${base}-${stamp}`)

  // The browser's half of ingest (blurhash + palette + pre-downscale dimensions), validated here
  // because it arrived from a client. Absent on any uploader that has not adopted it yet.
  const described = readImageDescriptor(formData)

  const id = await insertSpaceLibraryImage({
    spaceId,
    title: base,
    slug,
    storageBucket: target.bucket,
    storagePath: path,
    url: pub.publicUrl,
    mime: mime || fallbackMimeFor(target.kind),
    bytes: ingested.bytes.byteLength,
    kind: 'image',
    createdBy: profileId,
    source: 'upload',
    sha256: ingested.sha256,
    width: ingested.width,
    height: ingested.height,
    blurhash: described.blurhash,
    colors: described.colors,
    origWidth: described.origWidth ?? ingested.width,
    origHeight: described.origHeight ?? ingested.height,
  })
  if (!id) {
    await admin.storage.from(target.bucket).remove([path])
    return { error: 'Could not save the image to your Loom. Try again.' }
  }
  return { url: pub.publicUrl, id }
}
