import Link from 'next/link'
import { MessageSquare, Megaphone, Zap, ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime } from '@/lib/utils'
import { PostCard, FeedPost } from './post-card'

export async function FeedList({
  scopeIds,
  myProfileId,
  emptyMessage = 'Nothing posted yet. Be the first to share something.',
}: {
  scopeIds: string[]
  myProfileId: string | null
  emptyMessage?: string
}) {
  if (scopeIds.length === 0) {
    return <EmptyState message="Join a group to see posts here." />
  }

  const admin = createAdminClient()

  // ── Posts ──────────────────────────────────────────────────────────────────
  const { data: raw } = await admin
    .from('posts')
    .select(
      `id, body, post_type, is_pinned, created_at, media_urls,
       author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
       reactions:post_reactions ( id, reaction_type, profile_id )`
    )
    .in('scope_id', scopeIds)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  const posts = (raw ?? []) as unknown as FeedPost[]

  // ── Dispatches scoped to user's communities ────────────────────────────────
  let dispatches: any[] = []

  // Get hub IDs for the user's circles
  const { data: circles } = await admin
    .from('circles')
    .select('hub_id')
    .in('id', scopeIds)
  const hubIds = (circles ?? []).map((c: any) => c.hub_id).filter(Boolean) as string[]

  // Get nexus IDs for those hubs
  let nexusIds: string[] = []
  if (hubIds.length > 0) {
    const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = (hubs ?? []).map((h: any) => h.nexus_id).filter(Boolean) as string[]
  }

  const dispatchSelect = `id, title, excerpt, audience_scope, published_at,
               author:profiles!author_id ( display_name ),
               linked_task:crew_tasks!linked_task_id ( id, name )`

  // Fetch dispatches for all audience scopes + own authored dispatches in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchPromises: any[] = [
    admin
      .from('dispatches')
      .select(dispatchSelect)
      .eq('status', 'published')
      .eq('audience_scope', 'circle')
      .in('audience_id', scopeIds)
      .order('published_at', { ascending: false })
      .limit(5),
  ]

  // Always include dispatches authored by the viewer (they see their own content)
  if (myProfileId) {
    dispatchPromises.push(
      admin
        .from('dispatches')
        .select(dispatchSelect)
        .eq('status', 'published')
        .eq('author_id', myProfileId)
        .order('published_at', { ascending: false })
        .limit(5)
    )
  }

  if (hubIds.length > 0) {
    dispatchPromises.push(
      admin
        .from('dispatches')
        .select(dispatchSelect)
        .eq('status', 'published')
        .eq('audience_scope', 'hub')
        .in('audience_id', hubIds)
        .order('published_at', { ascending: false })
        .limit(5)
    )
  }

  if (nexusIds.length > 0) {
    dispatchPromises.push(
      admin
        .from('dispatches')
        .select(dispatchSelect)
        .eq('status', 'published')
        .eq('audience_scope', 'nexus')
        .in('audience_id', nexusIds)
        .order('published_at', { ascending: false })
        .limit(5)
    )
  }

  const dispatchResults = await Promise.all(dispatchPromises)
  const allDispatches = dispatchResults.flatMap(r => r.data ?? [])
  const seen = new Set<string>()
  dispatches = allDispatches
    .filter((d: any) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, 5)

  // ── Merge posts + dispatch cards, sort by date ─────────────────────────────
  type FeedItem =
    | { kind: 'post';     data: FeedPost; date: number }
    | { kind: 'dispatch'; data: any;      date: number }

  const pinned  = posts.filter(p => p.is_pinned)
  const regular = posts.filter(p => !p.is_pinned)

  const items: FeedItem[] = [
    ...regular.map(p => ({ kind: 'post' as const, data: p, date: new Date(p.created_at).getTime() })),
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

function DispatchFeedCard({ dispatch: d }: { dispatch: any }) {
  return (
    <Link
      href={`/broadcast/${d.id}`}
      className="group block rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/10 px-4 py-3.5 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
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
    <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
      <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}
