import Link from 'next/link'
import { CalendarDays, MapPin, AtSign, Megaphone, Zap, ArrowRight, MessageSquare, PenLine } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime } from '@/lib/utils'
import { PostCard, type FeedPost } from './post-card'

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

interface EventItem {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  slug: string
  is_cancelled: boolean
}

const POST_SELECT = `
  id, body, post_type, is_pinned, created_at, media_urls,
  reaction_count, comment_count, engagement_score,
  author:profiles!author_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_streak, achievement_count ),
  reactions:post_reactions ( id, reaction_type, profile_id )
`

type TimelineItem =
  | { kind: 'post'; data: FeedPost; date: number; context?: 'wall' | 'mention' }
  | { kind: 'dispatch'; data: DispatchItem; date: number }
  | { kind: 'event'; data: EventItem; date: number }

export async function ProfileFeed({
  profileId,
  profileHandle,
  myProfileId,
  viewerRole,
}: {
  profileId: string
  profileHandle: string
  myProfileId: string | null
  viewerRole?: string
}) {
  const admin = createAdminClient()

  // ── Parallel data fetches ────────────────────────────────────────────────

  const ownPostsP = admin
    .from('posts')
    .select(POST_SELECT)
    .eq('author_id', profileId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(30)

  const wallPostsP = admin
    .from('posts')
    .select(POST_SELECT)
    .eq('scope_id', profileId)
    .neq('author_id', profileId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(20)

  const mentionsP = admin
    .from('post_mentions')
    .select('post_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(10)

  const rsvpEventsP = admin
    .from('event_rsvps')
    .select(`
      events!event_id (
        id, title, starts_at, ends_at, location, slug, is_cancelled
      )
    `)
    .eq('profile_id', profileId)
    .eq('status', 'going')

  const hostedEventsP = admin
    .from('events')
    .select('id, title, starts_at, ends_at, location, slug, is_cancelled')
    .eq('host_id', profileId)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: false })
    .limit(5)

  const membershipsP = admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  const [ownPostsR, wallPostsR, mentionsR, rsvpEventsR, hostedEventsR, membershipsR] =
    await Promise.all([ownPostsP, wallPostsP, mentionsP, rsvpEventsP, hostedEventsP, membershipsP])

  const ownPosts = (ownPostsR.data ?? []) as unknown as RawPost[]
  const wallPosts = (wallPostsR.data ?? []) as unknown as RawPost[]

  // ── Mention posts (skip duplicates already in own/wall) ──────────────────

  const ownPostIds = new Set(ownPosts.map(p => p.id))
  const wallPostIds = new Set(wallPosts.map(p => p.id))
  const mentionPostIds = ((mentionsR.data ?? []) as { post_id: string }[])
    .map(m => m.post_id)
    .filter(id => !ownPostIds.has(id) && !wallPostIds.has(id))

  let mentionPosts: RawPost[] = []
  if (mentionPostIds.length > 0) {
    const { data } = await admin
      .from('posts')
      .select(POST_SELECT)
      .in('id', mentionPostIds)
      .is('parent_id', null)
    mentionPosts = (data ?? []) as unknown as RawPost[]
  }

  // ── Events ──────────────────────────────────────────────────────────────

  const rsvpEvents = ((rsvpEventsR.data ?? []) as unknown as { events: EventItem | null }[])
    .map(r => r.events)
    .filter((e): e is EventItem => !!e && !e.is_cancelled)

  const hostedEvents = (hostedEventsR.data ?? []) as unknown as EventItem[]

  const eventSeen = new Set<string>()
  const allEvents = [...rsvpEvents, ...hostedEvents].filter(e => {
    if (eventSeen.has(e.id)) return false
    eventSeen.add(e.id)
    return true
  })

  // ── Dispatches ──────────────────────────────────────────────────────────

  const circleIds = ((membershipsR.data ?? []) as { circle_id: string }[]).map(m => m.circle_id)

  let hubIds: string[] = []
  let nexusIds: string[] = []

  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles').select('hub_id').in('id', circleIds)
    hubIds = ((circles ?? []) as { hub_id: string | null }[])
      .map(c => c.hub_id).filter(Boolean) as string[]
  }
  if (hubIds.length > 0) {
    const { data: hubs } = await admin
      .from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = ((hubs ?? []) as { nexus_id: string | null }[])
      .map(h => h.nexus_id).filter(Boolean) as string[]
  }

  const dispatchSelect = `
    id, title, excerpt, audience_scope, published_at,
    author:profiles!author_id ( display_name ),
    linked_task:crew_tasks!linked_task_id ( id, name )
  `

  const dispatchPromises: Promise<{ data: DispatchItem[] | null }>[] = [
    admin.from('dispatches').select(dispatchSelect)
      .eq('status', 'published').eq('author_id', profileId)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>,
  ]

  if (circleIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').eq('audience_scope', 'circle')
        .in('audience_id', circleIds)
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
  const dSeen = new Set<string>()
  const dispatches = dispatchResults
    .flatMap(r => r.data ?? [])
    .filter(d => { if (dSeen.has(d.id)) return false; dSeen.add(d.id); return true })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

  // ── Build unified timeline ────────────────────────────────────────────

  const toFeedPost = (p: RawPost): FeedPost => ({ ...p, replyCount: p.comment_count ?? 0 }) as FeedPost

  const latestDispatch = dispatches[0] ?? null

  const items: TimelineItem[] = [
    ...ownPosts.map(p => ({
      kind: 'post' as const,
      data: toFeedPost(p),
      date: new Date(p.created_at).getTime(),
    })),
    ...wallPosts.map(p => ({
      kind: 'post' as const,
      data: toFeedPost(p),
      date: new Date(p.created_at).getTime(),
      context: 'wall' as const,
    })),
    ...mentionPosts.map(p => ({
      kind: 'post' as const,
      data: toFeedPost(p),
      date: new Date(p.created_at).getTime(),
      context: 'mention' as const,
    })),
    ...dispatches.slice(1).map(d => ({
      kind: 'dispatch' as const,
      data: d,
      date: new Date(d.published_at).getTime(),
    })),
    ...allEvents.map(e => ({
      kind: 'event' as const,
      data: e,
      date: new Date(e.starts_at).getTime(),
    })),
  ].sort((a, b) => b.date - a.date)

  if (!latestDispatch && items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
        <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {latestDispatch && <DispatchTimelineCard dispatch={latestDispatch} />}

      {items.map(item => {
        if (item.kind === 'post') {
          const postItem = item as TimelineItem & { kind: 'post'; context?: 'wall' | 'mention' }
          return (
            <div key={item.data.id}>
              {postItem.context === 'wall' && (
                <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5 px-1">
                  <PenLine className="w-3 h-3" />
                  <Link href={`/people/${item.data.author.handle}`} className="font-medium text-gray-500 hover:underline">
                    {item.data.author.display_name}
                  </Link>
                  {' '}wrote on this wall
                </p>
              )}
              {postItem.context === 'mention' && (
                <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5 px-1">
                  <AtSign className="w-3 h-3" />
                  Mentioned <span className="font-medium text-gray-500">@{profileHandle}</span>
                </p>
              )}
              <PostCard post={item.data} myProfileId={myProfileId} viewerRole={viewerRole} />
            </div>
          )
        }
        if (item.kind === 'dispatch') {
          return <DispatchTimelineCard key={item.data.id} dispatch={item.data} />
        }
        if (item.kind === 'event') {
          return <EventTimelineCard key={item.data.id} event={item.data} />
        }
        return null
      })}
    </div>
  )
}

function DispatchTimelineCard({ dispatch: d }: { dispatch: DispatchItem }) {
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

function EventTimelineCard({ event: e }: { event: EventItem }) {
  const d = new Date(e.starts_at)
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = d.getDate()
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <Link
      href={`/events/${e.slug}`}
      className="group block rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 shadow-sm px-4 py-3.5 hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400 leading-none">{month}</span>
          <span className="text-sm font-bold text-amber-700 dark:text-amber-300 leading-tight">{day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CalendarDays className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Event</span>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-50 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
            {e.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">{dateStr}</span>
            {e.location && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" />
                <span className="line-clamp-1">{e.location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
