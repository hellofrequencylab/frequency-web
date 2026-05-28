import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toggleRSVP } from '../actions'
import { CrewGateButton } from '@/components/crew-gate-button'
import { ContextActions } from '@/components/context-actions'
import { getInitials } from '@/lib/utils'

type EventDetail = {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean
  scope_id: string
  scope_type: string
  recurrence_type: 'none' | 'daily' | 'weekly' | 'monthly'
  recurrence_until: string | null
  parent_event_id: string | null
  host: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily:   'Repeats daily',
  weekly:  'Repeats weekly',
  monthly: 'Repeats monthly',
}

type RSVPRow = {
  id: string
  status: string
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  }
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function googleCalendarUrl(event: EventDetail) {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace('.000', '')
  const start = fmt(event.starts_at)
  const end = event.ends_at
    ? fmt(event.ends_at)
    : fmt(new Date(new Date(event.starts_at).getTime() + 60 * 60 * 1000).toISOString())
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    ...(event.description ? { details: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: rawEvent } = await admin
    .from('events')
    .select(
      `id, title, slug, description, location, starts_at, ends_at, is_cancelled,
       scope_id, scope_type, recurrence_type, recurrence_until, parent_event_id,
       host:profiles!host_id ( id, display_name, handle, avatar_url )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) notFound()
  const event = rawEvent as unknown as EventDetail

  const { data: rawRsvps } = await admin
    .from('event_rsvps')
    .select('id, status, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })

  const rsvps = (rawRsvps ?? []) as unknown as RSVPRow[]
  const goingRsvps = rsvps.filter((r) => r.status === 'going')

  // Resolve scope name. Circle
  let scopeName: string | null = null
  let scopeSlug: string | null = null
  if (event.scope_type === 'circle') {
    const { data: c } = await admin.from('circles').select('name, slug').eq('id', event.scope_id).maybeSingle()
    scopeName = c?.name ?? null
    scopeSlug = c?.slug ?? null
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let myRsvpStatus: string | null = null
  let isHost = false
  let isCrew = false
  let myRole: 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor' = 'member'

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      myRole = (profile.community_role ?? 'member') as typeof myRole
      isHost = event.host?.id === myProfileId
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)
      const myRsvp = rsvps.find((r) => r.profile.id === myProfileId)
      myRsvpStatus = myRsvp?.status ?? null
    }
  }

  const isPast = new Date(event.starts_at) < new Date()

  return (
    <div>
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-5 transition-colors"
      >
        ← Events
      </Link>

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        {event.is_cancelled && (
          <div className="mb-3 rounded-lg bg-danger-bg border border-danger px-3 py-2">
            <p className="text-sm font-medium text-danger">This event has been cancelled.</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-text">{event.title}</h1>
          <ContextActions
            role={myRole}
            context={{
              type: 'event',
              id: event.id,
              slug: event.slug,
              isHost,
              isCancelled: event.is_cancelled,
            }}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
            <span>
              {formatFull(event.starts_at)} at {formatTime(event.starts_at)}
              {event.ends_at && ` – ${formatTime(event.ends_at)}`}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <MapPin className="w-4 h-4 text-subtle shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {(event.recurrence_type !== 'none' || event.parent_event_id) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span aria-hidden className="text-base leading-none">🔁</span>
              <span>
                {event.recurrence_type !== 'none'
                  ? RECURRENCE_LABEL[event.recurrence_type]
                  : 'Part of a recurring series'}
                {event.recurrence_until && (
                  <span className="text-gray-400 ml-1">
                    · until {new Date(event.recurrence_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </span>
            </div>
          )}

          {scopeName && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Users className="w-4 h-4 text-subtle shrink-0" />
              {scopeSlug ? (
                <Link href={`/circles/${scopeSlug}`} className="text-primary-strong hover:underline">
                  {scopeName}
                </Link>
              ) : (
                <span>{scopeName}</span>
              )}
            </div>
          )}

          {event.host && (
            <p className="text-sm text-muted">
              Hosted by{' '}
              <Link href={`/people/${event.host.handle}`} className="text-primary-strong hover:underline">
                {event.host.display_name}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* ── Actions ────────────────────────────────── */}
      {!event.is_cancelled && !isPast && myProfileId && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <CrewGateButton
            isCrew={isCrew}
            label={myRsvpStatus === 'going' ? "✓ Going (click to undo)" : "RSVP: I'm going"}
            buttonClassName={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 ${
              myRsvpStatus === 'going'
                ? 'bg-success-bg text-success hover:bg-danger-bg hover:text-danger'
                : 'bg-primary text-on-primary hover:bg-primary-hover'
            }`}
          >
            <form action={toggleRSVP.bind(null, event.id, myRsvpStatus)}>
              <button
                type="submit"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  myRsvpStatus === 'going'
                    ? 'bg-success-bg text-success hover:bg-danger-bg hover:text-danger'
                    : 'bg-primary text-on-primary hover:bg-primary-hover'
                }`}
              >
                {myRsvpStatus === 'going' ? "✓ Going (click to undo)" : "RSVP: I'm going"}
              </button>
            </form>
          </CrewGateButton>

          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-border-strong hover:bg-surface transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Add to Google Calendar
          </a>

          <a
            href={`/events/${event.slug}/event.ics`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            title="Apple Calendar, Outlook, and any iCal-compatible app"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Add to Calendar (.ics)
          </a>

        </div>
      )}

      {/* ── Description ────────────────────────────── */}
      {event.description && (
        <div className="mb-6 rounded-2xl border border-border/80 bg-surface shadow-sm px-4 py-3">
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        </div>
      )}

      {/* ── Attendees ──────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-text mb-3">
          Attendees
          <span className="ml-2 text-xs font-normal text-subtle">{goingRsvps.length} going</span>
        </h2>

        {goingRsvps.length === 0 ? (
          <p className="text-sm text-subtle">No RSVPs yet.</p>
        ) : isCrew ? (
          <div className="space-y-0.5">
            {goingRsvps.map(({ profile }) => (
              <Link
                key={profile.id}
                href={`/people/${profile.handle}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface transition-colors -mx-3"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                    {getInitials(profile.display_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{profile.display_name}</p>
                  <p className="text-xs text-subtle">@{profile.handle}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {goingRsvps.length} {goingRsvps.length === 1 ? 'person' : 'people'} going.
          </p>
        )}
      </section>
    </div>
  )
}
