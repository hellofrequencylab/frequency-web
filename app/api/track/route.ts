// First-party client event sink (ADR-070, ANALYTICS.md). Accepts only client-
// emittable taxonomy events (navigation + UI interaction) — server-authoritative
// events are recorded server-side and can't be spoofed here. Member-tied (no new
// cookies); anonymous posts are dropped. Returns 204; never blocks the UI.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
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

  await track(event, body.props ?? {}, profile?.id ?? null)
  return new NextResponse(null, { status: 204 })
}
