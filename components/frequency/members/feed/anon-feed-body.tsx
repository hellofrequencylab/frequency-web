import '@/app/themes/active/members-a'
import Link from 'next/link'
import { Suspense } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { HOME_TZ } from '@/lib/time/zone'
import { ANON_FEED_PROFILE, loadAnonPosts, loadAnonPublicEvents, rankAnonEvents } from '@/lib/feed/anon-feed'
import type { FeedRow } from '@/lib/feed/feed-page'
import { CreateButton, FeedComposer } from './islands'
import { FeedPlanner } from './planner'
import { PostItem, type FeedSort } from './posts'

// THE FEED, SIGNED OUT, AS ANONYMOUS (SCAN-889; owner, 2026-10-14: "When a visitor goes to the feed, I
// want them to see the actual feed with their account as Anonymous"). The member Feed's own body
// (feed-body.tsx) in the same order and the same components: the greeting, the shortcuts, Up next and
// Near you (FeedPlanner), the composer, the sort lens and the stream (PostItem). What a member's Feed
// reads through their profile is read here from the PUBLIC data only (lib/feed/anon-feed.ts): public
// posts and public events. The standing, Needs you and the Circle-only rows have no anonymous meaning and
// are not drawn. Every account-only control is live markup that the join overlay intercepts
// (anon-join-gate.tsx), so nothing here can act.

const SORTS: [FeedSort, string][] = [
  ['relevant', 'Resonance'],
  ['recent', 'Recent'],
  ['popular', 'Popular'],
  ['story', 'Story'],
]

const QUICK: { label: string; href: string; icon: FqIconName }[] = [
  { label: 'Your Circles', href: '/circles', icon: 'circle' },
  { label: 'Events', href: '/events', icon: 'event' },
  { label: 'Messages', href: '/messages', icon: 'message' },
  { label: 'Practices', href: '/practices', icon: 'checkin' },
]

export function FrequencyAnonFeed({ sort: asked }: { sort: FeedSort }) {
  const sort: FeedSort = asked === 'nearby' ? 'relevant' : asked
  const eventsP = loadAnonPublicEvents()
    .then((rows) => rankAnonEvents(rows))
    .catch(() => [])
  const now = new Date()
  const hour = Number(now.toLocaleString('en-US', { timeZone: HOME_TZ, hour: '2-digit', hour12: false })) % 24
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLine = now.toLocaleDateString('en-US', { timeZone: HOME_TZ, weekday: 'long', month: 'long', day: 'numeric' })
  const clock = now.toLocaleTimeString('en-US', { timeZone: HOME_TZ, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

  return (
    <div className="fa-col">
      <div className="fa-greet" data-visual-mask="feed-greeting">
        <div className="fa-greet-txt">
          <span className="meta">{[dateLine, clock].join(' · ')}</span>
          <h1 className="h1">
            {hello}, <em>{ANON_FEED_PROFILE.display_name}.</em>
          </h1>
          <Suspense fallback={<span className="fa-ctx">&nbsp;</span>}>
            <ContextLine eventsP={eventsP} />
          </Suspense>
        </div>
        <CreateButton />
      </div>

      <nav className="fa-quick" aria-label="Your shortcuts">
        {QUICK.map((l) => (
          <Link key={l.href} href={l.href}>
            <FqIcon name={l.icon} />
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>

      <Suspense fallback={<section className="fa-hero" aria-busy="true"><div className="fa-hero-body"><span className="k">Up next for you</span></div></section>}>
        <PlannerSection eventsP={eventsP} />
      </Suspense>

      <FeedComposer scopeId="" avatarUrl={null} name={ANON_FEED_PROFILE.display_name} practiceHref="/practices" />

      <nav className="tabs fa-lens" aria-label="Sort the feed">
        {SORTS.map(([k, label]) => (
          <Link key={k} href={`/feed?sort=${k}`} className={sort === k ? 'on' : undefined} aria-current={sort === k ? 'page' : undefined} scroll={false}>
            {label}
          </Link>
        ))}
      </nav>
      {sort === 'story' && <p className="fa-story">A record of what the community lived, not a scroll to consume.</p>}

      <Suspense fallback={<div className="fa-post" aria-busy="true"><span className="t2">Loading the community’s posts</span></div>}>
        <AnonStream />
      </Suspense>

      <div className="soft fa-end">
        <span className="fq-breathe" aria-hidden />
        <b>That’s the public Feed.</b>
        <p>Members also see their Circles, their people’s plans and every reply.</p>
      </div>
    </div>
  )
}

type Ranked = ReturnType<typeof rankAnonEvents>

async function ContextLine({ eventsP }: { eventsP: Promise<Ranked> }) {
  const ranked = await eventsP
  const live = ranked.filter((e) => e.slot === 'now').length
  const tonight = ranked.filter((e) => e.slot === 'tonight').length
  const line =
    live > 0
      ? `${live === 1 ? 'One thing is' : `${live} things are`} on right now.`
      : tonight > 0
        ? `Nothing on this minute. ${tonight === 1 ? 'One thing' : `${tonight} things`} later today.`
        : 'A quiet day so far.'
  return <span className="fa-ctx">{line}</span>
}

async function PlannerSection({ eventsP }: { eventsP: Promise<Ranked> }) {
  const events = await eventsP
  return <FeedPlanner events={events} plans={[]} doorZaps={0} hasHome={false} showWhy={false} />
}

async function AnonStream() {
  let posts: FeedRow[]
  try {
    posts = await loadAnonPosts()
  } catch {
    return (
      <div className="fa-empty">
        <span className="fa-serif18">The feed could not load.</span>
        <Link href="/feed" className="btn sm">
          Try again
        </Link>
      </div>
    )
  }
  if (posts.length === 0) {
    return (
      <div className="fa-empty">
        <span className="fa-serif18">Nothing public yet. Members are sharing in their Circles.</span>
      </div>
    )
  }
  return (
    <div data-visual-mask="feed-stream">
      {posts.map((p) => (
        <PostItem key={p.id} post={p} scope={undefined} why={null} myProfileId="" viewerRole="member" />
      ))}
    </div>
  )
}
