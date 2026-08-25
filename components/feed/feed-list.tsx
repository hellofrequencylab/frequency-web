import { Suspense } from 'react'
import Link from 'next/link'
import { MessageSquare, Megaphone, Zap, ArrowRight, CalendarDays, MapPin, CalendarClock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { rankFeedPosts } from '@/lib/feed-rank'
import { blendRank, feedNowMs } from '@/lib/feed/blend-rank'
import { getViewerResonanceMap } from '@/lib/feed/viewer-resonance'
import { FeedPeopleStrip } from './feed-people-strip'
import { viewerHidesDemo } from '@/lib/demo-preference'
import {
  viewerInEventDispatchArea,
  viewerHasActiveRsvp,
  type EventDispatchTarget,
  type DispatchViewerContext,
} from '@/lib/events/dispatch-audience'
import { getMyOrbit } from '@/lib/connections/resonance'
import { buildScopeContextResolver } from '@/lib/feed/post-origin'
import { PostCard, type FeedPost, type RawPost } from './post-card'
import { upcomingEventFloor } from '@/lib/events/upcoming-floor'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { EmptyState } from '@/components/ui/empty-state'

// Day bucketing for the Story lens (matches /journal's grouping voice).
//
// The bucket is the COMMUNITY's calendar day (HOME_TZ), never the server's. This renders in a
// Server Component, and on Vercel the server clock is UTC — so keying off the server's day filed
// everything posted after ~5pm Pacific under "Yesterday", and shifted every weekday label with it.
function dayLabel(iso: string): string {
  const day = dayInZone(new Date(iso), HOME_TZ)
  const today = dayInZone(new Date(), HOME_TZ)
  // Yesterday derived from today's own day string via noon-anchored UTC arithmetic, so a DST
  // change can never make "24 hours ago" land on the wrong calendar day.
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, {
    timeZone: HOME_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

interface DispatchItem {
  id: string
  title: string
  excerpt: string | null
  audience_scope: string
  /** 'event' renders the Event-Dispatch variant (event badge → /events/[slug]). */
  dispatch_type: string | null
  published_at: string
  author: { display_name: string } | null
  linked_task: { id: string; name: string } | null
  /** Resolved when this is an Event Dispatch and the viewer may see it. */
  event: { slug: string; title: string } | null
}

// The dispatch row as the candidate query returns it (event link nested). The
// PostgREST reverse relation may come back as an object or a one-element array;
// the gate normalises both.
interface RawDispatchRow {
  id: string
  title: string
  excerpt: string | null
  audience_scope: string
  dispatch_type: string | null
  published_at: string
  author: { display_name: string } | null
  linked_task: { id: string; name: string } | null
  event_dispatch:
    | { event: EventDispatchTarget & { title: string } | null }
    | { event: EventDispatchTarget & { title: string } | null }[]
    | null
}

/** Unwrap the (possibly array-wrapped) nested event off a candidate dispatch row. */
function eventOf(row: RawDispatchRow): (EventDispatchTarget & { title: string }) | null {
  const ed = Array.isArray(row.event_dispatch) ? row.event_dispatch[0] : row.event_dispatch
  return ed?.event ?? null
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Resolve the viewer's circles + region + home once, for the Event-Dispatch gate. */
async function resolveDispatchViewer(
  admin: AdminClient,
  profileId: string,
  nearby: { lat: number; lng: number; radiusM: number } | null,
): Promise<DispatchViewerContext> {
  // getMyOrbit runs on the authed client (auth.uid() = this viewer), so it returns
  // the VIEWER's resonance set. Empty when resonance is off or there are no
  // connections, which simply means no surrounding-area bleed surfaces for them.
  const [membershipsR, profileR, orbit] = await Promise.all([
    admin.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
    admin.from('profiles').select('nexus_region_id').eq('id', profileId).maybeSingle(),
    getMyOrbit(200),
  ])
  const circleIds = ((membershipsR.data ?? []) as { circle_id: string | null }[])
    .map((m) => m.circle_id)
    .filter((id): id is string => !!id)
  const regionId = (profileR.data as { nexus_region_id: string | null } | null)?.nexus_region_id ?? null
  // Resonance set: hosts the viewer has real co-presence with. The surrounding-area
  // bleed only surfaces an event whose host is in here ("close by who have resonance").
  const resonantHostIds = new Set(orbit.filter((m) => m.resonance > 0).map((m) => m.profileId))
  return { profileId, circleIds, regionId, home: nearby, resonantHostIds }
}

/**
 * Pick the lead Dispatch for the feed from the newest-first candidate window.
 * Ordinary Dispatches lead as before. An Event Dispatch leads only when the viewer
 * may see it: readable + in its audience (guest / hosting Circle / surrounding
 * area). A private event never bleeds. Falls through to the next candidate when an
 * Event Dispatch is gated out, so a regular Dispatch still surfaces.
 */
async function pickLeadDispatch(
  candidates: RawDispatchRow[],
  viewer: DispatchViewerContext,
): Promise<DispatchItem | null> {
  for (const row of candidates) {
    if (row.dispatch_type !== 'event') {
      return toDispatchItem(row, null)
    }
    const event = eventOf(row)
    // A drift between a 'event'-typed dispatch and a missing link is non-surfacing.
    if (!event || !event.slug) continue

    let visible = viewerInEventDispatchArea(event, viewer)
    // Guest reach: an explicit non-muted RSVP also surfaces it, even outside the
    // viewer's Circle / radius. One narrow lookup, only when the area gate missed.
    if (!visible && viewer.profileId) {
      visible = await viewerHasActiveRsvp(event.id, viewer.profileId)
    }
    if (visible) {
      return toDispatchItem(row, { slug: event.slug, title: event.title })
    }
  }
  return null
}

function toDispatchItem(
  row: RawDispatchRow,
  event: { slug: string; title: string } | null,
): DispatchItem {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    audience_scope: row.audience_scope,
    dispatch_type: row.dispatch_type,
    published_at: row.published_at,
    author: row.author,
    linked_task: row.linked_task,
    event,
  }
}

export async function FeedList({
  circleIds = [],
  myProfileId,
  sort = 'relevant',
  showPublicLayer = true,
  emptyMessage = 'Nothing posted yet. Be the first to share something.',
  viewerRole,
  nearby = null,
}: {
  circleIds?: string[]
  myProfileId: string | null
  /** 'story' = the community's record: chronological, day-grouped (§6 Phase 3b).
   *  'relevant' = Resonance (the blended rank); 'popular' = pure engagement order. */
  sort?: 'recent' | 'relevant' | 'nearby' | 'story' | 'popular'
  /** false on circle/channel detail pages. Show only scoped posts, not the global public feed */
  showPublicLayer?: boolean
  emptyMessage?: string
  viewerRole?: string
  /** The member's location for the 'nearby' lens (location-aware feed, ADR-088). */
  nearby?: { lat: number; lng: number; radiusM: number } | null
}) {
  const admin = createAdminClient()

  // Story is a presentation lens over the chronological feed — fetch + rank it as
  // 'recent', then group by day in the render. 'popular' (Most popular) fetches +
  // ranks by raw engagement, which is exactly the RPC's 'relevant' DB ordering; the
  // resonance BLEND below only applies to 'relevant' (Resonance), so 'popular' stays
  // a pure popularity sort.
  const fetchSort = sort === 'story' ? 'recent' : sort === 'popular' ? 'relevant' : sort

  // ── Posts ──────────────────────────────────────────────────────────────────

  let rawPosts: RawPost[] = []

  if (myProfileId) {
    if (!showPublicLayer && circleIds.length > 0) {
      // Circle/channel detail page (RLS convergence surface 4, migration
      // 20260602194223): scoped posts now come from the `scoped_feed_for_viewer`
      // SECURITY DEFINER RPC on the user client — the SAME reach predicate as the
      // main feed, constrained to these scope ids. So it respects per-post
      // visibility (a non-member sees only the scope's PUBLIC posts, not its
      // members-only 'group' posts) while still returning a member's group/cluster
      // posts that the crew+ posts RLS policy would otherwise drop.
      const supabase = (await createClient())
      const { data } = await supabase.rpc('scoped_feed_for_viewer', {
        _scope_ids: circleIds,
        _sort: fetchSort,
        _limit: 30,
      })
      rawPosts = (data as RawPost[] | null) ?? []
    } else {
      // Main feed (RLS convergence, migration 20240309000000): the reach model —
      // public + group in my circles + cluster reachable via a shared hub or a
      // tuned topical channel — now lives in the `feed_for_viewer` SECURITY
      // DEFINER RPC, enforced in the DB and run on the user-scoped client. It
      // returns the author's public fields + reactions safely (so it works for
      // members too, whom the crew+ posts policy would otherwise limit to public).
      const supabase = (await createClient())
      // The 'nearby' lens passes the member's coords + radius so the reconciled
      // feed_for_viewer (geo + demo-aware) returns the closest activity first.
      const rpcArgs: Record<string, unknown> = { _sort: fetchSort, _limit: 40 }
      // Pass the viewer's coords for BOTH the 'nearby' lens (which filters + orders by
      // distance) and the 'relevant' lens (where it only POPULATES distance_m for the
      // blended rank — the RPC orders by distance for 'nearby' alone, so selection is
      // unchanged). Resonance Feed Phase 1 (ADR-414).
      if (nearby && (sort === 'nearby' || sort === 'relevant')) {
        rpcArgs._lat = nearby.lat
        rpcArgs._lng = nearby.lng
        rpcArgs._radius_m = nearby.radiusM
      }
      const { data } = await supabase.rpc('feed_for_viewer', rpcArgs)
      rawPosts = (data as RawPost[] | null) ?? []
    }
  }

  // Member-level beta-content toggle: drop seeded demo posts for an opted-out
  // viewer (the global demo_mode already removes them when it's off). Reused
  // below to gate the nearest-event banner the same way.
  const hideDemoEvents = await viewerHidesDemo()
  if (hideDemoEvents) {
    rawPosts = rawPosts.filter((p) => !(p as { is_demo?: boolean }).is_demo)
  }

  // The "For you" lens (sort='relevant') is the BLENDED resonance rank (Phase 1,
  // ADR-414 → docs/RESONANCE-FEED-ARCHITECTURE.md §3): proximity + graph + recency +
  // engagement, with a diversity rerank. Every other lens stays literal (recency /
  // nearest / chronological). Fail-safe: with no resonance + no geo the blend reduces
  // to recency-led, i.e. today's behavior.
  let ranked: RawPost[]
  if (sort === 'relevant' && myProfileId) {
    const resonance = await getViewerResonanceMap(myProfileId)
    const blendItems = rawPosts.map((p) => ({
      ...p,
      authorId: p.author.id,
      distance_m: (p as { distance_m?: number | null }).distance_m ?? null,
    }))
    ranked = blendRank(blendItems, { nowMs: feedNowMs(), resonance, radiusM: nearby?.radiusM ?? 25000 }, 40)
  } else {
    ranked = rankFeedPosts(rawPosts, fetchSort)
  }
  const posts: FeedPost[] = ranked.map((p) => ({ ...p, replyCount: p.comment_count ?? 0 })) as FeedPost[]

  // ── Resolve scope context (wall, circle, channel, event, space) ───────────
  // The main feed shows posts from everywhere, so each one names its destination
  // in the card's attribution header (author › context). ONE resolver serves the
  // feed and the profile timeline, so the read never drifts between surfaces.
  const resolveScope = await buildScopeContextResolver(posts.map((p) => p.scope_id))
  for (const post of posts) {
    post.scopeContext = resolveScope(post.scope_id, post.author.id)
  }

  // ── Dispatches + nearest event ──────────────────────────────────────────
  let latestDispatch: DispatchItem | null = null
  let nearestEvent: { id: string; title: string; starts_at: string; location: string | null; slug: string } | null = null

  if (myProfileId && showPublicLayer && sort !== 'story') {
    // Event Dispatches (ADR-255) ride this same rail with dispatch_type='event' and
    // link back to their event via event_dispatches. Pull a small candidate window
    // (not just the single latest) so an Event Dispatch the viewer can't reach
    // doesn't hide an ordinary Dispatch they can. The reverse relation gives the
    // linked event's slug + the visibility/scope/geog this code re-checks (the
    // admin client bypasses RLS, so the event gate must run in code).
    const dispatchSelect = `
      id, title, excerpt, audience_scope, dispatch_type, published_at,
      author:profiles!author_id ( display_name ),
      linked_task:crew_tasks!linked_task_id ( id, name ),
      event_dispatch:event_dispatches!dispatch_id (
        event:events!event_id ( id, slug, title, visibility, scope_type, scope_id, host_id, geog )
      )
    `

    const [dispatchR, eventR] = await Promise.all([
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published')
        .is('hidden_at', null)
        .order('published_at', { ascending: false })
        .limit(8),
      // The admin client bypasses RLS, so this banner must re-apply the public
      // listing gate itself (mirrors app/(main)/events/index-data.ts public query):
      // only genuinely public, published, non-circle/space events, and drop demo
      // rows for a viewer who has opted out. Without these, a private / draft /
      // circle-only / standalone event would surface in every member's feed.
      (hideDemoEvents
        ? admin.from('events').select('id, title, starts_at, location, slug')
            .eq('status', 'published')
            .eq('visibility', 'public')
            .eq('scope_type', 'public')
            .eq('is_cancelled', false)
            .eq('is_demo', false)
            .gte('starts_at', upcomingEventFloor())
            .order('starts_at', { ascending: true })
            .limit(1)
        : admin.from('events').select('id, title, starts_at, location, slug')
            .eq('status', 'published')
            .eq('visibility', 'public')
            .eq('scope_type', 'public')
            .eq('is_cancelled', false)
            .gte('starts_at', upcomingEventFloor())
            .order('starts_at', { ascending: true })
            .limit(1)),
    ])

    // Viewer context for the Event-Dispatch gate (visibility + surrounding-area
    // reach). Resolved once; reused for every candidate. `nearby` already carries
    // the member's home + radius from the page.
    const viewer = await resolveDispatchViewer(admin, myProfileId, nearby)

    const candidates = ((dispatchR.data ?? []) as unknown as RawDispatchRow[])
    latestDispatch = await pickLeadDispatch(candidates, viewer)
    nearestEvent = (eventR.data?.[0] as unknown as typeof nearestEvent) ?? null
  }

  // ── Merge + render ────────────────────────────────────────────────────────
  const pinned  = posts.filter(p => p.is_pinned)
  const regular = posts.filter(p => !p.is_pinned)

  // Preserve the RANK for the lenses that computed one. `posts` already arrives ordered: 'relevant'
  // by the blended resonance rank (blendRank) and 'popular' by engagement_score (rankFeedPosts with
  // fetchSort='relevant'). An unconditional re-sort by created_at here threw both away, so tapping
  // "Resonance" or "Most popular" returned a plain reverse-chronological feed identical to
  // "Most recent" — the entire ranking layer computed and then discarded on every render.
  //
  // 'recent' and 'nearby' are genuinely chronological: rankFeedPosts documents that 'nearby' selects
  // WHICH posts (the closest, within radius) while the display order stays recency. So they keep the
  // sort, and for them this is exactly the behaviour it always had. ('story' never reaches here; it
  // builds its own day-grouped list below.)
  const chronological = sort === 'recent' || sort === 'nearby'
  const items = (() => {
    const mapped = regular.map((p) => ({ data: p, date: new Date(p.created_at).getTime() }))
    return chronological ? mapped.sort((a, b) => b.date - a.date) : mapped
  })()

  if (!latestDispatch && !nearestEvent && pinned.length === 0 && items.length === 0) {
    return <FeedEmpty message={emptyMessage} />
  }

  // Story lens: the community's record — everything in time order, grouped by day,
  // no feed furniture (dispatches/events). Pins lose their pin here; a record is
  // chronological, not curated.
  if (sort === 'story') {
    const all = posts
      .map((p) => ({ data: p, date: new Date(p.created_at).getTime() }))
      .sort((a, b) => b.date - a.date)
    const days: { label: string; items: typeof all }[] = []
    for (const it of all) {
      const label = dayLabel(it.data.created_at)
      const last = days[days.length - 1]
      if (last && last.label === label) last.items.push(it)
      else days.push({ label, items: [it] })
    }
    return (
      <div className="space-y-6">
        {days.map((day) => (
          <section key={day.label}>
            <h3 className="mb-2 px-1 text-meta font-bold uppercase tracking-wide text-subtle">{day.label}</h3>
            <div className="space-y-4">
              {day.items.map(({ data: post }) => (
                <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {latestDispatch && <DispatchFeedCard dispatch={latestDispatch} />}
      {nearestEvent && <EventFeedCard event={nearestEvent} />}
      {pinned.map(post => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
      {items.slice(0, 3).map(({ data: post }) => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
      {/* "People you'd click with" rides INSIDE the For-you feed after the first few
          posts (Resonance Feed Phase 1, ADR-414). Streamed behind Suspense so it never
          blocks the post stream; renders nothing when there's no genuine suggestion. */}
      {myProfileId && sort === 'relevant' && (
        <Suspense fallback={null}>
          <FeedPeopleStrip viewerProfileId={myProfileId} />
        </Suspense>
      )}
      {items.slice(3).map(({ data: post }) => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
    </div>
  )
}

// Dispatch card. Sits on the SAME neutral card chrome as posts (one cohesive
// stream); the azure broadcast palette lives in the icon tile + kicker only, so
// it still reads as "broadcast / official" without shouting a tinted banner.
//
// An Event Dispatch (ADR-255, dispatch_type='event') is the third member of the
// Dispatch family: same broadcast rail, but it carries an inline EVENT badge and
// links to the event page (/events/[slug]) instead of /nearby/[id].
function DispatchFeedCard({ dispatch: d }: { dispatch: DispatchItem }) {
  const isEvent = d.dispatch_type === 'event' && d.event != null
  const href = isEvent ? `/events/${d.event!.slug}` : `/nearby/${d.id}`

  return (
    <Link
      href={href}
      className="group block rounded-card border border-border/70 bg-surface px-4 py-3.5 lift-1 transition-colors hover:border-broadcast dark:border-border/60 dark:bg-surface-elevated/80"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-control bg-broadcast-bg flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-broadcast-strong" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-3xs font-black uppercase tracking-widest text-broadcast-strong">
              {isEvent ? 'Dispatch' : `${d.audience_scope} Dispatch`}
            </span>
            {/* Event badge: a lucide icon + "Event" chip in DAWN success tokens, so an
                Event Dispatch reads as event-flavoured on the broadcast rail. */}
            {isEvent && (
              <span className="inline-flex items-center gap-0.5 rounded-pill bg-success-bg px-1.5 py-px text-3xs font-black uppercase tracking-wide text-success">
                <CalendarClock className="w-2.5 h-2.5" /> Event
              </span>
            )}
            {d.linked_task && (
              <span className="text-3xs font-bold text-primary flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-body-sm font-bold text-text group-hover:text-broadcast-strong transition-colors line-clamp-1">
            {d.title}
          </p>
          {/* For an Event Dispatch, name the event under the title so the link's
              destination is obvious; otherwise show the broadcast excerpt. */}
          {isEvent ? (
            <p className="text-meta text-muted line-clamp-1 mt-0.5">{d.event!.title}</p>
          ) : (
            d.excerpt && <p className="text-meta text-muted line-clamp-1 mt-0.5">{d.excerpt}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-2xs text-muted">
              {d.author?.display_name} · {relativeTime(d.published_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-broadcast-strong group-hover:text-broadcast transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  )
}

// Event card. Same neutral card chrome as posts; the teal success palette
// lives in the date tile + kicker, so "happening / show up" still reads at a
// glance without a full tinted banner competing with the stream.
function EventFeedCard({ event: e }: { event: { id: string; title: string; starts_at: string; location: string | null; slug: string } }) {
  const { month, day } = eventDateBadge(e.starts_at)
  const dateStr = formatEventDate(e.starts_at)

  return (
    <Link
      href={`/events/${e.slug}`}
      className="group block rounded-card border border-border/70 bg-surface px-4 py-3.5 lift-1 transition-colors hover:border-success dark:border-border/60 dark:bg-surface-elevated/80"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-control bg-success-bg flex flex-col items-center justify-center">
          <span className="text-3xs font-bold text-success leading-none">{month}</span>
          <span className="text-body-sm font-bold text-success leading-tight">{day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CalendarDays className="w-3 h-3 text-success" />
            <span className="text-3xs font-black uppercase tracking-widest text-success">Upcoming event</span>
          </div>
          <p className="text-body-sm font-bold text-text group-hover:text-success transition-colors line-clamp-1">
            {e.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-2xs text-muted">{dateStr}</span>
            {e.location && (
              <span className="text-2xs text-muted flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" /> {e.location}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-success group-hover:text-success transition-colors shrink-0" />
      </div>
    </Link>
  )
}

// The feed's empty pane composes the KIT EmptyState (components/ui/empty-state) rather than
// re-drawing a dashed card, so "nothing here" reads the same in the feed as everywhere else
// (PAGE-FRAMEWORK: compose, don't author). `emptyMessage` stays one string in the caller's hands
// — every one of them is already written as "Statement. Next step." — so it is split on the first
// sentence boundary into the kit's title + description. A message with no boundary is used whole
// as the title, which is what the old single-paragraph card did.
function FeedEmpty({ message }: { message: string }) {
  const split = message.match(/^(.+?[.!?])\s+(.+)$/)
  return (
    <EmptyState
      icon={MessageSquare}
      title={split ? split[1] : message}
      description={split ? split[2] : undefined}
    />
  )
}
