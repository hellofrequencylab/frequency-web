import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { Globe, MapPin } from 'lucide-react'
import { isOnline } from '@/lib/presence'
import { InviteMemberCompose } from '@/components/compose/invite-member-compose'
import { type CommunityRole, ROLE_LABEL, RoleBadge } from '@/lib/community-roles'
import { IndexTemplate } from '@/components/templates/index-template'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonCard } from '@/components/cards/person-card'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CircleLocationSearch } from '@/components/circles/circle-location-search'
import { SectionHeader } from '@/components/ui/section-header'
import { formatDistance } from '@/lib/geocode'
import { demoModeEnabled } from '@/lib/platform-flags'

type Profile = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
  last_seen_at: string | null
  is_demo: boolean
  nexus_regions: { name: string } | null
}

// Filters carried in the URL so the directory stays a shareable, server-rendered
// view (no client state). Members can be narrowed by role (rank), the Circle they
// belong to, the city that Circle meets in, their Nexus region, and whether
// they're online right now. Circle/city resolve through the memberships join.
type Filters = {
  role?: string
  circle?: string
  city?: string
  region?: string
  online?: string
  /** "lat,lng" set by the geolocation / city-autocomplete search. */
  near?: string
  /** Human label for the chosen place, e.g. "Encinitas, California". */
  place?: string
}

type NearbyCircle = CircleCardData & { distanceLabel: string }

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Filters>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const {
    role: roleFilter,
    circle: circleFilter,
    city: cityFilter,
    region: regionFilter,
    online: onlineFilter,
    near: nearParam,
    place: placeParam,
  } = await searchParams

  const admin = createAdminClient()

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

  // Get viewer's display name for the Invite Member modal
  const { data: viewer } = await admin
    .from('profiles')
    .select('display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const viewerName = (viewer?.display_name as string | undefined) ?? 'A friend'

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, last_seen_at, is_demo, nexus_regions!nexus_region_id ( name )')
    .eq('is_active', true)
    .eq('is_system', false) // hide system accounts (e.g. @moderation) from the directory
    .order('display_name', { ascending: true })

  if (roleFilter) query = query.eq('community_role', roleFilter as Database['public']['Enums']['community_role'])
  // Global demo switch: when demo_mode is off, hide seeded demo members.
  if (!(await demoModeEnabled())) query = query.eq('is_demo', false)

  // Fetch the filter vocabularies and the directory in parallel.
  const [{ data: profiles }, { data: regions }, { data: circles }] = await Promise.all([
    query,
    admin.from('nexus_regions').select('id, name').order('name'),
    admin
      .from('circles')
      .select('id, name, city, status')
      .in('status', ['forming', 'active'])
      .order('name'),
  ])

  const circleList = (circles ?? []) as { id: string; name: string; city: string | null }[]
  // Distinct, sorted cities a Circle actually meets in.
  const cities = Array.from(
    new Set(circleList.map((c) => c.city).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b))

  // Resolve the Circle and City filters through memberships → the set of profile
  // ids that belong to the chosen Circle (or to any Circle in the chosen city).
  // Only queried when one of those filters is active, so the default list is one
  // round trip per vocabulary.
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

  const roles: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

  function filterHref(params: Filters) {
    const p = new URLSearchParams()
    if (params.role) p.set('role', params.role)
    if (params.circle) p.set('circle', params.circle)
    if (params.city) p.set('city', params.city)
    if (params.region) p.set('region', params.region)
    if (params.online) p.set('online', params.online)
    if (params.near) p.set('near', params.near)
    if (params.place) p.set('place', params.place)
    const s = p.toString()
    return s ? `/people?${s}` : '/people'
  }

  // The current filter state, minus whichever dimension a pill row is editing.
  const base: Filters = {
    role: roleFilter,
    circle: circleFilter,
    city: cityFilter,
    region: regionFilter,
    online: onlineFilter,
    near: nearParam,
    place: placeParam,
  }

  const pillBase = 'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors'
  const pillOn = 'bg-primary text-on-primary border-primary'
  const pillOff = 'bg-surface text-muted border-border hover:border-primary'

  // Filters live in the IndexTemplate `toolbar` slot (URL-driven, server-rendered).
  const filters = (
    <div className="flex flex-col gap-3">
        {/* Smart location search — city autocomplete + geolocation → nearby
            REAL circles (demo excluded). */}
        <CircleLocationSearch activePlace={placeParam} />

        {/* Role (rank) filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted font-medium w-12 shrink-0">Role:</span>
          <Link
            href={filterHref({ ...base, role: undefined })}
            className={`${pillBase} ${!roleFilter ? pillOn : pillOff}`}
          >
            All
          </Link>
          {roles.map((r) => (
            <Link
              key={r}
              href={filterHref({ ...base, role: r })}
              className={`${pillBase} ${roleFilter === r ? pillOn : pillOff}`}
            >
              {ROLE_LABEL[r]}
            </Link>
          ))}
        </div>

        {/* Circle filter */}
        {circleList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted font-medium w-12 shrink-0">Circle:</span>
            <Link
              href={filterHref({ ...base, circle: undefined })}
              className={`${pillBase} ${!circleFilter ? pillOn : pillOff}`}
            >
              All
            </Link>
            {circleList.map((c) => (
              <Link
                key={c.id}
                href={filterHref({ ...base, circle: c.id })}
                className={`${pillBase} ${circleFilter === c.id ? pillOn : pillOff}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* City filter */}
        {cities.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted font-medium w-12 shrink-0">City:</span>
            <Link
              href={filterHref({ ...base, city: undefined })}
              className={`${pillBase} ${!cityFilter ? pillOn : pillOff}`}
            >
              All
            </Link>
            {cities.map((c) => (
              <Link
                key={c}
                href={filterHref({ ...base, city: c })}
                className={`${pillBase} ${cityFilter === c ? pillOn : pillOff}`}
              >
                {c}
              </Link>
            ))}
          </div>
        )}

        {/* Region filter */}
        {regions && regions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted font-medium w-12 shrink-0">Region:</span>
            <Link
              href={filterHref({ ...base, region: undefined })}
              className={`${pillBase} ${!regionFilter ? pillOn : pillOff}`}
            >
              All
            </Link>
            {regions.map((reg: { id: string; name: string }) => (
              <Link
                key={reg.id}
                href={filterHref({ ...base, region: reg.name })}
                className={`${pillBase} ${regionFilter === reg.name ? pillOn : pillOff}`}
              >
                {reg.name}
              </Link>
            ))}
          </div>
        )}

        {/* Online-now toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted font-medium w-12 shrink-0">Status:</span>
          <Link
            href={filterHref({ ...base, online: onlineFilter ? undefined : '1' })}
            className={`${pillBase} ${onlineFilter ? pillOn : pillOff}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${onlineFilter ? 'bg-on-primary' : 'bg-success'}`} />
              Online now
            </span>
          </Link>
        </div>
      </div>
  )

  return (
    <IndexTemplate
      title={
        <span className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-strong" />
          Directory
        </span>
      }
      description="Everyone in the community. Browse, find someone interesting, say hi."
      action={<InviteMemberCompose inviterName={viewerName} />}
      toolbar={filters}
    >
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
              description="We’re just getting started here. Be the first to start a circle for this area — others are looking too."
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {nearbyCircles.map((c) => (
                <CircleCard key={c.id} circle={c} isMember={nearbyMemberIds.has(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member count */}
      <p className="text-xs text-subtle mb-4">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No members match these filters"
          description="Try widening or clearing a filter to see more of the community."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const role = (p.community_role ?? 'member') as CommunityRole
            return (
              <PersonCard
                key={p.id}
                handle={p.handle}
                displayName={p.display_name}
                avatarUrl={p.avatar_url}
                online={isOnline(p.last_seen_at)}
                isDemo={p.is_demo}
                meta={
                  <>
                    <RoleBadge role={role} className="text-xs leading-tight" />
                    {p.nexus_regions?.name && <span>{p.nexus_regions.name}</span>}
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </IndexTemplate>
  )
}
