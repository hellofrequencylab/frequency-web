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
  reaction_count, comment_count, engagement_score,
  author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
  reactions:post_reactions ( id, reaction_type, profile_id )
`

export async function FeedList({
  circleIds,
  communityProfileIds = [],
  isAdmin = false,
  myProfileId,
  sort = 'relevant',
  showPublicLayer = true,
  emptyMessage = 'Nothing posted yet. Be the first to share something.',
}: {
  circleIds: string[]
  communityProfileIds?: string[]
  isAdmin?: boolean
  myProfileId: string | null
  sort?: 'recent' | 'relevant'
  /** false on circle/channel detail pages — show only scoped posts, not the global public feed */
  showPublicLayer?: boolean
  emptyMessage?: string
}) {
  const admin = createAdminClient()
  const order = sort === 'relevant' ? 'engagement_score' : 'created_at'

  // ── Posts ──────────────────────────────────────────────────────────────────
  // Composed from up to 3 layers depending on role, then merged + sorted.

  let rawPosts: RawPost[] = []

  if (isAdmin) {
    // Janitor sees everything
    const { data } = await admin
      .from('posts')
      .select(POST_SELECT)
      .is('parent_id', null)
      .order(order, { ascending: false })
      .limit(30)
    rawPosts = (data ?? []) as unknown as RawPost[]
  } else {
    const promises: Promise<{ data: RawPost[] | null }>[] = []

    // Layer 1 — public posts from everyone (main feed only; suppressed on circle/channel pages)
    if (showPublicLayer) {
      promises.push(
        admin
          .from('posts')
          .select(POST_SELECT)
          .eq('visibility', 'public')
          .is('parent_id', null)
          .order(order, { ascending: false })
          .limit(30) as unknown as Promise<{ data: RawPost[] | null }>
      )
    }

    // Layer 2 — circle-scoped posts from circles the viewer is in (Crew+)
    if (circleIds.length > 0) {
      promises.push(
        admin
          .from('posts')
          .select(POST_SELECT)
          .eq('visibility', 'group')
          .in('scope_id', circleIds)
          .is('parent_id', null)
          .order(order, { ascending: false })
          .limit(30) as unknown as Promise<{ data: RawPost[] | null }>
      )
    }

    // Layer 3 — all posts by members of managed community (Host/Guide/Mentor)
    // This surfaces group posts the manager isn't a direct member of,
    // giving hosts/guides/mentors a pulse on their whole community.
    if (communityProfileIds.length > 0) {
      promises.push(
        admin
          .from('posts')
          .select(POST_SELECT)
          .in('author_id', communityProfileIds)
          .is('parent_id', null)
          .order(order, { ascending: false })
          .limit(30) as unknown as Promise<{ data: RawPost[] | null }>
      )
    }

    const results = await Promise.all(promises)
    rawPosts = results.flatMap((r: { data: RawPost[] | null }) => (r.data ?? []))
  }

  // Dedupe + sort
  const seen = new Set<string>()
  const posts: FeedPost[] = rawPosts
    .filter((p: RawPost) => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    .sort((a: RawPost, b: RawPost) =>
      sort === 'relevant'
        ? (b.engagement_score ?? 0) - (a.engagement_score ?? 0)
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 20)
    .map((p: RawPost) => ({ ...p, replyCount: p.comment_count ?? 0 })) as FeedPost[]

  // ── Dispatches ────────────────────────────────────────────────────────────
  // Show the single most recent dispatch relevant to the viewer inline.
  let dispatches: DispatchItem[] = []

  const dispatchSelect = `
    id, title, excerpt, audience_scope, published_at,
    author:profiles!author_id ( display_name ),
    linked_task:crew_tasks!linked_task_id ( id, name )
  `

  const hubIds: string[] = []
  const nexusIds: string[] = []

  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles').select('hub_id').in('id', circleIds)
    const hids = (circles ?? []).map((c: { hub_id: string | null }) => c.hub_id).filter(Boolean) as string[]
    hubIds.push(...hids)
  }
  if (hubIds.length > 0) {
    const { data: hubs } = await admin
      .from('hubs').select('nexus_id').in('id', hubIds)
    const nids = (hubs ?? []).map((h: { nexus_id: string | null }) => h.nexus_id).filter(Boolean) as string[]
    nexusIds.push(...nids)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchPromises: Promise<{ data: DispatchItem[] | null }>[] = [
    admin
      .from('dispatches').select(dispatchSelect)
      .eq('status', 'published').eq('audience_scope', 'circle')
      .in('audience_id', circleIds.length > 0 ? circleIds : ['__none__'])
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>,
  ]
  if (myProfileId) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').eq('author_id', myProfileId)
        .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>
    )
  }
  if (hubIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').eq('audience_scope', 'hub')
        .in('audience_id', hubIds)
        .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>
    )
  }
  if (nexusIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').eq('audience_scope', 'nexus')
        .in('audience_id', nexusIds)
        .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>
    )
  }

  const dispatchResults = await Promise.all(dispatchPromises)
  const allDispatches = dispatchResults.flatMap(r => r.data ?? [])
  const dSeen = new Set<string>()
  dispatches = allDispatches
    .filter((d: DispatchItem) => { if (dSeen.has(d.id)) return false; dSeen.add(d.id); return true })
    .sort((a: DispatchItem, b: DispatchItem) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, 1)

  // ── Merge + render ────────────────────────────────────────────────────────
  type FeedItem =
    | { kind: 'post';     data: FeedPost; date: number }
    | { kind: 'dispatch'; data: DispatchItem; date: number }

  const pinned  = posts.filter(p => p.is_pinned)
  const regular = posts.filter(p => !p.is_pinned)

  const items: FeedItem[] = [
    ...regular.map(p => ({ kind: 'post'     as const, data: p, date: new Date(p.created_at).getTime() })),
    ...dispatches.map(d => ({ kind: 'dispatch' as const, data: d, date: new Date(d.published_at).getTime() })),
  ].sort((a, b) => b.date - a.date)

  if (pinned.length === 0 && items.length === 0) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="space-y-4">
      {pinned.map(post => (
        <PostCard key={post.id} post={post} myProfileId={myProfileId} />
      ))}
      {items.map(item =>
        item.kind === 'post' ? (
          <PostCard key={item.data.id} post={item.data} myProfileId={myProfileId} />
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
