// The /circles index data layer. Everything the Circles index needs — operator
// content, the faceted + sorted card list, the map inputs, the browse rails, the
// Starter injection, and the flywheel/empty-state flags — assembled in ONE place so
// the page (and, next, the editable block layout) just renders it. Pure server read;
// extracted verbatim from app/(main)/circles/page.tsx so behavior is unchanged.

import { createClient } from '@/lib/supabase/server'
import { resolvePageContent } from '@/lib/page-content'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { getActiveTemplates, templatesEnabled } from '@/lib/circles/templates-data'
import { canCreate as canCreateEntity } from '@/lib/core/load-capabilities'
import type { StarterSeed } from '@/lib/circles/starter-projection'
import type { CircleCardData } from '@/components/circles/circle-card'
import type { CircleBase } from '@/lib/types/circle'
import type { PillarSlug } from '@/lib/pillars'

// Coded defaults for the operator-editable content (ADR-180) — shared by the page
// header and the SEO metadata (generateMetadata).
export const CONTENT_FALLBACK = {
  title: 'Circles',
  description:
    'This is where it gets real. Find a circle near you, dive into something you love, or start your own. Showing up, week after week, is how strangers become your people.',
}

const PILLAR_LABELS: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

// Cap the fetch so the query can't scan an unbounded table. Filtering is applied over
// this set server-side; 500 is a generous ceiling that keeps the page fast.
const CIRCLES_FETCH_LIMIT = 500

type CircleRow = CircleBase & {
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  created_at: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  image_url: string | null
  featured_at: string | null
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
    id: c.id,
    name: c.name,
    slug: c.slug,
    about: c.about,
    type: c.type,
    member_count: c.member_count,
    member_cap: c.member_cap,
    status: c.status,
    context: contextFor(c),
    imageUrl: c.image_url,
    isDemo: c.is_demo,
    isFeatured: !!c.featured_at,
  }
}

export interface CirclesIndexParams {
  type?: string
  interest?: string
  sort?: string
  q?: string
  channel?: string
}

export interface CircleLocatable {
  id: string
  name: string
  slug: string
  latitude: number
  longitude: number
  neighborhood: string | null
}
export interface ChannelLink {
  href: string
  label: string
  count: number
  active: boolean
}
export interface InterestChip {
  id: string
  name: string
  category: string
  count: number
}
export interface NexusRollup {
  name: string
  slug: string
  count: number
}
export interface CircleInterest {
  id: string
  name: string
  category: string
}

export interface CirclesIndexData {
  /** Operator-editable header content (ADR-180), falling back to the coded defaults. */
  content: {
    title: string
    description: string
    heroImage: string | null
    ctaLabel: string | null
    ctaHref: string | null
  }
  signedIn: boolean
  /** Real Crew (or steward/staff) may start a circle; others get the upgrade popup (ADR-414). */
  canCreate: boolean
  interests: CircleInterest[]
  channelLinks: ChannelLink[]
  /** Members first, then Starters to claim, then the rest of discovery. */
  cards: CircleCardData[]
  myCircleIds: string[]
  locatable: CircleLocatable[]
  starterSeeds: StarterSeed[]
  showMap: boolean
  nearlyFullCount: number
  hitFetchCap: boolean
  fetchLimit: number
  filtering: boolean
  interestChips: InterestChip[]
  nexuses: NexusRollup[]
  selectedInterest: string | null
  selectedChannel: string | null
}

/** Assemble everything the /circles index renders, from the URL facets. */
export async function getCirclesIndexData(params: CirclesIndexParams): Promise<CirclesIndexData> {
  const { type, interest, sort = 'nearest', q, channel } = params
  const supabase = await createClient()

  // The genuinely-independent reads overlap in one Promise.all so the page's DB round-trips
  // run concurrently instead of in series — same client, same bindings, same output. Two
  // invariants are preserved: the auth chain stays SERIAL within its own closure (memberships
  // needs the resolved profile id), and the circles read keeps its demo gating BEFORE the query
  // executes, so the facet/sort/myCircles-first tail downstream is byte-for-byte identical.
  const [
    { title, description, heroImage, ctaLabel, ctaHref },
    { user, myCircleIds },
    rawCircles,
    interests,
    domains,
    starterTemplates,
  ] = await Promise.all([
    // Operator-editable page header (ADR-180) — falls back to the coded defaults.
    resolvePageContent('/circles', CONTENT_FALLBACK),
    // Auth → my active circle ids (getUser → profiles → memberships, serial within this closure).
    (async (): Promise<{ user: { id: string } | null; myCircleIds: string[] }> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { user: null, myCircleIds: [] }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, community_role, current_season_zaps, lifetime_gems, current_streak')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      const p = profile as { id: string } | null
      if (!p) return { user, myCircleIds: [] }
      const { data: mems } = await supabase
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', p.id)
        .eq('status', 'active')
      return { user, myCircleIds: (mems ?? []).map((m) => m.circle_id as string) }
    })(),
    // Circles — the discovery set, demo-gated BEFORE the query runs.
    (async (): Promise<CircleRow[]> => {
      let circlesQuery = supabase
        .from('circles')
        .select(
          `id, name, slug, about, type, member_count, member_cap, status, created_at,
           latitude, longitude, neighborhood, image_url, is_demo, featured_at, topical_channel_id,
           channel:topical_channels!topical_channel_id ( name, pillar_id ),
           hub:hubs!hub_id (
             id, name, slug,
             nexus:nexuses!nexus_id ( id, name, slug, outpost:outposts!outpost_id ( name ) )
           )`,
        )
        .neq('status', 'archived')
        .order('name', { ascending: true })
        .limit(CIRCLES_FETCH_LIMIT)
      // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
      if (!(await demoModeEnabled()) || (await viewerHidesDemo())) circlesQuery = circlesQuery.eq('is_demo', false)
      const { data } = await circlesQuery
      return (data ?? []) as unknown as CircleRow[]
    })(),
    // Interest browse rail (all topical channels).
    (async (): Promise<CircleInterest[]> => {
      const { data } = await supabase.from('topical_channels').select('id, name, category').order('name')
      return (data ?? []) as CircleInterest[]
    })(),
    // Channels (Pillars) drive the table-of-contents filter.
    (async (): Promise<{ id: string; slug: string; name: string; display_order: number }[]> => {
      const { data } = await supabase
        .from('pillars')
        .select('id, slug, name, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      return (data ?? []) as { id: string; slug: string; name: string; display_order: number }[]
    })(),
    // Starter Circles — staff blueprints, gated by the master flag.
    (async (): Promise<Awaited<ReturnType<typeof getActiveTemplates>>> =>
      (await templatesEnabled()) ? getActiveTemplates() : [])(),
  ])

  const all = rawCircles
  const hitFetchCap = all.length === CIRCLES_FETCH_LIMIT
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
  else if (sort === 'open')
    filtered = [...filtered].sort((a, b) => b.member_cap - b.member_count - (a.member_cap - a.member_count))
  else filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name)) // "nearest" -> name; the map does real proximity

  const myCircles = filtered.filter((c) => myCircleIds.includes(c.id))
  const discover = filtered.filter((c) => !myCircleIds.includes(c.id))

  // Starter Circles — staff blueprints surfaced as virtual, claim-able circles. Gated by
  // the master flag; they honor the same facets as real circles. The card id is synthetic
  // and links to /circles/starter/<slug>, never to a live circle.
  const starterSeeds: StarterSeed[] = starterTemplates.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    card: t.card,
    oneLiner: t.oneLiner,
    primaryPillar: t.primaryPillar,
  }))
  const starterCards: CircleCardData[] = starterTemplates
    .filter((t) => {
      if (selectedDomain && t.primaryPillar !== selectedDomain.slug) return false
      if (type === 'online') return false // Starters default to in-person
      if (interest) return false // Starters carry no Channel binding
      if (qLower) {
        const hay = `${t.name} ${t.card} ${t.oneLiner}`.toLowerCase()
        if (!hay.includes(qLower)) return false
      }
      return true
    })
    .map((t) => ({
      id: `starter-${t.slug}`,
      name: t.name,
      slug: t.slug,
      about: t.card || t.oneLiner,
      type: 'in-person' as const,
      member_count: 0,
      member_cap: 0,
      status: 'active',
      context: PILLAR_LABELS[t.primaryPillar],
      imageUrl: t.imageUrl,
      isStarter: true,
      primaryPillar: t.primaryPillar,
    }))

  // Members first, then the Starters to claim, then the rest of discovery.
  const cards: CircleCardData[] = [...myCircles.map(toCardData), ...starterCards, ...discover.map(toCardData)]
  const filtering = !!(type || interest || qLower || channel)

  // Near-you data (in-person, located) from the unfiltered set.
  const locatable: CircleLocatable[] = all
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      latitude: c.latitude as number,
      longitude: c.longitude as number,
      neighborhood: c.neighborhood,
    }))

  // The map opens when there are located real circles OR Starters to scatter near the viewer.
  const showMap = locatable.length > 0 || starterSeeds.length > 0

  // Flywheel: circles >=80% of cap are "filling up" — a nudge to open the next door.
  const nearlyFullCount = all.filter((c) => c.member_cap > 0 && c.member_count / c.member_cap >= 0.8).length

  // Interest browse (counts from full set, top by count).
  const interestCount = new Map<string, number>()
  for (const c of all)
    if (c.topical_channel_id) interestCount.set(c.topical_channel_id, (interestCount.get(c.topical_channel_id) ?? 0) + 1)
  const interestChips: InterestChip[] = interests
    .map((i) => ({ ...i, count: interestCount.get(i.id) ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // Region browse (nexus rollup from full set).
  const nexusMap = new Map<string, NexusRollup>()
  for (const c of all) {
    const nx = c.hub?.nexus
    if (nx) {
      const prev = nexusMap.get(nx.id)
      nexusMap.set(nx.id, { name: nx.name, slug: nx.slug, count: (prev?.count ?? 0) + 1 })
    }
  }
  const nexuses = [...nexusMap.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  // Channel quick-filter: All + EVERY active Channel (Pillar), so the full set of tags
  // always shows as the taxonomy — Mind / Body / Spirit / Expression — even at count 0.
  const channelLinks: ChannelLink[] = [
    { href: '/circles', label: 'All', count: all.length, active: !channel },
    ...domains.map((d) => ({
      href: `/circles?channel=${d.slug}`,
      label: d.name,
      count: domainCount.get(d.id) ?? 0,
      active: channel === d.slug,
    })),
  ]

  // Real Crew (or steward/staff) may start a circle; a free member sees the upgrade
  // popup. Cheap — shares the request-cached viewer (ADR-414).
  const canStartCircle = user ? await canCreateEntity('circle.create') : false

  return {
    content: {
      title,
      description,
      heroImage: heroImage ?? null,
      ctaLabel: ctaLabel ?? null,
      ctaHref: ctaHref ?? null,
    },
    signedIn: !!user,
    canCreate: canStartCircle,
    interests,
    channelLinks,
    cards,
    myCircleIds,
    locatable,
    starterSeeds,
    showMap,
    nearlyFullCount,
    hitFetchCap,
    fetchLimit: CIRCLES_FETCH_LIMIT,
    filtering,
    interestChips,
    nexuses,
    selectedInterest: interest ?? null,
    selectedChannel: channel ?? null,
  }
}
