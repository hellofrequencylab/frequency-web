import Link from 'next/link'
import { Users, Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { MapZone, MapPreview, MapBanner } from '@/components/circles/circles-map'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'

type CircleRow = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  created_at: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  image_url: string | null
  topical_channel_id: string | null
  channel: { name: string } | null
  hub: {
    id: string
    name: string
    slug: string
    nexus: { id: string; name: string; slug: string; outpost: { name: string } | null } | null
  } | null
}

function contextFor(c: CircleRow): string | null {
  const place = c.neighborhood ?? c.hub?.nexus?.outpost?.name ?? null
  const nexus = c.hub?.nexus?.name ?? null
  const geo = [place, nexus].filter(Boolean).join(' · ')
  if (geo) return geo
  return c.channel?.name ?? null
}

function toCardData(c: CircleRow): CircleCardData {
  return {
    id: c.id, name: c.name, slug: c.slug, about: c.about, type: c.type,
    member_count: c.member_count, member_cap: c.member_cap, status: c.status,
    context: contextFor(c), imageUrl: c.image_url,
  }
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string }>
}) {
  const { type, interest, sort = 'nearest', q } = await searchParams
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let myCircleIds: string[] = []
  let isAdmin = false
  if (user) {
    const { data: profile } = await admin
      .from('profiles').select('id, community_role').eq('auth_user_id', user.id).maybeSingle()
    if (profile) {
      isAdmin = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')
      const { data: mems } = await admin
        .from('memberships').select('circle_id').eq('profile_id', profile.id).eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  const { data: rawCircles } = await admin
    .from('circles')
    .select(
      `id, name, slug, about, type, member_count, member_cap, status, created_at,
       latitude, longitude, neighborhood, image_url, topical_channel_id,
       channel:topical_channels!topical_channel_id ( name ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id ( id, name, slug, outpost:outposts!outpost_id ( name ) )
       )`
    )
    .neq('status', 'archived')
    .order('name', { ascending: true })

  const all = (rawCircles ?? []) as unknown as CircleRow[]

  const { data: interestRows } = await admin
    .from('topical_channels').select('id, name, category').order('name')
  const interests = (interestRows ?? []) as { id: string; name: string; category: string }[]

  // ── Facets ──────────────────────────────────────────────────────────────
  const qLower = (q ?? '').trim().toLowerCase()
  let filtered = all.filter((c) => {
    if (type === 'in-person' && c.type !== 'in-person') return false
    if (type === 'online' && c.type !== 'online') return false
    if (interest && c.topical_channel_id !== interest) return false
    if (qLower) {
      const hay = `${c.name} ${c.about ?? ''} ${c.neighborhood ?? ''} ${c.channel?.name ?? ''}`.toLowerCase()
      if (!hay.includes(qLower)) return false
    }
    return true
  })

  const byMember = (a: CircleRow, b: CircleRow) => b.member_count - a.member_count
  if (sort === 'active') filtered = [...filtered].sort(byMember)
  else if (sort === 'new') filtered = [...filtered].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  else if (sort === 'open') filtered = [...filtered].sort((a, b) => (b.member_cap - b.member_count) - (a.member_cap - a.member_count))
  else filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name)) // "nearest" -> name; the near-you hero does real proximity

  const myCircles = filtered.filter((c) => myCircleIds.includes(c.id))
  const discover = filtered.filter((c) => !myCircleIds.includes(c.id))
  const filtering = !!(type || interest || qLower)

  // Near-you data (in-person, located) from the unfiltered set
  const locatableCircles = all
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, latitude: c.latitude as number, longitude: c.longitude as number, neighborhood: c.neighborhood }))

  // Interest browse (counts from full set, top by count)
  const interestCount = new Map<string, number>()
  for (const c of all) if (c.topical_channel_id) interestCount.set(c.topical_channel_id, (interestCount.get(c.topical_channel_id) ?? 0) + 1)
  const interestChips = interests
    .map((i) => ({ ...i, count: interestCount.get(i.id) ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // Region browse (nexus rollup from full set)
  const nexusMap = new Map<string, { name: string; slug: string; count: number }>()
  for (const c of all) {
    const nx = c.hub?.nexus
    if (nx) {
      const prev = nexusMap.get(nx.id)
      nexusMap.set(nx.id, { name: nx.name, slug: nx.slug, count: (prev?.count ?? 0) + 1 })
    }
  }
  const nexuses = [...nexusMap.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  return (
    <IndexTemplate
      title="Circles"
      description="Find your people — anywhere. Browse local circles, search by interest, or wander the network and start one where there's a gap."
      action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
      toolbar={
        isAdmin ? (
          <Link href="/admin/circles" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
            Manage circles →
          </Link>
        ) : undefined
      }
    >
      <CirclesToolbar interests={interests} />

      <MapZone circles={locatableCircles}>
        {/* Expanded map lives here (above the grid) so it pushes content down. */}
        <MapBanner />

        <div className="grid grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-3">
        {/* ── Interior right column: map preview + browse + explore, borderless ── */}
        <aside className="space-y-8 lg:col-start-3">
          <MapPreview />

          {interestChips.length > 0 && (
            <div>
              <SectionHeader title="Browse by interest" />
              <div className="space-y-0.5">
                {interestChips.map((i) => {
                  const active = interest === i.id
                  return (
                    <Link
                      key={i.id}
                      href={`/circles?interest=${active ? '' : i.id}`}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? 'bg-primary-bg font-semibold text-primary-strong'
                          : 'text-muted hover:bg-surface-elevated hover:text-text'
                      }`}
                    >
                      <span className="truncate">{i.name}</span>
                      <span className="text-xs tabular-nums text-subtle">{i.count}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {nexuses.length > 0 && (
            <div>
              <SectionHeader title="Explore the network" />
              <div className="space-y-0.5">
                {nexuses.map((nx) => (
                  <Link
                    key={nx.slug}
                    href={`/nexuses/${nx.slug}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-elevated"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-primary-strong">
                      <Compass className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-text">{nx.name}</span>
                    <span className="text-xs tabular-nums text-subtle">{nx.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main column: the circles themselves ──────────────────────────── */}
        <div className="space-y-10 lg:col-start-1 lg:col-span-2 lg:row-start-1">
          {myCircles.length > 0 && (
            <section>
              <SectionHeader title="Your circles" count={myCircles.length} />
              <div className="grid gap-4 sm:grid-cols-2">
                {myCircles.map((c) => <CircleCard key={c.id} circle={toCardData(c)} isMember />)}
              </div>
            </section>
          )}

          <section>
            <SectionHeader title={filtering ? 'Results' : 'Discover'} count={discover.length} />
            {discover.length === 0 ? (
              <EmptyState
                icon={Users}
                title={filtering ? 'No circles match these filters' : 'No circles yet'}
                description={filtering ? 'Try a wider search, or start the first one for this corner of the network.' : 'Be the first — start a circle for your neighborhood or an interest.'}
                action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {discover.map((c) => <CircleCard key={c.id} circle={toCardData(c)} isMember={false} />)}
              </div>
            )}
          </section>
        </div>
        </div>
      </MapZone>
    </IndexTemplate>
  )
}
