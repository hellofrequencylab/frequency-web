import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Megaphone, Zap, CalendarDays, Users, CircleDot, Radio, ArrowRight } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import { BroadcastCompose } from './broadcast-compose'
import { ContextActions } from '@/components/context-actions'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { SectionHeader } from '@/components/ui/section-header'
import { ModuleCard } from '@/components/modules/module-card'
import { StreamTemplate, PageIntro } from '@/components/templates'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { Suspense } from 'react'
import { NearbyMapHeader, NearbyMapCard } from '@/components/nearby/nearby-map-header'
import { SITE_DESIGN } from '@/lib/theme/design'
import { PageHero, type PageHeroSize, type PageHeroVariant } from '@/components/templates/page-hero'
import { resolveHeaderElement } from '@/lib/elements/header'
import {
  collapseSeriesRows,
  countSeries,
  seriesFetchLimit,
  SERIES_COLUMNS,
  SERIES_WIDE_READ,
  TEASER_CARDS_PER_SERIES,
  type SeriesRow,
} from '@/lib/events/series'
import { pickNewMembers, type NewMemberRow } from '@/lib/nearby/new-members'
import { Avatar } from '@/components/ui/avatar'
import { DIRECTORY_VISIBILITY_COLUMNS } from '@/lib/connections/directory-visibility'
import { scopeDirectoryQuery } from '@/lib/connections/directory-page'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { pickCirclesForming } from '@/lib/nearby/circles-forming'
import { DispatchMarquee } from '@/components/nearby/dispatch-marquee'
import { loadNearbyMapPins } from '@/lib/nearby/map-pins'
import { upcomingEventFloor } from '@/lib/events/upcoming-floor'

// /nearby is the Community Dashboard — the counterpart to the Quest Dashboard
// (/crew), but for community life: what's being announced, what's coming up, and
// what's new to join, all in one place (ADR-097 follow-on). Aggregates dispatches
// (audience-targeted), upcoming events, and freshly-created circles.
//
// The route was /broadcast until ADR-1020; the visible label has always been
// "Around You" and did not change. next.config.ts holds the permanent redirect.
export const dynamic = 'force-dynamic'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'janitor']

type DispatchRow = {
  id: string
  title: string
  excerpt: string | null
  author_id: string
  audience_scope: string
  published_at: string
  author: { display_name: string; avatar_url: string | null } | null
  linked_task: { id: string; name: string } | null
}

type EventRow = {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
  is_cancelled?: boolean | null
  recurrence_type?: string | null
  recurrence_until?: string | null
  parent_event_id?: string | null
}

/** "Coming up" cards. FOUR, on the owner's instruction, and the number is shared with the read's
 *  over-fetch and with the block's row grid so the three cannot drift. */
const COMING_UP_COUNT = 4

/** The header's eyebrow, above the operator-editable title. The same register the other community
 *  headers open on (Circles reads COMMUNITY over "Circles near you"). */
const HERO_EYEBROW = 'Community'
type CircleRow = { id: string; name: string; slug: string; city: string | null; member_count: number; created_at: string }

function eventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** The date chip's two lines. Split out so the Coming up card reads as markup rather than as two
 *  inline `toLocaleDateString` calls with different option bags. */
function eventMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' })
}
function eventDay(iso: string): string {
  return String(new Date(iso).getDate())
}

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Around You',
  description: 'Everything happening around you: announcements, what’s coming up, and what’s new to join.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/nearby', CONTENT_FALLBACK)
}

export default async function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string; scope?: string }>
}) {
  const { compose, scope: scopeParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role, city')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  // Place tree the viewer belongs to (drives dispatch visibility).
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
  const circleIds = (memberships ?? []).map((m) => m.circle_id as string)

  let hubIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
    hubIds = (circles ?? []).map((c) => c.hub_id).filter(Boolean) as string[]
  }
  let nexusIds: string[] = []
  if (hubIds.length > 0) {
    const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = (hubs ?? []).map((h) => h.nexus_id).filter(Boolean) as string[]
  }

  // ── Dispatches visible to this viewer (own + targeted at their place tree) ──
  const baseQuery = () =>
    admin
      .from('dispatches')
      .select(`
        id, title, excerpt, audience_scope, published_at, author_id,
        author:profiles!author_id ( display_name, avatar_url ),
        linked_task:crew_tasks!linked_task_id ( id, name )
      `)
      .eq('status', 'published')
      .is('hidden_at', null)
      .order('published_at', { ascending: false })
      .limit(40)

  const promises: ReturnType<typeof baseQuery>[] = [
    baseQuery().eq('author_id', profile.id),
    // Global (staff/janitor) dispatches reach everyone (Phase D).
    baseQuery().eq('audience_scope', 'global'),
  ]
  if (circleIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'circle').in('audience_id', circleIds))
  if (hubIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'hub').in('audience_id', hubIds))
  if (nexusIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'nexus').in('audience_id', nexusIds))

  const now = new Date()
  const weekAgoIso = new Date(now.getTime() - 7 * 864e5).toISOString()
  const twoWeeksAgoIso = new Date(now.getTime() - 14 * 864e5).toISOString()

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  const [dispatchResults, eventsRes, newCirclesRes, membersRes, circlesCountRes, eventsCountRes, newMembersRes, newMemberRowsRes] = await Promise.all([
    Promise.all(promises),
    // Everything happening soon across the community.
    //
    // ⚠️ These reads use the ADMIN client, which bypasses RLS, so every rule has to be stated
    // here. The comment that used to sit on this line said "events are anon-readable" and that
    // was the whole bug: it justified filtering nothing. `events` carries THREE more axes than
    // `is_cancelled`, and all three have rows in production (measured 2026-08-12) —
    // 2 `circle_only`, 1 `unlisted`, 1 soft-removed. They were all in the past, so the upcoming
    // window looked clean while the hole stayed open for the next one written.
    // 🔴 SELECTS SERIES_COLUMNS AND OVER-FETCHES, because this list FOLDS (ADR-897). Without the
    // fold this block showed "Breathe Connect Expand" twice in five rows — Aug 13 and Aug 20 of one
    // weekly series — which is the same bug the map had and the reason TEASER_CARDS_PER_SERIES
    // exists: a fixed block answers "which gathering", not "which date". Reading only 5 rows and
    // folding afterwards would leave 2 cards, so the read is multiplied first.
    admin.from('events').select(`id, title, slug, location, starts_at, is_cancelled, ${SERIES_COLUMNS}`)
      .eq('is_cancelled', false).gte('starts_at', upcomingEventFloor())
      .eq('status', 'published').eq('visibility', 'public').is('removed_at', null)
      .order('starts_at', { ascending: true }).limit(seriesFetchLimit(COMING_UP_COUNT)),
    // Freshly-created circles to join.
    //
    // 🔴 This is a DISCOVERY surface, so it keys on axis 1 (`unlisted`) — NOT on can_see_circle.
    // The two are different questions and ADR-1015 is explicit about it: an unlisted OPEN circle
    // is still reachable by direct link, so `can_see_circle` says yes about it, and RLS alone
    // would therefore keep listing it here. Discovery is the axis that says no. This predicate is
    // the body of public_circles() (20270227000000), and this file is now on the read-path ratchet
    // in lib/circles/visibility.test.ts, which C1's own sweep missed it off.
    admin.from('circles').select('id, name, slug, city, member_count, created_at')
      .in('status', ['forming', 'active']).eq('unlisted', false)
      .order('created_at', { ascending: false }).limit(30),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    // The count tiles are public face, so they count what a stranger could actually find. Counting
    // the hidden rows too would advertise a community larger than the one on offer.
    admin.from('circles').select('id', { count: 'exact', head: true })
      .in('status', ['forming', 'active']).eq('unlisted', false),
    // 🔴 THE COUNT FOLDS TOO (LIVE-198 / SERIES-COUNT). The block above already collapses this same
    // set to one card per gathering; a `head: true` tally beside it said "21 upcoming events" over a
    // list of five, because recurrence is materialised (ADR-007). A number and the list under it
    // must answer the same question, so this is a row read capped at SERIES_WIDE_READ — the cap
    // this module already uses for a community-wide upcoming read.
    admin.from('events').select(`id, starts_at, is_cancelled, ${SERIES_COLUMNS}`)
      .eq('is_cancelled', false).gte('starts_at', upcomingEventFloor())
      .eq('status', 'published').eq('visibility', 'public').is('removed_at', null)
      .limit(SERIES_WIDE_READ),
    // Joined in the last seven days: one number, no names, so it says the neighborhood is growing
    // without exposing who.
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('created_at', weekAgoIso),
    // The faces behind that number (LIVE-1035). Scoped by the SAME directory gate the Members page
    // uses (active, listed in the directory, not ghosting, the demo gate) and re-checked by the shared
    // predicate in pickNewMembers, because this is a service-role read that answers to no policy.
    scopeDirectoryQuery(
      admin.from('profiles').select(`id, display_name, handle, avatar_url, created_at, is_system, ${DIRECTORY_VISIBILITY_COLUMNS}`),
      { hideDemo },
    )
      .gte('created_at', twoWeeksAgoIso)
      .order('created_at', { ascending: false })
      .limit(24),
  ])

  const seen = new Set<string>()
  const dispatches = dispatchResults
    .flatMap((r) => r.data ?? [])
    .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
    .slice(0, 20) as unknown as DispatchRow[]

  // One card per GATHERING, earliest date first, then the first four.
  const upcomingEvents = collapseSeriesRows((eventsRes.data ?? []) as EventRow[], {
    perSeries: TEASER_CARDS_PER_SERIES,
    dropCancelled: false,
  }).slice(0, COMING_UP_COUNT)
  // The at-a-glance number, folded through the SAME helper as the cards beside it.
  const upcomingEventTotal = countSeries((eventsCountRes.data ?? []) as SeriesRow[])
  // The newest circles, scoped to the viewer's own city when they have set one and it has any
  // (LIVE-1034). The read over-fetches (30) so a city can be found past the community's newest five.
  const newestCircles = (newCirclesRes.data ?? []) as CircleRow[]
  const formingPick = pickCirclesForming(
    newestCircles,
    (profile as { city?: string | null }).city,
  )
  const newCircles = formingPick.circles
  const role = (profile as { community_role: CommunityRole }).community_role
  const broadcastsThisWeek = dispatches.filter((d) => (d.published_at ?? '') >= weekAgoIso).length
  const newMembersCount = newMembersRes.count ?? 0
  const newMembers = pickNewMembers((newMemberRowsRes.data ?? []) as unknown as NewMemberRow[], profile.id)
  const newCirclesCount = newestCircles.slice(0, 5).filter((c) => (c.created_at ?? '') >= twoWeeksAgoIso).length

  // Host+ compose targets.
  const isHost = HOST_PLUS.includes(role)
  let namedCircles: { id: string; name: string }[] = []
  let namedHubs: { id: string; name: string }[] = []
  let namedNexuses: { id: string; name: string }[] = []
  if (isHost && circleIds.length > 0) {
    namedCircles = (await admin.from('circles').select('id, name').in('id', circleIds)).data ?? []
  }
  if (isHost && hubIds.length > 0) {
    namedHubs = (await admin.from('hubs').select('id, name').in('id', hubIds)).data ?? []
  }
  if (isHost && nexusIds.length > 0) {
    namedNexuses = (await admin.from('nexuses').select('id, name').in('id', nexusIds)).data ?? []
  }
  const canCompose = isHost && (namedCircles.length > 0 || namedHubs.length > 0 || namedNexuses.length > 0)

  // Operator-editable page header (ADR-180) + the operator-tunable header ELEMENT (ADR-793: which
  // layout, height and overlay the band paints in). Both are cached reads and neither depends on the
  // other, so they run together.
  const [{ title, description, body, heroImage, ctaLabel, ctaHref }, header] = await Promise.all([
    resolvePageContent('/nearby', CONTENT_FALLBACK),
    resolveHeaderElement({ defaults: { layout: 'overlay', height: 'large' } }),
  ])

  const showCompose = canCompose || role === 'janitor'

  // The page's own actions. They USED to ride the page header; the header is now the map band, whose
  // one control is "View the map" (owner instruction, 2026-08-13). So they moved to the section they
  // act on — a New Dispatch button on the Dispatches header is closer to the thing it creates than a
  // button at the top of the page ever was, and the operator CTA travels with it rather than being
  // dropped.
  const dispatchActions =
    showCompose || (ctaLabel && ctaHref) ? (
      <div className="flex items-center gap-2">
        {showCompose && (
          <BroadcastCompose circles={namedCircles} hubs={namedHubs} nexuses={namedNexuses} canGlobal={role === 'janitor'} defaultOpen={compose === 'true'} initialScopeId={scopeParam} />
        )}
        {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
        {ctaLabel && ctaHref && (
          <a
            href={ctaHref}
            className={buttonClasses('primary', 'sm')}
          >
            {ctaLabel}
          </a>
        )}
      </div>
    ) : undefined

  // ── AT A GLANCE ──────────────────────────────────────────────────────────────────────────────
  // ORDER: Events, Circles, Members, Dispatches. The three things a member came to find lead;
  // the count of announcements, which is the page's own furniture, goes last.
  // 🔴 FOUR LIVE TALLIES, so the camera paints over them (`data-visual-mask`, ADR-1277). Every
  // number here is a database reading that moves without a deploy — this line is the most
  // likely author of LIVE-301's six identical failures, because it renders the SAME glyphs at
  // 1280, 390 and 320, which is what "1347 pixels in every context" looks like.
  const glance = (
    <p data-visual-mask="nearby-glance" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted">
      <span><strong className="font-semibold text-text tabular-nums">{(upcomingEventTotal || upcomingEvents.length).toLocaleString()}</strong> upcoming events</span>
      <span aria-hidden className="text-subtle">·</span>
      <span><strong className="font-semibold text-text tabular-nums">{(circlesCountRes.count ?? 0).toLocaleString()}</strong> circles</span>
      {newCirclesCount > 0 && <span className="text-subtle">({newCirclesCount} new)</span>}
      <span aria-hidden className="text-subtle">·</span>
      <span><strong className="font-semibold text-text tabular-nums">{(membersRes.count ?? 0).toLocaleString()}</strong> members</span>
      <span aria-hidden className="text-subtle">·</span>
      <span><strong className="font-semibold text-text tabular-nums">{dispatches.length}</strong> recent Dispatches</span>
      {broadcastsThisWeek > 0 && <span className="text-subtle">({broadcastsThisWeek} this week)</span>}
    </p>
  )

  // Everything under the divider row except the map, which each design seats differently.
  // ORDER: the Dispatch ticker (what is being said now), the three numbers, what is coming up and
  // forming nearby, the Dispatch stream, then a "do something" row so the page ends on an action
  // rather than a list. Full content width; the old narrow column with empty space beside it is gone.
  const tickerItems = dispatches.slice(0, 12).map((d) => ({
    id: d.id,
    title: d.title,
    authorName: d.author?.display_name ?? null,
    timeLabel: relativeTime(d.published_at),
    linked: !!d.linked_task,
  }))
  const dispatchesAndRail = (
    <div className="space-y-8">
      {tickerItems.length > 0 && <DispatchMarquee items={tickerItems} />}

      {/* ── The numbers: a tap-through tile each, so the stat row is navigation, not decoration ── */}
      <div data-visual-mask="nearby-stat-row" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile href="/events" Icon={CalendarDays} label="Upcoming events" value={upcomingEventTotal || upcomingEvents.length} tone="bg-primary-bg text-primary-strong" />
        <StatTile href="/circles" Icon={CircleDot} label="Circles" value={circlesCountRes.count ?? 0} note={newCirclesCount > 0 ? `${newCirclesCount} new` : undefined} tone="bg-signal-bg text-signal-strong" />
        <StatTile href="/network" Icon={Users} label="Members" value={membersRes.count ?? 0} note={newMembersCount ? `${newMembersCount} joined this week` : undefined} tone="bg-warning-bg text-warning" />
        <StatTile href="#dispatches" Icon={Megaphone} label="Dispatches this week" value={broadcastsThisWeek} tone="bg-broadcast-bg text-broadcast-strong" />
      </div>

      {/* ── Coming up (wide) beside Circles forming (narrow) ── */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-label="Coming up">
          <SectionHeader title="Happening near you" count={upcomingEventTotal || undefined} href="/events" />
          {upcomingEvents.length > 0 ? (
            <div data-visual-mask="nearby-coming-up" className="grid gap-3 sm:grid-cols-2">
              {upcomingEvents.map((e) => {
                const when = dayBadge(e.starts_at, now)
                return (
                  <Link
                    key={e.id}
                    href={`/events/${e.slug}`}
                    className="group flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
                  >
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-control bg-primary-bg text-primary-strong">
                      <span className="text-3xs font-bold uppercase leading-none">{eventMonth(e.starts_at)}</span>
                      <span className="text-body font-bold leading-none">{eventDay(e.starts_at)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      {when && (
                        <span className="mb-0.5 inline-block rounded-full bg-primary px-2 py-px text-3xs font-bold uppercase text-on-primary">{when}</span>
                      )}
                      <span className="block truncate text-body-sm font-semibold leading-tight text-text">{e.title}</span>
                      <span className="mt-0.5 block truncate text-meta leading-tight text-subtle">
                        {eventDate(e.starts_at)}{e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nothing on the calendar yet"
              description="Be the first to put a gathering on it. Hosts can start one in a minute."
              action={<Link href="/events/new" className={buttonClasses('primary', 'sm')}>Host an event</Link>}
            />
          )}
        </section>

        <section aria-label="Circles forming">
          <SectionHeader title={formingPick.city ? `Circles forming in ${formingPick.city}` : 'Circles forming'} href="/circles" />
          {newCircles.length > 0 ? (
            <ModuleCard title="Newest first" visualMask="nearby-new-circles">
              <div className="space-y-0.5">
                {newCircles.map((c) => (
                  <Link key={c.id} href={`/circles/${c.slug}`} className="flex items-center gap-3 rounded-control px-1 py-2 transition-colors hover:bg-surface-elevated">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-signal-bg text-signal-strong">
                      <CircleDot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-semibold text-text">{c.name}</p>
                      <p className="mt-0.5 truncate text-meta text-subtle">
                        {c.member_count} {c.member_count === 1 ? 'member' : 'members'}{c.city ? ` · ${c.city}` : ''}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-subtle" />
                  </Link>
                ))}
              </div>
            </ModuleCard>
          ) : (
            <EmptyState
              icon={CircleDot}
              title="No new circles this week"
              description="Start one around something you care about and the first people to find it will be neighbors."
              action={<Link href="/circles/new" className={buttonClasses('primary', 'sm')}>Start a circle</Link>}
            />
          )}
        </section>
      </div>

      {/* ── New to the community: faces, not a number. Only members the directory would list. ── */}
      {newMembers.length > 0 && (
        <section aria-label="New to the community">
          <SectionHeader title="New to the community" href="/network" />
          <ul data-visual-mask="nearby-new-members" className="flex gap-3 overflow-x-auto pb-1">
            {newMembers.map((m) => (
              <li key={m.id} className="shrink-0">
                <Link
                  href={`/people/${m.handle}`}
                  className="flex w-28 flex-col items-center gap-1.5 rounded-card border border-border bg-surface p-3 text-center lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
                >
                  <Avatar src={m.avatar_url} name={m.display_name ?? ''} size="md" />
                  <span className="w-full truncate text-body-sm font-semibold text-text">{m.display_name}</span>
                  <span className="text-meta text-subtle">Joined {relativeTime(m.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The Dispatch stream, in two columns so it uses the width ── */}
      <section id="dispatches" aria-label="Latest Dispatches" className="scroll-mt-24">
        <SectionHeader
          title="Latest Dispatches"
          count={dispatches.length > 0 ? dispatches.length : undefined}
          action={dispatchActions}
        />
        {dispatches.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No Dispatches yet"
            description="Your hosts and guides post announcements, events, and challenges here. When they do, they scroll across the top of this page."
          />
        ) : (
          /* The cards are the reading, so they are masked; the EmptyState above is design surface
             and is not (an empty column is the same picture on every capture). */
          <div data-visual-mask="nearby-dispatch-list" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dispatches.slice(0, 8).map((d) => (
              <DispatchCard key={d.id} dispatch={d} viewerRole={role} myProfileId={profile.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── One prompt to act, then the doors to the rest of the community ── */}
      <section aria-label="Do something" className="grid gap-3 sm:grid-cols-3">
        <PromptTile href="/events/new" Icon={CalendarDays} title="Host a gathering" body="Put a time and place on the calendar and let the neighborhood find it." tone="bg-primary-bg text-primary-strong" />
        <PromptTile href="/circles/new" Icon={CircleDot} title="Start a circle" body="Gather a few people around one thing you keep coming back to." tone="bg-signal-bg text-signal-strong" />
        <PromptTile href="/channels" Icon={Radio} title="Join a conversation" body="Pick a channel by topic and say hello." tone="bg-broadcast-bg text-broadcast-strong" />
      </section>
    </div>
  )

  // ── FREQUENCY: NO HEADER BAND (owner, 2026-10-14, SCAN-899) ────────────────────────────────────
  // The page opens on the plain member `.head` (PageHeading under Frequency: kicker, h1, meta), with
  // the counts on the divider row beneath it. The map moves into the body, directly above the
  // Dispatches, as a kit panel (NearbyMapCard). Still STREAMED: the fallback is the same card frame
  // at the same height, so the pin read never holds the page and nothing below jumps when it lands.
  if (SITE_DESIGN === 'frequency') {
    return (
      <StreamTemplate eyebrow={HERO_EYEBROW} title={title} description={description} headingLead={glance}>
        {/* The operator's intro copy (page_content.body, ADR-1284), inherited from the site row when
            this section sets none. */}
        <PageIntro text={body} />

        <Suspense fallback={<NearbyMapCard pins={null} />}>
          <NearbyMapCardSection />
        </Suspense>

        {dispatchesAndRail}
      </StreamTemplate>
    )
  }

  return (
    <StreamTemplate
      // ── THE HEADER IS THE MAP ────────────────────────────────────────────────────────────
      // The same header system Events and Circles open on (PageHero, sized and tuned by the
      // `header` element), with the live map behind the scrim instead of a photograph, and one
      // control: View the map, which opens the seam's fullscreen popup (ADR-1034).
      //
      // STREAMED, and that is load-bearing on THIS page. The pin read spans three tables and the
      // header must not wait on it: the fallback is the SAME band at the SAME height with the same
      // eyebrow, heading and subtitle, so the map arrives into a band that is already there and
      // nothing below it moves.
      hero={
        <Suspense
          fallback={
            <PageHero
              eyebrow={HERO_EYEBROW}
              title={title}
              subtitle={description}
              coverImage={heroImage ?? null}
              rawImg={!!heroImage}
              variant={header.layout}
              size={header.height}
              overlay={header.scrim}
            />
          }
        >
          <NearbyMapHeaderSection
            title={title}
            subtitle={description}
            coverImage={heroImage}
            header={header}
          />
        </Suspense>
      }
      // ── AT A GLANCE, ON THE DIVIDER ROW ──────────────────────────────────────────────────
      // Owner instruction 2026-08-13: this line sits "in line with the settings button" rather
      // than on a line of its own beneath it. The header's rule then fills the gap between the
      // two, so the row still reads as a divider carrying a label, not as a toolbar.
      headingLead={glance}
    >
      {/* The operator's intro copy (page_content.body, ADR-1284), inherited from the site row when
          this section sets none. */}
      <PageIntro text={body} />

      {dispatchesAndRail}
    </StreamTemplate>
  )
}

/** "Today" / "Tomorrow" for an event in the next two days, else nothing. Local to the server's
 *  clock, which is the same clock the dates beside it are formatted with. */
function dayBadge(iso: string, now: Date): string | null {
  const start = new Date(iso)
  const days = Math.floor((new Date(start.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 864e5)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return null
}

function StatTile({ href, Icon, label, value, note, tone }: {
  href: string; Icon: React.ElementType; label: string; value: number; note?: string; tone: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-card border border-border bg-surface p-4 lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-lead font-bold leading-none tabular-nums text-text">{value.toLocaleString()}</span>
        <span className="mt-1 block truncate text-meta text-muted">{label}</span>
        {note && <span className="block truncate text-3xs font-semibold text-primary-strong">{note}</span>}
      </span>
    </Link>
  )
}

function PromptTile({ href, Icon, title, body, tone }: {
  href: string; Icon: React.ElementType; title: string; body: string; tone: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-card border border-border bg-surface p-4 lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-control ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex items-center gap-1.5 text-body-sm font-bold text-text">
        {title}
        <ArrowRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="text-meta leading-relaxed text-muted">{body}</span>
    </Link>
  )
}

function DispatchCard({ dispatch: d, viewerRole, myProfileId }: { dispatch: DispatchRow; viewerRole: CommunityRole; myProfileId: string }) {
  const isAuthor = d.author_id === myProfileId
  const showActions = isAuthor || HOST_PLUS.includes(viewerRole)
  const scope = d.audience_scope
    ? d.audience_scope.charAt(0).toUpperCase() + d.audience_scope.slice(1)
    : 'Community'

  return (
    <EntityCard
      href={`/nearby/${d.id}`}
      anchor={
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-primary-bg text-primary-strong">
          {d.linked_task ? <Zap className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
        </div>
      }
      title={d.title}
      context={d.linked_task ? `${scope} · Challenge` : `${scope} Dispatch`}
      description={d.excerpt ?? undefined}
      meta={
        <>
          {d.author && <span>{d.author.display_name}</span>}
          <span>{relativeTime(d.published_at)}</span>
        </>
      }
      action={
        showActions
          ? <ContextActions role={viewerRole} context={{ type: 'dispatch', id: d.id, isAuthor }} />
          : undefined
      }
    />
  )
}

/** The header band's own read, behind its own Suspense boundary so the page paints without it.
 *  Everything the band needs except the pins is already resolved by the page and passed in, which is
 *  why the fallback can render the identical band and the map can land into it without a jump. */
async function NearbyMapHeaderSection({
  title,
  subtitle,
  coverImage,
  header,
}: {
  title: string
  subtitle?: string
  coverImage?: string | null
  header: { layout: PageHeroVariant; height: PageHeroSize; scrim: boolean }
}) {
  const pins = await loadNearbyMapPins()
  return (
    <NearbyMapHeader
      pins={pins}
      eyebrow={HERO_EYEBROW}
      title={title}
      subtitle={subtitle}
      coverImage={coverImage}
      variant={header.layout}
      size={header.height}
      overlay={header.scrim}
    />
  )
}

/** Frequency's map card, behind its own Suspense boundary: the pin read is the only slow part, and
 *  the fallback is the same card with no map in it (NearbyMapCard pins={null}). */
async function NearbyMapCardSection() {
  const pins = await loadNearbyMapPins()
  return <NearbyMapCard pins={pins} />
}
