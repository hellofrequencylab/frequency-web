import Link from 'next/link'
import { CalendarDays, MapPin, Users, CheckCircle2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EventCompose } from './event-compose'
import { PageHeader, StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getViewerGamStats } from '@/lib/viewer-stats'

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
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
      <span className="text-[10px] font-semibold uppercase leading-none tracking-wide">{month}</span>
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

  const gamPromise = getViewerGamStats()

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

  const gam = await gamPromise

  const description =
    'Group rides, gatherings, and meetups your circles are running near you. RSVP to see who is coming, show up, and earn zaps for every one you make.'

  if (myCircleIds.length === 0) {
    return (
      <div>
        <PageHeader title="Events" description={description} gam={gam} />
        <EmptyState
          icon={CalendarDays}
          title="No events on your radar yet"
          description="Events live inside circles. Join one near you and its gatherings show up right here."
          action={
            <Link
              href="/circles"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md hover:-translate-y-0.5"
            >
              Find a circle
            </Link>
          }
        />
      </div>
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
    <div>
      <PageHeader
        title="Events"
        description={description}
        action={isCrew ? <EventCompose groups={myCircles} /> : undefined}
        secondaryAction={
          isHost ? (
            <Link href="/admin/events" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
              Manage events
            </Link>
          ) : undefined
        }
        gam={gam}
      />

      <StatStrip items={[
        { value: events.length, label: 'Upcoming' },
        { value: goingEvents.length, label: 'You are going' },
        { value: myCircles.length, label: 'Your circles' },
      ]} />

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
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function EventCard({
  event, circleName, going, isGoing,
}: {
  event: EventRow
  circleName?: string
  going: number
  isGoing: boolean
}) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-primary-bg hover:shadow-md"
    >
      <DateBlock iso={event.starts_at} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight text-text">{event.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span>
          {event.location && (
            <span className="flex items-center gap-0.5 text-subtle">
              <MapPin className="h-3 w-3" />{event.location}
            </span>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {circleName && (
            <span className="rounded-md bg-primary-bg px-1.5 py-0.5 text-[11px] font-medium text-primary-strong">
              {circleName}
            </span>
          )}
          {going > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-subtle">
              <Users className="h-3 w-3" />{going} going
            </span>
          )}
          {isGoing && (
            <span className="flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-[11px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />Going
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
