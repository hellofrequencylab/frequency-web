import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EventCompose } from './event-compose'

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
    <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-primary-bg text-primary-strong shrink-0">
      <span className="text-[10px] font-semibold uppercase leading-none">{month}</span>
      <span className="text-lg font-bold leading-tight">{day}</span>
    </div>
  )
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
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
  let myCircles: { id: string; name: string }[] = []
  let isCrew = false
  let isHost = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)
      isHost = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role as string)

      const { data: memberships } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')

      myCircleIds = (memberships ?? []).map((m) => m.circle_id as string)

      if (myCircleIds.length > 0) {
        const { data: circles } = await admin
          .from('circles')
          .select('id, name')
          .in('id', myCircleIds)
        myCircles = (circles ?? []) as { id: string; name: string }[]
      }
    }
  }

  if (myCircleIds.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Events</h1>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
          <CalendarDays className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
          <p className="text-sm text-muted">
            <Link href="/circles" className="text-primary-strong hover:underline">
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

  const myRsvpEvents = events.filter((e) => myRsvps.has(e.id))

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Events</h1>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            Group rides, gatherings, and meetups happening in your community.
            RSVP to see who&apos;s coming, then drop it on your calendar.
          </p>
        </div>
        {isCrew && <EventCompose groups={myCircles} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main column: events list ─────────────────────────── */}
        <div className="lg:col-span-2">
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
              <CalendarDays className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
              <p className="text-sm text-muted">No upcoming events in the next 60 days.</p>
              {isCrew && (
                <Link href="/events/new" className="mt-3 inline-block text-xs text-primary-strong hover:underline">
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
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface shadow-sm px-4 py-3 hover:border-primary-bg dark:hover:border-primary hover:bg-primary-bg/30 dark:hover:bg-primary-bg transition-colors"
                >
                  <DateBlock iso={event.starts_at} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{event.title}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs text-muted">
                        {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-0.5 text-xs text-subtle">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {circleNames[event.scope_id] && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-primary-bg text-primary-strong font-medium">
                          {circleNames[event.scope_id]}
                        </span>
                      )}
                      {rsvpCounts[event.id] > 0 && (
                        <span className="text-[11px] text-subtle">{rsvpCounts[event.id]} going</span>
                      )}
                      {myRsvps.has(event.id) && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-success-bg text-success font-medium">
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

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Your RSVPs quick-links */}
          <SidebarCard title="Your RSVPs">
            {myRsvpEvents.length === 0 ? (
              <p className="px-4 py-4 text-xs text-subtle text-center">
                No RSVPs yet
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {myRsvpEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.slug}`}
                      className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-surface-elevated transition-colors"
                    >
                      <span className="text-xs font-medium text-text dark:text-subtle/60 truncate">
                        {event.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-subtle">
                        {formatDate(event.starts_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          {/* Admin card */}
          {isCrew && (
            <SidebarCard title="Admin">
              <div className="px-4 py-3 space-y-2">
                <Link
                  href="/events/new"
                  className="flex items-center justify-between text-xs font-medium text-primary-strong hover:underline"
                >
                  New Event →
                </Link>
                {isHost && (
                  <Link
                    href="/admin/events"
                    className="flex items-center justify-between text-xs font-medium text-muted hover:underline"
                  >
                    Manage Events
                  </Link>
                )}
              </div>
            </SidebarCard>
          )}
        </div>
      </div>
    </div>
  )
}
