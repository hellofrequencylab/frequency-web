// The Yes button on "Did you make it?" (LIVE-803). The token IS the credential: it is an HMAC
// over the seat (an RSVP or a guest ticket) the link was minted for, verified before anything
// is read. A valid Yes records one self-reported attendance (lib/events/made-it.ts) and lands
// the person on the event page; anything else lands them on the home page and records nothing.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { madeItKey, verifyMadeItToken, type SeatKind } from '@/lib/events/made-it'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const kind = url.searchParams.get('k') as SeatKind | null
  const seatId = url.searchParams.get('s') ?? ''
  const token = url.searchParams.get('t') ?? ''
  const home = new URL('/', url)
  if ((kind !== 'rsvp' && kind !== 'ticket') || !verifyMadeItToken(kind, seatId, token)) {
    return NextResponse.redirect(home)
  }

  const admin = createAdminClient()
  const { data: seat } = kind === 'rsvp'
    ? await admin.from('event_rsvps').select('event_id, profile_id').eq('id', seatId).maybeSingle()
    : await admin.from('event_tickets').select('event_id, profile_id:buyer_profile_id').eq('id', seatId).maybeSingle()
  const row = seat as { event_id: string; profile_id: string | null } | null
  if (!row) return NextResponse.redirect(home)

  const { data: ev } = await admin.from('events').select('slug').eq('id', row.event_id).maybeSingle()

  await recordEngagementEvent({
    idempotencyKey: madeItKey(row.event_id, { kind, id: seatId, profileId: row.profile_id }),
    source: 'web',
    eventType: 'event_attend',
    actorProfileId: row.profile_id,
    context: { eventId: row.event_id, kind: 'made_it', seat: kind, self_reported: true },
  }).catch(() => {})

  return NextResponse.redirect(ev?.slug ? new URL(`/events/${ev.slug}?made_it=1`, url) : home)
}
