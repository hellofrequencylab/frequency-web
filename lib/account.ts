// Self-serve account deletion (ADR-036, App Store requirement). Hard-deletes the
// member: removing the auth user cascades to the profile row (auth_user_id FK)
// and its content (own content CASCADE; authored-by SET NULL per migration
// 20240212). Server-only; the caller must confirm intent. Uses the service-role
// admin client (required for auth.admin.deleteUser).

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

export async function deleteMyAccount(): Promise<{ ok: boolean }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id')
    .eq('id', myProfileId)
    .maybeSingle()

  const authUserId = profile?.auth_user_id
  if (!authUserId) {
    // No auth link (should not happen for a signed-in member): soft-deactivate
    // as a safe fallback so the record stops appearing in the product.
    await admin.from('profiles').update({ is_active: false }).eq('id', myProfileId)
    return { ok: true }
  }

  const { error } = await admin.auth.admin.deleteUser(authUserId)
  if (error) {
    console.error('[deleteMyAccount]', error.message)
    return { ok: false }
  }
  return { ok: true }
}
