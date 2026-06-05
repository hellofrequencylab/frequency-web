import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isCodeLive } from '@/lib/qr/codes'
import { track } from '@/lib/analytics/track'
import { recordEngagementEvent } from '@/lib/engagement/events'
import {
  CHANNEL_COOKIE,
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE,
  encodeFirstTouch,
  type FirstTouch,
} from '@/lib/attribution/first-touch'
import { joinCircle } from '@/app/(main)/circles/actions'
import { checkInEvent } from '@/app/(main)/events/actions'
import { listActiveVariants, pickVariant } from '@/lib/entry-points/ab'

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
    .select('id, active, valid_from, valid_until, destination_type, target_url, alt_target_url, switch_at, node_id, circle_id, event_id, purpose, owner_profile_id, source_tag')
    .eq('slug', slug)
    .maybeSingle()

  if (!code || !isCodeLive(code)) return unavailable

  // A/B (ADR-135): an entry point (url code) can split traffic across destination
  // variants. Pick one by weight; it overrides the target, is logged on the scan, and
  // (for an anonymous scanner) rides a fq_var cookie so the eventual signup attributes
  // its conversion to this variant. No active variants ⇒ the default destination.
  let abVariantKey: string | null = null
  let abTarget: string | null = null
  if (code.destination_type === 'url') {
    const chosen = pickVariant(await listActiveVariants(code.id))
    if (chosen) {
      abVariantKey = chosen.key
      abTarget = chosen.targetUrl
    }
  }

  // Best-effort scan log (with coarse IP-geo for the locator map) — never blocks the
  // redirect. The edge sets these; they're absent locally, so geo is just null then.
  const profileId = await getMyProfileId()
  const h = request.headers
  const city = h.get('x-vercel-ip-city')
  const lat = Number(h.get('x-vercel-ip-latitude'))
  const lng = Number(h.get('x-vercel-ip-longitude'))
  // Channel attribution: a programmed NFC tag encodes `?m=nfc`; a printed QR has no
  // marker and falls back to 'qr'. Same code, distinct medium in the scan log.
  const medium = new URL(request.url).searchParams.get('m') === 'nfc' ? 'nfc' : 'qr'
  await admin
    .rpc('record_qr_scan', {
      p_code_id: code.id,
      p_profile: profileId ?? undefined,
      p_country: h.get('x-vercel-ip-country') ?? undefined,
      p_city: city ? decodeURIComponent(city) : undefined,
      p_lat: Number.isFinite(lat) ? lat : undefined,
      p_lng: Number.isFinite(lng) ? lng : undefined,
      p_medium: medium,
      p_variant: abVariantKey ?? undefined,
    })
    .then(() => {}, () => {})
  // First-party + GA4 funnel event (covers dynamic links, member + marketing codes).
  void track('qr.scanned', { purpose: code.purpose ?? 'none', destination: code.destination_type, medium }, profileId)

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
  const hasFirstTouch = (request.headers.get('cookie') ?? '').includes(`${FIRST_TOUCH_COOKIE}=`)
  const withReferral = (res: NextResponse) => {
    // Mark the channel for any anonymous scan (ADR-095) — attribution at signup.
    if (!profileId) {
      res.cookies.set(CHANNEL_COOKIE, 'qr_scan', { path: '/', maxAge: FIRST_TOUCH_MAX_AGE, sameSite: 'lax' })
      // First-touch wins: stamp the code/source only if no prior touch exists, so the
      // eventual signup traces to THIS poster (ADR-107). Persisted at onboarding.
      if (!hasFirstTouch) {
        const touch: FirstTouch = {
          ts: new Date().toISOString(),
          landing: `/q/${slug}`.slice(0, 200),
          code: slug,
          utm: { source: 'qr_scan', ...(code.source_tag ? { campaign: code.source_tag } : {}) },
        }
        res.cookies.set(FIRST_TOUCH_COOKIE, encodeFirstTouch(touch), {
          path: '/',
          maxAge: FIRST_TOUCH_MAX_AGE,
          sameSite: 'lax',
        })
      }
    }
    if (creditOwner && code.owner_profile_id) {
      res.cookies.set('fq_ref', code.owner_profile_id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    // A/B: remember which variant this anonymous scanner saw, so their signup
    // attributes the conversion (app/onboarding/actions.ts → applyEntryPointConversion).
    if (!profileId && abVariantKey) {
      res.cookies.set('fq_var', `${code.id}:${abVariantKey}`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    return res
  }

  if (code.destination_type === 'url' && (abTarget || code.target_url)) {
    // A/B variant wins; else time-aware: after switch_at, resolve to the alternate.
    const switched =
      code.switch_at && code.alt_target_url && new Date(code.switch_at).getTime() <= Date.now()
    const target = abTarget ?? (switched ? code.alt_target_url! : code.target_url!)
    return withReferral(NextResponse.redirect(new URL(target, origin)))
  }
  if (code.destination_type === 'node' && code.node_id) {
    return withReferral(to(`/n/${code.node_id}`))
  }

  // One-tap circle join: join on scan (signed-in), then land on the circle.
  if (code.destination_type === 'circle' && code.circle_id) {
    const { data: circle } = await admin
      .from('circles')
      .select('slug')
      .eq('id', code.circle_id)
      .maybeSingle()
    if (!circle) return unavailable
    if (profileId) await joinCircle(code.circle_id, circle.slug).catch(() => {})
    return withReferral(to(`/circles/${circle.slug}`))
  }

  // Event code: RSVP + verified-practice check-in on scan (check-in only succeeds
  // once the event has started — before then it just RSVPs), then land on the event.
  if (code.destination_type === 'event' && code.event_id) {
    const { data: ev } = await admin
      .from('events')
      .select('slug')
      .eq('id', code.event_id)
      .maybeSingle()
    if (!ev) return unavailable
    if (profileId) {
      // Ensure a 'going' RSVP (idempotent), then run the verified-practice check-in.
      const { data: existing } = await admin
        .from('event_rsvps')
        .select('id')
        .eq('event_id', code.event_id)
        .eq('profile_id', profileId)
        .maybeSingle()
      if (!existing) {
        await admin
          .from('event_rsvps')
          .insert({ event_id: code.event_id, profile_id: profileId, status: 'going' })
          .then(() => {}, () => {})
      }
      await checkInEvent(code.event_id).catch(() => {})
    }
    return withReferral(to(`/events/${ev.slug}`))
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
