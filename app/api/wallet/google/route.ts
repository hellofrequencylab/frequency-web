// "Add to Google Wallet" for a member's profile (connect) code (ADR-107).
// GET /api/wallet/google?code=<qr_code id> → redirects to the Google save link.
// Gated: 404 when Wallet isn't configured (env-gated, see lib/wallet/google.ts).
// The caller must own the code (or be host+), since a pass carries their identity.

import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { shortLinkUrl } from '@/lib/qr/links'
import { isGoogleWalletConfigured, buildGoogleWalletSaveUrl } from '@/lib/wallet/google'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isGoogleWalletConfigured()) return new Response('Wallet passes are not enabled.', { status: 404 })

  const me = await getCallerProfile()
  const myId = await getMyProfileId()
  if (!me || !myId) return new Response('Sign in first.', { status: 401 })

  const codeId = new URL(request.url).searchParams.get('code')
  if (!codeId) return new Response('Missing code.', { status: 400 })

  const db = createAdminClient()
  const { data: code } = await db
    .from('qr_codes')
    .select('slug, purpose, owner_profile_id')
    .eq('id', codeId)
    .maybeSingle()
  if (!code || code.purpose !== 'connect' || !code.owner_profile_id) {
    return new Response('Not a profile code.', { status: 404 })
  }
  // Only the owner (or an operator) can mint a pass that carries the owner's identity.
  if (code.owner_profile_id !== myId && !atLeastRole(me.community_role, 'host')) {
    return new Response('That isn’t your code.', { status: 403 })
  }

  const { data: owner } = await db
    .from('profiles')
    .select('handle, display_name')
    .eq('id', code.owner_profile_id)
    .maybeSingle()
  if (!owner) return new Response('Unknown member.', { status: 404 })

  const saveUrl = buildGoogleWalletSaveUrl({
    profileId: code.owner_profile_id,
    handle: owner.handle,
    displayName: owner.display_name ?? '',
    url: shortLinkUrl(code.slug),
  })
  if (!saveUrl) return new Response('Wallet passes are not enabled.', { status: 404 })

  return Response.redirect(saveUrl, 302)
}
