import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isCodeLive } from '@/lib/qr/codes'
import { track } from '@/lib/analytics/track'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { CHANNEL_COOKIE, FIRST_TOUCH_MAX_AGE } from '@/lib/attribution/first-touch'

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
  // First-party + GA4 funnel event (covers dynamic links, member + marketing codes).
  void track('qr.scanned', { purpose: code.purpose ?? 'none', destination: code.destination_type }, profileId)

  // Drive QR campaign challenges (scavenger hunts). Idempotent per (code, member),
  // so progress counts distinct codes; the rules engine advances any challenge whose
  // set includes this code. Signed-in scans only.
  if (profileId) {
    void recordEngagementEvent({
      idempotencyKey: `qrscan:${code.id}:${profileId}`,
      source: 'qr',
      eventType: 'qr_scan',
      actorProfileId: profileId,
      context: { qrCodeId: code.id },
      gamificationEvent: { type: 'qr_scan', profileId, qrCodeId: code.id },
    }).catch(() => {})
  }

  // Owner-owned codes — member connect/referral codes AND crew marketing funnels —
  // credit their owner: drop the referral cookie for an ANONYMOUS scanner so a later
  // signup is attributed at onboarding (app/onboarding/actions.ts). A signed-in
  // member is already here, so there's nothing to attribute.
  const creditOwner = !profileId && !!code.owner_profile_id
  const withReferral = (res: NextResponse) => {
    // Mark the channel for any anonymous scan (ADR-095) — attribution at signup.
    if (!profileId) {
      res.cookies.set(CHANNEL_COOKIE, 'qr_scan', { path: '/', maxAge: FIRST_TOUCH_MAX_AGE, sameSite: 'lax' })
    }
    if (creditOwner && code.owner_profile_id) {
      res.cookies.set('fq_ref', code.owner_profile_id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    return res
  }

  if (code.destination_type === 'url' && code.target_url) {
    return withReferral(NextResponse.redirect(new URL(code.target_url, origin)))
  }
  if (code.destination_type === 'node' && code.node_id) {
    return withReferral(to(`/n/${code.node_id}`))
  }

  if (code.destination_type === 'action' && code.owner_profile_id) {
    if (code.purpose === 'referral') {
      if (profileId) {
        // Already a member — there's nothing to attribute; show the owner.
        const handle = await ownerHandle(admin, code.owner_profile_id)
        return to(handle ? `/people/${handle}` : '/')
      }
      // New visitor — remember who referred them, then send to sign-in.
      return withReferral(to('/sign-in'))
    }
    if (code.purpose === 'gift_zap') {
      if (!profileId) return withReferral(to(`/sign-in?next=/q/${slug}`))
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
