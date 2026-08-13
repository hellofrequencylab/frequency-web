import Link from 'next/link'
import { CalendarDays, MapPin, AtSign, Megaphone, Zap, ArrowRight, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime, eventDateBadge, formatEventDate } from '@/lib/utils'
import { PostCard, type FeedPost, type RawPost } from './post-card'
import { buildScopeContextResolver } from '@/lib/feed/post-origin'

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
  id, body, post_type, is_pinned, created_at, media_urls, is_demo,
  reaction_count, comment_count, engagement_score, scope_id, visibility,
  author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
  reactions:post_reactions ( id, reaction_type, profile_id )
`

type TimelineItem =
  | { kind: 'post'; data: FeedPost; date: number; context?: 'mention' }
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
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  const wallPostsP = admin
    .from('posts')
    .select(POST_SELECT)
    .eq('scope_id', profileId)
    .neq('author_id', profileId)
    .is('parent_id', null)
    .is('hidden_at', null)
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
      .is('hidden_at', null)
    mentionPosts = (data ?? []) as unknown as RawPost[]
  }

  // ── Post scope (where each post was posted) ──────────────────────────────
  // The card's attribution header carries the where (author › context), so no
  // separate origin line rides above the card anymore. A wall post by someone
  // else resolves to THIS member's wall; the member's own posts to their own
  // profile resolve to no context (just posting).
  const resolveScope = await buildScopeContextResolver(
    [...ownPosts, ...wallPosts, ...mentionPosts].map(p => p.scope_id),
  )

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
      .eq('status', 'published').is('hidden_at', null).eq('author_id', profileId)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>,
  ]

  if (circleIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').is('hidden_at', null).eq('audience_scope', 'circle')
        .in('audience_id', circleIds)
        .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>
    )
  }
  if (hubIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').is('hidden_at', null).eq('audience_scope', 'hub')
        .in('audience_id', hubIds)
        .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchItem[] | null }>
    )
  }
  if (nexusIds.length > 0) {
    dispatchPromises.push(
      admin.from('dispatches').select(dispatchSelect)
        .eq('status', 'published').is('hidden_at', null).eq('audience_scope', 'nexus')
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

  const toFeedPost = (p: RawPost): FeedPost =>
    ({ ...p, replyCount: p.comment_count ?? 0, scopeContext: resolveScope(p.scope_id, p.author.id) }) as FeedPost

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
      <div className="rounded-card border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
        <MessageSquare className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
        <p className="text-body-sm text-muted">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {latestDispatch && <DispatchTimelineCard dispatch={latestDispatch} />}

      {items.map(item => {
        if (item.kind === 'post') {
          // The card's own header carries who + where; only a MENTION still needs
          // one quiet line to explain why the post is on this timeline.
          return (
            <div key={item.data.id}>
              {item.context === 'mention' && (
                <p className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1 text-meta text-subtle">
                  <AtSign className="h-3 w-3" />
                  Mentioned <span className="font-medium text-muted">@{profileHandle}</span>
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

// Dispatch + event timeline cards share the posts' neutral card chrome (one
// cohesive stream); their palettes live in the icon/date tile + kicker only.
function DispatchTimelineCard({ dispatch: d }: { dispatch: DispatchItem }) {
  return (
    <Link
      href={`/nearby/${d.id}`}
      className="group block rounded-card border border-border/70 bg-surface px-4 py-3.5 lift-1 transition-colors hover:border-primary dark:border-border/60 dark:bg-surface-elevated/80"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-control bg-primary-bg flex items-center justify-center mt-0.5">
          <Megaphone className="w-3.5 h-3.5 text-primary-strong" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-3xs font-black uppercase tracking-widest text-primary-strong">
              {d.audience_scope} Dispatch
            </span>
            {d.linked_task && (
              <span className="text-3xs font-bold text-primary flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Challenge
              </span>
            )}
          </div>
          <p className="text-body-sm font-bold text-text group-hover:text-primary-strong dark:group-hover:text-primary-strong transition-colors line-clamp-1">
            {d.title}
          </p>
          {d.excerpt && (
            <p className="text-meta text-muted line-clamp-1 mt-0.5">{d.excerpt}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-2xs text-muted">
              {d.author?.display_name} · {relativeTime(d.published_at)}
            </span>
            <ArrowRight className="w-3 h-3 text-primary-strong dark:text-primary-strong group-hover:text-primary-strong transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  )
}

function EventTimelineCard({ event: e }: { event: EventItem }) {
  const { month, day } = eventDateBadge(e.starts_at)
  const dateStr = formatEventDate(e.starts_at)

  return (
    <Link
      href={`/events/${e.slug}`}
      className="group block rounded-card border border-border/70 bg-surface px-4 py-3.5 lift-1 transition-colors hover:border-warning dark:border-border/60 dark:bg-surface-elevated/80"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-control bg-warning-bg dark:bg-warning-bg flex flex-col items-center justify-center">
          <span className="text-3xs font-bold uppercase text-warning leading-none">{month}</span>
          <span className="text-body-sm font-bold text-warning leading-tight">{day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CalendarDays className="w-3 h-3 text-primary" />
            <span className="text-3xs font-black uppercase tracking-widest text-primary">Event</span>
          </div>
          <p className="text-body-sm font-bold text-text group-hover:text-warning dark:group-hover:text-primary transition-colors line-clamp-1">
            {e.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-meta text-muted">{dateStr}</span>
            {e.location && (
              <span className="text-meta text-subtle flex items-center gap-1">
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
