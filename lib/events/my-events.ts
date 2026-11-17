import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { upcomingEventFloor } from '@/lib/events/upcoming-floor'

// MY EVENTS (LIVE-2337): one place a member finds their own events. The owner, 2026-11-17: "make sure
// any user or space user can easily find their events from their console." Before this a member's
// events were scattered: RSVPs only on each event page, hosted events behind an "Manage" button that
// pointed at the host-gated /admin/events, and a Space's events only inside its calendar.
//
// Three upcoming lists, read in ONE wave:
//   · going   — events the member RSVP'd going to.
//   · hosting — events they host, or posted on an organizer's behalf (drafts included, so a poster
//               capture is findable here too).
//   · spaces  — upcoming events of each Space they run (owner or admin), a few per Space.
//
// THE SESSION CLIENT, NOT THE ADMIN ONE: every read is the member's own rows, and RLS already says so
// (`event_rsvps: read own`, and the events read policy lets a host or poster see their own drafts and
// private events; a Space's events are read through `can_view_space_content`). Fail-soft: an error on
// one list reads as an empty list, never a broken page.

export interface MyEventRow {
  id: string
  slug: string
  title: string
  startsAt: string
  timeZone: string | null
  location: string | null
  status: string | null
  isCancelled: boolean
}

interface MySpaceEvents {
  spaceId: string
  name: string
  slug: string
  events: MyEventRow[]
}

interface MyEvents {
  going: MyEventRow[]
  hosting: MyEventRow[]
  spaces: MySpaceEvents[]
}

const COLS = 'id, slug, title, starts_at, time_zone, location, status, is_cancelled, removed_at'

type Raw = {
  id: string
  slug: string
  title: string
  starts_at: string
  time_zone: string | null
  location: string | null
  status: string | null
  is_cancelled: boolean | null
  removed_at: string | null
}

function toRow(r: Raw): MyEventRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    startsAt: r.starts_at,
    timeZone: r.time_zone,
    location: r.location,
    status: r.status,
    isCancelled: r.is_cancelled === true,
  }
}

/** Per Space, how many upcoming events the page lists before pointing at that Space's calendar. */
export const SPACE_EVENTS_SHOWN = 5

export async function loadMyEvents(
  profileId: string,
  spaces: readonly { id: string; name: string; slug: string }[],
): Promise<MyEvents> {
  const supabase = await createClient()
  const floor = upcomingEventFloor()
  const spaceIds = spaces.map((s) => s.id)

  const [goingRes, hostingRes, spaceRes] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select(`event:events!inner ( ${COLS} )`)
      .eq('profile_id', profileId)
      .eq('status', 'going')
      .gte('event.starts_at', floor)
      .limit(100)
      .then((r) => r, () => ({ data: null })),
    supabase
      .from('events')
      .select(COLS)
      .or(`host_id.eq.${profileId},posted_by_profile_id.eq.${profileId}`)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(100)
      .then((r) => r, () => ({ data: null })),
    spaceIds.length > 0
      ? supabase
          .from('events')
          .select(`${COLS}, space_id`)
          .in('space_id', spaceIds)
          .is('removed_at', null)
          .eq('is_cancelled', false)
          .gte('starts_at', floor)
          .order('starts_at', { ascending: true })
          .limit(200)
          .then((r) => r, () => ({ data: null }))
      : Promise.resolve({ data: [] as (Raw & { space_id: string })[] }),
  ])

  const going = ((goingRes.data ?? []) as unknown as { event: Raw | null }[])
    .flatMap((r) => (r.event && !r.event.removed_at ? [toRow(r.event)] : []))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const hosting = ((hostingRes.data ?? []) as unknown as Raw[]).map(toRow)

  const bySpace = new Map<string, MyEventRow[]>()
  for (const r of (spaceRes.data ?? []) as unknown as (Raw & { space_id: string })[]) {
    const list = bySpace.get(r.space_id) ?? []
    list.push(toRow(r))
    bySpace.set(r.space_id, list)
  }

  return {
    going,
    hosting,
    spaces: spaces.map((s) => ({ spaceId: s.id, name: s.name, slug: s.slug, events: bySpace.get(s.id) ?? [] })),
  }
}
