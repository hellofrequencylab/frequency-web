import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChevronLeft, ChevronRight, Globe, MapPin } from 'lucide-react'
import { isOnline } from '@/lib/presence'
import { InviteMemberCompose } from '@/components/compose/invite-member-compose'
import { type CommunityRole } from '@/lib/community-roles'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonClasses } from '@/components/ui/button'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CircleLocationSearch } from '@/components/circles/circle-location-search'
import { DirectorySearch } from '@/components/ui/directory-search'
import { SectionHeader } from '@/components/ui/section-header'
import { ContactCard } from '@/components/people/contact-card'
import { DirectoryFacets } from '@/components/people/directory-facets'
import { PeopleSuggestions } from '@/components/people/people-suggestions'
import { OnlineMembersCard, CommunityStatsCard } from '@/components/people/community-sidebar'
import { formatDistance } from '@/lib/geocode'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import type { ProfileIdentity } from '@/lib/types/profile'
import { searchVisibleLeads, type LeadHit } from '@/lib/crm/people-search'
import { connectionsOwnerId } from '@/lib/connections/access'
import {
  membersNear,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import type { ProximityBand } from '@/lib/connections/location'
import {
  DIRECTORY_VISIBILITY_COLUMNS,
  isListableInDirectory,
} from '@/lib/connections/directory-visibility'
import {
  DIRECTORY_PAGE_SIZE,
  directoryPageCount,
  directoryWindow,
  parseDirectoryPage,
  scopeDirectoryQuery,
  scopeIsEmpty,
  type DirectoryScope,
} from '@/lib/connections/directory-page'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getInitials } from '@/lib/utils'
import { ConnectionsPulse } from '@/components/connections/connections-pulse'
import { NetworkTabs } from '@/components/people/network-tabs'
import { resolveIndexHero } from '@/lib/layout/index-hero'

type Profile = ProfileIdentity & {
  id: string
  community_role: CommunityRole
  is_system: boolean | null
  last_seen_at: string | null
  is_demo: boolean
  entity_types: string[] | null
  nexus_regions: { name: string } | null
}

// Filters carried in the URL so the Community directory stays a shareable,
// server-rendered view (no client state). Members can be narrowed by the Circle
// they belong to, the city that Circle meets in, their Nexus region, and whether
// they're online right now. Circle/city resolve through the memberships join.
type Filters = {
  circle?: string
  city?: string
  region?: string
  online?: string
  /** Directory facets (P5): a shared entity_types tag and a community-role rung. */
  topic?: string
  role?: string
  /** Free-text name/handle search. */
  q?: string
  /** "lat,lng" set by the geolocation / city-autocomplete search. */
  near?: string
  /** Human label for the chosen place, e.g. "Encinitas, California". */
  place?: string
  /** 1-based directory page (LIVE-661). Absent means page 1. */
  page?: string
}

type NearbyCircle = CircleCardData & { distanceLabel: string }

// The member cards are a SERVER-FILTERED, PAGED read (LIVE-661, ADR-1655): every filter, the name
// search included, runs in the query (lib/connections/directory-page.ts) and each page is one
// `.range()`, so a member anywhere in the community can be found and reached. It used to be the
// first 500 profiles by name, filtered here, which made everyone past the 500th unfindable.
// The card columns, with the four privacy columns selected by the shared constant.
const CARD_SELECT = `id, display_name, handle, avatar_url, community_role, is_system, last_seen_at, is_demo, entity_types, ${DIRECTORY_VISIBILITY_COLUMNS}, nexus_regions!nexus_region_id ( name )` as const

// The facet vocabulary (Topic / Role options, the Most popular place) is still read from a bounded
// sample: PostgREST has no DISTINCT or GROUP BY, and these only choose which OPTIONS to offer. The
// sample never decides who can be listed or found; the paged read above does. 1000 is PostgREST's
// row ceiling (supabase/config.toml max_rows).
const FACET_SAMPLE_LIMIT = 1000

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  // "Members", not "Community": NAMING.md §Connection layer names the directory Members (ADR-868),
  // the same word as its nav row and its Network hub tab.
  title: 'Members',
  description: 'Everyone in the community. Browse, find someone interesting, say hi.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/network', CONTENT_FALLBACK)
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Filters>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const {
    circle: circleFilter,
    city: cityFilter,
    region: regionFilter,
    online: onlineFilter,
    topic: topicFilter,
    role: roleFilter,
    q: qFilter,
    near: nearParam,
    place: placeParam,
    page: pageParam,
  } = await searchParams
  const page = parseDirectoryPage(pageParam)

  const admin = createAdminClient()

  // Kick the independent reads off immediately and await each at its point of use, so the
  // round-trips OVERLAP without reordering any downstream logic: the page header, the viewer
  // profile (id + name + proximity home), the connection settings, the steward id, the demo gate,
  // the circle vocabulary and the region resolution. The member cards themselves are read inside
  // their own Suspense boundary below, so none of this waits on them.
  const contentPromise = resolvePageContent('/network', CONTENT_FALLBACK)
  const viewerPromise = admin
    .from('profiles')
    .select('id, display_name, home_lat, home_lng')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  // Only the platform settings are needed here. The viewer's own prefs used to ride along so
  // their discovery_radius_m could be passed as the search radius; that was the label inversion
  // described at the membersNear call below, so the read is gone with the coupling.
  const settingsPromise = getConnectionSettings()
  const stewardPromise = connectionsOwnerId()
  // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
  const hideDemoPromise = (async () => !(await demoModeEnabled()) || (await viewerHidesDemo()))()
  // The circle vocabulary (circles power the city → members resolution and the City facet).
  const circlesPromise = admin
    .from('circles')
    .select('id, name, city, status')
    .in('status', ['forming', 'active'])
    .order('name')
  // The region filter arrives as a region NAME (the card label); the query filters on the id.
  const regionIdsPromise: Promise<string[] | null> = regionFilter
    ? (async () => {
        const { data } = await admin.from('nexus_regions').select('id').eq('name', regionFilter)
        return (data ?? []).map((r) => r.id as string)
      })()
    : Promise.resolve(null)

  // 🔴 Every member read below is a SERVICE-ROLE read on a member-facing page (the nexus_regions
  // embed), so it answers to no policy. That is why "Show me in the Members directory" and
  // Ghost mode were once decorative here: the only enforcer of those columns was the members_near
  // RPC, which this page consults for BANDING, not for the listing. So each read is scoped by
  // scopeDirectoryQuery (active, directory_visible, not ghosting, the demo gate), selects the four
  // privacy columns by the shared constant, and passes every row it returns through the shared
  // predicate before anything renders or is counted (ADR-1203). Vera (is_system) is FULLY VISIBLE
  // by owner decision (ADR-231 update): she gets a member card like anyone else; her chip reads
  // Moderator.
  const hideDemo = await hideDemoPromise
  const baseScope: DirectoryScope = { hideDemo }
  // "Members Worldwide" / Total members: an exact count of the listable community.
  const totalPromise = scopeDirectoryQuery(
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    baseScope,
  )
  // "Online now" rail (independent of the online filter, so it still works while browsing).
  const onlinePromise = scopeDirectoryQuery(
    admin.from('profiles').select(CARD_SELECT),
    { ...baseScope, online: true },
  )
    .order('display_name', { ascending: true })
    .limit(8)
  // The facet vocabulary sample (see FACET_SAMPLE_LIMIT). Streamed: only the facets and the Most
  // popular place wait on it, each behind its own Suspense boundary.
  const vocabPromise: Promise<Profile[]> = (async () => {
    const { data } = await scopeDirectoryQuery(admin.from('profiles').select(CARD_SELECT), baseScope)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(FACET_SAMPLE_LIMIT)
    return ((data ?? []) as unknown as Profile[]).filter(isListableInDirectory)
  })()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, body, ctaLabel, ctaHref } = await contentPromise

  // Geolocation / city-autocomplete search → nearest REAL circles (the
  // circles_near RPC hard-excludes demo content). Only runs when a place is set.
  let nearbyCircles: NearbyCircle[] = []
  let nearbyMemberIds = new Set<string>()
  if (nearParam) {
    const [latStr, lngStr] = nearParam.split(',')
    const lat = Number(latStr)
    const lng = Number(lngStr)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const { data: near } = await admin.rpc('circles_near', { _lat: lat, _lng: lng, _limit: 12 })
      const nearList = near ?? []

      // Which of these the viewer already belongs to (for the Join/Open state).
      const nearIds = nearList.map((c) => c.id)
      if (nearIds.length > 0) {
        const { data: mine } = await admin
          .from('memberships')
          .select('circle_id, profiles!profile_id!inner ( auth_user_id )')
          .eq('status', 'active')
          .in('circle_id', nearIds)
          .eq('profiles.auth_user_id', user.id)
        nearbyMemberIds = new Set((mine ?? []).map((m) => m.circle_id as string))
      }

      nearbyCircles = nearList.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        about: c.about,
        type: c.type as 'in-person' | 'online',
        member_count: c.member_count,
        member_cap: c.member_cap,
        status: c.status,
        imageUrl: c.image_url,
        context: [formatDistance(c.distance_m), c.neighborhood].filter(Boolean).join(' · '),
        distanceLabel: formatDistance(c.distance_m),
      }))
    }
  }

  // Viewer's display name (Invite modal) + home location (proximity ordering), from the read
  // kicked off above.
  const { data: viewer } = await viewerPromise
  const viewerName = (viewer?.display_name as string | undefined) ?? 'A friend'

  // Proximity default ordering (ADR-186, privacy-safe). When proximity is enabled
  // and we have a viewer location — the place they searched (`near`) OR their saved
  // home — default the directory to NEARBY FIRST and tag each surfaced member with a
  // coarse band ("Nearby", "Your area"). The members_near RPC returns a band only —
  // never a distance — so we never invent one. Resolved here; the listing puts the surfaced
  // members first, through the same filters, so search / Online-now / scope all keep working.
  const connectionSettings = await settingsPromise
  let proxLat: number | null = null
  let proxLng: number | null = null
  if (nearParam) {
    const [latStr, lngStr] = nearParam.split(',')
    const la = Number(latStr)
    const ln = Number(lngStr)
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      proxLat = la
      proxLng = ln
    }
  }
  if (proxLat == null && viewer?.home_lat != null && viewer?.home_lng != null) {
    proxLat = Number(viewer.home_lat)
    proxLng = Number(viewer.home_lng)
  }
  const hasViewerLocation = proxLat != null && proxLng != null
  // Band per profile id for the surfaced (nearby) members + the nearby ordering.
  const bandByProfileId = new Map<string, ProximityBand>()
  const nearbyOrder: string[] = []
  if (connectionSettings.proximityEnabled && hasViewerLocation) {
    // ⚠️ NOT the viewer's discoveryRadiusM. That is the viewer's OWN "be findable within N" slider
    // (a privacy control on THEM, ADR-186 §3), and passing it here as the search radius made the
    // slider mean the opposite of its label: narrowing it shrank this member's Nearby list and
    // changed nothing for the strangers it promised to hide from. Since 20270344000100 the RPC
    // applies each TARGET's radius itself; this call uses the default viewer-side bound. The
    // viewer's id goes in so the RPC can exclude them and resolve their 'My connections' tier.
    const near = await membersNear(proxLat!, proxLng!, undefined, undefined, viewer?.id ?? null)
    for (const m of near) {
      if (!bandByProfileId.has(m.profileId)) {
        bandByProfileId.set(m.profileId, m.band)
        nearbyOrder.push(m.profileId)
      }
    }
  }

  // Non-member people the viewer is entitled to find: their own captures, plus
  // (as a steward) network-shared captures from stewards in their own locality.
  // Only stewards/staff have or can see these, so gate on connectionsOwnerId().
  const stewardId = await stewardPromise
  let metLeads: LeadHit[] = []
  if (qFilter?.trim() && stewardId) {
    metLeads = await searchVisibleLeads(stewardId, qFilter.trim(), { includeNetwork: true, limit: 12 })
  }

  const { data: circles } = await circlesPromise
  const circleList = (circles ?? []) as { id: string; name: string; city: string | null }[]

  // The Circle and City filters resolve to the circles whose ACTIVE members they mean (the
  // listing turns those into profile ids inside its own boundary). null = no such filter.
  const filterCircleIds: string[] | null = circleFilter
    ? [circleFilter]
    : cityFilter
      ? circleList.filter((c) => c.city === cityFilter).map((c) => c.id)
      : null

  // Everything the member cards are filtered by, server-side (lib/connections/directory-page.ts).
  const listingScope: DirectoryScope = {
    ...baseScope,
    regionIds: await regionIdsPromise,
    online: !!onlineFilter,
    topic: topicFilter ?? null,
    role: roleFilter ?? null,
    q: qFilter ?? null,
  }

  // The privacy gate (ADR-1203): a member who opted out of the directory, or is ghosting, is not
  // a member of this page — not in the cards, not in "Online now", not in the counts. The SQL
  // scope drops them and every row is passed through the predicate again before any use. There is
  // deliberately no carve-out for the viewer's own row: they are listed on the same terms as
  // everyone else, so opting out is visibly confirmed by their own card disappearing.
  const [{ count: totalCount }, { data: onlineRows }] = await Promise.all([totalPromise, onlinePromise])
  const totalMembers = totalCount ?? 0
  const onlineMembers = ((onlineRows ?? []) as unknown as Profile[])
    .filter(isListableInDirectory)
    .filter((p) => isOnline(p.last_seen_at))
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
    }))

  // Nearby-first ordering (privacy-safe) is applied by the listing: members the proximity RPC
  // surfaced lead page 1 in its fuzzed-cell rank, and the alphabetical pages follow without them.
  const proximityActive = bandByProfileId.size > 0

  function filterHref(params: Filters) {
    const p = new URLSearchParams()
    if (params.circle) p.set('circle', params.circle)
    if (params.city) p.set('city', params.city)
    if (params.region) p.set('region', params.region)
    if (params.online) p.set('online', params.online)
    if (params.topic) p.set('topic', params.topic)
    if (params.role) p.set('role', params.role)
    if (params.q) p.set('q', params.q)
    if (params.near) p.set('near', params.near)
    if (params.place) p.set('place', params.place)
    if (params.page && params.page !== '1') p.set('page', params.page)
    const s = p.toString()
    return s ? `/network?${s}` : '/network'
  }

  // The current filter state, carried across the "Online now" toggle so it
  // preserves any active location / search filters.
  const base: Filters = {
    circle: circleFilter,
    city: cityFilter,
    region: regionFilter,
    online: onlineFilter,
    topic: topicFilter,
    role: roleFilter,
    q: qFilter,
    near: nearParam,
    place: placeParam,
  }

  // Any directory filter active? Suggestions are a browse-mode lane only — they
  // step aside the moment the member is actually narrowing the directory.
  const filtering = !!(
    circleFilter || cityFilter || regionFilter || onlineFilter ||
    topicFilter || roleFilter || qFilter?.trim() || nearParam
  )
  // One Suspense key per query + page, so a new filter or page shows the skeleton instead of the
  // previous page's cards.
  const listingKey = filterHref({ ...base, page: String(page) })

  // The overlay hero band, resolved once (lib/layout/index-hero.ts): the operator's Settings header
  // image / focal point over the route's section default, plus the operator-tunable header element
  // (ADR-793). The directory ships no section cover, so this resolves to the gradient band at the
  // large directory height — exactly what this page rendered when it spelled the stanza out.
  const hero = await resolveIndexHero('/network')

  return (
    <div>
      {/* Hub tab strip — Community · Friends · Contacts read as one Network hub. Stays
          above the hero band so the Network sub-nav still leads the page. */}
      <NetworkTabs active="/network" />
      {/* Header: unified hero band with the operator-editable title/description, Invite on
          the right. Globe glyph rides the title; the stats row + filters follow in the body. */}
      <IndexTemplate
        {...hero}
        title={
          <span className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {title}
          </span>
        }
        description={description}
        intro={body}
        action={
          <div className="flex items-center gap-2">
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
            <InviteMemberCompose inviterName={viewerName} />
          </div>
        }
      >
      {/* Community size, pinned right against a baseline rule under the header. */}
      <div className="flex flex-wrap items-end justify-end gap-x-4 gap-y-1 border-b border-border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2.5 text-body-sm text-muted">
          <span>
            <span className="font-bold text-text">{totalMembers}</span> Members Worldwide
          </span>
          {connectionSettings.proximityEnabled && bandByProfileId.size > 0 && (
            <span>
              <span className="font-bold text-text">{bandByProfileId.size}</span> Members Near You
            </span>
          )}
        </div>
      </div>

      {/* Filter row — one aligned baseline against the divider above: the city
          search grows on the left; the "Use my location" + "Online now" actions
          pin to the right (the toggle rides in the search island's trailing slot
          so they share the field's exact height). */}
      <div className="mt-5">
        <CircleLocationSearch
          activePlace={placeParam}
          trailing={
            <Link
              href={filterHref({ ...base, online: onlineFilter ? undefined : '1' })}
              aria-pressed={!!onlineFilter}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-body-sm font-medium transition-colors ${
                onlineFilter
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text hover:border-primary hover:text-primary-strong'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-pill ${onlineFilter ? 'bg-on-primary' : 'bg-success'}`} />
              Online now
            </Link>
          }
        />
        {/* Directory facets (P5) — Topic / City / Role, options derived from the
            real data on the page; each dropdown hides itself when there's
            nothing to filter by (components/people/directory-facets). */}
        <Suspense fallback={null}>
          <SampledFacets vocab={vocabPromise} circles={circleList} />
        </Suspense>
        {/* No-location affordance — nudge the viewer to set a location so the
            directory can lead with who's nearby. Subtle, on the page background. */}
        {connectionSettings.proximityEnabled && !hasViewerLocation && (
          <p className="mt-2 flex items-center gap-1.5 text-meta text-subtle">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
            Set your location to see who&rsquo;s nearby.
          </p>
        )}
        {proximityActive && (
          <p className="mt-2 text-meta text-subtle">
            Showing members near {placeParam ?? 'you'} first.
          </p>
        )}
      </div>

      {/* Two-column body: 2/3 listings · 1/3 sidebar. Shares the page gutter with
          the header / filter row above, so both halves line up against the divider. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Nearby real circles — only when a place is searched. Demo circles are
              excluded by the circles_near RPC, so this is "real circles only". */}
          {nearParam && (
            <div className="mb-8">
              <SectionHeader
                title={`Circles near ${placeParam ?? 'you'}`}
                count={nearbyCircles.length > 0 ? nearbyCircles.length : undefined}
              />
              {nearbyCircles.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title={`No circles near ${placeParam ?? 'you'} yet`}
                  description="We’re just getting started here. Be the first to start a circle for this area. Others are looking too."
                />
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
                  {nearbyCircles.map((c) => (
                    <CircleCard key={c.id} circle={c} isMember={nearbyMemberIds.has(c.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* People you've met — non-member contacts you captured that match the
              search. The member directory only indexes profiles, so these would
              otherwise be unfindable until they join. */}
          {metLeads.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="People you’ve met" count={metLeads.length} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {metLeads.map((l) => (
                  <Link
                    key={l.id}
                    href={l.href ?? '#'}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-elevated"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-body-sm font-semibold text-primary-strong select-none">
                      {getInitials(l.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-body-sm font-semibold text-text">{l.displayName}</span>
                        <span className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">Lead</span>
                      </span>
                      <span className="mt-0.5 block truncate text-meta text-muted">
                        {[l.email, l.city, l.ownerName ? `shared by ${l.ownerName}` : null]
                          .filter(Boolean)
                          .join(' · ') || 'Saved contact'}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* People you may know (P5) — members the viewer isn't connected to,
              ranked by real signals only (shared circles, mutual connections).
              Browse mode only (steps aside while filtering); renders nothing
              when there's no genuine suggestion; streamed behind Suspense so the
              graph queries never block the directory (PAGE-FRAMEWORK §5). */}
          {!filtering && (
            <Suspense fallback={null}>
              <PeopleSuggestions authUserId={user.id} />
            </Suspense>
          )}

          {/* Portrait contact cards: one server-filtered page, streamed behind its own boundary
              (keyed on the query) so the header, filters and rail paint first. */}
          <Suspense key={listingKey} fallback={<DirectoryListingSkeleton />}>
            <DirectoryListing
              scope={listingScope}
              circleIds={filterCircleIds}
              nearbyOrder={nearbyOrder}
              bandByProfileId={bandByProfileId}
              page={page}
              hrefForPage={(n) => filterHref({ ...base, page: String(n) })}
            />
          </Suspense>
        </div>

        {/* Right rail: name search · online now · stats, then the connect-with-others
            pulse below them. The pulse (P5/P3b) is Suspense-wrapped so it never blocks. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            {/* DirectorySearch is a composite that names its own input, so this is a heading. */}
            <p className="mb-2 block text-body-sm font-bold tracking-tight text-text">
              Search members
            </p>
            <DirectorySearch placeholder="Search by name or @handle…" />
          </div>
          <OnlineMembersCard members={onlineMembers} />
          <Suspense fallback={<CommunityStatsCard totalMembers={totalMembers} />}>
            <SampledStats vocab={vocabPromise} totalMembers={totalMembers} />
          </Suspense>
          <Suspense fallback={null}>
            <ConnectionsPulse />
          </Suspense>
        </aside>
      </div>
      </IndexTemplate>
    </div>
  )
}

// ── The member cards: one server-filtered page (LIVE-661, ADR-1655) ─────────────────────────────

async function DirectoryListing({
  scope,
  circleIds,
  nearbyOrder,
  bandByProfileId,
  page: requestedPage,
  hrefForPage,
}: {
  scope: DirectoryScope
  /** Circles whose active members the Circle / City filter means; null = no such filter. */
  circleIds: string[] | null
  /** Profile ids the proximity RPC surfaced, in its rank order (empty when proximity is off). */
  nearbyOrder: string[]
  bandByProfileId: Map<string, ProximityBand>
  page: number
  hrefForPage: (page: number) => string
}) {
  const admin = createAdminClient()

  // Circle / City → the profile ids of their active members.
  let onlyIds: string[] | null = null
  if (circleIds) {
    if (circleIds.length === 0) {
      onlyIds = []
    } else {
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', circleIds)
        .eq('status', 'active')
      onlyIds = [...new Set((members ?? []).map((m) => m.profile_id as string))]
    }
  }

  // The nearby lead goes first on page 1 and is left out of the alphabetical read, so no member
  // appears twice and the page boundaries stay exact across the join.
  const nearbySet = new Set(nearbyOrder)
  const onlySet = onlyIds ? new Set(onlyIds) : null
  const leadIds = onlySet ? nearbyOrder.filter((id) => onlySet.has(id)) : nearbyOrder
  const leadScope: DirectoryScope = { ...scope, onlyIds: leadIds }
  const restScope: DirectoryScope = onlyIds
    ? { ...scope, onlyIds: onlyIds.filter((id) => !nearbySet.has(id)) }
    : { ...scope, onlyIds: null, excludeIds: nearbyOrder }

  let lead: Profile[] = []
  if (leadIds.length > 0 && !scopeIsEmpty(leadScope)) {
    const { data, error } = await scopeDirectoryQuery(admin.from('profiles').select(CARD_SELECT), leadScope)
    if (error) throw new Error(`Community directory: the nearby read failed (${error.message})`)
    const rank = new Map(nearbyOrder.map((id, i) => [id, i]))
    lead = ((data ?? []) as unknown as Profile[])
      .filter(isListableInDirectory)
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  }

  const restEmpty = scopeIsEmpty(restScope)
  const restCount = async (): Promise<number> => {
    if (restEmpty) return 0
    const { count, error } = await scopeDirectoryQuery(
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      restScope,
    )
    if (error) throw new Error(`Community directory: the count failed (${error.message})`)
    return count ?? 0
  }
  const restPage = async (from: number, to: number) =>
    scopeDirectoryQuery(admin.from('profiles').select(CARD_SELECT, { count: 'exact' }), restScope)
      .order('display_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

  // Read the requested page. A page past the end (a filter narrowed the set under a shared
  // ?page= link) is clamped to the last page rather than shown empty.
  let page = requestedPage
  let rows: Profile[] = []
  let rest: number | null = null
  let failed: string | null = null
  let win = directoryWindow(page, DIRECTORY_PAGE_SIZE, lead.length)
  if (win.rest && !restEmpty) {
    const { data, count, error } = await restPage(win.rest.from, win.rest.to)
    if (error) failed = error.message
    else {
      rows = (data ?? []) as unknown as Profile[]
      rest = count ?? 0
    }
  }
  // A range past the end answers with an error and no count, so count on its own and clamp.
  if (rest == null) rest = await restCount()
  const total = lead.length + rest
  const pages = directoryPageCount(total)
  if (page > pages) {
    page = pages
    win = directoryWindow(page, DIRECTORY_PAGE_SIZE, lead.length)
    rows = []
    if (win.rest && !restEmpty) {
      const { data, error } = await restPage(win.rest.from, win.rest.to)
      if (error) throw new Error(`Community directory: the page read failed (${error.message})`)
      rows = (data ?? []) as unknown as Profile[]
    }
  } else if (failed) {
    // Never render a failed read as "No members match".
    throw new Error(`Community directory: the page read failed (${failed})`)
  }

  const cards = [
    ...(win.lead ? lead.slice(win.lead[0], win.lead[1]) : []),
    ...rows.filter(isListableInDirectory),
  ]

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title="No members match these filters"
        description="Try widening or clearing a filter to see more of the community."
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((p) => (
          <ContactCard
            key={p.id}
            handle={p.handle}
            displayName={p.display_name}
            avatarUrl={p.avatar_url}
            role={p.is_system ? 'moderator' : ((p.community_role ?? 'member') as CommunityRole)}
            location={p.nexus_regions?.name ?? null}
            online={isOnline(p.last_seen_at)}
            isDemo={p.is_demo}
            band={bandByProfileId.get(p.id)}
          />
        ))}
      </div>
      <DirectoryPager page={page} pages={pages} total={total} hrefForPage={hrefForPage} />
    </>
  )
}

// Prev / Next + "Page X of Y". All Links, so it needs no client JS and every page is a shareable
// URL carrying the filters. Hidden when everything fits on one page.
function DirectoryPager({
  page,
  pages,
  total,
  hrefForPage,
}: {
  page: number
  pages: number
  total: number
  hrefForPage: (page: number) => string
}) {
  if (pages <= 1) return null
  const edge = `${buttonClasses('secondary', 'sm')} pointer-events-none opacity-40`
  return (
    <nav
      aria-label="Directory pages"
      className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-border pt-5 sm:flex-row"
    >
      <p className="text-meta text-subtle">
        <span className="tabular-nums font-medium text-muted">{total}</span> members match
      </p>
      <div className="flex items-center gap-3 text-meta">
        {page > 1 ? (
          <Link href={hrefForPage(page - 1)} className={buttonClasses('secondary', 'sm')}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Prev
          </Link>
        ) : (
          <span className={edge} aria-disabled>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Prev
          </span>
        )}
        <span className="tabular-nums font-medium text-muted">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={hrefForPage(page + 1)} className={buttonClasses('secondary', 'sm')}>
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className={edge} aria-disabled>
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  )
}

function DirectoryListingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-card border border-border bg-surface p-4 lift-1">
          <Skeleton className="mx-auto h-16 w-16 rounded-pill" />
          <Skeleton className="mx-auto mt-3 h-4 w-24" />
          <Skeleton className="mx-auto mt-1.5 h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

// ── Facet options and the Most popular place, from the vocabulary sample ────────────────────────

async function SampledFacets({
  vocab,
  circles,
}: {
  vocab: Promise<Profile[]>
  circles: { id: string; city: string | null }[]
}) {
  // Directory facets (P5): Topic / City / Role, options derived from real listed members; each
  // dropdown hides itself when there's nothing to filter by (components/people/directory-facets).
  return <DirectoryFacets profiles={await vocab} circles={circles} className="mt-3" />
}

async function SampledStats({ vocab, totalMembers }: { vocab: Promise<Profile[]>; totalMembers: number }) {
  // "Most popular place": the region with the most members (the only per-member geography we
  // carry on a profile).
  const placeCounts = new Map<string, number>()
  for (const p of await vocab) {
    const name = p.nexus_regions?.name
    if (name) placeCounts.set(name, (placeCounts.get(name) ?? 0) + 1)
  }
  let topPlace: string | null = null
  let topPlaceCount = 0
  for (const [name, count] of placeCounts) {
    if (count > topPlaceCount) {
      topPlace = name
      topPlaceCount = count
    }
  }
  return <CommunityStatsCard totalMembers={totalMembers} topPlace={topPlace} topPlaceCount={topPlaceCount} />
}
