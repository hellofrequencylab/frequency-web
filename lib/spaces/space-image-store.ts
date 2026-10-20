import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** Store a Space's cover or logo image under the Space's own folder in the public bucket and return its URL.
 *  The caller has already proven it may edit the Space: the Space console's uploadSpaceImage by the Frequency
 *  session, the website editor's uploadWebsiteLogo by the site-admin pass on the site's own host (SCAN-832). */
export async function storeSpaceImage(
  spaceId: string,
  kind: 'cover' | 'logo',
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const folder = kind === 'cover' ? 'covers' : 'logos'
  const path = `spaces/${spaceId}/${folder}/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true })
  if (error) return { error: error.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)
  return { url: data.publicUrl }
}
