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

  await track(event, body.props ?? {}, profile.id)
  return new NextResponse(null, { status: 204 })
}
