import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users, Check, Ticket, Clock, Zap, Video, Globe, LayoutDashboard, Settings } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema } from '@/lib/jsonld'
import { toggleRSVP } from '../actions'
import { EventCheckInButton } from './check-in-button'
import { TicketButton, type TicketTierView } from './ticket-button'
import { RsvpBottomBar } from './rsvp-bottom-bar'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { hasTicket, recordTicketFromSessionId } from '@/lib/billing/tickets'
import { getCapacityInfo } from '@/lib/events/capacity'
import { DetailTemplate } from '@/components/templates/detail-template'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { isStaff, asWebRole } from '@/lib/core/roles'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { updateEventField } from '../admin-actions'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { AddToCalendar, buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { HOME_TZ, resolveZone, isEventPast, zoneAbbrev } from '@/lib/time/zone'
import { type ActivityPost } from '@/components/events/event-activity'
import { EventRewardStrip } from '@/components/events/event-reward-strip'
import { type FactGuest } from '@/components/events/event-fact-panel'
import { type RecapPhoto } from '@/components/events/recap-album'
import { EventGallery } from '@/components/events/event-gallery'
import { HostHovercard } from '@/components/events/host-hovercard'
import { EventShareButton } from '@/components/events/event-share-button'
import { type CohostView } from '@/components/events/cohost-manager'
import { CohostInviteBanner } from '@/components/events/cohost-invite-banner'
import { listCohosts, listCohostInvites, getMyCohostInvite } from '@/lib/events/cohosts'
import { posterSignedUrlMap } from '@/lib/events/poster-media'
import { pointFromGeog } from '@/lib/events/geo'
import { eventHeroHeightClass, readEventHeroHeight } from '@/lib/events/hero-height'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import { detailsMediaPaths, type EventDetailsWithMedia } from '@/lib/events/details-media'
import type { EventMapPin } from '@/components/events/events-map'
import { ZAP_AMOUNTS } from '@/lib/zaps'
// The WHOLE event interior (description · poster · cohosts · sales · activity · recap, PLUS the Join
// box · warm proof · facts · the host "Post an update" composer) renders through the page-settings
// module engine (ADR-270/294/406), so operators arrange every block from Settings → Layout, shared
// across every /events/<slug> via the '/events/*' scope — exactly like the circle page. Only the
// fixed header (cover · title · badges · Edit/Manage) and the mobile action bar stay in the page; the
// page builds the Join/warm-proof/facts data once and stamps it into the event context for the
// modules to render (lib/events/active-event.ts), so no module re-derives the ticketing/RSVP logic.
import { PageModules } from '@/components/widgets/page-modules'
import { setEventContext } from '@/lib/events/active-event'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { nextOccurrence } from '@/lib/events/recurrence'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { mapsSearchUrl, eventMapsQuery } from '@/lib/events/maps-link'

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

// The stored starts_at/ends_at hold the event's wall-clock as UTC parts, so rendering
// them with timeZone:'UTC' shows the event's OWN local time on any server/browser zone
// (without it, a non-UTC runtime silently shifted every event). The zone abbrev is added
// once by the caller via zoneAbbrev(event.time_zone).
function formatFull(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
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
    .select('title, description, starts_at, ends_at, visibility, status, is_cancelled')
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) return { title: 'Event not found' }
  const event = ev as {
    title: string
    description: string | null
    starts_at: string
    ends_at: string | null
    visibility: string | null
    status: string | null
    is_cancelled: boolean | null
  }

  // The admin read bypasses RLS, so mirror the page body's visibility gate here:
  // only genuinely public, published, live events get rich indexable metadata.
  // Anything private / circle_only / unlisted / draft / cancelled gets a minimal,
  // noindexed head so private event data (title, description, venue) never crosses
  // to crawlers or answer engines for a page the body will 404 or member-gate.
  const isPublic =
    event.visibility === 'public' &&
    event.status === 'published' &&
    !event.is_cancelled
  if (!isPublic) {
    return { title: event.title, robots: { index: false, follow: false } }
  }

  // Never expose events.location in the description (SEO-AEO-PLAN: city/area is the
  // coarsest location an anon sees; the exact venue must not reach crawlers).
  const full =
    event.description ??
    `${event.title}: an event on Frequency. Sign in to RSVP.`
  // Search snippets truncate around 155 chars — keep the meta description tight
  // (matches the discover detail pages).
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${event.title} · ${SITE_NAME}`

  // Past events stay reachable but drop out of the index (they linger in the
  // sitemap comment's promise but were never actually noindexed): thin, stale.
  // Resolve through the event's own zone (default HOME) so the expired-noindex flips at
  // the event's real end, not the server's UTC clock.
  const isPast = isEventPast(event.starts_at, event.ends_at, HOME_TZ)

  // The share image is the dynamic OG card (opengraph-image.tsx) — Next injects it into
  // openGraph.images automatically, and Twitter inherits it as a large summary image. So
  // every event gets a card here without a per-event cover lookup.
  return {
    title: event.title,
    description,
    ...(isPast ? { robots: { index: false, follow: true } } : {}),
    // /events/<slug> is the canonical public event URL (the discover detail points here too),
    // so search + AI engines consolidate on this one page.
    alternates: { canonical: `/events/${slug}` },
    openGraph: {
      title: ogTitle,
      description,
      type: 'article',
      url: `/events/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
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
    /** One-time host claim token (seeded events). Drives the seeder's "Send to host" link. */
    claim_token: string | null
    organizer_name: string | null
    details: EventDetailsWithMedia | null
    poster_path: string | null
    cover_image_path: string | null
    gallery_image_paths: string[] | null
    attendance_mode: AttendanceMode | null
    online_url: string | null
    status: string | null
    // Structured venue address (feeds the Maps deep link; coarser fields omitted).
    venue_name: string | null
    street: string | null
    city: string | null
    region: string | null
    postal_code: string | null
    // Event's IANA zone (newer than the generated types → untyped read). Drives every
    // is-past / check-in gate and the when-line abbrev via lib/time/zone.
    time_zone: string | null
    // Presentation bag (jsonb). Carries the host-picked hero height (heroHeight key).
    theme: unknown
    // PostgREST returns a PostGIS `geography` as an EWKB hex string (or, in some setups, a
    // GeoJSON object) — decode it with pointFromGeog, never read `.coordinates` directly.
    geog: unknown
  }
  // These three only depend on already-resolved values (event.id / session_id) and
  // not on each other, so resolve them concurrently: the extra-meta read, the
  // Stripe redirect reconcile (when present), and the viewer's event capabilities.
  const [{ data: rawExtra }, ticketedCentsResolved, eventCaps] = await Promise.all([
    (admin)
      .from('events')
      .select(
        'posted_by_profile_id, claimed_at, claim_token, organizer_name, details, poster_path, cover_image_path, gallery_image_paths, attendance_mode, online_url, status, venue_name, street, city, region, postal_code, time_zone, theme, geog',
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
  // The event's IANA zone (default HOME). Every is-past / check-in gate + when-line
  // resolves through this so an event geolocated to another city reads in ITS zone.
  const eventTz = resolveZone(extra?.time_zone)
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
  // Resolve the poster's own profile (with web_role, to tell an operator from a member) and the
  // @frequency brand profile in parallel; we pick the credit between them below. The brand row is
  // only needed for a posted event, so it's skipped otherwise. @frequency is resolved by its handle
  // so the byline stays correct if the brand profile changes; a missing row falls back to the stable
  // Frequency name/handle.
  const BRAND_CREDIT = { display_name: 'Frequency', handle: 'frequency' }
  const [posterRow, brandRow, posterCropEntries] = await Promise.all([
    postedById && postedById !== (event.host?.id ?? null)
      ? admin
          .from('profiles')
          .select('display_name, handle, web_role')
          .eq('id', postedById)
          .maybeSingle()
          .then(
            ({ data }) =>
              data as { display_name: string; handle: string; web_role: string | null } | null,
          )
      : Promise.resolve(null),
    isPostedEvent
      ? admin
          .from('profiles')
          .select('display_name, handle')
          .eq('handle', 'frequency')
          .maybeSingle()
          .then(({ data }) => (data as { display_name: string; handle: string } | null) ?? BRAND_CREDIT)
      : Promise.resolve(null),
    posterSignedUrlMap(
      [...detailsMediaPaths(posterDetails), extra?.poster_path].filter((p): p is string => !!p),
    ),
  ])
  // The public "Posted by" credit. It reads as the @frequency BRAND account, not the human, in two
  // cases: (a) a SEEDED, still-unclaimed listing (isUnclaimedPosted) — seeded content stays attributed
  // to Frequency until its real host claims it; and (b) whenever the poster is a Frequency OPERATOR
  // (staff), in BOTH the unclaimed and claimed states — an event an operator posts on an organizer's
  // behalf is Frequency putting it on the map, so it never carries the individual operator's name.
  // This overrides only the DISPLAY: the underlying posted_by_profile_id (postedById) is untouched, so
  // the send-to-host + claim + reward flows below still key off it. A regular member who posts a town
  // event keeps their own byline (and their Zaps credit).
  const posterIsOperator = isStaff(asWebRole(posterRow?.web_role))
  const postedBy: { display_name: string; handle: string } | null =
    isUnclaimedPosted || posterIsOperator
      ? brandRow
      : posterRow
        ? { display_name: posterRow.display_name, handle: posterRow.handle }
        : null
  const posterCropUrls = Object.fromEntries(posterCropEntries)

  // Header image: the ORIGINAL poster leads for a scanned event. Priority: uploaded
  // cover → full poster (the original flyer) → the scanner's cropped cover as a last
  // resort. (The cropped cover/region crops are NOT shown as separate images anymore —
  // they just duplicate the poster.)
  const posterMedia = posterDetails.media
  const posterFullUrl = extra?.poster_path ? posterCropUrls[extra.poster_path] ?? null : null
  const coverCropUrl = posterMedia?.coverPath ? posterCropUrls[posterMedia.coverPath] ?? null : null
  const heroUrl = coverUrl ?? posterFullUrl ?? coverCropUrl
  // Host-picked hero height (Short / Standard / Tall), stored on events.theme; mirrors the
  // Business Space cover hero. Applied to both the cover and the no-cover placeholder.
  const heroHeightCls = eventHeroHeightClass(readEventHeroHeight(extra?.theme))
  // Host-picked cover FOCAL POINT (object-position), stored on events.theme.coverFocus. Applied to
  // the cover <img> so the important part of the photo survives the crop; defaults centered.
  const coverFocus = readEventCoverFocus(extra?.theme)

  // Gallery: the header image leads (clickable → full-screen), then any host-UPLOADED
  // extras. The scanner's crops are intentionally excluded: the original poster is the
  // header, and the lineup/region crops already render under "From the poster". So a
  // plain scanned event shows just its original poster, with no duplicate crops.
  // Unified gallery: cover_image_path == gallery_image_paths[0], so the hero and the first gallery
  // path resolve to the SAME url. Dedupe by url so the header photo shows once, not twice.
  const galleryUrls: string[] = [...new Set(
    [
      heroUrl,
      ...(extra?.gallery_image_paths ?? []).map(
        (p) => admin.storage.from('event-media').getPublicUrl(p).data.publicUrl,
      ),
    ].filter((u): u is string => !!u),
  )]

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
  // Checkout is live for this event only when the platform switch is on AND the event
  // is priced. While ticketing is off (lib/events/ticketing) a priced event keeps its
  // price header but behaves like a free event everywhere else: RSVP stays open and
  // no buy/closed/sold-out states render.
  const ticketingActive = TICKETING_ENABLED && isPaidEvent

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

  // Total tickets sold — folded onto the RSVP ticket card, replacing the retired rail Pricing/Sales
  // boxes. Tiers carry a public `sold` count (the same column that drives spotsLeft/sold-out), so
  // every viewer sees a real tally; a flat-price event falls back to the host-visible ticket rows.
  const ticketsSold = hasTiers
    ? tierRows.reduce((sum, t) => sum + Math.max(0, t.sold ?? 0), 0)
    : soldTickets.length

  // Resolve the event's real instant through its own zone — never compare the raw
  // wall-clock to now (that flipped a 7pm PT event "past" at noon, hiding RSVP and
  // unlocking check-in ~7h early). isPast = has started; hasEnded = past ends_at.
  const isPast = isEventPast(event.starts_at, null, eventTz)
  // RSVP stays changeable until the event actually ENDS (not merely starts), so a
  // member can still un-RSVP during a live session. Falls back to starts_at when
  // no end time is set.
  const hasEnded = isEventPast(event.starts_at, event.ends_at, eventTz)

  // For a recurring anchor whose start has passed, compute the next upcoming date so the
  // page surfaces "Next: ..." instead of looking like a one-off that already happened
  // (pure helper, lib/events/recurrence). Null when not recurring or the series has ended.
  const nextRecurrence =
    event.recurrence_type !== 'none' && isPast
      ? nextOccurrence(
          {
            startsAt: event.starts_at,
            recurrenceType: event.recurrence_type,
            recurrenceUntil: event.recurrence_until,
          },
          new Date(),
        )
      : null

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
    timeZone: eventTz,
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
    // 'rsvp' = a system "<Name> RSVP'd" entry; anything else = a guest comment.
    // Newer than the generated types → read via the untyped client below.
    kind: string | null
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

  // event_posts.kind ships in migration 20261125000000. Until it's applied the column
  // doesn't exist, so PostgREST would reject a select naming it and blank the whole feed.
  // Read defensively: try WITH kind, and on that error fall back to the pre-kind shape
  // (every row is then a comment — correct, since the RSVP writer no-ops pre-migration).
  const loadActivityPosts = async (): Promise<{ data: RawActivityPost[] }> => {
    const rel = 'author:profiles!profile_id ( id, display_name, handle, avatar_url )'
    const withKind = await adminUntyped
      .from('event_posts')
      .select(`id, body, image_url, created_at, kind, ${rel}`)
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!withKind.error) return { data: (withKind.data ?? []) as unknown as RawActivityPost[] }
    const noKind = await adminUntyped
      .from('event_posts')
      .select(`id, body, image_url, created_at, ${rel}`)
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(100)
    return { data: (noKind.data ?? []) as unknown as RawActivityPost[] }
  }

  // Practice check-in availability + whether the viewer already checked in.
  const canCheckIn = !!myProfileId && isGoing && isPast && !event.is_cancelled

  const [
    ciRes,
    cohostsRaw,
    cohostInvitesRaw,
    myCohostInvite,
    { data: rawActivity },
    { data: rawDispatches },
    rawMediaRes,
  ] =
    await Promise.all([
      canCheckIn && myProfileId
        ? admin
            .from('engagement_events')
            .select('id')
            .eq('idempotency_key', `event_checkin:${event.id}:${myProfileId}`)
            .maybeSingle()
        : Promise.resolve(null),
      listCohosts(event.id),
      // Pending cohost invites — only the host needs them (their manager lists them).
      isHost ? listCohostInvites(event.id) : Promise.resolve([]),
      // The viewer's own pending invite, if any — drives the Accept/Decline banner.
      myProfileId ? getMyCohostInvite(event.id, myProfileId) : Promise.resolve(null),
      // Untyped read (event_posts.kind is newer than the generated types, migration
      // 20261125000000) + migration-safe fallback. Map below casts to RawActivityPost.
      loadActivityPosts(),
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
  const cohostInvites = cohostInvitesRaw as CohostView[]
  const isCohost = myProfileId != null && cohosts.some((c) => c.profileId === myProfileId)
  // Who may add a comment / photo: ANY signed-in member (the old RSVP-holder
  // requirement was dropped so the event wall reads as open conversation; the
  // server action createEventPost applies the same gate). Dispatches stay
  // host/cohost-only below.
  const canContribute = !!myProfileId
  const canDispatch = isHost || isCohost

  const commentPosts: ActivityPost[] = ((rawActivity ?? []) as unknown as RawActivityPost[]).map((p) => ({
    id: p.id,
    body: p.body ?? '',
    imageUrl: p.image_url,
    createdAt: p.created_at,
    kind: p.kind === 'rsvp' ? 'rsvp' : 'comment',
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

  // Exact-venue point (§5): the event's OWN geog, shown as a precise mini-map. Only
  // for a PUBLISHED, in-person event that actually has a geocoded point — drafts and
  // online events never get it, and without a point we render nothing (no regression).
  // `geog` comes back from PostgREST as an EWKB hex STRING (not GeoJSON), so it must be
  // decoded — `pointFromGeog` handles both forms. This is why the map was never showing.
  const isPublished = (extra?.status ?? 'published') === 'published'
  const venuePoint: { lat: number; lng: number } | null =
    !isOnline && isPublished ? pointFromGeog(extra?.geog) : null

  // Mini-map pin (city-level circle area). Only in-person events with a circle that
  // has public coordinates get a map.
  const mapPin: EventMapPin | null =
    !isOnline && circleCoords
      ? {
          id: event.id,
          slug: event.slug,
          title: event.title,
          whenLabel: `${formatFull(event.starts_at)} at ${formatTime(event.starts_at)} ${zoneAbbrev(event.starts_at, eventTz)}`.trim(),
          cityLabel: scopeName,
          lat: circleCoords.lat,
          lng: circleCoords.lng,
        }
      : null

  const whenLine = `${formatFull(event.starts_at)} at ${formatTime(event.starts_at)}${
    event.ends_at ? ` to ${formatTime(event.ends_at)}` : ''
  } ${zoneAbbrev(event.starts_at, eventTz)}`.trim()

  // Maps deep link for the venue: the structured address when the host entered one,
  // else the free-text location line. One https URL opens native Maps on a phone and
  // the map site on desktop. Null for online events or when there is no address.
  const mapsHref = isOnline
    ? null
    : mapsSearchUrl(
        eventMapsQuery({
          venueName: extra?.venue_name,
          street: extra?.street,
          city: extra?.city,
          region: extra?.region,
          postalCode: extra?.postal_code,
          location: event.location,
        }),
      )

  // Header location line — the VENUE name first, then the street/city/region address (Event page
// overhaul, items 1 + 4). Composed from the same structured fields the location picker saves
// (venue_name / street / city / region), so the header stays in sync with the pin the moment the
// picker writes them. Falls back to the free-text `location` line when no structured address is set.
  const venueName = extra?.venue_name?.trim() || null
  const addressLine = [extra?.street, extra?.city, extra?.region]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  const headerLocation =
    venueName && addressLine
      ? `${venueName} · ${addressLine}`
      : venueName || addressLine || (event.location?.trim() || null)

  const mode = MODE_CHIP[attendanceMode]

  // The Join column's primary action — reused in the aside AND the mobile sheet.
  const joinActions = (
    <div className="space-y-4">
      {/* Price card for a priced event. With ticketing ON it carries the full checkout
          cascade; with ticketing OFF (lib/events/ticketing) it keeps ONLY the price
          header and the RSVP card below opens up like a free event — no
          closed/sold-out/sign-in/buy states. */}
      {isPaidEvent && !event.is_cancelled && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-text">
              {hasTiers ? (tiers.length === 1 ? 'Ticket' : 'Tickets') : `${priceLabel} ticket`}
            </span>
          </div>
          {TICKETING_ENABLED && (
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
                hostPayoutReady ? (
                  <p className="text-sm text-muted">You&rsquo;re hosting. No ticket needed.</p>
                ) : (
                  /* The buy path is gated on the HOST's Stripe Connect account being
                     charges + payouts ready (getConnectStatus.ready). When it isn't, the
                     old copy read "Tickets aren't available for this event yet" to
                     everyone with no way forward. Tell the host the real prerequisite and
                     link them straight to payout setup. */
                  <div className="space-y-2">
                    <p className="text-sm text-muted">
                      Connect payouts to start selling tickets for this event.
                    </p>
                    <Link
                      href="/settings/billing"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                    >
                      <Ticket className="h-4 w-4" />
                      Set up payouts
                    </Link>
                  </div>
                )
              ) : hostPayoutReady ? (
                <TicketButton
                  eventId={event.id}
                  priceLabel={priceLabel}
                  tiers={hasTiers ? tiers : undefined}
                />
              ) : (
                /* Host hasn't finished payout setup, so there is no one to pay yet.
                   Honest to the buyer, no dead "not available" phrasing. */
                <p className="text-sm text-muted">The host hasn&rsquo;t opened ticket sales yet.</p>
              )}
            </div>
          )}
          {/* Tickets sold, folded onto the ticket card from the retired rail Sales box. Quiet, factual. */}
          <p className="mt-3 text-xs text-subtle">
            {ticketsSold > 0 ? `${ticketsSold} sold` : 'No tickets sold yet'}
          </p>
        </div>
      )}
      {ticketingActive ? null : !event.is_cancelled && myProfileId && !isPast ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          {/* RSVP is open to every member on any event, INCLUDING the host of their own
              gathering (a host counts themselves in like anyone else) — it is never
              Crew-gated. Crew unlocks CREATING events, not attending them (the upgrade
              gate lives on the create flow, not here). */}
          <RsvpControls
            eventId={event.id}
            slug={event.slug}
            status={myRsvpStatus as 'going' | 'maybe' | 'waitlist' | 'not_going' | null}
            plusOnes={myPlusOnes}
            isFull={capacityInfo.isFull}
          />
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
      ) : !event.is_cancelled && !myProfileId && !isPast ? (
        /* Signed-out visitor on a free, upcoming event: RSVP is for everyone, so offer the
           one step that unlocks it — sign in, then you're on the list. (Paid events are
           handled above with their own "Sign in to get your ticket" line.) */
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <Link
            href={`/sign-in?next=/events/${event.slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Sign in to RSVP
          </Link>
          <p className="text-xs text-muted">Free to join. Sign in and you&rsquo;re on the list.</p>
        </div>
      ) : null}
    </div>
  )

  // Whether the mobile bottom bar should appear (there's a real action to take). A host
  // CAN RSVP to their own FREE event (so the bar shows), but never buys a ticket to it —
  // so the host is excluded only on the paid path ("you're hosting, no ticket needed").
  // While ticketing is off, a priced event rides the RSVP path (no "Get ticket" CTA).
  const showBottomBar =
    !event.is_cancelled && !hasEnded && (ticketingActive ? !isHost && !ownsTicket && !allTiersSoldOut : !!myProfileId)
  const bottomBarLabel = ticketingActive
    ? `Get ticket${hasTiers ? '' : ` · ${priceLabel}`}`
    : isGoing
      ? 'Going'
      : capacityInfo.isFull
        ? 'Join waitlist'
        : 'RSVP'
  const bottomBarStatus = ticketingActive
    ? hasTiers ? 'Tickets' : priceLabel
    : isGoing ? "You're going" : isWaitlisted ? 'On the waitlist' : isPaidEvent ? priceLabel : 'Free'

  // Stamp the resolved per-viewer context into the request-scoped holder so EVERY event interior
  // module (components/widgets/events/*) reads it without prop-drilling — then the single
  // <PageModules> renders them in the operator-arranged layout. The whole interior is module-driven
  // now (only the fixed header + the mobile action bar read the locals directly): the Join box,
  // warm proof, and facts that used to be a hardcoded aside are stamped here as `joinActions` /
  // `warmProof` / `facts`, each already gated/computed by the page so the modules render verbatim.
  setEventContext({
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      is_cancelled: event.is_cancelled,
    },
    // The host's public profile for the `event-lineup` Host profile box (null → the module self-hides).
    host: event.host
      ? {
          id: event.host.id,
          display_name: event.host.display_name,
          handle: event.host.handle,
          avatar_url: event.host.avatar_url,
        }
      : null,
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
    cohostInvites,
    isPaidEvent,
    soldTickets,
    activityPosts,
    recapPhotos,
    // The Join box, fully built + gated above; null on a cancelled event so the `event-join`
    // module renders nothing there (the old aside guarded it the same way).
    joinActions: event.is_cancelled ? null : joinActions,
    warmProof: {
      going: goingRsvps.length,
      fromYourCircles,
      maybe: maybeCount,
      guests: guestCount,
      faces,
      nearFull,
      spotsLeft: capacityInfo.spotsLeft,
    },
    facts: {
      whenLine,
      isOnline,
      location: event.location,
      mapsHref,
      onlineUrl,
      mapPin,
      venuePoint,
      going: goingRsvps.length,
      nearFull,
      spotsLeft: capacityInfo.spotsLeft,
      guests: factGuests,
      guestsAreVisible: isCrew,
      viewerSignedIn: !!myProfileId,
      signInHref: `/sign-in?next=/events/${event.slug}`,
    },
  })

  // Event structured data (schema.org) for SEO + AI answer engines, built from the shared
  // eventSchema helper so the canonical /events/<slug> page emits the same richer, city-level
  // schema as /discover (offers/validFrom/availability included; the exact venue is NEVER
  // leaked — city-level only, matching this page's own city-only meta description per ADR-186).
  const eventJsonLd = eventSchema({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    city: extra?.city ?? null,
    circle_id: event.scope_id ?? null,
    circle_name: scopeName,
    price_cents: event.price_cents,
    attendance_mode: attendanceMode,
    is_cancelled: event.is_cancelled,
    region: extra?.region ?? null,
  })

  return (
    <div className="pb-24 lg:pb-0">
      <JsonLd data={eventJsonLd} />
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

      {/* Pending cohost invite — the signed-in viewer was invited to cohost this event.
          Accept to join as a cohost, or decline. Hidden for the host (they can't invite
          themselves) and once the invite is answered. */}
      {myCohostInvite && !isHost && (
        <CohostInviteBanner eventId={event.id} slug={event.slug} eventTitle={event.title} />
      )}

      {/* The public "Is this your event? Claim it" banner is retired (owner directive): the person who
          SEEDED the event now hands it off privately via the "Send to host" link in the QR and Share popup,
          so the claim path is no longer surfaced to every visitor. */}

      <DetailTemplate
        // [A1] header image — the one big visual win. Uploaded cover, else the scanned
        // poster's cropped cover / full flyer (heroUrl); token placeholder when none.
        hero={
          heroUrl ? (
            <div className={`relative ${heroHeightCls} w-full overflow-hidden rounded-2xl bg-surface-elevated`}>
              {/* The uploaded cover is a PUBLIC URL the optimizer is configured for; a
                  scanned poster's hero is a SIGNED URL from the private bucket (path
                  `/object/sign/...`, outside next.config remotePatterns), so it must
                  bypass the optimizer — matching PosterDetails' plain <img> crops. */}
              <Image
                src={heroUrl}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 1344px"
                className="object-cover"
                style={{ objectPosition: coverFocus }}
                preload
                unoptimized={heroUrl !== coverUrl}
              />
            </div>
          ) : (
            // No cover: a designed placeholder, not a blank box. Mirrors the
            // circle-card no-cover fill (soft DAWN gradient + centered icon) and
            // leads with the event's date so the slot still says something.
            <div className={`relative flex ${heroHeightCls} w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong`}>
              <div className="flex flex-col items-center gap-1 text-center">
                <CalendarDays className="h-7 w-7 opacity-80" />
                <span className="text-3xl font-bold leading-none sm:text-4xl">
                  {new Date(event.starts_at).toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}
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
        // Every viewer gets "QR & Share" (the public send-this-event control); operators/hosts
        // additionally get Edit (Settings drawer) then Manage (dashboard), stacked beneath it.
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <EventShareButton
              slug={event.slug}
              title={event.title}
              sharerProfileId={myProfileId}
              // "Send to host": only the SEEDER (the poster) of an unclaimed event gets the claim link, so
              // they can hand it to its real organizer. Everyone else gets null (no block shown).
              hostClaimUrl={
                isUnclaimedPosted && myProfileId && myProfileId === postedById && extra?.claim_token
                  ? `${SITE_URL}/events/claim/${extra.claim_token}`
                  : null
              }
            />
            {canManage && (
              <>
                <OpenAdminBarButton
                  scope={{ kind: 'event', id: event.id }}
                  caps={Array.from(eventCaps)}
                  label="Edit event"
                  icon={<Settings className="h-4 w-4" />}
                />
                <Link
                  href={`/events/${event.slug}/manage`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                >
                  <LayoutDashboard className="h-4 w-4 text-subtle" />
                  Manage event
                </Link>
              </>
            )}
          </div>
        }
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

            {headerLocation && !isOnline && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-subtle shrink-0" />
                {/* Venue name leads, then the address (item 4). The line deep-links into Maps
                    (native app on a phone, the map site on desktop) so guests navigate in one tap. */}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary-strong hover:underline"
                  >
                    {headerLocation}
                  </a>
                ) : (
                  <span>{headerLocation}</span>
                )}
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

            {/* Recurring anchor whose date has passed: surface the next upcoming date so the
                series never reads as a one-off that already happened. */}
            {nextRecurrence && (
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
                <span>
                  Next:{' '}
                  {nextRecurrence.toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                  })}
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
              // In-network host: bold, clickable, with a hover/focus profile-preview popover
              // (items 2 + 3). An out-of-network organizer stays plain text below.
              <p>
                Hosted by <HostHovercard host={event.host} />
              </p>
            ) : isPostedEvent ? (
              <p className="text-subtle">
                {extra?.organizer_name ? `By ${extra.organizer_name} · ` : ''}
                Organizer not on Frequency yet
              </p>
            ) : null}

            {postedBy &&
              (isUnclaimedPosted ? (
                // Still unclaimed: the poster credit IS the attribution, so it stays prominent
                // (Zap icon + accent link) next to the claim/organizer lines.
                <p className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Posted by{' '}
                    <Link href={`/people/${postedBy.handle}`} className="text-primary-strong hover:underline">
                      {postedBy.display_name}
                    </Link>
                  </span>
                </p>
              ) : (
                // Once a host has claimed the event, the original poster is just a small, unobtrusive
                // credit under the host line — no accent, no icon.
                <p className="text-2xs text-subtle">
                  Posted by{' '}
                  <Link
                    href={`/people/${postedBy.handle}`}
                    className="underline-offset-2 hover:text-text hover:underline"
                  >
                    {postedBy.display_name}
                  </Link>
                </p>
              ))}

            {/* [A3] The calm reward line reads as HEADER content — it sits with the
                date/location/host lines, not floating above the grid with a divider. The
                check-in Zaps reward (+ streak / Current when real). Hidden for a cancelled
                event. */}
            {!event.is_cancelled && (
              <EventRewardStrip
                checkInZaps={ZAP_AMOUNTS.event_attend}
                isPast={isPast}
                circleName={scopeName}
              />
            )}
          </div>
        }
      >
        {/* Photo gallery (item 5) — the FIRST gallery image is the header/cover, already rendered
            full-width above at its host-picked hero height (the DetailTemplate `hero` band). So the
            gallery below shows only the REST of the photos as thumbnails (no duplicate of the
            header), each clickable into a full-screen lightbox. It stays in the page (not a module):
            it's built from the gallery URLs the header already resolved, and self-hides with no
            extras. It leads the interior, above the arrangeable blocks. */}
        <EventGallery images={galleryUrls.slice(1)} />

        {/* ── The FULL interior is one templated <PageModules> now: no hardcoded aside, no bespoke
            two-column grid. The '/events/*' layout owns the arrangement — its default Main + side
            grid reproduces the old two-column page (post area in MAIN; the Join box, warm proof,
            facts, and the host "Post an update" composer in SIDE), and every block is movable from
            the on-page Layout editor. On a phone the SIDE column stacks above MAIN (the grid's
            order-first), so a guest still sees who's going + the facts before the conversation —
            the old mobile-only duplicate is gone (no double-render). ── */}
        <PageModules route={`/events/${event.slug}`} />
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
