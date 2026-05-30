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
