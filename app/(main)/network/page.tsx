import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Globe, MapPin } from 'lucide-react'
import { isOnline } from '@/lib/presence'
import { InviteMemberCompose } from '@/components/compose/invite-member-compose'
import { type CommunityRole } from '@/lib/community-roles'
import { PageHeading } from '@/components/templates/page-heading'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CircleLocationSearch } from '@/components/circles/circle-location-search'
import { DirectorySearch } from '@/components/ui/directory-search'
import { SectionHeader } from '@/components/ui/section-header'
import { CommunityTabs } from '@/components/network/community-tabs'
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
  getMyConnectionPrefs,
  getConnectionSettings,
} from '@/lib/connections/connection-settings'
import type { ProximityBand } from '@/lib/connections/location'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getInitials } from '@/lib/utils'
import { ConnectionsPulse } from '@/components/connections/connections-pulse'

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
}

type NearbyCircle = CircleCardData & { distanceLabel: string }

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Community',
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
  } = await searchParams

  const admin = createAdminClient()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, ctaLabel, ctaHref } = await resolvePageContent('/network', CONTENT_FALLBACK)

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

  // Get viewer's display name (Invite modal) + home location (proximity ordering).
  const { data: viewer } = await admin
    .from('profiles')
    .select('display_name, home_lat, home_lng')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const viewerName = (viewer?.display_name as string | undefined) ?? 'A friend'

  // Proximity default ordering (ADR-186, privacy-safe). When proximity is enabled
  // and we have a viewer location — the place they searched (`near`) OR their saved
  // home — default the directory to NEARBY FIRST and tag each surfaced member with a
  // coarse band ("Nearby", "Your area"). The members_near RPC returns a band only —
  // never a distance — so we never invent one. Resolved here; applied to `filtered`
  // (post-filter) below, so search / Online-now / scope all keep working.
  const [connectionSettings, myPrefs] = await Promise.all([
    getConnectionSettings(),
    getMyConnectionPrefs(),
  ])
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
    const radius = myPrefs?.discoveryRadiusM ?? undefined
    const near = await membersNear(proxLat!, proxLng!, radius)
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
  const stewardId = await connectionsOwnerId()
  let metLeads: LeadHit[] = []
  if (qFilter?.trim() && stewardId) {
    metLeads = await searchVisibleLeads(stewardId, qFilter.trim(), { includeNetwork: true, limit: 12 })
  }

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, is_system, last_seen_at, is_demo, entity_types, nexus_regions!nexus_region_id ( name )')
    .eq('is_active', true)
    // Vera (is_system) is FULLY VISIBLE here by owner decision (ADR-231 update):
    // she gets a member card like anyone else; her chip reads Moderator.
    .order('display_name', { ascending: true })

  // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) query = query.eq('is_demo', false)

  // Fetch the directory and the circle vocabulary in parallel. (Circles power the
  // city → members resolution; the region/city facet chips are gone, but the
  // memberships join still honours any circle/city filter carried in the URL.)
  const [{ data: profiles }, { data: circles }] = await Promise.all([
    query,
    admin
      .from('circles')
      .select('id, name, city, status')
      .in('status', ['forming', 'active'])
      .order('name'),
  ])

  const circleList = (circles ?? []) as { id: string; name: string; city: string | null }[]

  // Resolve the Circle and City filters through memberships → the set of profile
  // ids that belong to the chosen Circle (or to any Circle in the chosen city).
  // Only queried when one of those filters is active.
  let circleMemberIds: Set<string> | null = null
  if (circleFilter || cityFilter) {
    let circleIds: string[]
    if (circleFilter) {
      circleIds = [circleFilter]
    } else {
      circleIds = circleList.filter((c) => c.city === cityFilter).map((c) => c.id)
    }
    if (circleIds.length === 0) {
      circleMemberIds = new Set()
    } else {
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', circleIds)
        .eq('status', 'active')
      circleMemberIds = new Set((members ?? []).map((m) => m.profile_id as string))
    }
  }

  const typedProfiles = (profiles ?? []) as unknown as Profile[]

  // Apply the join-resolved + client-side filters.
  let filtered = typedProfiles
  if (regionFilter) filtered = filtered.filter((p) => p.nexus_regions?.name === regionFilter)
  if (circleMemberIds) filtered = filtered.filter((p) => circleMemberIds!.has(p.id))
  if (onlineFilter) filtered = filtered.filter((p) => isOnline(p.last_seen_at))
  // P5 facets — a shared topic tag (entity_types) and a community-role rung.
  if (topicFilter) filtered = filtered.filter((p) => (p.entity_types ?? []).includes(topicFilter))
  if (roleFilter) filtered = filtered.filter((p) => (p.community_role ?? 'member') === roleFilter)
  if (qFilter?.trim()) {
    const needle = qFilter.trim().toLowerCase()
    filtered = filtered.filter(
      (p) =>
        (p.display_name ?? '').toLowerCase().includes(needle) ||
        (p.handle ?? '').toLowerCase().includes(needle),
    )
  }

  // Nearby-first ordering (privacy-safe). Members the proximity RPC surfaced come
  // first, in its fuzzed-cell rank (the RPC's order = its proximity/secondary sort);
  // everyone else keeps the existing alphabetical directory order beneath them. Only
  // reorders — it never adds or removes members, so all filters above stand. Inert
  // (no-op) when the viewer has no location or proximity is off.
  const proximityActive = bandByProfileId.size > 0
  if (proximityActive) {
    const rank = new Map(nearbyOrder.map((id, i) => [id, i]))
    filtered = [...filtered].sort((a, b) => {
      const ra = rank.get(a.id)
      const rb = rank.get(b.id)
      if (ra != null && rb != null) return ra - rb
      if (ra != null) return -1
      if (rb != null) return 1
      return 0 // both non-nearby → keep prior (alphabetical) order
    })
  }

  // Sidebar data, computed from the data we already fetched.
  // "Online now" — members currently online (independent of the online filter,
  // so the rail still works while browsing everyone). Capped for a tidy rail.
  const onlineMembers = typedProfiles
    .filter((p) => isOnline(p.last_seen_at))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
    }))

  // "Most popular place" — the region with the most members (the only
  // per-member geography we carry on a profile).
  const placeCounts = new Map<string, number>()
  for (const p of typedProfiles) {
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

  return (
    <div>
      {/* Header: globe + operator-editable title/description, Invite on the right. */}
      <PageHeading
        title={
          <span className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary-strong" />
            {title}
          </span>
        }
        description={description}
        actions={
          <div className="flex items-center gap-2">
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
            <InviteMemberCompose inviterName={viewerName} />
          </div>
        }
      />

      {/* Hub tabs + community size on one line: tabs left, member counts pinned
          right against the same baseline rule. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border">
        <CommunityTabs />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2.5 text-sm text-muted">
          <span>
            <span className="font-bold text-text">{typedProfiles.length}</span> Members Worldwide
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
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                onlineFilter
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text hover:border-primary hover:text-primary-strong'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${onlineFilter ? 'bg-on-primary' : 'bg-success'}`} />
              Online now
            </Link>
          }
        />
        {/* Directory facets (P5) — Topic / City / Role, options derived from the
            real data on the page; each dropdown hides itself when there's
            nothing to filter by (components/people/directory-facets). */}
        <DirectoryFacets profiles={typedProfiles} circles={circleList} className="mt-3" />
        {/* No-location affordance — nudge the viewer to set a location so the
            directory can lead with who's nearby. Subtle, on the page background. */}
        {connectionSettings.proximityEnabled && !hasViewerLocation && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
            Set your location to see who&rsquo;s nearby.
          </p>
        )}
        {proximityActive && (
          <p className="mt-2 text-xs text-subtle">
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
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong select-none">
                      {getInitials(l.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-text">{l.displayName}</span>
                        <span className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">Lead</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
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

          {/* Portrait contact cards */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No members match these filters"
              description="Try widening or clearing a filter to see more of the community."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {filtered.map((p) => (
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
          )}
        </div>

        {/* Right rail: name search · online now · stats, then the connect-with-others
            pulse below them. The pulse (P5/P3b) is Suspense-wrapped so it never blocks. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <label className="mb-2 block text-sm font-bold tracking-tight text-text">
              Search members
            </label>
            <DirectorySearch placeholder="Search by name or @handle…" />
          </div>
          <OnlineMembersCard members={onlineMembers} />
          <CommunityStatsCard
            totalMembers={typedProfiles.length}
            topPlace={topPlace}
            topPlaceCount={topPlaceCount}
          />
          <Suspense fallback={null}>
            <ConnectionsPulse />
          </Suspense>
        </aside>
      </div>
    </div>
  )
}
