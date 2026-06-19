// "Next gathering" for My Quest — the one upcoming event to put in front of a member, so the
// season home points at showing up in person (the whole point of Frequency). Prefers an event
// the member RSVP'd to (going/maybe); falls back to the nearest upcoming community event so the
// block is still useful before they've RSVP'd to anything. Service-role read; the page gate
// authorizes it. No writes.

import { createAdminClient } from '@/lib/supabase/admin'

export interface NextGathering {
  id: string
  title: string
  slug: string
  startsAt: string
  location: string | null
  /** True when this is an event the member is going to / maybe (vs. a community fallback). */
  rsvped: boolean
}

type EventRow = {
  id: string
  title: string
  slug: string
  starts_at: string
  location: string | null
  is_cancelled: boolean
}

export async function getNextGathering(profileId: string): Promise<NextGathering | null> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()

  // 1. The member's next RSVP'd (going/maybe) upcoming event.
  try {
    const { data } = await db
      .from('event_rsvps')
      .select('event:events!event_id ( id, title, slug, starts_at, location, is_cancelled )')
      .eq('profile_id', profileId)
      .eq('muted', false)
      .in('status', ['going', 'maybe'])
    const events = ((data ?? []) as { event: EventRow | EventRow[] | null }[])
      .map((r) => (Array.isArray(r.event) ? r.event[0] : r.event))
      .filter((e): e is EventRow => !!e && !e.is_cancelled && e.starts_at >= nowIso)
      .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    if (events[0]) {
      const e = events[0]
      return { id: e.id, title: e.title, slug: e.slug, startsAt: e.starts_at, location: e.location, rsvped: true }
    }
  } catch {
    // fall through to the community fallback
  }

  // 2. Fallback — the nearest upcoming community event.
  try {
    const { data } = await db
      .from('events')
      .select('id, title, slug, starts_at, location')
      .eq('is_cancelled', false)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(1)
    const e = (data?.[0] as Omit<EventRow, 'is_cancelled'> | undefined) ?? null
    if (e) return { id: e.id, title: e.title, slug: e.slug, startsAt: e.starts_at, location: e.location, rsvped: false }
  } catch {
    // no event to show
  }

  return null
}
