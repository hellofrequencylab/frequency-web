// The Zap menu's live line from Vera (ADR-230). Deliberately CHEAP: this backs
// the most-tapped button in the app, so there is no AI call and no generation
// here — it reuses today's already-cached Dispatch when one exists (Vera
// already wrote it), else falls to a deterministic streak/time template. The
// client renders a static fallback instantly and swaps when this arrives.

import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchDay } from '@/lib/on-air/dispatch-day'
import { HOME_TZ, zoneOffsetMinutes } from '@/lib/time/zone'
import { shortLinkUrl } from '@/lib/qr/links'

export const dynamic = 'force-dynamic'

function templateLine(streak: number, hour: number): string {
  if (streak >= 2) {
    if (hour >= 18) return `Day ${streak}. One log tonight keeps the run alive.`
    return `Day ${streak}. Catch something real today.`
  }
  if (hour >= 18) return 'The day counts when you log it. Catch one thing.'
  return 'Every run starts with one. Catch today.'
}

export async function GET() {
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ line: null }, { status: 401 })

  const admin = createAdminClient()
  // The SAME key vera_dispatches is minted under — imported, never re-derived (SCAN-106). This was
  // its own `toISOString().slice(0, 10)`, i.e. the server's UTC day, so once vera-dispatch.ts moved
  // to the community's day a re-derived key here would have missed today's cached Dispatch on every
  // request after ~5pm Pacific and silently fallen back to the template line.
  const day = dispatchDay()

  // Reuse today's Dispatch verbatim when it exists — never generate from here.
  const { data: dispatch } = await admin
    .from('vera_dispatches')
    .select('copy')
    .eq('profile_id', profileId)
    .eq('day', day)
    .maybeSingle()
  let line = (dispatch as { copy: string } | null)?.copy ?? null
  // One profile read serves the streak line and the post box's avatar orb (LIVE-2423).
  const { data: profRow } = await admin
    .from('profiles')
    .select('current_streak, display_name, avatar_url')
    .eq('id', profileId)
    .maybeSingle()
  const prof = profRow as { current_streak: number | null; display_name: string | null; avatar_url: string | null } | null
  const me = { name: prof?.display_name ?? '', avatar: prof?.avatar_url ?? null }
  if (!line) {
    const streak = Number(prof?.current_streak ?? 0)
    // The COMMUNITY's hour, not the server's. `getUTCHours()` put the "tonight" line on screen
    // from 5pm-midnight UTC — 9am to 4pm Pacific — i.e. it read "One log tonight" over lunch and
    // never once in the evening. Same 5pm-Pacific rollover as the day key above. Shifting the
    // instant by the zone offset and reading UTC parts is this repo's wall-clock convention.
    const now = new Date()
    const hour = new Date(now.getTime() + zoneOffsetMinutes(now, HOME_TZ) * 60_000).getUTCHours()
    line = templateLine(streak, hour)
  }

  // A live event the member is going to and hasn't checked into → the menu's
  // Check In tile pulses (ADR-237). Events without an end time count as live
  // for 12 hours after they start.
  let liveEvent = false
  const { data: rsvps } = await admin
    .from('event_rsvps')
    .select('event_id, events!event_id ( id, starts_at, ends_at, is_cancelled )')
    .eq('profile_id', profileId)
    .eq('status', 'going')
  type RsvpRow = {
    event_id: string
    events: { id: string; starts_at: string; ends_at: string | null; is_cancelled: boolean } | null
  }
  const nowMs = Date.now()
  const live = ((rsvps ?? []) as unknown as RsvpRow[]).filter((r) => {
    const e = r.events
    if (!e || e.is_cancelled) return false
    const starts = Date.parse(e.starts_at)
    const ends = e.ends_at ? Date.parse(e.ends_at) : starts + 12 * 3_600_000
    return starts <= nowMs && nowMs <= ends
  })
  if (live.length > 0) {
    const keys = live.map((r) => `event_checkin:${r.events!.id}:${profileId}`)
    const { data: done } = await admin
      .from('engagement_events')
      .select('idempotency_key')
      .in('idempotency_key', keys)
    liveEvent = (done ?? []).length < live.length
  }

  // The member's own personal code (LIVE-2423): the Zap menu leads with it, so the QR is one tap
  // from the button. Read only, scoped to the caller; onboarding provisions it, and a member
  // without one yet gets null and the menu points at /codes instead.
  const { data: own } = await admin
    .from('qr_codes')
    .select('id, slug')
    .eq('owner_profile_id', profileId)
    .eq('purpose', 'connect')
    .maybeSingle()
  const mine = own as { id: string; slug: string } | null
  const code = mine ? { id: mine.id, url: shortLinkUrl(mine.slug) } : null

  return NextResponse.json({ line, liveEvent, code, me })
}
