// First-party client event sink (ADR-070, ANALYTICS.md). Accepts only client-
// emittable taxonomy events (navigation + UI interaction) — server-authoritative
// events are recorded server-side and can't be spoofed here. Member-tied (no new
// cookies); anonymous posts are dropped. Returns 204; never blocks the UI.
//
// CONSENT-GATED (SCAN-765, same gate as /api/observe, ADR-069). Every row this sink writes is an
// engagement_events row keyed to the member's profile, which is exactly the "first-party usage data
// tied to your account" the Product analytics toggle promises to stop. Only this client sink is
// gated: track() itself stays open because it also records server-authoritative events (joins,
// RSVPs, account.created) that feed dashboards and rewards.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
import { isClientEvent } from '@/lib/analytics/events'
import { hasConsent } from '@/lib/consent/consent'

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

  // Consent gate (ADR-069): no analytics consent → silently drop, nothing is stored.
  if (!(await hasConsent(profile.id, 'analytics'))) return new NextResponse(null, { status: 204 })

  await track(event, body.props ?? {}, profile.id)
  return new NextResponse(null, { status: 204 })
}
