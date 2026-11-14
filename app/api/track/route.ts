// First-party client event sink (ADR-070, ANALYTICS.md). Accepts only client-
// emittable taxonomy events (navigation + UI interaction) — server-authoritative
// events are recorded server-side and can't be spoofed here. Member-tied (no new
// cookies); anonymous posts are dropped. Consent-gated server-side (analytics scope,
// ADR-069, same gate as /api/observe): a member who turned off Product analytics is
// silently not recorded, because every row here is keyed to their profile. Server-
// authoritative events (joins, RSVPs) call track() directly and are not affected
// (SCAN-765). Returns 204; never blocks the UI.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
import { hasConsent } from '@/lib/consent/consent'
import { isClientEvent } from '@/lib/analytics/events'
import { currentAnalyticsAudience } from '@/lib/analytics/audience'
import { analyticsAllowed, parseConsentChoice, CONSENT_COOKIE, CONSENT_REGION_COOKIE } from '@/lib/consent/cookie-consent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { event?: string; props?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const event = body?.event
  if (!event || !isClientEvent(event)) return new NextResponse(null, { status: 400 })

  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieValue = (name: string) => cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`))?.trim().slice(name.length + 1)
  if (!analyticsAllowed({ choice: parseConsentChoice(cookieValue(CONSENT_COOKIE)), priorConsentRegion: cookieValue(CONSENT_REGION_COOKIE) === '1' })) return new NextResponse(null, { status: 204 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 204 }) // member-tied only; drop anon

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return new NextResponse(null, { status: 204 })

  // Consent gate (ADR-069): no analytics consent → silently drop (SCAN-765).
  if (!(await hasConsent(profile.id, 'analytics'))) return new NextResponse(null, { status: 204 })

  // This is a trusted current-request read, including real staff membership under
  // view-as. Client-provided consent or role flags never decide eligibility.
  const audience = await currentAnalyticsAudience().catch(() => ({ allowed: false, staff: false }))
  if (!audience.allowed || audience.staff) return new NextResponse(null, { status: 204 })

  // The browser already mirrors eligible client events to GA. Its payload may not
  // supply a server MP identity or an authoritative actor/idempotency key and cause
  // a second, differently attributed event. GA cookies are not needed for our own
  // consenting first-party collection.
  const reserved = new Set(['gaclientid', 'gasessionid', 'clientid', 'sessionid', 'userid', 'actorprofileid', 'profileid', 'idempotencykey', 'consent', 'analyticsconsent', 'staff', 'isstaff'])
  const rawProps = body.props && typeof body.props === 'object' && !Array.isArray(body.props) ? body.props : {}
  const props = Object.fromEntries(Object.entries(rawProps).filter(([key]) => !reserved.has(key.toLowerCase().replace(/[_-]/g, ''))))
  await track(event, props, profile.id)
  return new NextResponse(null, { status: 204 })
}
