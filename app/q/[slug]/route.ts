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
import { referralsEnabled } from '@/lib/platform-flags'
import { normalizeSplash, primarySplashLink } from '@/lib/qr/splash'
import { renderSplashPage } from '@/lib/qr/splash-render'
import { captureQrContact } from '@/lib/connections/qr-capture'

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

  // `splash` isn't in the generated DB types yet (ADR-246), so the typed `.select` rejects it. Read
  // this row through an UNTYPED client cast (like getSpaceBySlug reads `visibility` in store.ts) and
  // hand-type the projected shape, so the new `splash` column rides along with the existing columns.
  type CodeRow = {
    id: string
    active: boolean
    valid_from: string | null
    valid_until: string | null
    destination_type: string
    target_url: string | null
    alt_target_url: string | null
    switch_at: string | null
    node_id: string | null
    circle_id: string | null
    event_id: string | null
    purpose: string | null
    owner_profile_id: string | null
    source_tag: string | null
    splash: unknown
  }
  type UntypedQuery = {
    select: (cols: string) => UntypedQuery
    eq: (col: string, val: string) => UntypedQuery
    maybeSingle: () => Promise<{ data: CodeRow | null }>
  }
  const untypedQr = (admin as unknown as { from: (t: string) => UntypedQuery }).from('qr_codes')
  const { data: code } = await untypedQr
    .select(
      'id, active, valid_from, valid_until, destination_type, target_url, alt_target_url, switch_at, node_id, circle_id, event_id, purpose, owner_profile_id, source_tag, splash',
    )
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
  // The referral master switch (platform_flags.referrals_enabled, operator control at
  // /admin/onboarding-controls) gates ONLY the attribution cookie: with referrals off
  // we still log the scan and redirect, we just don't drop fq_ref, so no new referral
  // credit accrues (existing rewards untouched). Defaults on; off cleanly stops attribution.
  const creditOwner = !profileId && !!code.owner_profile_id && (await referralsEnabled())
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

  // IN-PERSON QR CAPTURE (CRM-STRATEGY §4, ADR-361, P2). When a SIGNED-IN member
  // scans another member's PERSONAL connect/referral code (owner-owned, the personal
  // connect QR), keep them as a private contact and drop them into the follow-up
  // moment. One-way only: pre-filled from the owner's PUBLIC profile, stamped with
  // where/when they met — it never touches the marketing `contacts` DB and never
  // notifies the owner.
  // Scope is narrow on purpose: only a signed-in NON-owner, only a personal code.
  // Everything else (anonymous scanners, self-scans, the owner-profile view, the
  // splash/url/event/circle branches, every cookie) is untouched below. If the
  // capture returns null (skip / any error), we fall through to the existing
  // behavior so the scan never breaks.
  const isPersonalCode =
    !!code.owner_profile_id && (code.purpose === 'connect' || code.purpose === 'referral')
  if (profileId && isPersonalCode && code.owner_profile_id && profileId !== code.owner_profile_id) {
    // Met-context from what the scan already knows: the event/Space the code carries
    // (if any), else the coarse IP-geo city. Date defaults to today inside capture.
    let metAt: string | null = code.event_id ? await eventTitle(admin, code.event_id) : null
    if (!metAt && city) metAt = decodeURIComponent(city)
    const contactId = await captureQrContact(profileId, code.owner_profile_id, { at: metAt })
    if (contactId) {
      // Land on the captured contact's detail page — the P1 "Follow up" section is
      // right there, so "set a follow-up now" is one tap away.
      return to(`/connections/${contactId}`)
    }
    // null → fall through to the existing signed-in routing (owner profile view, etc.).
  }

  // SPLASH (ENTITY-SPACES-BUILD §C, Phase 2): when a code carries a valid splash, a scan sees the
  // splash landing instead of a bare redirect. Two behaviors, both AFTER the scan is logged + the
  // referral/first-touch cookies are set (so a splash code still counts + attributes):
  //   • A/B variant in play -> the variant wins (skip the splash), so split-traffic codes keep their
  //     existing behavior unchanged.
  //   • Otherwise, if the splash has a PRIMARY CTA, redirect straight to it (the owner's chosen main
  //     action). If it has no links, RENDER the splash landing page (heading + blurb + image).
  // A code WITHOUT a splash (or a malformed one) falls through to every existing branch below,
  // unchanged. A relative-path or a same-origin CTA resolves against the request origin.
  const splash = abTarget ? null : normalizeSplash(code.splash)
  if (splash) {
    const cta = primarySplashLink(splash)
    if (cta) {
      return withReferral(NextResponse.redirect(new URL(cta.url, origin)))
    }
    // No CTA: render the splash landing itself (cookies are set via withReferral on the HTML response).
    const html = renderSplashPage(splash, origin)
    return withReferral(
      new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    )
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

/** The title of the event a code carries (for the met-context stamp), or null. */
async function eventTitle(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<string | null> {
  const { data } = await admin.from('events').select('title').eq('id', eventId).maybeSingle()
  return data?.title ?? null
}
