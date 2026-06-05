import Link from 'next/link'
import { Users, Compass, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone, MapPreview, MapBanner, FindNearMeButton } from '@/components/circles/circles-map'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import type { CircleBase } from '@/lib/types/circle'

type CircleRow = CircleBase & {
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  created_at: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  image_url: string | null
  is_demo: boolean
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
    context: contextFor(c), imageUrl: c.image_url, isDemo: c.is_demo,
  }
}

// De-boxed network stat — a value over a label, floating on the canvas (no card).
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold leading-none tabular-nums text-text">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-subtle">{label}</div>
    </div>
  )
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
      .from('profiles')
      .select('id, community_role, current_season_zaps, lifetime_gems, current_streak')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const p = profile as {
      id: string; community_role: string | null
      current_season_zaps?: number; lifetime_gems?: number; current_streak?: number
    } | null
    if (p) {
      isAdmin = ['host', 'guide', 'mentor', 'janitor'].includes(p.community_role ?? '')
      const { data: mems } = await admin
        .from('memberships').select('circle_id').eq('profile_id', p.id).eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  let circlesQuery = admin
    .from('circles')
    .select(
      `id, name, slug, about, type, member_count, member_cap, status, created_at,
       latitude, longitude, neighborhood, image_url, is_demo, topical_channel_id,
       channel:topical_channels!topical_channel_id ( name ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id ( id, name, slug, outpost:outposts!outpost_id ( name ) )
       )`
    )
    .neq('status', 'archived')
    .order('name', { ascending: true })
  // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) circlesQuery = circlesQuery.eq('is_demo', false)
  const { data: rawCircles } = await circlesQuery

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
  else filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name)) // "nearest" -> name; the map's find-near-me does real proximity

  const myCircles = filtered.filter((c) => myCircleIds.includes(c.id))
  const discover = filtered.filter((c) => !myCircleIds.includes(c.id))
  const combined = [...myCircles, ...discover] // members first, then discover
  const filtering = !!(type || interest || qLower)

  // Near-you data (in-person, located) from the unfiltered set
  const locatableCircles = all
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, latitude: c.latitude as number, longitude: c.longitude as number, neighborhood: c.neighborhood }))

  // Flywheel: circles ≥80% of cap are "filling up". When a circle fills, the
  // next one should start — so we surface a gentle nudge to open the next door.
  const nearlyFull = all.filter((c) => c.member_cap > 0 && c.member_count / c.member_cap >= 0.8)

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

  // Network stats for the header strip
  const stats = {
    circles: all.length,
    members: all.reduce((s, c) => s + (c.member_count ?? 0), 0),
    cities: nexusMap.size,
    interests: interestChips.length,
  }

  return (
    <IndexTemplate
      title="Circles"
      description={
        <>
          {/* Mobile leads with a tight one-liner so the stats + actions surface
              without scrolling past a wall of copy; desktop keeps the full pitch. */}
          <span className="sm:hidden">Find a circle near you, or start your own.</span>
          <span className="hidden sm:inline">
            This is where it gets real. Find a circle near you, dive into something you love, or
            start your own — because showing up, week after week, is how strangers become your people.
          </span>
        </>
      }
    >
      {/* Reassurance — the introvert's worry, named and answered. Secondary copy,
          so it folds away on mobile to keep the header scannable. */}
      <p className="mb-6 hidden max-w-2xl text-sm leading-relaxed text-muted sm:block">
        Circles are small on purpose — most are just a handful of people. You don&rsquo;t have to know
        anyone, and you don&rsquo;t have to say much. You just have to show up.
      </p>

      <MapZone circles={locatableCircles}>
        {/* Control bar: network stats + find-near-me / start / manage. On mobile it
            stacks into a tidy card — a 4-up stat strip over a divided action row;
            from sm up it's the original stats-left · actions-right bar. */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:px-5">
          <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-3">
            <Stat value={stats.circles} label="Circles" />
            <Stat value={stats.members} label="Members" />
            <Stat value={stats.cities} label="Cities" />
            <Stat value={stats.interests} label="Interests" />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 sm:border-0 sm:pt-0">
            {locatableCircles.length > 0 && <FindNearMeButton />}
            {user && (
              <NewCircleCompose
                interests={interests}
                buttonLabel="Start a circle"
                buttonClass="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              />
            )}
            {user && isAdmin && (
              <Link href="/admin/circles" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
                Manage circles →
              </Link>
            )}
          </div>
        </div>

        {/* Flywheel nudge — when circles are filling up, invite the next host. */}
        {user && nearlyFull.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 p-4 dark:bg-primary-bg/15">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">
                  {nearlyFull.length} {nearlyFull.length === 1 ? 'circle is' : 'circles are'} filling up
                </p>
                <p className="text-sm text-muted">
                  A full circle is a good problem — it means the next one&rsquo;s ready to start. Open the
                  door for the people still looking for their room.
                </p>
              </div>
            </div>
            <NewCircleCompose
              interests={interests}
              buttonLabel="Start the next circle"
              buttonClass="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            />
          </div>
        )}

        <CirclesToolbar interests={interests} />

        {/* Expanded map — opens above the grid (the Find-near-me button opens it). */}
        <div className="mt-6">
          <MapBanner />
        </div>

        {/* Masonry: boxed circle cards fill the grid; the map is a 2-wide block
            top-right and the nav sits in the right column under it.
            grid-auto-flow:dense lets the cards flow into the gaps (and under the
            nav). Rows size to content so the boxed cards sit flush. */}
        <div className="grid auto-rows-min grid-cols-1 gap-6 [grid-auto-flow:row_dense] sm:grid-cols-2 lg:grid-cols-4">
          {/* Map — top-right, 2 columns × one tall cell */}
          {locatableCircles.length > 0 && (
            <div className="h-72 sm:col-span-2 lg:col-start-3 lg:row-start-1">
              <MapPreview />
            </div>
          )}

          {/* Navigation — right column, directly under the map */}
          <div className="space-y-6 sm:col-span-2 lg:col-span-1 lg:col-start-4 lg:row-start-2 lg:row-span-2">
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
          </div>

          {/* Circles — yours first, then discover; they fill every other cell */}
          {combined.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 lg:row-start-1">
              <EmptyState
                icon={Users}
                title={filtering ? 'No circles match these filters' : 'No circles yet'}
                description={filtering ? 'Try a wider search, or start the first one for this corner of the network.' : 'Be the first — start a circle for your neighborhood or an interest.'}
                action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
              />
            </div>
          ) : (
            combined.map((c) => (
              <CircleCard key={c.id} circle={toCardData(c)} isMember={myCircleIds.includes(c.id)} />
            ))
          )}
        </div>
      </MapZone>
    </IndexTemplate>
  )
}
