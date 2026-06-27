import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// All profile-image writes go through here, on the SERVER, using the service-role
// client. Why: the browser Supabase client frequently has no session under
// SSR-cookie auth (the access token lives in cookies the page reads server-side,
// not in the browser client's storage), so a client-side `storage.upload()` goes
// out as `anon`. The `avatars` owner-INSERT policy is `TO authenticated`, so an
// anon upload fails default-deny with "new row violates row-level security policy"
// (observed for a real member whose photo silently never landed). Resolving the
// caller's auth user id server-side and writing with the service role removes that
// whole failure mode. The path stays `{authUserId}/{kind}.{ext}`, so the public
// URL shape and the owner-scoped read/update/delete policies are unchanged.

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matches the bucket's file_size_limit
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export type ProfileImageKind = 'avatar' | 'header'

/**
 * Upload a profile image to the public `avatars` bucket and return its public URL
 * (cache-busted). Throws on an oversized or unsupported image. The caller must
 * have already resolved + verified `authUserId` from the session.
 */
export async function uploadProfileImage(
  authUserId: string,
  bytes: Uint8Array,
  contentType: string,
  kind: ProfileImageKind,
): Promise<string> {
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`Image is too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
  }
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) {
    throw new Error('Unsupported image type. Use JPEG, PNG, GIF, or WebP.')
  }

  const admin = createAdminClient()
  const path = `${authUserId}/${kind}.${ext}`
  const { error } = await admin.storage
    .from('avatars')
    .upload(path, bytes, { upsert: true, contentType })
  if (error) throw new Error(error.message)

  const { data } = admin.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
