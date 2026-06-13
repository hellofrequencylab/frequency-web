// The Zap menu's live line from Vera (ADR-230). Deliberately CHEAP: this backs
// the most-tapped button in the app, so there is no AI call and no generation
// here — it reuses today's already-cached Dispatch when one exists (Vera
// already wrote it), else falls to a deterministic streak/time template. The
// client renders a static fallback instantly and swaps when this arrives.

import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const day = new Date().toISOString().slice(0, 10)

  // Reuse today's Dispatch verbatim when it exists — never generate from here.
  const { data: dispatch } = await admin
    .from('vera_dispatches')
    .select('copy')
    .eq('profile_id', profileId)
    .eq('day', day)
    .maybeSingle()
  let line = (dispatch as { copy: string } | null)?.copy ?? null
  if (!line) {
    const { data: prof } = await admin
      .from('profiles')
      .select('current_streak')
      .eq('id', profileId)
      .maybeSingle()
    const streak = Number((prof as { current_streak: number | null } | null)?.current_streak ?? 0)
    const hour = new Date().getUTCHours() // close enough for a nudge line
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

  return NextResponse.json({ line, liveEvent })
}
