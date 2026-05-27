import Link from 'next/link'
import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type EventRow = {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean
  scope_id: string
  scope_type: string
  host: { id: string; display_name: string; handle: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
      <span className="text-[10px] font-semibold uppercase leading-none">{month}</span>
      <span className="text-lg font-bold leading-tight">{day}</span>
    </div>
  )
}

export default async function EventsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let myCircleIds: string[] = []
  let isCrew = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)

      const { data: memberships } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')

      myCircleIds = (memberships ?? []).map((m) => m.circle_id as string)
    }
  }

  if (myCircleIds.length === 0) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Events</h1>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
          <CalendarDays className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <Link href="/circles" className="text-indigo-600 hover:underline">
              Join a circle
            </Link>{' '}
            to see events.
          </p>
        </div>
      </div>
    )
  }

  const now = new Date().toISOString()
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rawEvents } = await admin
    .from('events')
    .select(
      `id, title, slug, location, starts_at, ends_at, is_cancelled,
       scope_id, scope_type,
       host:profiles!host_id ( id, display_name, handle )`
    )
    .in('scope_id', myCircleIds)
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .lte('starts_at', future)
    .order('starts_at', { ascending: true })
    .limit(30)

  const events = (rawEvents ?? []) as unknown as EventRow[]

  // Fetch circle names for scope_ids
  const circleIds = [...new Set(events.map((e) => e.scope_id))]
  let circleNames: Record<string, string> = {}
  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('id, name')
      .in('id', circleIds)
    ;(circles ?? []).forEach((c: { id: string; name: string }) => {
      circleNames[c.id] = c.name
    })
  }

  // RSVP data
  const eventIds = events.map((e) => e.id)
  let rsvpCounts: Record<string, number> = {}
  let myRsvps = new Set<string>()

  if (eventIds.length > 0) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'going')
    ;(rsvps ?? []).forEach((r: { event_id: string }) => {
      rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] ?? 0) + 1
    })

    if (myProfileId) {
      const { data: mine } = await admin
        .from('event_rsvps')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('profile_id', myProfileId)
        .eq('status', 'going')
      ;(mine ?? []).forEach((r: { event_id: string }) => myRsvps.add(r.event_id))
    }
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Events</h1>
        {isCrew && (
          <Link
            href="/events/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Event
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
          <CalendarDays className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming events in the next 60 days.</p>
          {isCrew && (
            <Link href="/events/new" className="mt-3 inline-block text-xs text-indigo-600 hover:underline">
              Create the first one →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
            >
              <DateBlock iso={event.starts_at} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{event.title}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-xs text-gray-500">
                    {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-0.5 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      {event.location}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {circleNames[event.scope_id] && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                      {circleNames[event.scope_id]}
                    </span>
                  )}
                  {rsvpCounts[event.id] > 0 && (
                    <span className="text-[11px] text-gray-400">{rsvpCounts[event.id]} going</span>
                  )}
                  {myRsvps.has(event.id) && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      ✓ Going
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
