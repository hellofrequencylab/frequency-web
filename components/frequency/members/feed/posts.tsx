import Link from 'next/link'
import { Suspense, type CSSProperties } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { loadFeedPage, type FeedRow } from '@/lib/feed/feed-page'
import { buildScopeContextResolver } from '@/lib/feed/post-origin'
import { getMyOrbit } from '@/lib/connections/resonance'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { loadLeadDispatch, type DispatchItem } from '@/components/feed/feed-list'
import { PostReplies } from '@/components/feed/post-replies'
import { PostPoll } from '@/components/feed/post-poll'
import { PostBody } from '@/components/feed/post-body'
import { ContextActions } from '@/components/context-actions'
import type { CommunityRole } from '@/lib/community-roles'
import type { PostScopeContext } from '@/components/feed/post-card'
import { relativeTime } from '@/lib/utils'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { FqAvatar, phStyle } from '../shared/avatar'

// THE STREAM (Frequency Member Feed, section 9). Posts sit between hairlines with no card, a dot
// marks the source, and each can say why it is there. The rows are the platform's own feed RPC
// (feed_for_viewer through lib/feed/feed-page.ts, the same reach model and ranking the web feed
// uses); reactions, comments, polls and the post menu are the existing live components.
//
// The design's Milestone and Classifieds items have no post type behind them yet, so they are not
// drawn. The Journey Run card is the member's own active Journey (lib/member-progress.ts).

export type FeedSort = 'recent' | 'relevant' | 'nearby' | 'story' | 'popular'

export interface JourneyRun {
  title: string
  percent: number
  phasesComplete: number
  phasesTotal: number
  nextLesson: { title: string; href: string } | null
  inCohort: boolean
}

export async function FeedStream({
  myProfileId,
  viewerRole,
  sort,
  nearby,
  circleIds,
  journey,
}: {
  myProfileId: string
  viewerRole: CommunityRole
  sort: FeedSort
  nearby: { lat: number; lng: number; radiusM: number } | null
  circleIds: string[]
  journey: JourneyRun | null
}) {
  const fetchSort = sort === 'story' ? 'recent' : sort === 'nearby' && !nearby ? 'recent' : sort
  const [loaded, orbit, hideDemo, dispatch] = await Promise.all([
    loadFeedPage({ profileId: myProfileId, sort: fetchSort, nearby }),
    getMyOrbit(200),
    viewerHidesDemo(),
    sort === 'story' ? Promise.resolve(null) : loadLeadDispatch(myProfileId, nearby),
  ])

  if (loaded.kind === 'error') {
    return (
      <div className="fa-empty">
        <span className="fa-serif18">The feed could not load.</span>
        <Link href={`/feed?sort=${sort}`} className="btn sm">
          Try again
        </Link>
      </div>
    )
  }

  let posts = loaded.items
  if (hideDemo) posts = posts.filter((p) => !p.is_demo)
  if (sort === 'recent' || sort === 'nearby' || sort === 'story') {
    posts = [...posts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  }
  const pinned = sort === 'story' ? [] : posts.filter((p) => p.is_pinned)
  const rest = sort === 'story' ? posts : posts.filter((p) => !p.is_pinned)
  const resolve = await buildScopeContextResolver(posts.map((p) => p.scope_id))
  const people = new Set(orbit.map((m) => m.profileId))
  const mine = new Set(circleIds)

  const render = (p: FeedRow) => (
    <PostItem
      key={p.id}
      post={p}
      scope={resolve(p.scope_id, p.author.id)}
      why={sort === 'story' ? null : whyFor(p, people, mine)}
      myProfileId={myProfileId}
      viewerRole={viewerRole}
    />
  )

  if (sort === 'story') {
    const days: { label: string; items: FeedRow[] }[] = []
    for (const p of rest) {
      const label = dayLabel(p.created_at)
      const last = days[days.length - 1]
      if (last && last.label === label) last.items.push(p)
      else days.push({ label, items: [p] })
    }
    return (
      <div data-visual-mask="feed-stream">
        {days.map((d) => (
          <section key={d.label} aria-label={d.label}>
            <h2 className="k fa-day">{d.label}</h2>
            {d.items.map(render)}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div data-visual-mask="feed-stream">
      {pinned.map(render)}
      {rest.slice(0, 2).map(render)}
      {journey && <JourneyRunItem journey={journey} />}
      {rest.slice(2, 5).map(render)}
      {dispatch && <DispatchItemRow d={dispatch} />}
      {rest.slice(5).map(render)}
    </div>
  )
}

function whyFor(p: FeedRow, people: Set<string>, circles: Set<string>): string | null {
  if (p.scope_id && circles.has(p.scope_id)) return 'From your Circle'
  if (people.has(p.author.id)) return 'From your people'
  if (p.distance_m != null) return p.distance_m < 1609 ? 'Close to home' : `${Math.round(p.distance_m / 1609)} mi away`
  return null
}

function dayLabel(iso: string): string {
  const day = dayInZone(new Date(iso), HOME_TZ)
  const today = dayInZone(new Date(), HOME_TZ)
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { timeZone: HOME_TZ, weekday: 'long', month: 'long', day: 'numeric' })
}

function PostItem({
  post,
  scope,
  why,
  myProfileId,
  viewerRole,
}: {
  post: FeedRow
  scope: PostScopeContext | undefined
  why: string | null
  myProfileId: string
  viewerRole: CommunityRole
}) {
  const name = post.author.display_name ?? 'Member'
  const handle = post.author.handle

  // A join notice (Vera's system line): one centred line, no avatar, no actions.
  if (post.post_type === 'system') {
    if (!post.body) return null
    const parts = post.body.split(/(@[a-zA-Z0-9_]+)/g)
    return (
      <div className="fa-join">
        {parts.map((part, i) =>
          part.startsWith('@') ? (
            <Link key={i} href={`/people/${part.slice(1)}`}>
              {part}
            </Link>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </div>
    )
  }

  const media = (post.media_urls ?? []).filter(Boolean)
  const kicker = post.post_type === 'announcement' ? 'Announcement' : post.is_pinned ? 'Pinned' : post.post_type === 'ask' ? 'Asking' : post.post_type === 'note' ? 'Note' : null
  const where = scope ? (scope.type === 'wall' ? `${scope.name}’s wall` : scope.name) : null

  return (
    <article id={`post-${post.id}`} className="fa-post">
      {kicker && <span className="fa-kick">{kicker}</span>}
      <div className="fa-post-h">
        <Link href={handle ? `/people/${handle}` : '#'} aria-label={name}>
          <FqAvatar url={post.author.avatar_url} name={name} />
        </Link>
        <span className="grow">
          <Link href={handle ? `/people/${handle}` : '#'} className="t1">
            {name}
          </Link>
          <span className="fa-src">
            {where && scope ? <Link href={scope.href}>{where}</Link> : null}
            {where ? ' · ' : ''}
            {relativeTime(post.created_at)}
          </span>
        </span>
        {why && <span className="fa-whytag">{why}</span>}
        <ContextActions
          role={viewerRole}
          context={{ type: 'post', id: post.id, isPinned: post.is_pinned, isOwn: post.author.id === myProfileId, postType: post.post_type }}
        />
      </div>
      {post.body && <PostBody body={post.body} className="fa-post-b" />}
      {post.post_type === 'poll' && (
        <Suspense fallback={null}>
          <PostPoll postId={post.id} myProfileId={myProfileId} />
        </Suspense>
      )}
      {media.length === 1 && <span className="ph fa-photo" style={phStyle(media[0])} role="img" aria-label="Post photo" />}
      {media.length >= 2 && (
        <div className="fa-recap" role="img" aria-label={`${media.length} photos`}>
          <span className="ph" style={phStyle(media[0])} />
          <span>
            <span className="ph" style={phStyle(media[1])} />
            {media.length >= 3 ? (
              <span className="ph" style={phStyle(media[2])}>
                {media.length > 3 && <span className="fa-more">+{media.length - 3}</span>}
              </span>
            ) : (
              <span className="ph" style={phStyle(media[1])} />
            )}
          </span>
        </div>
      )}
      <div className="fa-replies">
        <PostReplies postId={post.id} initialCount={post.comment_count ?? 0} myProfileId={myProfileId} postReactions={post.reactions ?? []} />
      </div>
    </article>
  )
}

function JourneyRunItem({ journey }: { journey: JourneyRun }) {
  return (
    <article className="fa-post" style={{ gap: 20 }}>
      <div className="fa-post-h">
        <span className="fa-icav" aria-hidden>
          <FqIcon name="program" />
        </span>
        <span className="grow">
          <span className="t1">Your {journey.inCohort ? 'Run' : 'Journey'} · {journey.title}</span>
          <span className="fa-src">
            Phase {Math.min(journey.phasesTotal, journey.phasesComplete + 1)} of {journey.phasesTotal}
          </span>
        </span>
      </div>
      <div className="fa-run" data-energy="still">
        <div className="fq-aura" aria-hidden />
        <span className="fa-run-ring" style={{ '--p': `${journey.percent}%`, position: 'relative' } as CSSProperties}>
          <span>{journey.percent}%</span>
        </span>
        <span className="stack grow" style={{ gap: 10 }}>
          <span className="t2">Next lesson</span>
          <span className="fa-run-t">{journey.nextLesson?.title ?? 'Every lesson done'}</span>
        </span>
      </div>
      {journey.nextLesson && (
        <div className="row wrap" style={{ gap: 16 }}>
          <Link href={journey.nextLesson.href} className="btn pa lg">
            Continue lesson
          </Link>
        </div>
      )}
    </article>
  )
}

function DispatchItemRow({ d }: { d: DispatchItem }) {
  const isEvent = d.dispatch_type === 'event' && d.event != null
  const href = isEvent ? `/events/${d.event!.slug}` : `/nearby/${d.id}`
  return (
    <article className="fa-post">
      <div className="fa-post-h">
        <span className="fa-icav" aria-hidden>
          <FqIcon name="space" />
        </span>
        <span className="grow">
          <Link href={href} className="t1">
            {d.title}
          </Link>
          <span className="fa-src">
            Dispatch{d.author?.display_name ? ` · ${d.author.display_name}` : ''} · {relativeTime(d.published_at)}
          </span>
        </span>
      </div>
      {isEvent ? <p className="fa-post-b">{d.event!.title}</p> : d.excerpt ? <p className="fa-post-b">{d.excerpt}</p> : null}
    </article>
  )
}
