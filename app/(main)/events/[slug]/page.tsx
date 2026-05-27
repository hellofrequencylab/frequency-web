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
  host: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
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
       scope_id, scope_type,
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

  // Resolve scope name — circle
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
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← Events
      </Link>

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        {event.is_cancelled && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-sm font-medium text-red-700">This event has been cancelled.</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-gray-900">{event.title}</h1>
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
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
            <span>
              {formatFull(event.starts_at)} at {formatTime(event.starts_at)}
              {event.ends_at && ` – ${formatTime(event.ends_at)}`}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {scopeName && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-400 shrink-0" />
              {scopeSlug ? (
                <Link href={`/circles/${scopeSlug}`} className="text-indigo-600 hover:underline">
                  {scopeName}
                </Link>
              ) : (
                <span>{scopeName}</span>
              )}
            </div>
          )}

          {event.host && (
            <p className="text-sm text-gray-500">
              Hosted by{' '}
              <Link href={`/people/${event.host.handle}`} className="text-indigo-600 hover:underline">
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
                ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <form action={toggleRSVP.bind(null, event.id, myRsvpStatus)}>
              <button
                type="submit"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  myRsvpStatus === 'going'
                    ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Add to Google Calendar
          </a>

        </div>
      )}

      {/* ── Description ────────────────────────────── */}
      {event.description && (
        <div className="mb-6 rounded-2xl border border-gray-100/80 bg-gray-50 shadow-sm px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        </div>
      )}

      {/* ── Attendees ──────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Attendees
          <span className="ml-2 text-xs font-normal text-gray-400">{goingRsvps.length} going</span>
        </h2>

        {goingRsvps.length === 0 ? (
          <p className="text-sm text-gray-400">No RSVPs yet.</p>
        ) : isCrew ? (
          <div className="space-y-0.5">
            {goingRsvps.map(({ profile }) => (
              <Link
                key={profile.id}
                href={`/people/${profile.handle}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors -mx-3"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                    {getInitials(profile.display_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{profile.display_name}</p>
                  <p className="text-xs text-gray-400">@{profile.handle}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {goingRsvps.length} {goingRsvps.length === 1 ? 'person' : 'people'} going.
          </p>
        )}
      </section>
    </div>
  )
}
