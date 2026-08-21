import { notFound } from 'next/navigation'
import Link from 'next/link'
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
import { StreamTemplate } from '@/components/templates'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { Suspense } from 'react'
import { NearbyMapHeader } from '@/components/nearby/nearby-map-header'
import { PageHero, type PageHeroSize, type PageHeroVariant } from '@/components/templates/page-hero'
import { resolveHeaderElement } from '@/lib/elements/header'
import {
  collapseSeriesRows,
  seriesFetchLimit,
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
} from '@/lib/events/series'
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
    .select('id, community_role')
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

  const [dispatchResults, eventsRes, newCirclesRes, membersRes, circlesCountRes, eventsCountRes] = await Promise.all([
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
      .order('created_at', { ascending: false }).limit(5),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    // The count tiles are public face, so they count what a stranger could actually find. Counting
    // the hidden rows too would advertise a community larger than the one on offer.
    admin.from('circles').select('id', { count: 'exact', head: true })
      .in('status', ['forming', 'active']).eq('unlisted', false),
    admin.from('events').select('id', { count: 'exact', head: true })
      .eq('is_cancelled', false).gte('starts_at', upcomingEventFloor())
      .eq('status', 'published').eq('visibility', 'public').is('removed_at', null),
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
  const newCircles = (newCirclesRes.data ?? []) as CircleRow[]
  const role = (profile as { community_role: CommunityRole }).community_role
  const broadcastsThisWeek = dispatches.filter((d) => (d.published_at ?? '') >= weekAgoIso).length
  const newCirclesCount = newCircles.filter((c) => (c.created_at ?? '') >= twoWeeksAgoIso).length

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

  const latest = dispatches[0]

  // Operator-editable page header (ADR-180) + the operator-tunable header ELEMENT (ADR-793: which
  // layout, height and overlay the band paints in). Both are cached reads and neither depends on the
  // other, so they run together.
  const [{ title, description, heroImage, ctaLabel, ctaHref }, header] = await Promise.all([
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    ) : undefined

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
      //
      // ORDER: Events, Circles, Members, Dispatches. The three things a member came to find lead;
      // the count of announcements, which is the page's own furniture, goes last.
      headingLead={
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted">
          <span><strong className="font-semibold text-text tabular-nums">{(eventsCountRes.count ?? upcomingEvents.length).toLocaleString()}</strong> upcoming events</span>
          <span aria-hidden className="text-subtle">·</span>
          <span><strong className="font-semibold text-text tabular-nums">{(circlesCountRes.count ?? 0).toLocaleString()}</strong> circles</span>
          {newCirclesCount > 0 && <span className="text-subtle">({newCirclesCount} new)</span>}
          <span aria-hidden className="text-subtle">·</span>
          <span><strong className="font-semibold text-text tabular-nums">{(membersRes.count ?? 0).toLocaleString()}</strong> members</span>
          <span aria-hidden className="text-subtle">·</span>
          <span><strong className="font-semibold text-text tabular-nums">{dispatches.length}</strong> recent Dispatches</span>
          {broadcastsThisWeek > 0 && <span className="text-subtle">({broadcastsThisWeek} this week)</span>}
        </p>
      }
    >
      {/* ── Highlight hero: the latest Dispatch ──────────────────────────────────────────────
              The "next event" FALLBACK that used to sit here is gone: the four Coming up cards
              beside the map now do that job, with four gatherings instead of one. Keeping both
              would have led the page with the same event twice. */}
      {latest ? (
        <Link
          href={`/nearby/${latest.id}`}
          className="mb-6 flex items-center gap-4 rounded-2xl border border-primary-bg bg-primary-bg/40 p-5 transition-colors hover:bg-primary-bg/60 dark:bg-primary-bg/15 dark:hover:bg-primary-bg/25"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
            {latest.linked_task ? <Zap className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-meta font-medium text-subtle">Latest Dispatch</p>
            <p className="text-body font-bold leading-tight text-text">{latest.title}</p>
            {latest.excerpt && <p className="mt-0.5 line-clamp-1 text-body-sm leading-relaxed text-muted">{latest.excerpt}</p>}
          </div>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-primary-strong sm:block" />
        </Link>
      ) : null}

      {/* ── Main: broadcasts (left) + happenings (right) ─────── */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <SectionHeader
            title="Latest Dispatches"
            count={dispatches.length > 0 ? dispatches.length : undefined}
            action={dispatchActions}
          />
          {dispatches.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No Dispatches yet"
              description="Your hosts and guides post announcements, events, and challenges here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {dispatches.map((d) => (
                <DispatchCard key={d.id} dispatch={d} viewerRole={role} myProfileId={profile.id} />
              ))}
            </div>
          )}
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-72">
          {/* ── COMING UP ────────────────────────────────────────────────────────────────────
              The four next GATHERINGS (one card per series, not one per date). This block used to
              sit beside the map in the main column, height-matched to it; the map is the page
              header now, so it moved to the rail, which is where the retired "Happening soon"
              block used to render the same four events off a second, unfolded read. There is still
              exactly ONE of these on the page and it is still fed by `upcomingEvents`. */}
          {upcomingEvents.length > 0 && (
            <div>
              <SectionHeader title="Coming up" count={eventsCountRes.count ?? undefined} href="/events" />
              <div className="grid gap-2">
                {upcomingEvents.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.slug}`}
                    className="group flex min-h-0 items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface px-2.5 py-2 lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
                  >
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                      <span className="text-3xs font-bold uppercase leading-none">{eventMonth(e.starts_at)}</span>
                      <span className="text-body-sm font-bold leading-none">{eventDay(e.starts_at)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold leading-tight text-text">{e.title}</span>
                      <span className="mt-0.5 block truncate text-meta leading-tight text-subtle">
                        {eventDate(e.starts_at)}{e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick links across community surfaces */}
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/events" Icon={CalendarDays} label="Events" sub="What’s on" color="bg-primary-bg text-primary-strong" />
            <QuickLink href="/circles" Icon={CircleDot} label="Circles" sub="Find your people" color="bg-signal-bg text-signal-strong" />
            <QuickLink href="/channels" Icon={Radio} label="Channels" sub="By topic" color="bg-broadcast-bg text-broadcast-strong" />
            <QuickLink href="/network" Icon={Users} label="Directory" sub="The community" color="bg-warning-bg text-warning" />
          </div>

          {/* "Happening soon" USED TO SIT HERE and is gone deliberately. It rendered the exact
              same `upcomingEvents` array the Coming up cards beside the map now render, so keeping
              it would have printed the next four gatherings twice on one page, a screen apart.
              (It was also the block that showed "Breathe Connect Expand" twice in five rows: it
              never applied the series fold, which is fixed at the read now.) */}

          {newCircles.length > 0 && (
            <ModuleCard title="New circles">
              <div className="space-y-0.5">
                {newCircles.map((c) => (
                  <Link key={c.id} href={`/circles/${c.slug}`} className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal-bg text-signal-strong">
                      <CircleDot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-semibold text-text">{c.name}</p>
                      <p className="mt-0.5 truncate text-meta text-subtle">
                        {c.member_count} {c.member_count === 1 ? 'member' : 'members'}{c.city ? ` · ${c.city}` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </ModuleCard>
          )}
        </div>
      </div>
    </StreamTemplate>
  )
}

function QuickLink({ href, Icon, label, sub, color }: {
  href: string; Icon: React.ElementType; label: string; sub: string; color: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-surface p-3 lift-1 transition-colors hover:border-primary-bg dark:hover:border-primary"
    >
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-control ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-body-sm font-semibold leading-none text-text">{label}</div>
      <div className="mt-0.5 text-meta text-muted">{sub}</div>
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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
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
