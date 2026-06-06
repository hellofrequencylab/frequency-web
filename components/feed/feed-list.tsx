import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MessageSquare, Megaphone, Zap, ArrowRight, CalendarDays, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { rankFeedPosts } from '@/lib/feed-rank'
import { viewerHidesDemo } from '@/lib/demo-preference'
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
  published_at: string
  author: { display_name: string } | null
  linked_task: { id: string; name: string } | null
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
      const supabase = (await createClient()) as unknown as SupabaseClient
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
      const supabase = (await createClient()) as unknown as SupabaseClient
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
    const dispatchSelect = `
      id, title, excerpt, audience_scope, published_at,
      author:profiles!author_id ( display_name ),
      linked_task:crew_tasks!linked_task_id ( id, name )
    `

    const [dispatchR, eventR] = await Promise.all([
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published')
        .is('hidden_at', null)
        .order('published_at', { ascending: false })
        .limit(1),
      admin.from('events').select('id, title, starts_at, location, slug')
        .eq('is_cancelled', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(1),
    ])

    latestDispatch = ((dispatchR.data ?? []) as unknown as DispatchItem[])[0] ?? null
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
function DispatchFeedCard({ dispatch: d }: { dispatch: DispatchItem }) {
  return (
    <Link
      href={`/broadcast/${d.id}`}
      className="group block rounded-2xl border border-broadcast-bg bg-broadcast-bg/60 dark:bg-broadcast-bg/40 shadow-sm px-4 py-3.5 hover:border-broadcast transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-broadcast-bg flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-broadcast-strong" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-3xs font-black uppercase tracking-widest text-broadcast-strong">
              {d.audience_scope} broadcast
            </span>
            {d.linked_task && (
              <span className="text-3xs font-bold text-primary flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-text group-hover:text-broadcast-strong transition-colors line-clamp-1">
            {d.title}
          </p>
          {d.excerpt && (
            <p className="text-xs text-muted line-clamp-1 mt-0.5">{d.excerpt}</p>
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
