import Link from 'next/link'
import { MessageSquare, Megaphone, Zap, ArrowRight, CalendarDays, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime } from '@/lib/utils'
import { PostCard, FeedPost } from './post-card'

interface RawPost {
  id: string
  body: string | null
  post_type: string
  is_pinned: boolean
  created_at: string
  media_urls: string[]
  reaction_count: number | null
  comment_count: number | null
  engagement_score: number | null
  scope_id: string | null
  visibility: string | null
  author: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
  }
  reactions: Array<{
    id: string
    reaction_type: string
    profile_id: string
  }>
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

const POST_SELECT = `
  id, body, post_type, is_pinned, created_at, media_urls,
  reaction_count, comment_count, engagement_score, scope_id, visibility,
  author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
  reactions:post_reactions ( id, reaction_type, profile_id )
`

export async function FeedList({
  circleIds = [],
  myProfileId,
  sort = 'relevant',
  showPublicLayer = true,
  emptyMessage = 'Nothing posted yet. Be the first to share something.',
  viewerRole,
}: {
  circleIds?: string[]
  myProfileId: string | null
  sort?: 'recent' | 'relevant'
  /** false on circle/channel detail pages. Show only scoped posts, not the global public feed */
  showPublicLayer?: boolean
  emptyMessage?: string
  viewerRole?: string
}) {
  const admin = createAdminClient()
  const order = sort === 'relevant' ? 'engagement_score' : 'created_at'

  // ── Posts ──────────────────────────────────────────────────────────────────

  let rawPosts: RawPost[] = []

  if (myProfileId) {
    if (!showPublicLayer && circleIds.length > 0) {
      // Circle/channel detail page. Show only scoped posts
      const { data } = await admin
        .from('posts')
        .select(POST_SELECT)
        .in('scope_id', circleIds)
        .is('parent_id', null)
        .is('hidden_at', null)
        .order(order, { ascending: false })
        .limit(30)
      rawPosts = (data ?? []) as unknown as RawPost[]
    } else {
      // Main feed: public posts + the posts the viewer can actually reach.
      // This mirrors the posts SELECT RLS model (the feed uses the admin
      // client, so visibility is enforced here in code instead):
      //   group   → posts in circles the viewer belongs to (circle-only).
      //   cluster → announcements from the viewer's circles, plus any circle
      //             in a hub they belong to, plus hub-less circles whose
      //             topical channel they follow.
      const { data: myMemberships } = await admin
        .from('memberships')
        .select('circle_id, circles!circle_id ( id, hub_id )')
        .eq('profile_id', myProfileId)
        .eq('status', 'active')

      const myCircleIds = [...new Set(
        (myMemberships ?? []).map((m) => m.circle_id).filter(Boolean) as string[]
      )]
      const myHubIds = [...new Set(
        (myMemberships ?? [])
          .map((m) => m.circles?.hub_id)
          .filter(Boolean) as string[]
      )]

      const { data: myChannels } = await admin
        .from('topical_channel_memberships')
        .select('topical_channel_id')
        .eq('profile_id', myProfileId)
      const myChannelIds = [...new Set(
        (myChannels ?? []).map((c) => c.topical_channel_id).filter(Boolean) as string[]
      )]

      // Circles whose announcements the viewer can reach via a shared hub or a
      // followed topical channel (their own circles are always reachable).
      const announcementCircleIds = new Set<string>(myCircleIds)
      const reachableQueries = []
      if (myHubIds.length > 0) {
        reachableQueries.push(
          admin.from('circles').select('id').in('hub_id', myHubIds)
        )
      }
      if (myChannelIds.length > 0) {
        reachableQueries.push(
          admin.from('circles').select('id').is('hub_id', null).in('topical_channel_id', myChannelIds)
        )
      }
      if (reachableQueries.length > 0) {
        const results = await Promise.all(reachableQueries)
        for (const r of results) {
          for (const c of (r.data ?? []) as { id: string }[]) announcementCircleIds.add(c.id)
        }
      }

      const queries: PromiseLike<{ data: unknown }>[] = [
        admin.from('posts').select(POST_SELECT)
          .eq('visibility', 'public').is('parent_id', null).is('hidden_at', null)
          .order(order, { ascending: false })
          .limit(20),
      ]
      if (myCircleIds.length > 0) {
        queries.push(
          admin.from('posts').select(POST_SELECT)
            .eq('visibility', 'group').in('scope_id', myCircleIds)
            .is('parent_id', null).is('hidden_at', null)
            .order(order, { ascending: false })
            .limit(30)
        )
      }
      if (announcementCircleIds.size > 0) {
        queries.push(
          admin.from('posts').select(POST_SELECT)
            .eq('visibility', 'cluster').in('scope_id', [...announcementCircleIds])
            .is('parent_id', null).is('hidden_at', null)
            .order(order, { ascending: false })
            .limit(30)
        )
      }

      const results = await Promise.all(queries)
      rawPosts = results.flatMap(r => (r.data ?? []) as unknown as RawPost[])
    }
  }

  // Dedupe + sort
  const seen = new Set<string>()
  const posts: FeedPost[] = rawPosts
    .filter((p: RawPost) => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    .sort((a: RawPost, b: RawPost) => {
      if (sort === 'relevant') {
        const diff = (b.engagement_score ?? 0) - (a.engagement_score ?? 0)
        if (diff !== 0) return diff
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    .slice(0, 20)
    .map((p: RawPost) => ({ ...p, replyCount: p.comment_count ?? 0 })) as FeedPost[]

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

  if (myProfileId && showPublicLayer) {
    const dispatchSelect = `
      id, title, excerpt, audience_scope, published_at,
      author:profiles!author_id ( display_name ),
      linked_task:crew_tasks!linked_task_id ( id, name )
    `

    const [dispatchR, eventR] = await Promise.all([
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published')
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

// Dispatch banner. Teal signal palette. Reads as "broadcast / official"
// and stays visually distinct from the green event card and the amber
// announcement post type further down the feed.
function DispatchFeedCard({ dispatch: d }: { dispatch: DispatchItem }) {
  return (
    <Link
      href={`/broadcast/${d.id}`}
      className="group block rounded-2xl border border-signal-bg bg-signal-bg/60 dark:bg-signal-bg/40 shadow-sm px-4 py-3.5 hover:border-signal transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-signal-bg flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-signal-strong" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-signal-strong">
              {d.audience_scope} dispatch
            </span>
            {d.linked_task && (
              <span className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-text group-hover:text-signal-strong transition-colors line-clamp-1">
            {d.title}
          </p>
          {d.excerpt && (
            <p className="text-xs text-muted line-clamp-1 mt-0.5">{d.excerpt}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-subtle">
              {d.author?.display_name} · {relativeTime(d.published_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-signal-strong group-hover:text-signal transition-colors" />
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
  const d = new Date(e.starts_at)
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = d.getDate()
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

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
            <span className="text-[10px] font-black uppercase tracking-widest text-success">Upcoming event</span>
          </div>
          <p className="text-sm font-bold text-text group-hover:text-success transition-colors line-clamp-1">
            {e.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-subtle">{dateStr}</span>
            {e.location && (
              <span className="text-[11px] text-subtle flex items-center gap-0.5">
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
