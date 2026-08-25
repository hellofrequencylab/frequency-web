import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ClaimButton } from '@/app/events/claim/[token]/claim-button'
import { ClaimRequestCta } from './claim-request-cta'
import { HostRequestCta } from './host-request-cta'
import { listSpacesThatCanAskToHost, type HostAskSpace } from '../host-transfer-actions'
import { CalendarDays, MapPin, Check, Ticket, Clock, Zap, Video, Globe, LayoutDashboard, Settings } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSeriesDates } from '@/lib/events/series-dates'
import { SERIES_COLUMNS } from '@/lib/events/series'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'
import { seriesRobots, seriesSeoFacts, suppressPastNoindex } from '@/lib/events/series-seo'
import { SeriesDatesRail } from '@/components/events/series-dates-rail'
import { createClient } from '@/lib/supabase/server'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'
import { ticketFromPriceCents, ticketsSoldOut } from '@/lib/commerce/ticket-projection'
import { toggleRSVP } from '../actions'
import { EventCheckInButton } from './check-in-button'
import { TicketButton, type TicketTierView } from './ticket-button'
import { RsvpBottomBar } from './rsvp-bottom-bar'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { hasTicket, recordTicketFromSessionId } from '@/lib/billing/tickets'
import { getCapacityInfo } from '@/lib/events/capacity'
import { EventDetailTemplate } from '@/components/templates/event-detail-template'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { isStaff, asWebRole } from '@/lib/core/roles'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { updateEventField } from '../admin-actions'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { WarmProof } from '@/components/events/warm-proof'
import { GuestRsvpForm } from '@/components/events/guest-rsvp-form'
import { GuestCheckInPrompt } from '@/components/events/guest-check-in-prompt'
import { safeHttpUrl } from '@/lib/safe-url'
import { MembershipCheckoutFold } from '@/components/events/membership-checkout-fold'
import { RsvpPaymentFlow, type FlowRate } from '@/components/events/rsvp-payment-flow'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { HOME_TZ, resolveZone, isEventPast, zoneAbbrev } from '@/lib/time/zone'
import { type ActivityPost } from '@/components/events/event-activity'
import { EventRewardStrip } from '@/components/events/event-reward-strip'
import { type FactGuest } from '@/components/events/event-fact-panel'
import { type RecapPhoto } from '@/components/events/recap-album'
import { EventGallery } from '@/components/events/event-gallery'
import { EventBelonging, EventBelongingSkeleton } from '@/components/events/event-belonging'
import { VenueCredit } from '@/components/events/venue-credit'
import { circleScopeId, hostingSpaceId, venueSpaceId } from '@/lib/events/belonging'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { HostHovercard } from '@/components/events/host-hovercard'
import { EventShareButton } from '@/components/events/event-share-button'
import { type CohostView } from '@/components/events/cohost-manager'
import { CohostInviteBanner } from '@/components/events/cohost-invite-banner'
import { listCohosts, listCohostInvites, getMyCohostInvite } from '@/lib/events/cohosts'
import { listCollaboratorSpacesForEvent } from '@/lib/events/event-share'
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
import { setEventContext, type SpaceHostLite } from '@/lib/events/active-event'
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
  /** The event's IANA zone (`events.time_zone`, not null, default 'America/Los_Angeles').
   *  `starts_at` above is a WALL CLOCK kept as UTC parts, so this is what turns it back into an
   *  instant. Read here for the JSON-LD `startDate` (SCAN-207); the page's own labels format
   *  through lib/time/zone, which resolves the zone the same way. */
  time_zone: string | null
  is_cancelled: boolean
  price_cents: number | null
  /** ISO 4217 as stored (DEFAULT 'usd'). Read only to denominate the JSON-LD Offer — the page's
   *  own price labels format through the commerce helpers, which already carry it. */
  currency: string | null
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

// Attendance-mode PILL (EVENTS-DESIGN §2.4) — one bordered rounded-pill chip in the
// DetailTemplate `badges` slot, so it reads as a tag beside the title rather than plain
// inline text. DAWN tokens only.
const MODE_CHIP: Record<AttendanceMode, { Icon: typeof Video; cls: string; label: string }> = {
  in_person: { Icon: MapPin, cls: 'border-border bg-surface-elevated text-muted', label: 'In person' },
  online:    { Icon: Video, cls: 'border-broadcast/30 bg-broadcast-bg text-broadcast-strong', label: 'Online' },
  hybrid:    { Icon: Globe, cls: 'border-primary/30 bg-primary-bg text-primary-strong', label: 'In person + online' },
}

// `profile` is NULLABLE, and the null case is a real row rather than a defect: a signed-out guest
// RSVP carries `guest_name`/`guest_email` and no profile_id at all (20270303000000). The embed is a
// LEFT join, so those rows arrive with `profile: null`.
//
// 🔴 This type was declared non-null and reached through unguarded (`r.profile.id`) in four places.
// The row is cast with `as unknown as RSVPRow[]`, so TypeScript believed the lie and the first
// guest RSVP on any event would have thrown `Cannot read properties of null` and 500'd the whole
// detail page. Guard every deref; `goingMembers` below exists so the common case reads cleanly.
type RSVPRow = {
  id: string
  status: string
  plus_ones: number
  /** Null for a signed-out guest seat. */
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
  /** What a guest typed, when they typed one. Null for member seats and for anonymous guests. */
  guest_name: string | null
  /** 'pending' while the host has not yet admitted this request (20270303000000). */
  approval_status: string | null
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
    // The three recurrence columns ride along on the read generateMetadata already does, so the
    // series robots rules cost this page ZERO extra round trips for a one-off (see seriesSeoFacts).
    .select(
      `id, title, description, starts_at, ends_at, visibility, status, is_cancelled, ${SERIES_COLUMNS}`,
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) return { title: 'Event not found' }
  const event = ev as {
    id: string
    title: string
    description: string | null
    starts_at: string
    ends_at: string | null
    visibility: string | null
    status: string | null
    is_cancelled: boolean | null
    recurrence_type: string | null
    recurrence_until: string | null
    parent_event_id: string | null
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

  // ── Series robots (ADR-897) ───────────────────────────────────────────────
  // Two corrections, in one call that costs a one-off nothing (it short-circuits on the row above
  // before touching the database):
  //   D1 — a long-running series' ANCHOR row keeps its original, now-past starts_at forever, so the
  //        page that IS the series was reading as "ended" and dropping out of the index while its
  //        third date stayed in. suppressPastNoindex cancels that while any date is still ahead.
  //   The occurrence rule — past the operator's allowance, a date goes noindex,follow. It stays
  //        live, RSVP-able and SELF-canonical (a rel=canonical to the series page would tell Google
  //        this URL is a duplicate that should not rank, deleting the "the next dates are indexed"
  //        half of the design), and it keeps passing its links up to the series page.
  // `indexedOccurrences` is the same operator knob the sitemap sizes its fold with. The two must
  // agree: a sitemap advertising date three while this page answers noindex is a contradictory
  // crawl signal, and it is the kind that resolves in Google's favour, not ours.
  const facts = await seriesSeoFacts(event)
  const { indexedOccurrences } = await getSeriesDisplayConfig()
  const pastRobots = isPast && !suppressPastNoindex(facts) ? { index: false, follow: true } as const : undefined
  const robots = pastRobots ?? seriesRobots(facts, indexedOccurrences)

  // The share image is the dynamic OG card (opengraph-image.tsx) — Next injects it into
  // openGraph.images automatically, and Twitter inherits it as a large summary image. So
  // every event gets a card here without a per-event cover lookup.
  return {
    title: event.title,
    description,
    ...(robots ? { robots } : {}),
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
  searchParams: Promise<{ ticket?: string; session_id?: string; claimed?: string; claim?: string }>
}) {
  // params, searchParams, and the auth client are mutually independent — resolve
  // them concurrently instead of one-after-another. (createAdminClient is sync.)
  const admin = createAdminClient()
  const [{ slug }, { ticket, session_id, claimed, claim }, supabase] = await Promise.all([
    params,
    searchParams,
    createClient(),
  ])

  const { data: rawEvent } = await admin
    .from('events')
    .select(
      `id, title, slug, description, location, starts_at, ends_at, time_zone, is_cancelled, price_cents, currency,
       visibility, scope_id, scope_type, recurrence_type, recurrence_until, parent_event_id,
       host:profiles!host_id ( id, display_name, handle, avatar_url )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) notFound()
  const event = rawEvent as unknown as EventDetail

  // PLACEMENT, read honestly (ADR-883). `scope_id` names an entity for exactly ONE value of
  // `scope_type`: Circle. A 'public' event's scope_id is a shared SENTINEL region uuid and the
  // legacy 'standalone' row's scope_id is a PROFILE id, so both resolve to null here and can
  // never be looked up as a Circle, gated as a Circle, or rendered as a link. The helper also
  // accepts the pre-rename 'group' value the older rows still carry, which the two hand-rolled
  // `=== 'circle'` checks below used to miss (the circle_only membership gate among them).
  const circleId = circleScopeId({ scopeType: event.scope_type, scopeId: event.scope_id })

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
    // The Space that hosts the event (ADR-800). Set ⇒ the event was posted from a Space and is
    // attributed to it (the Space brand is the displayed host). Newer than the generated types → cast.
    space_id: string | null
    // The explicit HOSTING entity (ADR-819): when set, this Space is the billed + displayed host,
    // regardless of placement. Wins over space_id for attribution. Newer than the generated types.
    host_space_id: string | null
    // Presentation bag (jsonb). Carries the host-picked hero height (heroHeight key).
    theme: unknown
    // PostgREST returns a PostGIS `geography` as an EWKB hex string (or, in some setups, a
    // GeoJSON object) — decode it with pointFromGeog, never read `.coordinates` directly.
    geog: unknown
    // ADR-825: hide the exact address until the viewer registers (going/waitlist RSVP or ticket).
    hide_address: boolean | null
    /** 20270303000000. When true an RSVP lands as a REQUEST and the host admits it. */
    rsvp_requires_approval: boolean | null
    // ADR-826: how people join — 'auto' derives from pricing; 'rsvp' = first come first served
    // (prices informational); 'tickets' = buying is attending (no RSVP switch).
    join_mode: 'auto' | 'rsvp' | 'tickets' | null
  }
  // These three only depend on already-resolved values (event.id / session_id) and
  // not on each other, so resolve them concurrently: the extra-meta read, the
  // Stripe redirect reconcile (when present), and the viewer's event capabilities.
  const [{ data: rawExtra }, ticketedCentsResolved, eventCaps, rootSpaceId] = await Promise.all([
    (admin)
      .from('events')
      .select(
        'posted_by_profile_id, claimed_at, claim_token, organizer_name, details, poster_path, cover_image_path, gallery_image_paths, attendance_mode, online_url, status, venue_name, street, city, region, postal_code, time_zone, space_id, host_space_id, theme, geog, hide_address, join_mode, rsvp_requires_approval',
      )
      .eq('id', event.id)
      .maybeSingle(),
    // Webhook-independent reconcile when Stripe redirects back from a paid ticket.
    ticket === 'success' && session_id
      ? recordTicketFromSessionId(session_id)
      : Promise.resolve(null),
    getEventCapabilities(event.id),
    // The root Space is the single-tenant default an event inherits (a personal Circle derives
    // it), so it has to be excluded before space_id can be read as a real placement.
    loadRootSpaceId(),
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

  // SPACE ATTRIBUTION (ADR-800/819): the explicit HOSTING entity (events.host_space_id) wins; else the
  // placement Space (events.space_id) is the displayed host — its brand + logo, linking to the Space
  // page. The person in host_id stays the operational organizer (edit rights, rewards, cohost
  // management). Best-effort: a missing or non-active Space just falls back to the person host, so
  // attribution never breaks the page.
  //
  // The ROOT Space is excluded: every event inherits it (a personal Circle's events derive it,
  // lib/circles/store.ts spaceIdForCircle), so treating it as a placement attributed those events
  // to the platform's own brand instead of their person host, and pointed the membership-tier +
  // payout lookups at the root tenant. The edit page already made this exact check.
  const spaceAxes = { spaceId: extra?.space_id, hostSpaceId: extra?.host_space_id }
  // THE HOST: billed, displayed, accountable. Drives attribution, the membership-tier lookup and
  // the payout-readiness check below.
  const eventSpaceId = hostingSpaceId(spaceAxes, rootSpaceId)
  // THE VENUE: where the event lives, and ONLY when that is a different Space from the host — so
  // the page can never name one Space twice (lib/events/belonging.ts).
  const eventVenueSpaceId = venueSpaceId(spaceAxes, rootSpaceId)
  let spaceHost: SpaceHostLite | null = null
  // The HOSTING space's owner: for an explicitly space-hosted event (host_space_id set) this is
  // the payee whose Connect account tickets pay into (ADR-819) — the payout-readiness check below
  // must key on it, not on the personal organizer.
  let hostSpaceOwnerId: string | null = null
  if (eventSpaceId) {
    const { data: rawSpace } = await admin
      .from('spaces')
      .select('id, slug, name, brand_name, brand_logo_url, status, owner_profile_id')
      .eq('id', eventSpaceId)
      .maybeSingle()
    const s = rawSpace as {
      id: string; slug: string; name: string | null
      brand_name: string | null; brand_logo_url: string | null; status: string | null
      owner_profile_id: string | null
    } | null
    if (s && s.status === 'active') {
      spaceHost = { id: s.id, slug: s.slug, name: s.brand_name ?? s.name ?? 'Space', logoUrl: s.brand_logo_url }
      if (extra?.host_space_id === s.id) hostSpaceOwnerId = s.owner_profile_id
    }
  }

  // THE VENUE Space, when a DIFFERENT Space hosts (ADR-911). Name + slug only: a venue is a
  // context credit on the host line, not an identity with a logo, and it carries no money and no
  // rights. `venueSpaceId` already returned null when the venue IS the host, so this read only ever
  // happens on an event that genuinely has two Spaces to name.
  //
  // Gated on `status === 'active'` exactly as the host is, so a suspended or archived venue silently
  // drops to "Hosted by <host>" rather than linking a dead Space page.
  let venueSpace: { slug: string; name: string } | null = null
  if (eventVenueSpaceId) {
    const { data: rawVenue } = await admin
      .from('spaces')
      .select('slug, name, brand_name, status')
      .eq('id', eventVenueSpaceId)
      .maybeSingle()
    const v = rawVenue as { slug: string; name: string | null; brand_name: string | null; status: string | null } | null
    if (v && v.status === 'active') venueSpace = { slug: v.slug, name: v.brand_name ?? v.name ?? 'Space' }
  }

  // Draft guard (ADR poster-events): an unpublished draft must never render on its
  // public slug. The admin read above bypasses RLS, so re-apply the status gate the
  // migration assumes server reads carry — only a manager may preview a draft.
  if ((extra?.status ?? 'published') !== 'published' && !canManage) notFound()

  // An unclaimed event posted on an organizer's behalf: it has a poster credit, no
  // host, and was never claimed. Drives the "this is not my event / claim it" UI.
  //
  // A SPACE host counts as claimed (owner report, seeded-listing handoff): once an operator
  // places a seeded listing under the organizer's real Space, that Space owns the event even
  // though host_id is still null (nobody claimed it as a person). Without the spaceHost term
  // the page kept the seeded posture — prominent "Posted by Frequency" with the Zap credit,
  // plus the claim banner — under a real host's brand.
  const isUnclaimedPosted = isPostedEvent && !extra?.claimed_at && !event.host && !spaceHost

  // CLAIMABLE — the exact guard `resendClaimInvite` applies server-side (lib/events/event-drafts.ts:
  // published · no host_id · no claimed_at · a claim_token exists), expressed in this page's own
  // terms so the CTA can never offer a send the action would refuse. `isUnclaimedPosted` already
  // carries the host_id/claimed_at halves plus the Space-host rule; `status` and `claim_token` are
  // the two the page didn't yet name. Status matters here because a manager may PREVIEW a draft
  // (the notFound() guard above lets them through) and a draft is not claimable.
  const isClaimable =
    isUnclaimedPosted && !!extra?.claim_token && (extra?.status ?? 'published') === 'published'

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
    if (vis === 'circle_only' && circleId) {
      const { getMyProfileId } = await import('@/lib/auth')
      const myId = await getMyProfileId()
      if (!myId) notFound()
      const { data: member } = await admin
        .from('memberships')
        .select('id')
        .eq('profile_id', myId)
        .eq('circle_id', circleId)
        .eq('status', 'active')
        .maybeSingle()
      if (!member) notFound()
    }
  }

  // The RSVP roster, capacity/waitlist info, the hosting circle's public area, the
  // auth user, and the active ticket tiers are mutually independent (each depends only on
  // event fields or the already-built supabase client) — resolve them concurrently.
  const [{ data: rawRsvps }, capacityInfo, circleRow, {
    data: { user },
  }, { data: rawTiers }] = await Promise.all([
    admin
      .from('event_rsvps')
      .select('id, status, plus_ones, guest_name, approval_status, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true }),
    // Real capacity / waitlist info (lib/events/capacity) — drives the waitlist CTA
    // and the "filling up" line. Never invented.
    getCapacityInfo(event.id),
    // The circle's PUBLIC city-level coordinates (the mini map rides the hosting
    // circle's area, never the exact venue — ADR-186 privacy).
    circleId
      ? admin
          .from('circles')
          .select('name, slug, latitude, longitude')
          .eq('id', circleId)
          .maybeSingle()
          .then(({ data }) => data as { name: string; slug: string; latitude: number | null; longitude: number | null } | null)
      : Promise.resolve(null),
    supabase.auth.getUser(),
    // ACTIVE TICKET TIERS (ADR-177 + tiers, EVENTS-SYSTEM §2.2). Keyed on `event.id` alone,
    // which has been resolved since the first read — so it rides this wave instead of costing
    // its own serial round trip after it. Nothing between here and the ticketing block below
    // feeds this query; the rows are shaped and typed there, where they are read.
    admin
      .from('event_ticket_types')
      .select(
        'id, name, description, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, active, sort_order, created_at',
      )
      .eq('event_id', event.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const rsvps = (rawRsvps ?? []) as unknown as RSVPRow[]
  // EVERY going seat, member or guest. This is the headcount, and it is deliberately
  // identity-blind so it agrees with lib/events/capacity.ts — the capacity trigger counts guests
  // because they occupy the room, so a "going" number that skipped them would contradict the
  // waitlist the same page renders.
  //
  // ⚠️ AND FOR THE SAME REASON IT SKIPS PENDING REQUESTS (SCAN-512, ADR-1152). That sentence above
  // states the invariant, and SCAN-105 broke it from the other side: `getCapacityInfo` learned that
  // a request awaiting the host is not a seat, and this line did not. The two numbers render
  // TOGETHER — `spotsLeft={capacityInfo.spotsLeft}` sits beside this count — so the page could say
  // "20 going · 1 spot left" about the same room. Identity-blind, approval-aware: both dimensions
  // are the same question, which is whether the person is actually in the room.
  //
  // It also decides who appears in public: `goingMembers` below feeds the avatar pile and the guest
  // facts, and an unapproved requester's face and handle do not belong there before the host has
  // said yes.
  const goingRsvps = rsvps.filter(
    (r) => r.status === 'going' && r.approval_status !== 'pending',
  )
  // The subset with an account. Anything that needs a profile — a face, a handle, a shared-circle
  // lookup — reads THIS list, never `goingRsvps`. A guest has no avatar to show and no circles to
  // overlap with, so they are absent here by definition rather than by oversight.
  const goingMembers = goingRsvps.filter(
    (r): r is RSVPRow & { profile: NonNullable<RSVPRow['profile']> } => r.profile != null,
  )
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
  let myApprovalStatus: 'none' | 'pending' | 'approved' = 'none'
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
      const myRsvp = rsvps.find((r) => r.profile?.id === myProfileId)
      myRsvpStatus = myRsvp?.status ?? null
      myApprovalStatus = (myRsvp?.approval_status as 'none' | 'pending' | 'approved' | null) ?? 'none'
      myPlusOnes = myRsvp?.plus_ones ?? 0

      // "From your circles" = going attendees (excluding me) who share at least
      // one active circle with me. Two cheap membership reads + a set overlap;
      // mirrors the shared-circle pattern in lib/connections/welcomes.ts. This
      // is warm proof, never scarcity — it's only ever additive. The Crew check
      // is independent of the membership reads, so they all run concurrently.
      const otherGoingIds = goingMembers
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
  // `event_ticket_types` is read through the typed client; the cast below narrows the
  // DB's plain-string pricing_mode to the view's union.
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
    space_members_only: boolean
    space_tier_id: string | null
  }
  // `rawTiers` was fetched in the RSVP wave above (it needs only `event.id`), so this block
  // spends no round trip of its own.
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
      spaceMembersOnly: t.space_members_only || t.space_tier_id != null,
      spaceTierId: t.space_tier_id,
      membershipPriceLabel: null as string | null,
    }
  })
  const hasTiers = tiers.length > 0

  // MEMBERSHIP PRICE on a gated tier (ADR-823 polish): a non-member sees what the membership
  // costs instead of a bare "Free" — the named tier's price when the ticket names one, else the
  // cheapest active tier. Members see the ticket's own price (Free) via the unlocked state.
  // The tier LIST + billing state also feed the tap-to-join popup on the membership row.
  let hostMembershipTiers: import('@/lib/spaces/memberships').MembershipTier[] = []
  let membershipBillingOn = false
  if (tiers.some((t) => t.spaceMembersOnly) && eventSpaceId) {
    const [{ listMembershipTiers }, { billingLive }] = await Promise.all([
      import('@/lib/spaces/memberships'),
      import('@/lib/pricing/settings'),
    ])
    ;[hostMembershipTiers, membershipBillingOn] = await Promise.all([
      listMembershipTiers(eventSpaceId),
      billingLive(),
    ])
    const membershipTiers = hostMembershipTiers
    const fmt = (cents: number, interval: 'month' | 'year' | 'once') => {
      if (cents <= 0) return 'Free membership'
      const dollars = cents / 100
      const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
      return interval === 'month' ? `${amount}/mo` : interval === 'year' ? `${amount}/yr` : amount
    }
    for (const t of tiers) {
      if (!t.spaceMembersOnly) continue
      const named = t.spaceTierId ? membershipTiers.find((mt) => mt.id === t.spaceTierId) : null
      const cheapest =
        named ??
        [...membershipTiers].sort((a, b) => a.priceCents - b.priceCents)[0] ??
        null
      t.membershipPriceLabel = cheapest ? fmt(cheapest.priceCents, cheapest.interval) : null
    }
  }

  // SPACE-MEMBERSHIP tickets (ADR-823): when a tier is restricted to the hosting Space's members,
  // read the viewer's active membership there so the buy panel can show an honest lock + a join
  // pointer instead of a surprise refusal at checkout (the server gate stays authoritative).
  // space_memberships isn't in the generated types yet (ADR-246) — narrow untyped read.
  let viewerIsSpaceMember = false
  let viewerSpaceTierId: string | null = null
  if (tiers.some((t) => t.spaceMembersOnly) && eventSpaceId && myProfileId) {
    const mdb = admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                maybeSingle: () => Promise<{ data: { tier_id: string } | null }>
              }
            }
          }
        }
      }
    }
    const { data: myMembership } = await mdb
      .from('space_memberships')
      .select('tier_id')
      .eq('space_id', eventSpaceId)
      .eq('member_profile_id', myProfileId)
      .eq('status', 'active')
      .maybeSingle()
    viewerIsSpaceMember = !!myMembership
    viewerSpaceTierId = myMembership?.tier_id ?? null
  }

  const flatPriceCents = event.price_cents ?? 0
  // The event "sells tickets" when it has active tiers (paid or free-claim) OR a
  // flat price. Tiers win when present; otherwise fall back to the flat price
  // (backward compat — an implicit single fixed tier).
  const isPaidEvent = hasTiers || flatPriceCents > 0
  let hostPayoutReady = false
  let ownsTicket = false
  // PAYEE (ADR-819): a space-hosted event pays the hosting space's owner; a personal event pays
  // the host. Readiness must check the SAME account createTicketCheckout charges into — checking
  // the personal organizer would keep the buy panel hidden after the space owner connects Stripe
  // (and vice versa).
  const payoutProfileId = hostSpaceOwnerId ?? event.host?.id
  if (isPaidEvent && payoutProfileId) {
    // The payout chain (payoutsLive → getConnectStatus) is sequential within itself,
    // but it's independent of the viewer's hasTicket lookup — run them concurrently.
    const [payoutReady, owns] = await Promise.all([
      (async () => ((await payoutsLive()) ? (await getConnectStatus(payoutProfileId)).ready : false))(),
      myProfileId ? hasTicket(event.id, myProfileId) : Promise.resolve(false),
    ])
    hostPayoutReady = payoutReady
    ownsTicket = owns
  }
  if (ticketedCents !== null) ownsTicket = true
  const priceLabel = `$${(flatPriceCents / 100).toFixed(2)}`
  // Routed through the shared tier authority rather than re-derived here. The old inline form
  // (`hasTiers && tiers.every((t) => t.soldOut)`) computed exactly this, and it stayed correct —
  // but the JSON-LD needs the same answer, and two expressions of one predicate is how the page
  // and its structured data drifted into contradicting each other in the first place.
  const allTiersSoldOut = ticketsSoldOut(tierRows)
  // Checkout is live for this event only when the platform switch is on AND the event
  // is priced. While ticketing is off (lib/events/ticketing) a priced event keeps its
  // price header but behaves like a free event everywhere else: RSVP stays open and
  // no buy/closed/sold-out states render.
  const ticketingActive = TICKETING_ENABLED && isPaidEvent
  // JOIN MODE (ADR-826): ONE join function per event, never both. 'rsvp' = first come first
  // served (the answer switch for everyone; prices render as information); 'tickets' = buying is
  // attending (the ticket cascade, no answer switch); 'auto' keeps the pre-existing derivation.
  const joinMode = extra?.join_mode ?? 'auto'
  const ticketsMode = ticketingActive && joinMode !== 'rsvp'

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
  // (The series-date rail moved into the social wave below — see `seriesRailDates` there. It
  // depends only on the event's own recurrence columns, which have been in hand since the first
  // read, so it had no reason to hold the page open on its own.)

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
    kind: string | null
    author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }
  // Host Event Dispatches (ADR-255) — page updates the host posted. They render in
  // the same activity stream with an event badge.
  type RawDispatch = {
    id: string
    title: string | null
    body: string
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }
  type RawMedia = { id: string; image_url: string; caption: string | null; profile_id: string }

  // event_posts (incl. `kind`) is in the generated types now — typed read; the cast
  // only reshapes the joined author embed onto RawActivityPost.
  const loadActivityPosts = async (): Promise<{ data: RawActivityPost[] }> => {
    const res = await admin
      .from('event_posts')
      .select('id, body, image_url, created_at, kind, author:profiles!profile_id ( id, display_name, handle, avatar_url )')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(100)
    return { data: (res.data ?? []) as unknown as RawActivityPost[] }
  }

  // Practice check-in availability + whether the viewer already checked in.
  const canCheckIn = !!myProfileId && isGoing && isPast && !event.is_cancelled

  const [
    ciRes,
    cohostsRaw,
    cohostInvitesRaw,
    myCohostInvite,
    collaboratorSpaces,
    { data: rawActivity },
    { data: rawDispatches },
    rawMediaRes,
    seriesRailDates,
    hostAskSpaces,
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
      // COLLABORATORS (ADR-834): Spaces co-hosting via an ACCEPTED share (EC3) — public credit under
      // the Host box + the "with …" mention on the hosted-by line. Accepted-only by contract.
      listCollaboratorSpacesForEvent(event.id),
      loadActivityPosts(),
      admin
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
      // The next real dates of this series, for the date rail under the header (ADR-897). Every
      // occurrence keeps its own live page; the rail is how a member reaches the dates the browse
      // index no longer lists separately. Fail-safe: [] on any error, and the rail renders nothing.
      //
      // How many dates it offers is the operator knob (/admin/events > Repeating events), read HERE
      // and passed in rather than resolved inside loadSeriesDates: the surface owns the number, so
      // it is read once per page and the fetch helper stays a helper. Zero configuration is
      // DEFAULT_RAIL_DATES = 5, which is also what a failed settings read returns. The settings
      // read still sizes the query, so the pair stays sequential WITH RESPECT TO EACH OTHER — but
      // inside this wave, not in front of it, and getSeriesDisplayConfig is React-cache()d and
      // already resolved by generateMetadata, so in practice only loadSeriesDates costs a trip.
      (async () => {
        const { railDates } = await getSeriesDisplayConfig()
        return loadSeriesDates({
          eventId: event.id,
          parentEventId: event.parent_event_id,
          recurrenceType: event.recurrence_type,
          limit: railDates,
        })
      })(),
      // The SPACE side of the ADR-911 host handshake: the Spaces this viewer could ask to host
      // from. Resolved only for a signed-in viewer who does NOT manage the event — a manager has
      // the rail's "Hand hosting to another Space" control (event-host-offer-field), and offering
      // both would put the two sides of one handshake in one pair of hands. The loader mirrors
      // `requestEventHost`'s own gate (runs the Space, active Business / Non Profit, not already
      // the host, no money block, nothing pending), so the CTA below never offers an ask the
      // action would refuse. Both gate inputs (`myProfileId`, `canManage`) were resolved well
      // above this wave, and the loader needs nothing else — so it rides here instead of holding
      // the page open on its own just before the return.
      myProfileId && !canManage
        ? listSpacesThatCanAskToHost(event.id)
        : Promise.resolve([] as HostAskSpace[]),
    ])

  const alreadyCheckedIn = !!ciRes?.data

  const cohosts = cohostsRaw as CohostView[]
  const cohostInvites = cohostInvitesRaw as CohostView[]
  const isCohost = myProfileId != null && cohosts.some((c) => c.profileId === myProfileId)

  // The minimal "with …" mention for the hosted-by line: up to two Collaborator names, then a count.
  // The full featured credit (logo cards) is the Collaborators box in the host column.
  const collaboratorNames =
    collaboratorSpaces.length === 0
      ? null
      : collaboratorSpaces.length <= 2
        ? collaboratorSpaces.map((s) => s.name).join(' and ')
        : `${collaboratorSpaces[0].name}, ${collaboratorSpaces[1].name} and ${collaboratorSpaces.length - 2} more`
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
  // The viewer's OWN RSVP note (their kind='rsvp' activity entry): the note box starts
  // COLLAPSED ("Shared with the group") when one already exists, instead of re-offering the
  // composer on every load; Edit reopens it prefilled.
  const myRsvpNote =
    (myProfileId &&
      commentPosts.find((p) => p.kind === 'rsvp' && p.author?.id === myProfileId)?.body?.trim()) ||
    ''

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
  // Members only: a face needs an avatar and a profile to link to. The pile therefore shows fewer
  // faces than `going` counts when guests are present, which is correct — WarmProof already renders
  // a count alongside the pile, so the room still reads as full.
  const faces = goingMembers.map(({ profile }) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  }))
  // Guest roster for the fact panel — Crew see names; others see a count.
  const factGuests: FactGuest[] = goingMembers.map(({ profile }) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    handle: profile.handle,
  }))

  // HIDDEN ADDRESS (ADR-825): when the host hides the address, the exact venue (venue name,
  // street, postal, precise pin, maps link, and the free-text location line, which often carries
  // the street) renders only for a REGISTERED viewer — a going/waitlist RSVP or a ticket — or a
  // manager. Everyone else gets city-level location plus an honest share-after-RSVP note.
  const viewerRegistered = myRsvpStatus === 'going' || myRsvpStatus === 'waitlist' || ownsTicket
  const addressHidden = extra?.hide_address === true && !canManage && !viewerRegistered

  // Exact-venue point (§5): the event's OWN geog, shown as a precise mini-map. Only
  // for a PUBLISHED, in-person event that actually has a geocoded point — drafts and
  // online events never get it, and without a point we render nothing (no regression).
  // `geog` comes back from PostgREST as an EWKB hex STRING (not GeoJSON), so it must be
  // decoded — `pointFromGeog` handles both forms. This is why the map was never showing.
  const isPublished = (extra?.status ?? 'published') === 'published'
  const venuePoint: { lat: number; lng: number } | null =
    !isOnline && isPublished && !addressHidden ? pointFromGeog(extra?.geog) : null

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
  const mapsHref = isOnline || addressHidden
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
  // Hidden address (ADR-825): city-level only — no venue name, no street, no free-text line.
  const cityLine = [extra?.city, extra?.region].map((p) => p?.trim()).filter(Boolean).join(', ')
  const headerLocation = addressHidden
    ? cityLine || null
    : venueName && addressLine
      ? `${venueName} · ${addressLine}`
      : venueName || addressLine || (event.location?.trim() || null)

  const mode = MODE_CHIP[attendanceMode]

  // UNIFIED RSVP BOX (ADR-826): ONE dynamic card, ONE join function. TICKETS mode carries the
  // checkout cascade (your ticket is your answer; a members-only tier prices the member rate).
  // RSVP mode is first come, first served: the answer switch for everyone, with any pricing
  // rendered as information (paid at the door / included with membership), never a buy button.
  // The who's-coming pile grows in place in both modes. Guests change their answer any time.
  const memberUnlocks = (t: (typeof tiers)[number]) =>
    !!viewerIsSpaceMember && (t.spaceTierId == null || t.spaceTierId === viewerSpaceTierId)
  // The price row that APPLIES to this viewer (RSVP-mode info list): their included member
  // tier when their membership covers one, else the general rate.
  const appliedTierId =
    tiers.find((t) => t.spaceMembersOnly && memberUnlocks(t))?.id ??
    tiers.find((t) => !t.spaceMembersOnly)?.id ??
    null

  // RSVP + PAYMENT FLOW inputs (ADR-826): the selectable rates, the membership fold context,
  // and whether checkout can actually charge. Drives the progressive flow on a live RSVP-mode
  // priced event; past events keep the static informational list.
  const flowRates: FlowRate[] = tiers.map((t) => ({
    id: t.id,
    name: t.name,
    priceLabel: t.spaceMembersOnly
      ? memberUnlocks(t)
        ? 'Included'
        : t.membershipPriceLabel ?? 'Members'
      : t.pricingMode === 'fixed'
        ? `$${((t.priceCents ?? 0) / 100).toFixed(2)}`
        : t.pricingMode === 'free'
          ? 'Free'
          : 'Pay what you can',
    kind: t.spaceMembersOnly ? ('membership' as const) : ('general' as const),
    ticketTypeId: t.id,
    covered: t.spaceMembersOnly ? memberUnlocks(t) : t.pricingMode === 'free',
    tag: t.spaceMembersOnly ? (memberUnlocks(t) ? ('member' as const) : ('membership' as const)) : null,
  }))
  const gatedNamedTierId = tiers.find((t) => t.spaceMembersOnly)?.spaceTierId ?? null
  const membershipFold =
    spaceHost && eventSpaceId && hostMembershipTiers.length > 0
      ? {
          spaceId: eventSpaceId,
          spaceName: spaceHost.name,
          tiers: gatedNamedTierId
            ? hostMembershipTiers.filter((mt) => mt.id === gatedNamedTierId)
            : hostMembershipTiers,
          includedEvent: { slug: event.slug, title: event.title },
          billingOn: membershipBillingOn,
        }
      : null
  const paymentsReady = TICKETING_ENABLED && hostPayoutReady

  // The Join column's primary action — reused in the aside AND the mobile sheet.
  const joinActions = (
    <div className="space-y-4">
      <div className="space-y-4 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" />
          <span className="text-body-sm font-bold text-text">RSVP</span>
          {isPaidEvent && !hasTiers && (
            <span className="text-body-sm font-medium text-muted">· {priceLabel} ticket</span>
          )}
        </div>

        {/* The when-line + calendar links moved OUT of this box into the Event Details card
            (the `event-when-where` module) — owner spec. Only the online join link stays here:
            it's the action a remote guest needs at RSVP time (the venue line + map stay in the
            event-location block). */}
        {isOnline && (
          <p className="flex items-start gap-2 text-body-sm text-text">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            {safeHttpUrl(onlineUrl) ? (
              <a
                href={onlineUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary-strong hover:underline"
              >
                Join link
              </a>
            ) : (
              <span className="text-muted">Online. Link shows once you RSVP.</span>
            )}
          </p>
        )}

        {/* RSVP + PAYMENT FLOW (live RSVP-mode priced event): the progressive experience —
            pick a rate, answer, and the payment area slides open under Going when the rate
            costs something. Maybe funnels to follow-up; Can't go just files. */}
        {!ticketsMode && isPaidEvent && hasTiers && !isPast && !event.is_cancelled && (
          <RsvpPaymentFlow
            eventId={event.id}
            slug={event.slug}
            rates={flowRates}
            status={myRsvpStatus as 'going' | 'maybe' | 'waitlist' | 'not_going' | null}
            plusOnes={myPlusOnes}
            isFull={capacityInfo.isFull}
            initialNote={myRsvpNote}
            membership={membershipFold}
            paymentsReady={paymentsReady}
            signedIn={!!myProfileId}
            signInHref={`/sign-in?next=/events/${event.slug}`}
          />
        )}

        {/* Past RSVP-mode priced event: the rates as plain INFORMATION. */}
        {!ticketsMode && isPaidEvent && hasTiers && isPast && (
          <div className="space-y-2">
            {tiers.map((t) => {
              // A membership row a non-member can act on: selecting the package folds the full
              // checkout experience open right here in the column (ADR-826, owner spec).
              const unlocking = t.spaceTierId
                ? hostMembershipTiers.filter((mt) => mt.id === t.spaceTierId)
                : hostMembershipTiers
              if (
                t.spaceMembersOnly &&
                !memberUnlocks(t) &&
                eventSpaceId &&
                spaceHost &&
                unlocking.length > 0
              ) {
                return (
                  <MembershipCheckoutFold
                    key={t.id}
                    rowName={t.name}
                    priceLabel={t.membershipPriceLabel ?? 'Members'}
                    spaceId={eventSpaceId}
                    spaceName={spaceHost.name}
                    tiers={unlocking}
                    includedEvent={{ slug: event.slug, title: event.title }}
                    billingOn={membershipBillingOn}
                    signedIn={!!myProfileId}
                    signInHref={`/sign-in?next=/events/${event.slug}`}
                  />
                )
              }
              return (
              <div
                key={t.id}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                  t.id === appliedTierId ? 'border-primary bg-primary-bg/40' : 'border-border'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-text">{t.name}</p>
                  {t.spaceMembersOnly && (
                    <div className="mt-1">
                      {memberUnlocks(t) ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-medium text-primary-strong">
                          <Check className="h-2.5 w-2.5" /> Member
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
                          Membership
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-body-sm font-semibold text-text">
                  {t.spaceMembersOnly
                    ? memberUnlocks(t)
                      ? 'Included'
                      : t.membershipPriceLabel ?? 'Members'
                    : t.pricingMode === 'fixed'
                      ? `$${((t.priceCents ?? 0) / 100).toFixed(2)}`
                      : t.pricingMode === 'free'
                        ? 'Free'
                        : 'Pay what you can'}
                </span>
              </div>
              )
            })}
          </div>
        )}

        {/* TICKETS mode: the full checkout cascade — buying is how you attend. */}
        {ticketsMode && (
          <div>
              {ownsTicket ? (
                <p className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Ticket confirmed
                </p>
              ) : hasEnded ? (
                <p className="text-body-sm text-muted">Ticket sales have closed.</p>
              ) : allTiersSoldOut ? (
                <p className="text-body-sm text-muted">Sold out.</p>
              ) : !myProfileId ? (
                <p className="text-body-sm text-muted">Sign in to get your ticket.</p>
              ) : isHost && !hostSpaceOwnerId ? (
                /* PERSONAL event only: the host IS the payee, so "no ticket needed" / "connect
                   YOUR payouts" both address the right person. A SPACE-hosted event's organizer
                   falls through to the buyer chain instead: the payee is the space owner, the
                   organizer may buy a ticket (ADR-819), and the payout prompt would have pointed
                   them at the wrong Stripe account. */
                hostPayoutReady ? (
                  <p className="text-body-sm text-muted">You&rsquo;re hosting. No ticket needed.</p>
                ) : (
                  /* The buy path is gated on the HOST's Stripe Connect account being
                     charges + payouts ready (getConnectStatus.ready). When it isn't, the
                     old copy read "Tickets aren't available for this event yet" to
                     everyone with no way forward. Tell the host the real prerequisite and
                     link them straight to payout setup. */
                  <div className="space-y-2">
                    <p className="text-body-sm text-muted">
                      Connect payouts to start selling tickets for this event.
                    </p>
                    <Link
                      href="/settings/billing"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                    >
                      <Ticket className="h-4 w-4" />
                      Set up payouts
                    </Link>
                  </div>
                )
              ) : myProfileId && myProfileId === hostSpaceOwnerId ? (
                /* The hosting space's OWNER is the payee — the server's self-purchase guard would
                   refuse their checkout, so say so instead of showing a button that errors. */
                <p className="text-body-sm text-muted">Your space is hosting. No ticket needed.</p>
              ) : hostPayoutReady ? (
                <TicketButton
                  eventId={event.id}
                  priceLabel={priceLabel}
                  tiers={hasTiers ? tiers : undefined}
                  membershipSpace={
                    spaceHost ? { name: spaceHost.name, slug: spaceHost.slug } : null
                  }
                  viewerIsSpaceMember={viewerIsSpaceMember}
                  viewerSpaceTierId={viewerSpaceTierId}
                  eventSlug={event.slug}
                />
              ) : canManage ? (
                /* PAYMENTS PREVIEW (manager-only): payouts aren't connected, so checkout is off —
                   but the manager sees exactly what buyers will see once it is, instead of a blank.
                   The real TicketButton renders with the CTA disabled; nothing can reach Stripe. */
                <div className="space-y-2">
                  <span className="inline-flex items-center rounded-md bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                    Payments preview
                  </span>
                  <TicketButton
                    eventId={event.id}
                    priceLabel={priceLabel}
                    tiers={hasTiers ? tiers : undefined}
                    membershipSpace={
                      spaceHost ? { name: spaceHost.name, slug: spaceHost.slug } : null
                    }
                    viewerIsSpaceMember={viewerIsSpaceMember}
                    viewerSpaceTierId={viewerSpaceTierId}
                    eventSlug={event.slug}
                    previewMode
                  />
                  <p className="text-meta text-muted">
                    Only you and your team see this. Buyers see it live once{' '}
                    {spaceHost ? `${spaceHost.name}'s owner connects` : 'you connect'} payouts in
                    Settings → Billing.
                  </p>
                </div>
              ) : (
                /* Host hasn't finished payout setup, so there is no one to pay yet.
                   Honest to the buyer, no dead "not available" phrasing. */
                <p className="text-body-sm text-muted">The host hasn&rsquo;t opened ticket sales yet.</p>
              )}
          </div>
        )}

        {/* Your answer — RSVP mode only (first come, first served; never Crew-gated; a host
            counts themselves in like anyone else). In TICKETS mode the ticket IS the answer, so
            the switch doesn't render; on a priced RSVP event the FLOW above already carries it.
            Answers change any time. The add-to-calendar buttons moved to the Event Details card
            (the `event-when-where` module), where they're available regardless of RSVP state —
            so the going / ticket-holder branches here carry no calendar row anymore. */}
        {!ticketsMode && myProfileId && !isPast ? (
          !(isPaidEvent && hasTiers) ? (
            <RsvpControls
              eventId={event.id}
              slug={event.slug}
              status={myRsvpStatus as 'going' | 'maybe' | 'waitlist' | 'not_going' | null}
              plusOnes={myPlusOnes}
              isFull={capacityInfo.isFull}
              initialNote={myRsvpNote}
              // The host's approval gate. RsvpControls has accepted these two props since
              // EVENTS-REWORK A1 and NOTHING has ever passed them, so "Request to join" and the
              // pending state were unreachable UI for the whole life of the feature.
              requiresApproval={extra?.rsvp_requires_approval === true}
              approvalStatus={myApprovalStatus}
            />
          ) : null
        ) : ticketsMode && ownsTicket && !isPast ? null : myProfileId && isGoing && isPast ? (
          /* Event time, going: Check in is the primary action; Cancel RSVP is quiet. */
          <div className="flex flex-wrap items-center gap-4">
            {alreadyCheckedIn ? (
              <div className="inline-flex items-center gap-2 rounded-lg bg-success-bg text-success px-4 py-2 text-body-sm font-semibold">
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
                  className="text-meta text-subtle hover:text-danger underline underline-offset-2 transition-colors"
                >
                  Cancel RSVP
                </button>
              </form>
            )}
          </div>
        ) : myProfileId && isWaitlisted ? (
          <form action={toggleRSVP.bind(null, event.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
            >
              <Clock className="w-4 h-4" />
              On waitlist · tap to leave
            </button>
          </form>
        ) : !myProfileId && !isPast && !ticketsMode && !(isPaidEvent && hasTiers) ? (
          /* Signed-out visitor on a FREE RSVP-mode upcoming event: RSVP is for everyone, so
             offer the one step that unlocks it. (A priced RSVP event's flow above carries its
             own sign-in step; tickets-mode events carry theirs in the cascade.) */
          /* One field instead of a detour through /sign-in. Someone who follows a shared link and
             wants to come can say so here; the account is offered afterwards, in the confirmation
             email, once there is a reason to make one. Signing in is still available below for
             anyone who already has an account. */
          <div className="space-y-3">
            <GuestRsvpForm eventId={event.id} isFull={capacityInfo.isFull} />
            <p className="text-meta text-muted">
              Already a member?{' '}
              <Link
                href={`/sign-in?next=/events/${event.slug}`}
                className="font-semibold text-text underline underline-offset-2 hover:text-primary"
              >
                Sign in
              </Link>{' '}
              to RSVP with your account.
            </p>
          </div>
        ) : !myProfileId && isPast && !ticketsMode ? (
          /* Signed-out visitor on an event that has STARTED (ADR-1033). RSVP is closed, so the guest
             form above is gone and, until now, nothing replaced it. This is the check-in door: a
             guest seat can only become a counted attendance by becoming a member's seat first, so
             the honest offer is the sign-in that claims it. Tickets-mode events are excluded because
             a guest seat cannot exist on one (capture_guest_rsvp refuses join_mode = 'tickets'). */
          <GuestCheckInPrompt slug={event.slug} />
        ) : null}

        {/* Who's coming — the avatar pile grows in place as guests answer (warm proof, in-box). */}
        <WarmProof
          embedded
          going={goingRsvps.length}
          fromYourCircles={fromYourCircles}
          maybe={maybeCount}
          guests={guestCount}
          faces={faces}
          nearFull={nearFull}
          spotsLeft={capacityInfo.spotsLeft}
        />

        {/* Tickets sold — quiet, factual (tickets mode only). */}
        {ticketsMode && (
          <p className="text-meta text-subtle">
            {ticketsSold > 0 ? `${ticketsSold} sold` : 'No tickets sold yet'}
          </p>
        )}
      </div>
    </div>
  )

  // Whether the mobile bottom bar should appear (there's a real action to take). A host
  // CAN RSVP to their own FREE event (so the bar shows), but never buys a ticket to it —
  // so the host is excluded only on the paid path ("you're hosting, no ticket needed").
  // While ticketing is off, a priced event rides the RSVP path (no "Get ticket" CTA).
  const showBottomBar =
    !event.is_cancelled && !hasEnded && (ticketsMode ? !isHost && !ownsTicket && !allTiersSoldOut : !!myProfileId)
  const bottomBarLabel = ticketsMode
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
    // The Space that hosts the event (posted from a Space) → attributed to the Space (null for a personal
    // / circle / standalone event, where the person host above is shown as today).
    spaceHost,
    // Spaces co-hosting via an accepted share (ADR-834) — the featured Collaborators credit.
    collaboratorSpaces,
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
      // Hidden address (ADR-825): the free-text location line often carries the street.
      location: addressHidden ? cityLine || null : event.location,
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
    // The Event Details card (the `event-when-where` module): the date/time facts plus the SAME
    // calendar links the RSVP box used to carry (built once above), relocated so the calendar
    // affordance is available regardless of RSVP state.
    schedule: {
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      tzAbbrev: zoneAbbrev(event.starts_at, eventTz),
      recurrenceType: event.recurrence_type,
      recurrenceUntil: event.recurrence_until,
      partOfSeries: !!event.parent_event_id,
      nextOccurrenceIso: nextRecurrence ? nextRecurrence.toISOString() : null,
      icsHref,
      googleUrl,
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
    // The event's OWN zone, so the published startDate carries the right offset. `starts_at` is a
    // wall clock kept as UTC parts, so passing it without the zone tells Google the local time is a
    // UTC instant — seven or eight hours early here (SCAN-207). Same convention as every other
    // reader on this page.
    time_zone: event.time_zone,
    city: extra?.city ?? null,
    // The Circle only, never the raw scope id: a public event's scope_id is the shared sentinel
    // region, which is not an organizer and must not be published as one.
    circle_id: circleId,
    circle_name: scopeName,
    price_cents: event.price_cents,
    // A ticketed event prices on its ACTIVE TIERS, not events.price_cents (null for them), so
    // passing only the column published "free" for every tier-priced event. Supplied only when
    // the event actually has tiers: `undefined` keeps the price_cents fallback for untiered
    // events, while an explicit null here correctly means "tiered and genuinely free".
    ...(hasTiers ? { ticket_from_cents: ticketFromPriceCents(tierRows) } : {}),
    attendance_mode: attendanceMode,
    is_cancelled: event.is_cancelled,
    region: extra?.region ?? null,
    // The Offer's own currency, not a hardcoded USD.
    currency: event.currency,
    // SOLD OUT, from the two authorities this page already holds — so the structured data can no
    // longer say InStock while the page renders "Sold out." / the full-capacity waitlist CTA.
    // These are the SAME values those two branches render from: `allTiersSoldOut` is what prints
    // "Sold out." and hides the ticket bar, and `capacityInfo.isFull` is what turns the RSVP CTA
    // into "Join waitlist". Reusing them is the point — the schema cannot disagree with the page
    // unless the page disagrees with itself.
    is_sold_out: capacityInfo.isFull || allTiersSoldOut,
  })

  // (`hostAskSpaces` — the ADR-911 host handshake's Space side — is resolved in the social wave
  // above, under the same `myProfileId && !canManage` gate. See the comment there.)

  return (
    <EventDetailTemplate
      structuredData={
        <JsonLd
          data={[
            eventJsonLd,
            breadcrumbSchema([
              { name: 'Events', path: '/events' },
              { name: event.title, path: `/events/${event.slug}` },
            ]),
          ]}
        />
      }
      notices={
        <>
          {event.is_cancelled && (
            <div className="mb-4 rounded-2xl bg-danger-bg border border-danger px-3 py-2">
              <p className="text-body-sm font-medium text-danger">This event has been cancelled.</p>
            </div>
          )}

          {claimed === '1' && isHost && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-body-sm font-semibold text-success">
              <Check className="h-4 w-4" />
              It is yours. You are the host now, so you can edit anything on this page.
            </div>
          )}

          {ticketedCents !== null && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-body-sm font-semibold text-success">
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

          {/* No claim banner in NOTICES. The banner that lived here was retired on 2026-07-13 (#1751)
              because it surfaced the claim PATH to every visitor; the seeder hands the listing off
              privately via "Send to host" in the QR and Share popup, and that is unchanged.
              What an unclaimed listing shows instead is <ClaimRequestCta> in `bodyLead` below: it
              carries no token, and pressing it only re-sends the one-time link to the organizer
              contact already on the row. See the bodyLead comment. */}
        </>
      }
      // [A1] header image — the one big visual win. Uploaded cover, else the scanned
      // poster's cropped cover / full flyer (heroUrl); token placeholder when none.
      cover={
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
              <span className="text-display-h3 font-bold leading-none">
                {new Date(event.starts_at).toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
              </span>
              <span className="text-meta font-semibold uppercase tracking-wide text-muted">
                {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}
              </span>
            </div>
          </div>
        )
      }
      // The event title renders at the DISPLAY scale (a step up from the default Detail h1) —
      // this is the page's marquee fact, so it leads at destination-page stature.
      titleScale="display"
      title={
        canManage ? (
          /* 🔴 The size here MIRRORS DetailTemplate's `titleScale="display"` h1, so the input
             matches the title it replaces. Change one and you must change both — an input gets
             the browser's own form-control font, so it cannot simply inherit the h1 it sits in.
             Converted with that h1 to the single fluid role (ADR-947's "fourth decision"): the mirror is now
             one token rather than a three-step ramp across two breakpoints, which is a smaller
             coupling but the same one. See the note at components/templates/detail-template.tsx. */
          <InlineText
            value={event.title}
            save={updateEventField.bind(null, event.id, slug, 'title')}
            inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-page-title-lg font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
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
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                <LayoutDashboard className="h-4 w-4 text-subtle" />
                Manage event
              </Link>
            </>
          )}
        </div>
      }
      // [A2] attendance-mode pill.
      badges={
        <span className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta font-semibold ${mode.cls}`}>
          <mode.Icon className="h-3.5 w-3.5" /> {mode.label}
        </span>
      }
      identity={{
        // The when-line is the key fact under the title — it renders a step stronger
        // (size, weight, and full text color) than the rest of the subtitle stack.
        when: (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-strong shrink-0" />
            <span className="text-body font-semibold text-text">{whenLine}</span>
          </div>
        ),

        where: headerLocation && !isOnline && (
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
            {addressHidden && (
              <span className="text-subtle">· Exact address shared after you RSVP</span>
            )}
          </div>
        ),

        cadence: (event.recurrence_type !== 'none' || event.parent_event_id) && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-body leading-none">🔁</span>
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
        ),

        // Recurring anchor whose date has passed: surface the next upcoming date so the
        // series never reads as a one-off that already happened.
        nextDate: nextRecurrence && (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-subtle shrink-0" />
            <span>
              Next:{' '}
              {nextRecurrence.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </span>
          </div>
        ),

        // The series date rail: the next real dates, each linking to that date's own live
        // page (ADR-897). Renders nothing for a one-off or a single-date series.
        seriesRail: <SeriesDatesRail dates={seriesRailDates} timeZone={eventTz} className="pt-1" />,

        // WHERE THIS EVENT BELONGS: its Circle, its Space, and its Journey, each a link.
        // This replaces the bare unlabeled Circle name that used to sit here, which said
        // nothing about what it was and left the Space and Journey ties invisible. The
        // Circle ref is null unless `scope_type` genuinely names one, so a public event's
        // sentinel scope_id and the legacy standalone row's profile id cannot reach it.
        // Its Journey needs a read the header must not wait on, so it streams in behind
        // its own <Suspense> (PAGE-FRAMEWORK §5).
        belonging: (
          <Suspense fallback={<EventBelongingSkeleton />}>
            <EventBelonging
              eventId={event.id}
              circle={scopeSlug ? { name: scopeName, slug: scopeSlug } : null}
              canManage={canManage}
            />
          </Suspense>
        ),

        hostedBy: spaceHost ? (
          // Space-hosted event: the Space is the attribution — its brand links to the Space page. The
          // person in host_id stays the organizer, shown as a subtle secondary credit so they're still
          // visible without being the headline host. Collaborating Spaces (accepted shares, ADR-834)
          // get a minimal "with …" mention here; their featured credit is the Collaborators box.
          <p>
            Hosted by{' '}
            <Link href={`/spaces/${spaceHost.slug}`} className="font-semibold hover:underline">
              {spaceHost.name}
            </Link>
            {collaboratorNames ? <span> with {collaboratorNames}</span> : null}
            <VenueCredit venue={venueSpace} />
            {event.host ? (
              <span className="text-subtle"> · organized by {event.host.display_name}</span>
            ) : null}
          </p>
        ) : event.host ? (
          // In-network host: bold, clickable, with a hover/focus profile-preview popover
          // (items 2 + 3). An out-of-network organizer stays plain text below.
          // The venue rides here too: a PERSON can host at a Space's venue, and before ADR-911 that
          // combination silently dropped the Space (the belonging strip resolved the host axis).
          <p>
            Hosted by <HostHovercard host={event.host} />
            {collaboratorNames ? <span> with {collaboratorNames}</span> : null}
            <VenueCredit venue={venueSpace} />
          </p>
        ) : isPostedEvent ? (
          <p className="text-subtle">
            {extra?.organizer_name ? `By ${extra.organizer_name} · ` : ''}
            Organizer not on Frequency yet
          </p>
        ) : null,

        credit:
          postedBy &&
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
            <p className="text-2xs text-muted">
              Posted by{' '}
              <Link
                href={`/people/${postedBy.handle}`}
                className="underline-offset-2 hover:text-text hover:underline"
              >
                {postedBy.display_name}
              </Link>
            </p>
          )),

        // [A3] The calm reward line reads as HEADER content — it sits with the
        // date/location/host lines, not floating above the grid with a divider. The
        // check-in Zaps reward (+ streak / Current when real). Hidden for a cancelled
        // event.
        reward: !event.is_cancelled && (
          <EventRewardStrip
            checkInZaps={ZAP_AMOUNTS.event_attend}
            isPast={isPast}
          />
        ),
      }}
      // Claim banner — shown only when an UNCLAIMED posted event is opened via its claim
      // link (?claim=<token>, matching the event's one-time token). The claim landing now
      // redirects here, so the real public listing IS the claim page: opening it never
      // claims (the accidental-claim fix), and claiming is a deliberate button. Signed-in →
      // one-tap claim; signed-out → the host setup funnel, which returns here to finish.
      bodyLead={
        claim && isUnclaimedPosted && extra?.claim_token && claim === extra.claim_token ? (
          <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-primary/40 bg-primary-bg/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-body-lg font-bold text-text">
                <Zap className="h-5 w-5 shrink-0 text-primary" aria-hidden /> Is this your event?
              </p>
              <p className="mt-1 text-body-sm text-muted">
                Frequency built this page so people nearby could find it. Claim it to manage RSVPs, edit the
                details, and run it from your own account. It takes one tap.
              </p>
            </div>
            <div className="shrink-0 sm:w-64">
              {myProfileId ? (
                <ClaimButton token={extra.claim_token} size="lg" />
              ) : (
                <Link
                  href={`/join?seq=event-experience-hosts-copy&next=${encodeURIComponent(`/events/${event.slug}?claim=${extra.claim_token}`)}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-primary px-8 py-4 text-body font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
                >
                  <Zap className="h-5 w-5" aria-hidden /> Claim This Event
                </Link>
              )}
            </div>
          </div>
        ) : isClaimable && !canManage ? (
          // No token in the URL, but this listing is genuinely unclaimed: offer to SEND the claim
          // link to the organizer contact on file. This is the render path for `requestClaimLink`,
          // which had none. It is not the banner that was retired on 2026-07-13 (#1751): that one
          // published the claim path itself, this one publishes nothing and mails the one-time
          // token to the address already on the row. Hidden from anyone who can already manage the
          // event (the seeder and staff use "Send to host" in QR & Share instead).
          <ClaimRequestCta eventId={event.id} organizerName={extra?.organizer_name ?? null} />
        ) : hostAskSpaces.length > 0 ? (
          // The Space-side "ask to host" (ADR-911): shown only to a signed-in non-manager whose own
          // Space passes requestEventHost's gate (see hostAskSpaces above). The claim branches win
          // when the listing is unclaimed — claiming settles who runs it before hosting can move.
          <HostRequestCta eventId={event.id} spaces={hostAskSpaces} />
        ) : null
      }
      // Photo gallery (item 5) — the FIRST gallery image is the header/cover, already rendered
      // full-width above at its host-picked hero height (the cover band). So the gallery below
      // shows only the REST of the photos as thumbnails (no duplicate of the header), each
      // clickable into a full-screen lightbox. It stays in the page (not a module): it's built
      // from the gallery URLs the header already resolved, and self-hides with no extras. It
      // leads the interior, above the arrangeable blocks.
      gallery={<EventGallery images={galleryUrls.slice(1)} />}
      // ── The FULL interior is one templated <PageModules> now: no hardcoded aside, no bespoke
      //    two-column grid. The '/events/*' layout owns the arrangement — its default Main + side
      //    grid reproduces the old two-column page (post area in MAIN; the Join box, warm proof,
      //    facts, and the host "Post an update" composer in SIDE), and every block is movable from
      //    the on-page Layout editor. On a phone the SIDE column stacks above MAIN (the grid's
      //    order-first), so a guest still sees who's going + the facts before the conversation —
      //    the old mobile-only duplicate is gone (no double-render). ──
      interior={<PageModules route={`/events/${event.slug}`} />}
      // MOBILE sticky action bar — hidden on lg+, hidden for host/past/cancelled.
      actionBar={
        showBottomBar ? (
          <RsvpBottomBar primaryLabel={bottomBarLabel} statusLine={bottomBarStatus}>
            {joinActions}
          </RsvpBottomBar>
        ) : null
      }
    />
  )
}
