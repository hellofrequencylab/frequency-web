'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/staff'

// Upload an image to the public `site-media` bucket and return its public URL.
// Staff-gated; called from the Puck image field in the editor.
export async function uploadSiteMedia(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireStaff('marketer')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('site-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) return { error: error.message }

  const { data } = admin.storage.from('site-media').getPublicUrl(path)
  return { url: data.publicUrl }
}

// The max images a single multi-upload accepts, so one drop can't stage an unbounded batch.
const MAX_BATCH = 12

/** Upload MANY images to the `site-media` bucket in one call (the gallery multi-upload). Reuses the
 *  SAME bucket + per-file validation as `uploadSiteMedia`; staff-gated once for the batch. Returns the
 *  public URLs of the files that uploaded, plus a first error string (if any) so the field can surface
 *  what was skipped. A partial batch still returns its successes. */
export async function uploadSiteMediaBatch(
  formData: FormData,
): Promise<{ urls: string[]; error?: string }> {
  await requireStaff('marketer')

  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { urls: [], error: 'No files selected.' }

  const admin = createAdminClient()
  const urls: string[] = []
  let firstError: string | undefined

  for (const file of files.slice(0, MAX_BATCH)) {
    if (!file.type.startsWith('image/')) {
      firstError ??= `${file.name || 'A file'} is not an image and was skipped.`
      continue
    }
    if (file.size > 8 * 1024 * 1024) {
      firstError ??= `${file.name || 'A file'} is over 8MB and was skipped.`
      continue
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await admin.storage
      .from('site-media')
      .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
    if (error) {
      firstError ??= error.message
      continue
    }
    urls.push(admin.storage.from('site-media').getPublicUrl(path).data.publicUrl)
  }

  if (files.length > MAX_BATCH) {
    firstError ??= `Only the first ${MAX_BATCH} images were added.`
  }
  return { urls, error: firstError }
}
