import Link from 'next/link'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EventCompose } from './event-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { RsvpButton } from '@/components/events/rsvp-button'

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

// Relative "when" — "Tomorrow at 3pm" / "Friday at 3pm" / "Jun 24 at 3pm".
// `now` is passed in so this stays a pure helper (no clock read at render).
function formatWhen(iso: string, now: Date) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    d.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' }
  const time = d.toLocaleTimeString('en-US', opts).replace(' ', '').toLowerCase()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(now)) / (24 * 60 * 60 * 1000))
  if (days === 0) return `Today at ${time}`
  if (days === 1) return `Tomorrow at ${time}`
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}

function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
      <span className="text-xs font-semibold uppercase leading-none tracking-wide">{month}</span>
      <span className="text-xl font-bold leading-tight">{day}</span>
    </div>
  )
}

export default async function EventsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

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
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')
      isHost = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')

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

  const description =
    'Group rides, gatherings, and meetups your circles are running near you. RSVP to see who’s coming, show up, and earn zaps for every one you make.'

  if (myCircleIds.length === 0) {
    return (
      <IndexTemplate title="Events" description={description}>
        <EmptyState
          icon={CalendarDays}
          title="No events on your radar yet"
          description="Events live inside circles. Join one near you and its gatherings show up right here."
          action={
            <Link
              href="/circles"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
            >
              Find a circle
            </Link>
          }
        />
      </IndexTemplate>
    )
  }

  const nowDate = new Date()
  const now = nowDate.toISOString()
  const future = new Date(nowDate.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()

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

  // Circle names for scope_ids.
  const circleIds = [...new Set(events.map((e) => e.scope_id))]
  const circleNames: Record<string, string> = {}
  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('id, name')
      .in('id', circleIds)
    ;(circles ?? []).forEach((c: { id: string; name: string }) => {
      circleNames[c.id] = c.name
    })
  }

  // RSVP data.
  const eventIds = events.map((e) => e.id)
  const rsvpCounts: Record<string, number> = {}
  const myRsvps = new Set<string>()

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

  const goingEvents = events.filter((e) => myRsvps.has(e.id))

  return (
    <IndexTemplate
      title="Events"
      description={description}
      action={
        (isCrew || isHost) ? (
          <div className="flex items-center gap-3">
            {isHost && (
              <Link href="/admin/events" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
                Manage
              </Link>
            )}
            {isCrew && <EventCompose groups={myCircles} />}
          </div>
        ) : undefined
      }
    >
      <div className="mb-6">
        <StatStrip
          items={[
            { value: events.length, label: 'Upcoming' },
            { value: goingEvents.length, label: 'You’re going' },
            { value: myCircles.length, label: 'Your circles' },
          ]}
        />
      </div>

      <div className="space-y-10">
        {goingEvents.length > 0 && (
          <section>
            <SectionHeader title="You're going" count={goingEvents.length} />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {goingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  circleName={circleNames[event.scope_id]}
                  going={rsvpCounts[event.id] ?? 0}
                  isGoing
                  now={nowDate}
                  canRsvp={!!myProfileId}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title={goingEvents.length > 0 ? 'Coming up' : 'Upcoming events'} count={events.length} />
          {events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing on the calendar yet"
              description="No events in the next 60 days. When your circles plan something, it lands here."
              action={
                isCrew ? (
                  <Link href="/events/new" className="text-sm font-semibold text-primary-strong hover:underline">
                    Create the first one
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  circleName={circleNames[event.scope_id]}
                  going={rsvpCounts[event.id] ?? 0}
                  isGoing={myRsvps.has(event.id)}
                  now={nowDate}
                  canRsvp={!!myProfileId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}

function EventCard({
  event, circleName, going, isGoing, now, canRsvp,
}: {
  event: EventRow
  circleName?: string
  going: number
  isGoing: boolean
  now: Date
  canRsvp: boolean
}) {
  return (
    <div className="group relative">
      <Link
        href={`/events/${event.slug}`}
        className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
      >
        <DateBlock iso={event.starts_at} />
        <div className="min-w-0 flex-1 pr-16">
          <p className="truncate text-base font-semibold leading-tight text-text">{event.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{formatWhen(event.starts_at, now)}</span>
            {event.location && (
              <span className="flex items-center gap-0.5 text-subtle">
                <MapPin className="h-3 w-3" />{event.location}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {circleName && (
              <span className="rounded-md bg-primary-bg px-1.5 py-0.5 text-xs font-medium text-primary-strong">
                {circleName}
              </span>
            )}
            {going > 0 && (
              <span className="flex items-center gap-1 text-xs text-subtle">
                <Users className="h-3 w-3" />{going} going
              </span>
            )}
            {event.host && (
              <span className="text-xs text-subtle">Hosted by {event.host.display_name}</span>
            )}
          </div>
        </div>
      </Link>
      {canRsvp && (
        <div className="absolute right-3 top-3">
          <RsvpButton eventId={event.id} isGoing={isGoing} />
        </div>
      )}
    </div>
  )
}
