import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, Check, Ticket, Clock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toggleRSVP } from '../actions'
import { EventCheckInButton } from './check-in-button'
import { TicketButton } from './ticket-button'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { hasTicket, recordTicketFromSessionId } from '@/lib/billing/tickets'
import { getCapacityInfo } from '@/lib/events/capacity'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { ContextActions } from '@/components/context-actions'
import { DetailTemplate } from '@/components/templates/detail-template'
import { EditModeButton, StartEditingLink } from '@/components/admin/inline/edit-mode-button'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { updateEventField } from '../admin-actions'
import { getInitials } from '@/lib/utils'
import { WarmProof } from '@/components/events/warm-proof'
import { AddToCalendar, buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'

type EventDetail = {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean
  price_cents: number | null
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

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ticket?: string; session_id?: string }>
}) {
  const { slug } = await params
  const { ticket, session_id } = await searchParams
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: rawEvent } = await admin
    .from('events')
    .select(
      `id, title, slug, description, location, starts_at, ends_at, is_cancelled, price_cents,
       scope_id, scope_type, recurrence_type, recurrence_until, parent_event_id,
       host:profiles!host_id ( id, display_name, handle, avatar_url )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) notFound()
  const event = rawEvent as unknown as EventDetail

  // Webhook-independent reconcile when Stripe redirects back from a paid ticket.
  let ticketedCents: number | null = null
  if (ticket === 'success' && session_id) {
    ticketedCents = await recordTicketFromSessionId(session_id)
  }

  const eventCaps = await getEventCapabilities(event.id)
  const canManage = eventCaps.has('event.editSettings')

  const { data: rawRsvps } = await admin
    .from('event_rsvps')
    .select('id, status, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })

  const rsvps = (rawRsvps ?? []) as unknown as RSVPRow[]
  const goingRsvps = rsvps.filter((r) => r.status === 'going')
  const maybeCount = rsvps.filter((r) => r.status === 'maybe').length

  // Real capacity / waitlist info (lib/events/capacity) — drives the waitlist CTA
  // and the "filling up" line. Never invented.
  const capacityInfo = await getCapacityInfo(event.id)

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
  // Warm proof: going attendees who share an active circle with the viewer.
  let fromYourCircles = 0

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
      isCrew = await isPaidViewer()
      const myRsvp = rsvps.find((r) => r.profile.id === myProfileId)
      myRsvpStatus = myRsvp?.status ?? null

      // "From your circles" = going attendees (excluding me) who share at least
      // one active circle with me. Two cheap membership reads + a set overlap;
      // mirrors the shared-circle pattern in lib/connections/welcomes.ts. This
      // is warm proof, never scarcity — it's only ever additive.
      const otherGoingIds = goingRsvps
        .map((r) => r.profile.id)
        .filter((id) => id !== myProfileId)
      if (otherGoingIds.length > 0) {
        const [mineRes, theirsRes] = await Promise.all([
          admin
            .from('memberships')
            .select('circle_id')
            .eq('profile_id', myProfileId)
            .eq('status', 'active'),
          admin
            .from('memberships')
            .select('profile_id, circle_id')
            .in('profile_id', otherGoingIds)
            .eq('status', 'active'),
        ])
        const myCircleIds = new Set(
          (mineRes.data ?? []).map((m) => (m as { circle_id: string }).circle_id)
        )
        if (myCircleIds.size > 0) {
          const sharers = new Set<string>()
          for (const m of (theirsRes.data ?? []) as { profile_id: string; circle_id: string }[]) {
            if (myCircleIds.has(m.circle_id)) sharers.add(m.profile_id)
          }
          fromYourCircles = sharers.size
        }
      }
    }
  }

  // Ticketing (ADR-177): a priced event needs a payouts-ready host. Show the buy
  // control to a signed-in non-host who hasn't already bought; otherwise a
  // "ticket confirmed" state. The whole block hides for free events.
  const priceCents = event.price_cents ?? 0
  const isPaidEvent = priceCents > 0
  let hostPayoutReady = false
  let ownsTicket = false
  if (isPaidEvent && event.host?.id) {
    if (await payoutsLive()) hostPayoutReady = (await getConnectStatus(event.host.id)).ready
    if (myProfileId) ownsTicket = await hasTicket(event.id, myProfileId)
  }
  if (ticketedCents !== null) ownsTicket = true
  const priceLabel = `$${(priceCents / 100).toFixed(2)}`

  const isPast = new Date(event.starts_at) < new Date()
  // RSVP stays changeable until the event actually ENDS (not merely starts), so a
  // member can still un-RSVP during a live session. Falls back to starts_at when
  // no end time is set.
  const hasEnded = new Date(event.ends_at ?? event.starts_at) < new Date()

  const isGoing = myRsvpStatus === 'going'
  const isWaitlisted = myRsvpStatus === 'waitlist'

  // "Filling up" only when GENUINELY near-full: real capacity, seats remain, and
  // ≤20% of capacity is left (EVENTS-SYSTEM §4, Law 1 — care, never manufactured
  // urgency). Min 1 so a tiny capacity still qualifies on its last seat.
  const nearFull =
    capacityInfo.capacity != null &&
    capacityInfo.spotsLeft != null &&
    capacityInfo.spotsLeft > 0 &&
    capacityInfo.spotsLeft <= Math.max(1, Math.ceil(capacityInfo.capacity * 0.2))

  // Calendar links (built once; reused by the AddToCalendar control).
  const icsHref = `/events/${event.slug}/event.ics`
  const googleUrl = buildGoogleCalendarUrl({
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    description: event.description,
    location: event.location,
  })

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

      {ticketedCents !== null && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-sm font-semibold text-success">
          <Ticket className="h-4 w-4" />
          You’re in — ${(ticketedCents / 100).toFixed(2)} ticket confirmed. See you there.
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
        {/* ── Warm proof (EVENTS-SYSTEM §4, Law 1): real, never-low counts ── */}
        {!event.is_cancelled && (
          <div className="mb-6">
            <WarmProof
              going={goingRsvps.length}
              fromYourCircles={fromYourCircles}
              maybe={maybeCount}
              faces={goingRsvps.map(({ profile }) => ({
                id: profile.id,
                displayName: profile.display_name,
                avatarUrl: profile.avatar_url,
              }))}
              nearFull={nearFull}
              spotsLeft={capacityInfo.spotsLeft}
            />
          </div>
        )}

        {/* ── Ticket (paid events, ADR-177) ── */}
        {isPaidEvent && !event.is_cancelled && (
          <div className="mb-6 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-text">{priceLabel} ticket</span>
            </div>
            <div className="mt-3">
              {ownsTicket ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Ticket confirmed
                </p>
              ) : hasEnded ? (
                <p className="text-sm text-muted">Ticket sales have closed.</p>
              ) : !myProfileId ? (
                <p className="text-sm text-muted">Sign in to get your ticket.</p>
              ) : isHost ? (
                <p className="text-sm text-muted">You’re hosting — no ticket needed.</p>
              ) : hostPayoutReady ? (
                <TicketButton eventId={event.id} priceLabel={priceLabel} />
              ) : (
                <p className="text-sm text-muted">Tickets aren’t available for this event yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Actions: RSVP while upcoming, then Check in at event time ── */}
        {!event.is_cancelled && myProfileId && (
          <div className="mb-6">
            {!isPast ? (
              /* Upcoming: RSVP / waitlist toggle + one-tap add-to-calendar */
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {isWaitlisted ? (
                    /* Already waitlisted — calm "tap to leave" state, never pressure. */
                    <form action={toggleRSVP.bind(null, event.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
                      >
                        <Clock className="w-4 h-4" />
                        On waitlist · tap to leave
                      </button>
                    </form>
                  ) : (
                    <CrewGateButton
                      isCrew={isCrew}
                      label={isGoing ? '✓ Going' : capacityInfo.isFull ? 'Join waitlist' : "RSVP: I'm going"}
                      buttonClassName="rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
                    >
                      <form action={toggleRSVP.bind(null, event.id)}>
                        <button
                          type="submit"
                          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                            isGoing
                              ? 'bg-success-bg text-success hover:bg-danger-bg hover:text-danger'
                              : 'bg-primary text-on-primary hover:bg-primary-hover'
                          }`}
                        >
                          {isGoing ? (
                            "✓ Going (click to undo)"
                          ) : capacityInfo.isFull ? (
                            <><Clock className="w-4 h-4" />Join waitlist</>
                          ) : (
                            "RSVP: I'm going"
                          )}
                        </button>
                      </form>
                    </CrewGateButton>
                  )}

                  {/* Compact add-to-calendar always available; emphasised below once going. */}
                  {!isGoing && <AddToCalendar icsHref={icsHref} googleUrl={googleUrl} />}
                </div>

                {/* Highest-ROI lever: surface a prominent calendar add right after a
                    'going' RSVP (implementation intentions, EVENTS-SYSTEM §4). */}
                {isGoing && (
                  <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                    <p className="mb-2 text-xs font-medium text-muted">
                      You’re going — lock it in so you don’t miss it.
                    </p>
                    <AddToCalendar icsHref={icsHref} googleUrl={googleUrl} emphasis />
                  </div>
                )}
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
              /* Event started, not 'going' yet. Waitlisted → calm "tap to leave";
                 otherwise still allow joining (waitlist if the event is full). */
              isWaitlisted ? (
                <form action={toggleRSVP.bind(null, event.id)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
                  >
                    <Clock className="w-4 h-4" />
                    On waitlist · tap to leave
                  </button>
                </form>
              ) : (
                <CrewGateButton
                  isCrew={isCrew}
                  label={capacityInfo.isFull ? 'Join waitlist' : "RSVP: I'm going"}
                  buttonClassName="rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
                >
                  <form action={toggleRSVP.bind(null, event.id)}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors bg-primary text-on-primary hover:bg-primary-hover"
                    >
                      {capacityInfo.isFull ? (
                        <><Clock className="w-4 h-4" />Join waitlist</>
                      ) : (
                        "RSVP: I'm going"
                      )}
                    </button>
                  </form>
                </CrewGateButton>
              )
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
