import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, Check, Ticket, Clock, Zap, Video, Globe, LayoutDashboard } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SITE_NAME } from '@/lib/site'
import { toggleRSVP } from '../actions'
import { EventCheckInButton } from './check-in-button'
import { TicketButton, type TicketTierView } from './ticket-button'
import { RsvpBottomBar } from './rsvp-bottom-bar'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { hasTicket, recordTicketFromSessionId } from '@/lib/billing/tickets'
import { getCapacityInfo } from '@/lib/events/capacity'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { DetailTemplate } from '@/components/templates/detail-template'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { updateEventField } from '../admin-actions'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { AddToCalendar, buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { type ActivityPost } from '@/components/events/event-activity'
import { EventRewardStrip } from '@/components/events/event-reward-strip'
import { EventFactPanel, type FactGuest } from '@/components/events/event-fact-panel'
import { type RecapPhoto } from '@/components/events/recap-album'
import { EventGallery } from '@/components/events/event-gallery'
import { ClaimEventBanner } from '@/components/events/claim-event-banner'
import { type CohostView } from '@/components/events/cohost-manager'
import { listCohosts } from '@/lib/events/cohosts'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import { detailsMediaPaths, type EventDetailsWithMedia } from '@/lib/events/details-media'
import type { EventMapPin } from '@/components/events/events-map'
import { ZAP_AMOUNTS } from '@/lib/zaps'
// The event POST AREA (description · poster details · cohosts · sales · dispatch · activity · recap)
// renders through the page-settings module engine (ADR-270/294/406), so operators arrange it from
// Settings → Layout, shared across every /events/<slug> via the '/events/*' scope — exactly like the
// circle page. The fixed header + the RSVP/ticket Join aside + the mobile action bar stay in the page.
import { PageModules } from '@/components/widgets/page-modules'
import { setEventContext } from '@/lib/events/active-event'
import { EditEventButton } from '@/components/events/edit-event-button'

type AttendanceMode = 'in_person' | 'online' | 'hybrid'

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
  visibility: string | null
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

// Attendance-mode chip (EVENTS-DESIGN §2.4) — one chip in the DetailTemplate
// `badges` slot. DAWN tokens only.
const MODE_CHIP: Record<AttendanceMode, { Icon: typeof Video; cls: string; label: string }> = {
  in_person: { Icon: MapPin, cls: 'bg-surface-elevated text-muted', label: 'In person' },
  online:    { Icon: Video, cls: 'bg-broadcast-bg text-broadcast-strong', label: 'Online' },
  hybrid:    { Icon: Globe, cls: 'bg-primary-bg text-primary-strong', label: 'In person + online' },
}

type RSVPRow = {
  id: string
  status: string
  plus_ones: number
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

// ── Anonymous share-card metadata (logged-in link unfurls; correct-by-construction
// for any future anon carve). Resolves the event through the admin client only — no
// auth round-trip — reading just the card fields. Visibility is NOT re-checked here:
// metadata never leaks more than the public title/cover, and the page body still
// enforces the ADR-202 gate.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('title, description, location, starts_at, cover_image_path')
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) return { title: 'Event not found' }
  const event = ev as {
    title: string
    description: string | null
    location: string | null
    starts_at: string
    cover_image_path: string | null
  }

  const where = event.location ? ` at ${event.location}` : ''
  const full =
    event.description ??
    `${event.title}: an event on Frequency${where}. Sign in to RSVP.`
  // Search snippets truncate around 155 chars — keep the meta description tight
  // (matches the discover detail pages).
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${event.title} · ${SITE_NAME}`

  const coverUrl = event.cover_image_path
    ? admin.storage.from('event-media').getPublicUrl(event.cover_image_path).data.publicUrl
    : null

  return {
    title: event.title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: 'article',
      ...(coverUrl ? { images: [{ url: coverUrl }] } : {}),
    },
    twitter: {
      card: coverUrl ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description,
    },
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ticket?: string; session_id?: string; claimed?: string }>
}) {
  // params, searchParams, and the auth client are mutually independent — resolve
  // them concurrently instead of one-after-another. (createAdminClient is sync.)
  const admin = createAdminClient()
  const [{ slug }, { ticket, session_id, claimed }, supabase] = await Promise.all([
    params,
    searchParams,
    createClient(),
  ])

  const { data: rawEvent } = await admin
    .from('events')
    .select(
      `id, title, slug, description, location, starts_at, ends_at, is_cancelled, price_cents,
       visibility, scope_id, scope_type, recurrence_type, recurrence_until, parent_event_id,
       host:profiles!host_id ( id, display_name, handle, avatar_url )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) notFound()
  const event = rawEvent as unknown as EventDetail

  // ── Poster Events + presentation + geo fields (newer than the generated types →
  // untyped read, repo convention). Drives the "Posted by" credit, the cover image,
  // the attendance-mode chip, and the online join link. ───────────────────────
  type ExtraMeta = {
    posted_by_profile_id: string | null
    claimed_at: string | null
    organizer_name: string | null
    details: EventDetailsWithMedia | null
    poster_path: string | null
    cover_image_path: string | null
    gallery_image_paths: string[] | null
    attendance_mode: AttendanceMode | null
    online_url: string | null
    status: string | null
  }
  // These three only depend on already-resolved values (event.id / session_id) and
  // not on each other, so resolve them concurrently: the extra-meta read, the
  // Stripe redirect reconcile (when present), and the viewer's event capabilities.
  const [{ data: rawExtra }, ticketedCentsResolved, eventCaps] = await Promise.all([
    (admin)
      .from('events')
      .select(
        'posted_by_profile_id, claimed_at, organizer_name, details, poster_path, cover_image_path, gallery_image_paths, attendance_mode, online_url, status',
      )
      .eq('id', event.id)
      .maybeSingle(),
    // Webhook-independent reconcile when Stripe redirects back from a paid ticket.
    ticket === 'success' && session_id
      ? recordTicketFromSessionId(session_id)
      : Promise.resolve(null),
    getEventCapabilities(event.id),
  ])
  const extra = (rawExtra ?? null) as ExtraMeta | null
  const postedById = extra?.posted_by_profile_id ?? null
  const isPostedEvent = !!postedById
  const attendanceMode: AttendanceMode = extra?.attendance_mode ?? 'in_person'
  const isOnline = attendanceMode === 'online'
  const onlineUrl = extra?.online_url ?? null
  const ticketedCents: number | null = ticketedCentsResolved
  const canManage = eventCaps.has('event.editSettings')

  // Draft guard (ADR poster-events): an unpublished draft must never render on its
  // public slug. The admin read above bypasses RLS, so re-apply the status gate the
  // migration assumes server reads carry — only a manager may preview a draft.
  if ((extra?.status ?? 'published') !== 'published' && !canManage) notFound()

  // An unclaimed event posted on an organizer's behalf: it has a poster credit, no
  // host, and was never claimed. Drives the "this is not my event / claim it" UI.
  const isUnclaimedPosted = isPostedEvent && !extra?.claimed_at && !event.host

  // Uploaded cover (A1) — a public storage path in the event-media bucket → public URL
  // (next/image allows the supabase public storage host). Null when the host never
  // uploaded one, which is the case for every event captured by scanning a poster.
  const coverUrl = extra?.cover_image_path
    ? admin.storage.from('event-media').getPublicUrl(extra.cover_image_path).data.publicUrl
    : null

  // Both of these depend only on `extra` (not on each other): the "Posted by" credit
  // lookup and the signed URLs for the poster's media — resolve concurrently. We sign
  // the poster's crops (details.media) AND the full poster (poster_path) in one batch,
  // so a scanned poster can serve as the header + gallery below.
  const posterDetails: EventDetailsWithMedia =
    extra?.details && typeof extra.details === 'object' ? extra.details : {}
  const [postedByResolved, posterCropEntries] = await Promise.all([
    postedById && postedById !== (event.host?.id ?? null)
      ? admin
          .from('profiles')
          .select('display_name, handle')
          .eq('id', postedById)
          .maybeSingle()
          .then(({ data }) => (data as { display_name: string; handle: string } | null) ?? null)
      : Promise.resolve(null),
    posterSignedUrlMap(
      [...detailsMediaPaths(posterDetails), extra?.poster_path].filter((p): p is string => !!p),
    ),
  ])
  // The credit: whoever put the event on the map, when they aren't the host.
  const postedBy: { display_name: string; handle: string } | null = postedByResolved
  const posterCropUrls = Object.fromEntries(posterCropEntries)

  // Header image + clickable gallery. A scanned-poster event has no uploaded cover; its
  // image lives in poster_path (the full flyer) and details.media (the scanner's cropped
  // cover + region crops), all in the PRIVATE poster bucket → the short-lived signed URLs
  // just resolved above. Header (hero) priority: uploaded cover → cropped cover → full
  // poster. Gallery: the full flyer leads (so the whole poster opens full-screen), then
  // the cropped cover, the poster's region crops, and any uploaded gallery images —
  // deduped by storage path (signed URLs differ per render; the paths are stable).
  const posterMedia = posterDetails.media
  const posterFullUrl = extra?.poster_path ? posterCropUrls[extra.poster_path] ?? null : null
  const coverCropUrl = posterMedia?.coverPath ? posterCropUrls[posterMedia.coverPath] ?? null : null
  const heroUrl = coverUrl ?? coverCropUrl ?? posterFullUrl

  const galleryUrls: string[] = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    const add = (id: string | null | undefined, url: string | null | undefined) => {
      if (!id || !url || seen.has(id)) return
      seen.add(id)
      out.push(url)
    }
    add(extra?.poster_path, posterFullUrl) // full flyer first (when scanned)
    add(extra?.cover_image_path, coverUrl) // uploaded cover leads for non-poster events
    add(posterMedia?.coverPath, coverCropUrl) // the scanner's cropped cover
    Object.values(posterMedia?.gallery ?? {}).forEach((p) => add(p, posterCropUrls[p] ?? null))
    ;(extra?.gallery_image_paths ?? []).forEach((p) =>
      add(p, admin.storage.from('event-media').getPublicUrl(p).data.publicUrl),
    )
    return out
  })()

  // Visibility gate (ADR-202). This page reads through the admin client, which
  // bypasses RLS — so the same rules the RLS policy enforces are re-applied here:
  // public/unlisted are link-readable; private is host/manager-only; circle_only
  // requires active membership of the hosting circle. notFound() (not a 403) so a
  // private slug doesn't confirm the event exists.
  if (!canManage) {
    const vis = event.visibility ?? 'circle_only'
    if (vis === 'private') notFound()
    if (vis === 'circle_only' && event.scope_type === 'circle') {
      const { getMyProfileId } = await import('@/lib/auth')
      const myId = await getMyProfileId()
      if (!myId) notFound()
      const { data: member } = await admin
        .from('memberships')
        .select('id')
        .eq('profile_id', myId)
        .eq('circle_id', event.scope_id)
        .eq('status', 'active')
        .maybeSingle()
      if (!member) notFound()
    }
  }

  // The RSVP roster, capacity/waitlist info, the hosting circle's public area, and
  // the auth user are mutually independent (each depends only on event fields or the
  // already-built supabase client) — resolve them concurrently.
  const [{ data: rawRsvps }, capacityInfo, circleRow, {
    data: { user },
  }] = await Promise.all([
    admin
      .from('event_rsvps')
      .select('id, status, plus_ones, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true }),
    // Real capacity / waitlist info (lib/events/capacity) — drives the waitlist CTA
    // and the "filling up" line. Never invented.
    getCapacityInfo(event.id),
    // The circle's PUBLIC city-level coordinates (the mini map rides the hosting
    // circle's area, never the exact venue — ADR-186 privacy).
    event.scope_type === 'circle'
      ? admin
          .from('circles')
          .select('name, slug, latitude, longitude')
          .eq('id', event.scope_id)
          .maybeSingle()
          .then(({ data }) => data as { name: string; slug: string; latitude: number | null; longitude: number | null } | null)
      : Promise.resolve(null),
    supabase.auth.getUser(),
  ])

  const rsvps = (rawRsvps ?? []) as unknown as RSVPRow[]
  const goingRsvps = rsvps.filter((r) => r.status === 'going')
  const maybeCount = rsvps.filter((r) => r.status === 'maybe').length
  // Plus-ones are an informational headcount for the host (they do NOT consume
  // capacity — the trigger counts 'going' rows). Sum across confirmed attendees.
  const guestCount = goingRsvps.reduce((sum, r) => sum + Math.max(0, r.plus_ones ?? 0), 0)

  // Resolve scope name + the circle's PUBLIC city-level coordinates.
  let scopeName: string | null = null
  let scopeSlug: string | null = null
  let circleCoords: { lat: number; lng: number } | null = null
  if (circleRow) {
    scopeName = circleRow.name ?? null
    scopeSlug = circleRow.slug ?? null
    if (circleRow.latitude != null && circleRow.longitude != null) {
      circleCoords = { lat: Number(circleRow.latitude), lng: Number(circleRow.longitude) }
    }
  }

  let myProfileId: string | null = null
  let myRsvpStatus: string | null = null
  let myPlusOnes = 0
  let isHost = false
  let isCrew = false
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
      isHost = event.host?.id === myProfileId
      const myRsvp = rsvps.find((r) => r.profile.id === myProfileId)
      myRsvpStatus = myRsvp?.status ?? null
      myPlusOnes = myRsvp?.plus_ones ?? 0

      // "From your circles" = going attendees (excluding me) who share at least
      // one active circle with me. Two cheap membership reads + a set overlap;
      // mirrors the shared-circle pattern in lib/connections/welcomes.ts. This
      // is warm proof, never scarcity — it's only ever additive. The Crew check
      // is independent of the membership reads, so they all run concurrently.
      const otherGoingIds = goingRsvps
        .map((r) => r.profile.id)
        .filter((id) => id !== myProfileId)
      const [paidViewer, mineRes, theirsRes] = await Promise.all([
        isPaidViewer(),
        otherGoingIds.length > 0
          ? admin
              .from('memberships')
              .select('circle_id')
              .eq('profile_id', myProfileId)
              .eq('status', 'active')
          : Promise.resolve(null),
        otherGoingIds.length > 0
          ? admin
              .from('memberships')
              .select('profile_id, circle_id')
              .in('profile_id', otherGoingIds)
              .eq('status', 'active')
          : Promise.resolve(null),
      ])
      isCrew = paidViewer
      if (mineRes && theirsRes) {
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

  // Ticketing (ADR-177 + tiers, EVENTS-SYSTEM §2.2): a priced event needs a
  // payouts-ready host. An event sells tickets when it has either a flat
  // `events.price_cents` OR one or more active ticket tiers. Tiers add named
  // pricing modes (fixed/free/pwyc/sliding_scale/donation) + inventory. The whole
  // block hides for free events with no priced tiers.
  //
  // `event_ticket_types` isn't in the generated types yet — untyped cast (repo
  // convention, same as price_cents above).
  type TierRow = {
    id: string
    name: string
    description: string | null
    pricing_mode: TicketTierView['pricingMode']
    price_cents: number | null
    min_cents: number | null
    suggested_cents: number | null
    quantity: number | null
    sold: number
    member_only: boolean
  }
  const { data: rawTiers } = await (admin)
    .from('event_ticket_types')
    .select(
      'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, active, sort_order, created_at',
    )
    .eq('event_id', event.id)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  const tierRows = ((rawTiers ?? []) as unknown as (TierRow & { active: boolean })[]).filter(
    (t) => t.active,
  )

  const tiers: TicketTierView[] = tierRows.map((t) => {
    const spotsLeft = t.quantity == null ? null : Math.max(0, t.quantity - (t.sold ?? 0))
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      pricingMode: t.pricing_mode,
      priceCents: t.price_cents,
      minCents: t.min_cents,
      suggestedCents: t.suggested_cents,
      spotsLeft,
      soldOut: spotsLeft != null && spotsLeft <= 0,
      memberOnly: t.member_only,
    }
  })
  const hasTiers = tiers.length > 0

  const flatPriceCents = event.price_cents ?? 0
  // The event "sells tickets" when it has active tiers (paid or free-claim) OR a
  // flat price. Tiers win when present; otherwise fall back to the flat price
  // (backward compat — an implicit single fixed tier).
  const isPaidEvent = hasTiers || flatPriceCents > 0
  let hostPayoutReady = false
  let ownsTicket = false
  const hostId = event.host?.id
  if (isPaidEvent && hostId) {
    // The payout chain (payoutsLive → getConnectStatus) is sequential within itself,
    // but it's independent of the viewer's hasTicket lookup — run them concurrently.
    const [payoutReady, owns] = await Promise.all([
      (async () => ((await payoutsLive()) ? (await getConnectStatus(hostId)).ready : false))(),
      myProfileId ? hasTicket(event.id, myProfileId) : Promise.resolve(false),
    ])
    hostPayoutReady = payoutReady
    ownsTicket = owns
  }
  if (ticketedCents !== null) ownsTicket = true
  const priceLabel = `$${(flatPriceCents / 100).toFixed(2)}`
  const allTiersSoldOut = hasTiers && tiers.every((t) => t.soldOut)

  // Host sales + refunds (EVENTS-SYSTEM §7). The host (anyone who can manage this
  // event) sees the succeeded tickets and can refund them. RLS lets the host read
  // tickets for their events, but we keep the admin client for the buyer join.
  type SoldTicketRow = {
    id: string
    amount_cents: number
    qty: number
    status: string
    buyer: { display_name: string | null; handle: string | null } | null
  }
  let soldTickets: SoldTicketRow[] = []
  if (canManage && isPaidEvent) {
    const { data: rawSold } = await (admin)
      .from('event_tickets')
      .select('id, amount_cents, qty, status, buyer:profiles!buyer_profile_id ( display_name, handle )')
      .eq('event_id', event.id)
      .eq('status', 'succeeded')
      .order('succeeded_at', { ascending: false })
    soldTickets = (rawSold ?? []) as unknown as SoldTicketRow[]
  }

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

  // ── Post-event social loop (slice B-2, EVENTS-SYSTEM §2.5) ──────────────────
  // The check-in lookup, cohosts, the activity feed, the host's Event Dispatches,
  // and the recap album are all independent of each other (each keyed only on
  // event.id / myProfileId) — resolve them in one concurrent batch.
  type RawActivityPost = {
    id: string
    body: string | null
    image_url: string | null
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }
  // Host Event Dispatches (ADR-255) — page updates the host posted. They render in
  // the same activity stream with an event badge. event_dispatches isn't in the
  // generated types yet → untyped cast (repo convention).
  type RawDispatch = {
    id: string
    title: string | null
    body: string
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }
  type RawMedia = { id: string; image_url: string; caption: string | null; profile_id: string }
  // event_dispatches isn't in lib/database.types.ts yet, so the typed client can't
  // resolve the table name (narrows to `never`). Widen this ONE read to an untyped
  // client — the genuinely-untyped case the ADR-246 rule allows (same convention as
  // the lib/events/* data layer, which writes these rows).
  // eslint-disable-next-line no-restricted-syntax -- event_dispatches not in generated types yet (ADR-246 exception)
  const adminUntyped = admin as unknown as SupabaseClient

  // Practice check-in availability + whether the viewer already checked in.
  const canCheckIn = !!myProfileId && isGoing && isPast && !event.is_cancelled

  const [ciRes, cohostsRaw, { data: rawActivity }, { data: rawDispatches }, rawMediaRes] =
    await Promise.all([
      canCheckIn && myProfileId
        ? admin
            .from('engagement_events')
            .select('id')
            .eq('idempotency_key', `event_checkin:${event.id}:${myProfileId}`)
            .maybeSingle()
        : Promise.resolve(null),
      listCohosts(event.id),
      (admin)
        .from('event_posts')
        .select('id, body, image_url, created_at, author:profiles!profile_id ( id, display_name, handle, avatar_url )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
        .limit(100),
      adminUntyped
        .from('event_dispatches')
        .select('id, title, body, created_at, author:profiles!author_id ( id, display_name, handle, avatar_url )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
        .limit(50),
      // Recap album only matters once the event is over.
      hasEnded
        ? (admin)
            .from('event_media')
            .select('id, image_url, caption, profile_id')
            .eq('event_id', event.id)
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve(null),
    ])

  const alreadyCheckedIn = !!ciRes?.data

  const cohosts = cohostsRaw as CohostView[]
  const isCohost = myProfileId != null && cohosts.some((c) => c.profileId === myProfileId)
  // Who may add a comment / photo: the host, a cohost, or anyone holding an RSVP.
  const isGuest = myRsvpStatus === 'going' || myRsvpStatus === 'maybe' || myRsvpStatus === 'waitlist'
  const canContribute = !!myProfileId && (isHost || isCohost || isGuest)
  const canDispatch = isHost || isCohost

  const commentPosts: ActivityPost[] = ((rawActivity ?? []) as unknown as RawActivityPost[]).map((p) => ({
    id: p.id,
    body: p.body ?? '',
    imageUrl: p.image_url,
    createdAt: p.created_at,
    author: p.author
      ? { id: p.author.id, displayName: p.author.display_name, handle: p.author.handle, avatarUrl: p.author.avatar_url }
      : null,
  }))
  const dispatchPosts: ActivityPost[] = ((rawDispatches ?? []) as unknown as RawDispatch[]).map((d) => ({
    id: `dispatch:${d.id}`,
    body: d.body,
    title: d.title,
    isDispatch: true,
    imageUrl: null,
    createdAt: d.created_at,
    author: d.author
      ? { id: d.author.id, displayName: d.author.display_name, handle: d.author.handle, avatarUrl: d.author.avatar_url }
      : null,
  }))
  // Merge comments + Dispatches into one newest-first stream.
  const activityPosts: ActivityPost[] = [...dispatchPosts, ...commentPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Recap album only matters once the event is over (query ran in the batch above).
  const recapPhotos: RecapPhoto[] = ((rawMediaRes?.data ?? []) as unknown as RawMedia[]).map((m) => ({
    id: m.id,
    imageUrl: m.image_url,
    caption: m.caption,
    profileId: m.profile_id,
  }))

  // Warm-proof faces (shared by the reward strip + fact panel).
  const faces = goingRsvps.map(({ profile }) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  }))
  // Guest roster for the fact panel — Crew see names; others see a count.
  const factGuests: FactGuest[] = goingRsvps.map(({ profile }) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    handle: profile.handle,
  }))

  // Mini-map pin (city-level circle area). Only in-person events with a circle that
  // has public coordinates get a map.
  const mapPin: EventMapPin | null =
    !isOnline && circleCoords
      ? {
          id: event.id,
          slug: event.slug,
          title: event.title,
          whenLabel: `${formatFull(event.starts_at)} at ${formatTime(event.starts_at)}`,
          cityLabel: scopeName,
          lat: circleCoords.lat,
          lng: circleCoords.lng,
        }
      : null

  const whenLine = `${formatFull(event.starts_at)} at ${formatTime(event.starts_at)}${
    event.ends_at ? ` to ${formatTime(event.ends_at)}` : ''
  }`

  const mode = MODE_CHIP[attendanceMode]

  // The Join column's primary action — reused in the aside AND the mobile sheet.
  const joinActions = (
    <div className="space-y-4">
      {isPaidEvent && !event.is_cancelled ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-text">
              {hasTiers ? (tiers.length === 1 ? 'Ticket' : 'Tickets') : `${priceLabel} ticket`}
            </span>
          </div>
          <div className="mt-3">
            {ownsTicket ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <Check className="h-4 w-4" /> Ticket confirmed
              </p>
            ) : hasEnded ? (
              <p className="text-sm text-muted">Ticket sales have closed.</p>
            ) : allTiersSoldOut ? (
              <p className="text-sm text-muted">Sold out.</p>
            ) : !myProfileId ? (
              <p className="text-sm text-muted">Sign in to get your ticket.</p>
            ) : isHost ? (
              <p className="text-sm text-muted">You&rsquo;re hosting. No ticket needed.</p>
            ) : hostPayoutReady ? (
              <TicketButton
                eventId={event.id}
                priceLabel={priceLabel}
                tiers={hasTiers ? tiers : undefined}
              />
            ) : (
              <p className="text-sm text-muted">Tickets aren&rsquo;t available for this event yet.</p>
            )}
          </div>
        </div>
      ) : !event.is_cancelled && myProfileId && !isPast && !isHost ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <CrewGateButton
            isCrew={isCrew}
            label={isGoing ? '✓ Going' : capacityInfo.isFull ? 'Join waitlist' : "RSVP: I'm going"}
            buttonClassName="rounded-lg px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
          >
            <RsvpControls
              eventId={event.id}
              slug={event.slug}
              status={myRsvpStatus as 'going' | 'maybe' | 'waitlist' | 'not_going' | null}
              plusOnes={myPlusOnes}
              isFull={capacityInfo.isFull}
            />
          </CrewGateButton>
          {/* At-RSVP calendar — the highest-ROI lever, emphasised once going. */}
          {isGoing ? (
            <div className="rounded-xl border border-border bg-surface-elevated/40 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted">
                You&rsquo;re going. Lock it in so you don&rsquo;t miss it.
              </p>
              <AddToCalendar icsHref={icsHref} googleUrl={googleUrl} emphasis />
            </div>
          ) : (
            <AddToCalendar icsHref={icsHref} googleUrl={googleUrl} />
          )}
        </div>
      ) : !event.is_cancelled && myProfileId && isGoing && isPast ? (
        /* Event time, going: Check in is the primary action; Cancel RSVP is quiet. */
        <div className="flex items-center gap-4 flex-wrap rounded-2xl border border-border bg-surface p-4">
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
      ) : !event.is_cancelled && myProfileId && isWaitlisted ? (
        <form action={toggleRSVP.bind(null, event.id)} className="rounded-2xl border border-border bg-surface p-4">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
          >
            <Clock className="w-4 h-4" />
            On waitlist · tap to leave
          </button>
        </form>
      ) : null}
    </div>
  )

  // Whether the mobile bottom bar should appear (there's a real action to take).
  const showBottomBar =
    !event.is_cancelled && !hasEnded && !isHost && (isPaidEvent ? !ownsTicket && !allTiersSoldOut : !!myProfileId)
  const bottomBarLabel = isPaidEvent
    ? `Get ticket${hasTiers ? '' : ` · ${priceLabel}`}`
    : isGoing
      ? 'Going'
      : capacityInfo.isFull
        ? 'Join waitlist'
        : 'RSVP'
  const bottomBarStatus = isPaidEvent
    ? hasTiers ? 'Tickets' : priceLabel
    : isGoing ? "You're going" : isWaitlisted ? 'On the waitlist' : 'Free'

  // Stamp the resolved per-viewer context into the request-scoped holder so the event's post-area
  // modules (components/widgets/events/*) read it without prop-drilling — then <PageModules> renders
  // them in the operator-arranged layout. The fixed header + Join aside read the locals directly.
  setEventContext({
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      is_cancelled: event.is_cancelled,
    },
    myProfileId,
    canManage,
    isHost,
    isCohost,
    canDispatch,
    canContribute,
    isPast,
    hasEnded,
    posterDetails,
    posterCropUrls,
    cohosts,
    isPaidEvent,
    soldTickets,
    activityPosts,
    recapPhotos,
  })

  return (
    <div className="pb-24 lg:pb-0">
      {event.is_cancelled && (
        <div className="mb-4 rounded-2xl bg-danger-bg border border-danger px-3 py-2">
          <p className="text-sm font-medium text-danger">This event has been cancelled.</p>
        </div>
      )}

      {claimed === '1' && isHost && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-sm font-semibold text-success">
          <Check className="h-4 w-4" />
          It is yours. You are the host now, so you can edit anything on this page.
        </div>
      )}

      {ticketedCents !== null && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-sm font-semibold text-success">
          <Ticket className="h-4 w-4" />
          You&rsquo;re in. ${(ticketedCents / 100).toFixed(2)} ticket confirmed. See you there.
        </div>
      )}

      {/* "This is not my event" — for an unclaimed posted event, name the poster +
          organizer and give the organizer a path to claim it. Hidden for managers. */}
      {isUnclaimedPosted && !canManage && (
        <ClaimEventBanner
          eventId={event.id}
          organizerName={extra?.organizer_name ?? null}
          postedByName={postedBy?.display_name ?? null}
        />
      )}

      <DetailTemplate
        // [A1] header image — the one big visual win. Uploaded cover, else the scanned
        // poster's cropped cover / full flyer (heroUrl); token placeholder when none.
        hero={
          heroUrl ? (
            <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl bg-surface-elevated">
              {/* The uploaded cover is a PUBLIC URL the optimizer is configured for; a
                  scanned poster's hero is a SIGNED URL from the private bucket (path
                  `/object/sign/...`, outside next.config remotePatterns), so it must
                  bypass the optimizer — matching PosterDetails' plain <img> crops. */}
              <Image
                src={heroUrl}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-cover"
                preload
                unoptimized={heroUrl !== coverUrl}
              />
            </div>
          ) : (
            // No cover: a designed placeholder, not a blank box. Mirrors the
            // circle-card no-cover fill (soft DAWN gradient + centered icon) and
            // leads with the event's date so the slot still says something.
            <div className="relative flex aspect-[16/6] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
              <div className="flex flex-col items-center gap-1 text-center">
                <CalendarDays className="h-7 w-7 opacity-80" />
                <span className="text-3xl font-bold leading-none sm:text-4xl">
                  {new Date(event.starts_at).toLocaleDateString('en-US', { day: 'numeric' })}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'long' })}
                </span>
              </div>
            </div>
          )
        }
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
        // Operator/host entry to Settings (inline edit + the Layout editor), mirroring "Edit Circle".
        actions={canManage ? <EditEventButton /> : undefined}
        // [A2] attendance-mode chip.
        badges={
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${mode.cls}`}>
            <mode.Icon className="h-3 w-3" /> {mode.label}
          </span>
        }
        subtitle={
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
              <span>{whenLine}</span>
            </div>

            {event.location && !isOnline && (
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

            {event.host ? (
              <p>
                Hosted by{' '}
                <Link href={`/people/${event.host.handle}`} className="text-primary-strong hover:underline">
                  {event.host.display_name}
                </Link>
              </p>
            ) : isPostedEvent ? (
              <p className="text-subtle">
                {extra?.organizer_name ? `By ${extra.organizer_name} · ` : ''}
                Organizer not on Frequency yet
              </p>
            ) : null}

            {postedBy && (
              <p className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary shrink-0" />
                <span>
                  Posted by{' '}
                  <Link href={`/people/${postedBy.handle}`} className="text-primary-strong hover:underline">
                    {postedBy.display_name}
                  </Link>
                </span>
              </p>
            )}
          </div>
        }
      >
        {/* Photo gallery — the poster leads, then any additional images, each clickable
            into a full-screen lightbox. Renders only when there are 2+ images to browse. */}
        <EventGallery images={galleryUrls} />

        {/* Host/cohost: a quiet door to the Manage Dashboard (roster, waitlist,
            questionnaire, dispatches, analytics). Host-only; everyone else never
            sees it. */}
        {canManage && (
          <div className="mb-6">
            <Link
              href={`/events/${event.slug}/manage`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
            >
              <LayoutDashboard className="h-4 w-4 text-subtle" />
              Manage event
            </Link>
          </div>
        )}

        {/* [A3] EventRewardStrip — calm gamification chips + warm proof. Hidden for
            a cancelled event (no rewards to dangle on a dead event). */}
        {!event.is_cancelled && (
          <EventRewardStrip
            checkInZaps={ZAP_AMOUNTS.event_attend}
            isPast={isPast}
            circleName={scopeName}
            going={goingRsvps.length}
            fromYourCircles={fromYourCircles}
            maybe={maybeCount}
            guests={guestCount}
            faces={faces}
            nearFull={nearFull}
            spotsLeft={capacityInfo.spotsLeft}
          />
        )}

        {/* MOBILE: the critical-info card stacks ABOVE the Post area so a guest sees
            the facts before the conversation (EVENTS-DESIGN §2.6). The lg aside is
            hidden < lg; this block is hidden ≥ lg. */}
        <div className="mb-8 lg:hidden">
          <EventFactPanel
            whenLine={whenLine}
            isOnline={isOnline}
            location={event.location}
            onlineUrl={onlineUrl}
            mapPin={mapPin}
            going={goingRsvps.length}
            nearFull={nearFull}
            spotsLeft={capacityInfo.spotsLeft}
            guests={factGuests}
            guestsAreVisible={isCrew}
          />
        </div>

        {/* ── TWO-COLUMN interior grid (no new template; plain grid in the body) ── */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* [B] POST AREA — the operator-arranged module column (description · poster · cohosts ·
              sales · dispatch · activity · recap). Shared across every event via the '/events/*'
              scope and rearranged from Settings → Layout, exactly like the circle page. */}
          <div className="min-w-0 space-y-8">
            <PageModules route={`/events/${event.slug}`} />
          </div>

          {/* [C] JOIN AREA — narrow right, sticky on lg+. Hidden on mobile (it
              collapses to the bottom bar + the fact panel stacks above). */}
          <aside className="hidden space-y-4 self-start lg:sticky lg:top-20 lg:block">
            {!event.is_cancelled && joinActions}
            {/* C4 critical info */}
            <EventFactPanel
              whenLine={whenLine}
              isOnline={isOnline}
              location={event.location}
              onlineUrl={onlineUrl}
              mapPin={mapPin}
              going={goingRsvps.length}
              nearFull={nearFull}
              spotsLeft={capacityInfo.spotsLeft}
              guests={factGuests}
              guestsAreVisible={isCrew}
            />
          </aside>
        </div>
      </DetailTemplate>

      {/* MOBILE sticky action bar — hidden on lg+, hidden for host/past/cancelled. */}
      {showBottomBar && (
        <RsvpBottomBar primaryLabel={bottomBarLabel} statusLine={bottomBarStatus}>
          {joinActions}
        </RsvpBottomBar>
      )}
    </div>
  )
}
