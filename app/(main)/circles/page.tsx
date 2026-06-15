import Link from 'next/link'
import { Users, Compass, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone, MapPreview, MapBanner, FindNearMeButton } from '@/components/circles/circles-map'
import { IndexTemplate } from '@/components/templates'
import { PageContents } from '@/components/templates/page-contents'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard, type CircleCardData } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
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
  channel: { name: string; pillar_id: string | null } | null
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

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Circles',
  description:
    'This is where it gets real. Find a circle near you, dive into something you love, or start your own. Showing up, week after week, is how strangers become your people.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/circles', CONTENT_FALLBACK)
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string; channel?: string }>
}) {
  const { type, interest, sort = 'nearest', q, channel } = await searchParams
  const supabase = await createClient()

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title: pageTitle, description: pageDescription, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/circles', CONTENT_FALLBACK)

  const { data: { user } } = await supabase.auth.getUser()

  let myCircleIds: string[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, community_role, current_season_zaps, lifetime_gems, current_streak')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const p = profile as {
      id: string; community_role: string | null
      current_season_zaps?: number; lifetime_gems?: number; current_streak?: number
    } | null
    if (p) {
      const { data: mems } = await supabase
        .from('memberships').select('circle_id').eq('profile_id', p.id).eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  // Cap the fetch at 500 rows so the query can't scan an unbounded table.
  // Filtering is applied over this set server-side (interest/search/demo/type),
  // so the cap is applied before any filtering — 500 is a generous ceiling that
  // keeps the page fast while accommodating any realistic community size.
  const CIRCLES_FETCH_LIMIT = 500
  let circlesQuery = (supabase)
    .from('circles')
    .select(
      `id, name, slug, about, type, member_count, member_cap, status, created_at,
       latitude, longitude, neighborhood, image_url, is_demo, topical_channel_id,
       channel:topical_channels!topical_channel_id ( name, pillar_id ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id ( id, name, slug, outpost:outposts!outpost_id ( name ) )
       )`
    )
    .neq('status', 'archived')
    .order('name', { ascending: true })
    .limit(CIRCLES_FETCH_LIMIT)
  // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) circlesQuery = circlesQuery.eq('is_demo', false)
  const { data: rawCircles } = await circlesQuery

  const all = (rawCircles ?? []) as unknown as CircleRow[]
  const hitFetchCap = all.length === CIRCLES_FETCH_LIMIT

  const { data: interestRows } = await supabase
    .from('topical_channels').select('id, name, category').order('name')
  const interests = (interestRows ?? []) as { id: string; name: string; category: string }[]

  // Channels (Pillars) drive the table-of-contents filter: group circles by the
  // Pillar their practice belongs to, so tapping one drills into that Channel.
  const { data: domainRows } = await (supabase)
    .from('pillars').select('id, slug, name, display_order').eq('is_active', true)
    .order('display_order', { ascending: true })
  const domains = (domainRows ?? []) as { id: string; slug: string; name: string; display_order: number }[]
  const domainCount = new Map<string, number>()
  for (const c of all) {
    const d = c.channel?.pillar_id
    if (d) domainCount.set(d, (domainCount.get(d) ?? 0) + 1)
  }
  const selectedDomain = channel ? domains.find((d) => d.slug === channel) ?? null : null

  // ── Facets ──────────────────────────────────────────────────────────────
  const qLower = (q ?? '').trim().toLowerCase()
  let filtered = all.filter((c) => {
    if (selectedDomain && c.channel?.pillar_id !== selectedDomain.id) return false
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
  const filtering = !!(type || interest || qLower || channel)

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

  // Table-of-contents filter: All + each Channel (with a circle count). Tapping a
  // Channel drills into just its circles via ?channel=<slug>.
  const channelLinks = [
    { href: '/circles', label: 'All', count: all.length, active: !channel },
    ...domains
      .filter((d) => (domainCount.get(d.id) ?? 0) > 0)
      .map((d) => ({
        href: `/circles?channel=${d.slug}`,
        label: d.name,
        count: domainCount.get(d.id) ?? 0,
        active: channel === d.slug,
      })),
  ]

  return (
    <IndexTemplate
      title={pageTitle}
      action={
        (user || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {user && (
              <NewCircleCompose
                interests={interests}
                buttonLabel="Start a circle"
                buttonClass="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              />
            )}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      description={
        <>
          {/* Mobile leads with a tight one-liner so the stats + actions surface
              without scrolling past a wall of copy; desktop keeps the operator-
              editable full pitch. */}
          <span className="sm:hidden">Find a circle near you, or start your own.</span>
          <span className="hidden sm:inline">{pageDescription}</span>
        </>
      }
    >
      {/* Operator-set hero banner (PX.1) — renders only when set. */}
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt=""
          className="mb-6 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
        />
      )}

      {/* Table of contents — filter circles by Channel. Counts ride quietly on each
          chip (gamified-stat law: member/city counts are inline context, never KPI
          tiles — MEMBER-DESIGN-SYSTEM §2). */}
      <PageContents links={channelLinks} divider={false} />

      <MapZone circles={locatableCircles}>
        {/* Find-near-me opens the map; the stats moved up beside the filter menu and
            "Start a circle" lives in the page header now. */}
        {locatableCircles.length > 0 && (
          <div className="mb-6">
            <FindNearMeButton />
          </div>
        )}

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
                  A full circle is a good problem. It means the next one&rsquo;s ready to start. Open the
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

        {/* Cap notice — only shown when the fetch hit the safety limit. */}
        {hitFetchCap && (
          <p className="mt-3 text-xs text-subtle">
            Showing the first {CIRCLES_FETCH_LIMIT} Circles. Use the filters above to find what you&rsquo;re looking for.
          </p>
        )}

        {/* Expanded map — opens above the grid (the Find-near-me button opens it). */}
        <div className="mt-6">
          <MapBanner />
        </div>

        {/* Two columns: circles flow on the left; the browse nav sits in a STABLE
            right column so it's never orphaned at the bottom. The map leads the
            left column when there are locatable circles. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* Left — map (when present) over the circle grid */}
          <div className="min-w-0 space-y-6">
            {locatableCircles.length > 0 && (
              <div className="h-72">
                <MapPreview />
              </div>
            )}

            {combined.length === 0 ? (
              <EmptyState
                icon={Users}
                title={filtering ? 'No circles match these filters' : 'No circles yet'}
                description={filtering ? 'Try a wider search, or start the first one for this corner of the network.' : 'Be the first to start a circle for your neighborhood or a Channel.'}
                action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {combined.map((c) => (
                  <CircleCard key={c.id} circle={toCardData(c)} isMember={myCircleIds.includes(c.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Right — the browse nav, pinned at the top of its column */}
          <aside className="space-y-6">
            {interestChips.length > 0 && (
              <div>
                <SectionHeader title="Browse by Channel" />
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
        </div>
      </MapZone>
    </IndexTemplate>
  )
}
