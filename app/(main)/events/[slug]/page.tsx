import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, ExternalLink, Check } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toggleRSVP } from '../actions'
import { EventCheckInButton } from './check-in-button'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { ContextActions } from '@/components/context-actions'
import { DetailTemplate } from '@/components/templates/detail-template'
import { EditModeButton, StartEditingLink } from '@/components/admin/inline/edit-mode-button'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { updateEventField } from '../admin-actions'
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

  const eventCaps = await getEventCapabilities(event.id)
  const canManage = eventCaps.has('event.editSettings')

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
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')
      const myRsvp = rsvps.find((r) => r.profile.id === myProfileId)
      myRsvpStatus = myRsvp?.status ?? null
    }
  }

  const isPast = new Date(event.starts_at) < new Date()
  // RSVP stays changeable until the event actually ENDS (not merely starts), so a
  // member can still un-RSVP during a live session. Falls back to starts_at when
  // no end time is set.
  const hasEnded = new Date(event.ends_at ?? event.starts_at) < new Date()

  const isGoing = myRsvpStatus === 'going'

  // Practice check-in availability + whether the viewer already checked in.
  const canCheckIn = !!myProfileId && isGoing && isPast && !event.is_cancelled
  let alreadyCheckedIn = false
  if (canCheckIn && myProfileId) {
    const { data: ci } = await admin
      .from('engagement_events')
      .select('id')
      .eq('idempotency_key', `event_checkin:${event.id}:${myProfileId}`)
      .maybeSingle()
    alreadyCheckedIn = !!ci
  }

  return (
    <div>
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-3 transition-colors"
      >
        ← Events
      </Link>

      {event.is_cancelled && (
        <div className="mb-4 rounded-2xl bg-danger-bg border border-danger px-3 py-2">
          <p className="text-sm font-medium text-danger">This event has been cancelled.</p>
        </div>
      )}

      {/* Unified Detail header (REDESIGN-INAPP Phase 1): title + the when/where/
          host meta as subtitle; the host/admin kebab as the action. */}
      <DetailTemplate
        title={
          canManage ? (
            <InlineText
              value={event.title}
              save={updateEventField.bind(null, event.id, slug, 'title')}
              inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-xl sm:text-2xl font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
            />
          ) : (
            event.title
          )
        }
        actions={
          <>
            {canManage && <EditModeButton />}
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
          </>
        }
        subtitle={
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
              <span>
                {formatFull(event.starts_at)} at {formatTime(event.starts_at)}
                {event.ends_at && ` – ${formatTime(event.ends_at)}`}
              </span>
            </div>

            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-subtle shrink-0" />
                <span>{event.location}</span>
              </div>
            )}

            {(event.recurrence_type !== 'none' || event.parent_event_id) && (
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">🔁</span>
                <span>
                  {event.recurrence_type !== 'none'
                    ? RECURRENCE_LABEL[event.recurrence_type]
                    : 'Part of a recurring series'}
                  {event.recurrence_until && (
                    <span className="text-subtle ml-1">
                      · until {new Date(event.recurrence_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </span>
              </div>
            )}

            {scopeName && (
              <div className="flex items-center gap-2">
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
              <p>
                Hosted by{' '}
                <Link href={`/people/${event.host.handle}`} className="text-primary-strong hover:underline">
                  {event.host.display_name}
                </Link>
              </p>
            )}
          </div>
        }
      >
        {/* ── Actions: RSVP while upcoming, then Check in at event time ── */}
        {!event.is_cancelled && myProfileId && (
          <div className="mb-6">
            {!isPast ? (
              /* Upcoming: RSVP toggle + add-to-calendar */
              <div className="flex items-center gap-3 flex-wrap">
                <CrewGateButton
                  isCrew={isCrew}
                  label={isGoing ? '✓ Going' : "RSVP: I'm going"}
                  buttonClassName="rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
                >
                  <form action={toggleRSVP.bind(null, event.id)}>
                    <button
                      type="submit"
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                        isGoing
                          ? 'bg-success-bg text-success hover:bg-danger-bg hover:text-danger'
                          : 'bg-primary text-on-primary hover:bg-primary-hover'
                      }`}
                    >
                      {isGoing ? '✓ Going (click to undo)' : "RSVP: I'm going"}
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-border-strong hover:bg-surface transition-colors"
                  title="Apple Calendar, Outlook, and any iCal-compatible app"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Add to Calendar (.ics)
                </a>
              </div>
            ) : isGoing ? (
              /* Event time, going: Check in is the primary action; Cancel RSVP is a quiet link */
              <div className="flex items-center gap-4 flex-wrap">
                {alreadyCheckedIn ? (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-success-bg text-success px-4 py-2 text-sm font-semibold">
                    <Check className="w-4 h-4" />
                    Checked In
                  </div>
                ) : (
                  <EventCheckInButton eventId={event.id} />
                )}
                {!hasEnded && (
                  <form action={toggleRSVP.bind(null, event.id)}>
                    <button
                      type="submit"
                      className="text-xs text-subtle hover:text-danger underline underline-offset-2 transition-colors"
                    >
                      Cancel RSVP
                    </button>
                  </form>
                )}
              </div>
            ) : !hasEnded ? (
              /* Event started, not going yet: still allow joining */
              <CrewGateButton
                isCrew={isCrew}
                label="RSVP: I'm going"
                buttonClassName="rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
              >
                <form action={toggleRSVP.bind(null, event.id)}>
                  <button
                    type="submit"
                    className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors bg-primary text-on-primary hover:bg-primary-hover"
                  >
                    RSVP: I&apos;m going
                  </button>
                </form>
              </CrewGateButton>
            ) : null}
          </div>
        )}

        {/* ── Description (open prose, not boxed) ─────── */}
        {canManage ? (
          <div className="mb-6 max-w-2xl">
            <InlineText
              value={event.description}
              multiline
              placeholder="Add a description…"
              save={updateEventField.bind(null, event.id, slug, 'description')}
            >
              {event.description ? (
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                  {event.description}
                </p>
              ) : (
                <StartEditingLink label="+ Add a description" />
              )}
            </InlineText>
          </div>
        ) : event.description ? (
          <div className="mb-6 max-w-2xl">
            <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        ) : null}

        {/* ── Attendees ──────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-text mb-3">
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
                    <Image src={profile.avatar_url} alt={profile.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
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
      </DetailTemplate>
    </div>
  )
}
