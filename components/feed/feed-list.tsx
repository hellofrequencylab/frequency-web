import Link from 'next/link'
import { MessageSquare, Megaphone, Zap, ArrowRight, CalendarDays, MapPin, CalendarClock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { rankFeedPosts } from '@/lib/feed-rank'
import { viewerHidesDemo } from '@/lib/demo-preference'
import {
  viewerInEventDispatchArea,
  viewerHasActiveRsvp,
  type EventDispatchTarget,
  type DispatchViewerContext,
} from '@/lib/events/dispatch-audience'
import { getMyOrbit } from '@/lib/connections/resonance'
import { PostCard, type FeedPost, type RawPost } from './post-card'

// Day bucketing for the Story lens (matches /journal's grouping voice).
function dayLabel(iso: string): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
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
  /** 'story' = the community's record: chronological, day-grouped (§6 Phase 3b). */
  sort?: 'recent' | 'relevant' | 'nearby' | 'story'
  /** false on circle/channel detail pages. Show only scoped posts, not the global public feed */
  showPublicLayer?: boolean
  emptyMessage?: string
  viewerRole?: string
  /** The member's location for the 'nearby' lens (location-aware feed, ADR-088). */
  nearby?: { lat: number; lng: number; radiusM: number } | null
}) {
  const admin = createAdminClient()

  // Story is a presentation lens over the chronological feed — fetch + rank it as
  // 'recent', then group by day in the render.
  const fetchSort = sort === 'story' ? 'recent' : sort

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
      if (sort === 'nearby' && nearby) {
        rpcArgs._lat = nearby.lat
        rpcArgs._lng = nearby.lng
        rpcArgs._radius_m = nearby.radiusM
      }
      const { data } = await supabase.rpc('feed_for_viewer', rpcArgs)
      rawPosts = (data as RawPost[] | null) ?? []
    }
  }

  // Member-level beta-content toggle: drop seeded demo posts for an opted-out
  // viewer (the global demo_mode already removes them when it's off).
  if (await viewerHidesDemo()) {
    rawPosts = rawPosts.filter((p) => !(p as { is_demo?: boolean }).is_demo)
  }

  const posts: FeedPost[] = rankFeedPosts(rawPosts, fetchSort).map(
    (p) => ({ ...p, replyCount: p.comment_count ?? 0 }),
  ) as FeedPost[]

  // ── Resolve scope context (wall, circle, channel) ─────────────────────────
  const scopeIds = [...new Set(posts.map(p => p.scope_id).filter(Boolean) as string[])]
  const scopeMap: Record<string, { type: 'wall' | 'circle' | 'channel'; name: string; href: string; avatar_url?: string | null; handle?: string }> = {}

  if (scopeIds.length > 0) {
    const [profileScopes, circleScopes, channelScopes] = await Promise.all([
      admin.from('profiles').select('id, display_name, handle, avatar_url').in('id', scopeIds),
      admin.from('circles').select('id, name, slug').in('id', scopeIds),
      admin.from('channels').select('id, name').in('id', scopeIds),
    ])
    for (const c of (circleScopes.data ?? []) as { id: string; name: string; slug: string }[]) {
      scopeMap[c.id] = { type: 'circle', name: c.name, href: `/circles/${c.slug}` }
    }
    for (const ch of (channelScopes.data ?? []) as { id: string; name: string }[]) {
      if (!scopeMap[ch.id]) scopeMap[ch.id] = { type: 'channel', name: ch.name, href: `/channels/${ch.id}` }
    }
    for (const p of (profileScopes.data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[]) {
      if (!scopeMap[p.id]) scopeMap[p.id] = { type: 'wall', name: p.display_name, href: `/people/${p.handle}`, avatar_url: p.avatar_url, handle: p.handle }
    }
  }

  for (const post of posts) {
    const sid = post.scope_id as string | undefined
    if (sid && scopeMap[sid]) {
      const scope = scopeMap[sid]
      if (scope.type === 'wall') {
        if (post.author.id !== sid) {
          post.scopeContext = scope
        }
      } else {
        post.scopeContext = scope
      }
    }
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
      admin.from('events').select('id, title, starts_at, location, slug')
        .eq('is_cancelled', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(1),
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

  const items = regular
    .map(p => ({ data: p, date: new Date(p.created_at).getTime() }))
    .sort((a, b) => b.date - a.date)

  if (!latestDispatch && !nearestEvent && pinned.length === 0 && items.length === 0) {
    return <EmptyState message={emptyMessage} />
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
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-subtle">{day.label}</h3>
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
      {items.map(({ data: post }) => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
    </div>
  )
}

// Dispatch banner. Azure broadcast palette. Reads as "broadcast / official"
// and stays visually distinct from the green event card and the amber
// announcement post type further down the feed.
//
// An Event Dispatch (ADR-255, dispatch_type='event') is the third member of the
// Dispatch family: same broadcast rail, but it carries an inline EVENT badge and
// links to the event page (/events/[slug]) instead of /broadcast/[id].
function DispatchFeedCard({ dispatch: d }: { dispatch: DispatchItem }) {
  const isEvent = d.dispatch_type === 'event' && d.event != null
  const href = isEvent ? `/events/${d.event!.slug}` : `/broadcast/${d.id}`

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-broadcast-bg bg-broadcast-bg/60 dark:bg-broadcast-bg/40 shadow-sm px-4 py-3.5 hover:border-broadcast transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-broadcast-bg flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-broadcast-strong" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-3xs font-black uppercase tracking-widest text-broadcast-strong">
              {isEvent ? 'Dispatch' : `${d.audience_scope} broadcast`}
            </span>
            {/* Event badge: a lucide icon + "Event" chip in DAWN success tokens, so an
                Event Dispatch reads as event-flavoured on the broadcast rail. */}
            {isEvent && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success-bg px-1.5 py-px text-3xs font-black uppercase tracking-wide text-success">
                <CalendarClock className="w-2.5 h-2.5" /> Event
              </span>
            )}
            {d.linked_task && (
              <span className="text-3xs font-bold text-primary flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-text group-hover:text-broadcast-strong transition-colors line-clamp-1">
            {d.title}
          </p>
          {/* For an Event Dispatch, name the event under the title so the link's
              destination is obvious; otherwise show the broadcast excerpt. */}
          {isEvent ? (
            <p className="text-xs text-muted line-clamp-1 mt-0.5">{d.event!.title}</p>
          ) : (
            d.excerpt && <p className="text-xs text-muted line-clamp-1 mt-0.5">{d.excerpt}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-2xs text-subtle">
              {d.author?.display_name} · {relativeTime(d.published_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-broadcast-strong group-hover:text-broadcast transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  )
}

// Event banner. Green success palette. Reads as "happening / alive / show
// up" and stays visually distinct from the teal dispatch above and the
// amber announcement below.
function EventFeedCard({ event: e }: { event: { id: string; title: string; starts_at: string; location: string | null; slug: string } }) {
  const { month, day } = eventDateBadge(e.starts_at)
  const dateStr = formatEventDate(e.starts_at)

  return (
    <Link
      href={`/events/${e.slug}`}
      className="group block rounded-2xl border border-success-bg bg-success-bg/60 dark:bg-success-bg/40 shadow-sm px-4 py-3.5 hover:border-success transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-success-bg flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold text-success leading-none">{month}</span>
          <span className="text-sm font-bold text-success leading-tight">{day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CalendarDays className="w-3 h-3 text-success" />
            <span className="text-3xs font-black uppercase tracking-widest text-success">Upcoming event</span>
          </div>
          <p className="text-sm font-bold text-text group-hover:text-success transition-colors line-clamp-1">
            {e.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-2xs text-subtle">{dateStr}</span>
            {e.location && (
              <span className="text-2xs text-subtle flex items-center gap-0.5">
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
      <MessageSquare className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}
