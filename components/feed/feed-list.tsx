import Link from 'next/link'
import { MessageSquare, Megaphone, Zap, ArrowRight } from 'lucide-react'
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
  /** false on circle/channel detail pages — show only scoped posts, not the global public feed */
  showPublicLayer?: boolean
  emptyMessage?: string
  viewerRole?: string
}) {
  const admin = createAdminClient()
  const order = sort === 'relevant' ? 'engagement_score' : 'created_at'

  // ── Posts ──────────────────────────────────────────────────────────────────
  // All logged-in users see all posts. Visibility scoping will be re-added
  // when the Friends feature lands.

  let rawPosts: RawPost[] = []

  if (myProfileId) {
    let query = admin
      .from('posts')
      .select(POST_SELECT)
      .is('parent_id', null)
      .order(order, { ascending: false })
      .limit(30)

    if (!showPublicLayer && circleIds.length > 0) {
      query = query.in('scope_id', circleIds)
    }

    const { data } = await query
    rawPosts = (data ?? []) as unknown as RawPost[]
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
  const scopeMap: Record<string, { type: 'wall' | 'circle' | 'channel'; name: string; href: string }> = {}

  if (scopeIds.length > 0) {
    const [profileScopes, circleScopes, channelScopes] = await Promise.all([
      admin.from('profiles').select('id, display_name, handle').in('id', scopeIds),
      admin.from('circles').select('id, name, slug').in('id', scopeIds),
      admin.from('channels').select('id, name').in('id', scopeIds),
    ])
    for (const c of (circleScopes.data ?? []) as { id: string; name: string; slug: string }[]) {
      scopeMap[c.id] = { type: 'circle', name: c.name, href: `/circles/${c.slug}` }
    }
    for (const ch of (channelScopes.data ?? []) as { id: string; name: string }[]) {
      if (!scopeMap[ch.id]) scopeMap[ch.id] = { type: 'channel', name: ch.name, href: `/channels/${ch.id}` }
    }
    for (const p of (profileScopes.data ?? []) as { id: string; display_name: string; handle: string }[]) {
      if (!scopeMap[p.id]) scopeMap[p.id] = { type: 'wall', name: p.display_name, href: `/people/${p.handle}` }
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

  // ── Dispatches ────────────────────────────────────────────────────────────
  // All logged-in users see the latest published dispatch pinned to top.
  let dispatches: DispatchItem[] = []

  const dispatchSelect = `
    id, title, excerpt, audience_scope, published_at,
    author:profiles!author_id ( display_name ),
    linked_task:crew_tasks!linked_task_id ( id, name )
  `

  if (myProfileId) {
    const { data } = await admin
      .from('dispatches')
      .select(dispatchSelect)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
    dispatches = (data ?? []) as unknown as DispatchItem[]
  }

  // ── Merge + render ────────────────────────────────────────────────────────
  type FeedItem =
    | { kind: 'post';     data: FeedPost; date: number }
    | { kind: 'dispatch'; data: DispatchItem; date: number }

  const pinned  = posts.filter(p => p.is_pinned)
  const regular = posts.filter(p => !p.is_pinned)

  const latestDispatch = dispatches[0] ?? null

  const items: FeedItem[] = [
    ...regular.map(p => ({ kind: 'post'     as const, data: p, date: new Date(p.created_at).getTime() })),
    ...dispatches.slice(1).map(d => ({ kind: 'dispatch' as const, data: d, date: new Date(d.published_at).getTime() })),
  ].sort((a, b) => b.date - a.date)

  if (!latestDispatch && pinned.length === 0 && items.length === 0) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="space-y-4">
      {latestDispatch && <DispatchFeedCard dispatch={latestDispatch} />}
      {pinned.map(post => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} viewerRole={viewerRole} />
      ))}
      {items.map(item =>
        item.kind === 'post' ? (
          <PostCard key={item.data.id} post={item.data} myProfileId={myProfileId} viewerRole={viewerRole} />
        ) : (
          <DispatchFeedCard key={item.data.id} dispatch={item.data} />
        )
      )}
    </div>
  )
}

function DispatchFeedCard({ dispatch: d }: { dispatch: DispatchItem }) {
  return (
    <Link
      href={`/broadcast/${d.id}`}
      className="group block rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/10 shadow-sm px-4 py-3.5 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-indigo-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              {d.audience_scope} dispatch
            </span>
            {d.linked_task && (
              <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
            {d.title}
          </p>
          {d.excerpt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{d.excerpt}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-gray-400">
              {d.author?.display_name} · {relativeTime(d.published_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-indigo-300 dark:text-indigo-700 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
      <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}
