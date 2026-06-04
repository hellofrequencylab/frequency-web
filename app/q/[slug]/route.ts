import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isCodeLive } from '@/lib/qr/codes'

export const dynamic = 'force-dynamic'

// The universal dynamic-code resolver. A route handler (not a page) so it can set
// the referral cookie and redirect server-side. Logs the scan, then sends the
// visitor to the code's CURRENT destination:
//   • url      → the target (any link)
//   • node     → /n/<id> (the verified earn pipeline)
//   • action   → referral (cookie + sign-in, or owner profile) / gift_zap (confirm)
// qr_codes RLS denies client reads, so we use the admin client here.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const origin = new URL(request.url).origin
  const to = (path: string) => NextResponse.redirect(new URL(path, origin))
  const unavailable = to('/code-unavailable')

  const { data: code } = await admin
    .from('qr_codes')
    .select('id, active, valid_from, valid_until, destination_type, target_url, node_id, purpose, owner_profile_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!code || !isCodeLive(code)) return unavailable

  // Best-effort scan log — never blocks the redirect.
  const profileId = await getMyProfileId()
  await admin
    .rpc('record_qr_scan', { p_code_id: code.id, p_profile: profileId ?? undefined })
    .then(() => {}, () => {})

  if (code.destination_type === 'url' && code.target_url) {
    return NextResponse.redirect(new URL(code.target_url, origin))
  }
  if (code.destination_type === 'node' && code.node_id) {
    return to(`/n/${code.node_id}`)
  }

  if (code.destination_type === 'action' && code.owner_profile_id) {
    if (code.purpose === 'referral') {
      if (profileId) {
        // Already a member — there's nothing to attribute; show the owner.
        const handle = await ownerHandle(admin, code.owner_profile_id)
        return to(handle ? `/people/${handle}` : '/')
      }
      // New visitor — remember who referred them, then send to sign-in. The
      // attribution is applied at onboarding (app/onboarding/actions.ts).
      const res = to('/sign-in')
      res.cookies.set('fq_ref', code.owner_profile_id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }
    if (code.purpose === 'gift_zap') {
      if (!profileId) return to(`/sign-in?next=/q/${slug}`)
      return to(`/g/${slug}`) // confirm page → POST awards the zap
    }
  }

  return unavailable
}

async function ownerHandle(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
): Promise<string | null> {
  const { data } = await admin.from('profiles').select('handle').eq('id', ownerId).maybeSingle()
  return data?.handle ?? null
}
