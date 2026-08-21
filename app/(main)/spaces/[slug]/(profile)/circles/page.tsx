import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { UsersRound, Users, DoorOpen, Settings2, MapPin, Globe } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { listPublicSpaceCircles, myActiveCircleIds, type SpaceCircle } from '@/lib/circles/store'
import { asCircleAccess } from '@/lib/circles/visibility'
import { CircleCard } from '@/components/circles/circle-card'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { JsonLd } from '@/components/json-ld'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

// ── THE PUBLIC CIRCLES TAB (ADR-1094) ───────────────────────────────────────────────────────────
//
// A Space's community IS its Circles (NAMING.md, ADR-1091), and until now there was nowhere to send
// someone who wanted to see them. The profile menu's "Circles" item was an ANCHOR into a six-item
// teaser on Home, and the one route that looked like the right URL was the owner console, which
// notFound()s a visitor. So the most obvious click on a Space profile ended in a 404.
//
// This is that page. It lives INSIDE the `(profile)` route group on purpose: the cover, the identity
// row and the tab menu all come from the group's layout, so this file is only ever the body, and it
// must never declare a second <h1> (the Space's name is the page's one heading). The owner console
// moved to `/manage/circles`, OUTSIDE the group, which is the same public-noun / owner-console split
// Shop already runs.
//
// GATES, in order:
//   • `getVisibleSpaceBySlug` fails closed, so a private Space's tab is unreachable by inheritance.
//   • ROOT is never member-facing (lib/spaces/types.ts). Every PERSONAL circle on the platform is
//     stamped to the root tenant by `stampCircleSpaceId`, so without this guard the root Space's
//     profile would list the whole platform's private circles as "circles this space runs". Same
//     class of bug LIVE-075 just closed across ten event call sites.
//   • The `circles` FUNCTION being switched off is a notFound(), matching how Reviews handles its
//     own switch. The nav gate agrees, so the tab is not offered either.
//
// VISIBILITY is not decided here. `listPublicSpaceCircles` owns axis 1 and applies it in SQL; this
// page only decides whether the viewer is a manager, which is the one fact the reader cannot know.

export const dynamic = 'force-dynamic'

/** Above this many circles the filter row earns its place. Below it, a filter bar over five cards is
 *  noise, so the page shows the grid and nothing else. */
const FILTER_THRESHOLD = 8

/** The most this tab lists. A Space with more than this has a discovery problem the filter row is
 *  not going to solve, and /circles is the surface for it. */
const CAP = 60

type Sort = 'new' | 'active' | 'open'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'new', label: 'Newest' },
  { key: 'active', label: 'Busiest' },
  { key: 'open', label: 'Most room' },
]
const FORMATS = [
  { key: '', label: 'All', Icon: Users },
  { key: 'in-person', label: 'In person', Icon: MapPin },
  { key: 'online', label: 'Online', Icon: Globe },
] as const

// Its OWN canonical + title. Without this the tab inherits the Space ROOT's metadata and declares
// itself a duplicate of a page it is not (FINALIZE-PLAN §9.5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'circles',
    label: 'Circles',
    describe: (brandName) => `Circles you can join at ${brandName}.`,
  })
}

export default async function SpaceCirclesProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ type?: string; sort?: string }>
}) {
  const { slug } = await params
  const { type: rawType, sort: rawSort } = await searchParams

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  // The root tenant is the platform host, never a member-facing Space, and every personal circle
  // is stamped to it. Listing them here would publish the platform's private rooms.
  if (space.type === 'root') notFound()
  setActiveSpace(space)

  const circlesDef = spaceFunctionDef('circles')
  if (circlesDef && !spaceFunctionEnabled(space, circlesDef)) notFound()

  // The ONE fact the reader cannot resolve for itself: may this viewer manage the Space? A manager
  // sees the hidden circles too (they are the ones who hid them) and gets the console link.
  const caps = viewerProfileId ? await getSpaceCapabilities(space, viewerProfileId) : null
  const canManage = caps?.canEditProfile === true

  const [all, myIds] = await Promise.all([
    listPublicSpaceCircles(space.id, { viewerProfileId, limit: CAP, includeHidden: canManage }),
    myActiveCircleIds(viewerProfileId),
  ])

  const brandName = space.brandName ?? space.name

  // HONEST EMPTY, and the nav agrees: `spaceHasVisibleCircles` gates the menu item on the same
  // reader, so a visitor is never offered this tab over an empty page. A direct hit still resolves
  // (a shared link, a crawler) and says plainly that there is nothing yet, rather than 404ing on a
  // Space that genuinely exists.
  if (all.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHead brandName={brandName} slug={space.slug} canManage={canManage} count={0} />
        <EmptyState
          icon={UsersRound}
          title="No circles yet"
          description={
            canManage
              ? 'A circle is where your people meet each other, not just you. Start one and it shows up here.'
              : `${brandName} has not opened a circle up yet.`
          }
          action={
            canManage ? (
              <Link href={`/spaces/${space.slug}/manage/circles`} className={buttonClasses('primary', 'sm')}>
                Start your first circle
              </Link>
            ) : undefined
          }
        />
      </div>
    )
  }

  // Facets read the FULL visible set, never the filtered one, so switching format never changes the
  // counts above the grid.
  const memberTotal = all.reduce((n, c) => n + (c.member_count ?? 0), 0)
  const openTotal = all.filter(isOpenToJoin).length

  const type = rawType === 'in-person' || rawType === 'online' ? rawType : ''
  const sort: Sort = rawSort === 'active' || rawSort === 'open' ? rawSort : 'new'
  const showFilters = all.length >= FILTER_THRESHOLD

  let shown = showFilters && type ? all.filter((c) => c.type === type) : all
  if (showFilters) shown = sortCircles(shown, sort)

  const base = `/spaces/${space.slug}/circles`

  return (
    <div className="space-y-6">
      <SectionHead brandName={brandName} slug={space.slug} canManage={canManage} count={all.length} />

      {/* The signal row earns its place only over a real set. One circle needs no scoreboard. */}
      {all.length > 1 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard bordered size="sm" icon={UsersRound} label="Circles" value={all.length} />
          <StatCard bordered size="sm" icon={Users} label="Members" value={memberTotal} />
          <StatCard bordered size="sm" icon={DoorOpen} label="Open to join" value={openTotal} />
        </div>
      )}

      {showFilters && <FilterRow base={base} type={type} sort={sort} />}

      {shown.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No circles match that"
          description="Nothing in this space meets here right now."
          action={
            <Link href={base} className={buttonClasses('secondary', 'sm')}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <li key={c.id}>
              <CircleCard circle={toCardData(c)} isMember={myIds.has(c.id)} />
            </li>
          ))}
        </ul>
      )}

      {/* ItemList of the circles a VISITOR may see. A manager's extra hidden rows are excluded by
          construction: the filter below is the same axis-1 rule, so a preview never leaks into the
          structured data a crawler reads. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Circles at ${brandName}`,
          itemListElement: all
            .filter((c) => c.unlisted !== true)
            .map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/circles/${c.slug}`,
              name: c.name,
            })),
        }}
      />
    </div>
  )
}

/** The tab's own heading. An <h2>, never an <h1>: the Space's name upstairs is the page's one
 *  heading, and the (profile) chrome already declared it. `font-section` is the page theme's
 *  heading face (ADR-578), the same treatment the Collaborators tab uses. */
function SectionHead({
  brandName,
  slug,
  canManage,
  count,
}: {
  brandName: string
  slug: string
  canManage: boolean
  count: number
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-section text-lead font-bold text-text">Circles</h2>
        <p className="text-body-sm text-muted">
          {count === 0
            ? `Groups that ${brandName} runs.`
            : `Groups that ${brandName} runs. Join one and meet the people in it.`}
        </p>
      </div>
      {canManage && (
        <Link href={`/spaces/${slug}/manage/circles`} className={buttonClasses('secondary', 'sm')}>
          <Settings2 className="h-4 w-4" aria-hidden />
          Manage circles
        </Link>
      )}
    </div>
  )
}

/** Format + sort as plain LINKS, not a client control. The whole tab ships zero client JS of its
 *  own this way, a filtered view is shareable, and the back button behaves. */
function FilterRow({ base, type, sort }: { base: string; type: string; sort: Sort }) {
  const href = (next: { type?: string; sort?: Sort }) => {
    const sp = new URLSearchParams()
    const t = next.type ?? type
    const s = next.sort ?? sort
    if (t) sp.set('type', t)
    if (s !== 'new') sp.set('sort', s)
    const q = sp.toString()
    return q ? `${base}?${q}` : base
  }
  const pill = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-meta font-semibold transition-colors',
      active ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text',
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-0.5 rounded-control bg-surface-elevated p-0.5">
        {FORMATS.map(({ key, label, Icon }) => (
          <Link
            key={key || 'all'}
            href={href({ type: key })}
            aria-current={type === key ? 'page' : undefined}
            className={pill(type === key)}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-0.5 rounded-control bg-surface-elevated p-0.5">
        {SORTS.map(({ key, label }) => (
          <Link
            key={key}
            href={href({ sort: key })}
            aria-current={sort === key ? 'page' : undefined}
            className={pill(sort === key)}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Can a stranger walk in? Open access AND a seat free. Used for the "Open to join" stat, so the
 *  number means what a visitor would take it to mean rather than counting rooms they cannot enter. */
function isOpenToJoin(c: SpaceCircle): boolean {
  if (asCircleAccess(c.access) !== 'open') return false
  const cap = c.member_cap ?? 0
  return cap <= 0 || (c.member_count ?? 0) < cap
}

/** Newest / busiest / most room. `new` is the default and matches the reader's own order, so the
 *  unfiltered page costs no sort at all beyond this copy. */
function sortCircles(rows: SpaceCircle[], sort: Sort): SpaceCircle[] {
  const out = [...rows]
  if (sort === 'active') return out.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
  if (sort === 'open')
    return out.sort((a, b) => roomIn(b) - roomIn(a))
  return out.sort((a, b) => +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))
}

/** Seats left, with an uncapped circle treated as roomy but never infinite (so it does not
 *  permanently outrank a real circle with real space). */
function roomIn(c: SpaceCircle): number {
  const cap = c.member_cap ?? 0
  return cap > 0 ? Math.max(0, cap - (c.member_count ?? 0)) : 0
}

/** SpaceCircle -> the shared CircleCard shape, so a Space's circle reads identically to a circle
 *  anywhere else on the site. `context` is the real neighbourhood when there is one; the card falls
 *  back to "In person" / "Online" on its own when it is null. */
function toCardData(c: SpaceCircle) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    about: c.about,
    type: c.type === 'online' ? ('online' as const) : ('in-person' as const),
    member_count: c.member_count ?? 0,
    member_cap: c.member_cap ?? 0,
    status: c.status,
    context: c.type === 'online' ? null : c.neighborhood,
    imageUrl: c.image_url,
    access: c.access,
  }
}
