import '@/app/themes/active/members-a'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadHomeEvents, loadNeedsYou, loadZapBreakdown, type HomeEvents } from '@/lib/feed/frequency-home'
import { SEASON_RANKS, RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { distanceLabel } from '@/lib/feed/home-rank'
import type { CommunityRole } from '@/lib/community-roles'
import { Standing, type StandingPractice } from './standing'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { hasOperatedSpaces } from '@/lib/spaces/operated'
import { FeedPlanner } from './planner'
import { feedWhyShown } from '@/lib/feed/why-pref'
import { CreateButton, FeedComposer, GetStarted, NeedsYou, CaughtUpButton, type GsStep } from './islands'
import { FeedStream, type FeedSort, type JourneyRun } from './posts'
import { FrequencyPhonePanels } from '../shell/right-rail'
import { loadGameStats } from '@/components/sidebar/right-sidebar'

// THE FREQUENCY MEMBER FEED (design_handoff/frequency/templates/members/README.md, the centre
// column). Order: greeting, standing, Get started, one ranked pick, Near you, your people's plans,
// Needs you, the composer, the sort lens, the posts, and the hard stop. The shell lane owns the
// header, rails, footer and the [data-kit="members"] root; this is the body only.
//
// Server Component. The slow reads (ranked events, the queue, the stream) stream behind their
// own <Suspense>, so the greeting and standing paint first (PAGE-FRAMEWORK §5).

interface FrequencyFeedProps {
  profileId: string
  firstName: string | null
  displayName: string
  avatarUrl: string | null
  role: CommunityRole
  sort: FeedSort
  home: { lat: number; lng: number } | null
  radiusM: number
  locationLabel: string | null
  standing: {
    streak: number
    loggedToday: boolean
    atRisk: boolean
    freezeTokens: number
    nextMilestone: { day: number; label: string } | null
    toNext: number
    zaps: number
    gems: number
    rank: SeasonRank
    journeysFinished: number
    journeysToNext: number | null
    nextRankLabel: string | null
  }
  onboarding: GsStep[] | null
  journey: (JourneyRun & { nextLessonId: string | null }) | null
  tuneOutHref: string
  /** Every adopted practice, with whether it is logged on the member's today (Standing). */
  practices: StandingPractice[]
}

const SORTS: [FeedSort, string][] = [
  ['nearby', 'Nearby'],
  ['relevant', 'Resonance'],
  ['recent', 'Recent'],
  ['popular', 'Popular'],
  ['story', 'Story'],
]

export async function FrequencyFeed(p: FrequencyFeedProps) {
  // The viewer's own active Circles: their own membership rows, so the session client reads them under RLS.
  const supabase = await createClient()
  const [{ data: memberships }, zapRows, operates] = await Promise.all([
    supabase
      .from('memberships')
      .select('circle_id, circles!circle_id ( id, name )')
      .eq('profile_id', p.profileId)
      .eq('status', 'active'),
    loadZapBreakdown(p.profileId),
    hasOperatedSpaces(p.profileId),
  ])
  const circles = ((memberships ?? []) as unknown as { circles: { id: string; name: string } | null }[])
    .map((m) => m.circles)
    .filter((c): c is { id: string; name: string } => !!c)

  // Started once, read by the greeting's live count and the planner, so the events are fetched once.
  const eventsP = loadHomeEvents({ profileId: p.profileId, home: p.home, circles })
  const nextLesson = p.journey?.nextLesson && p.journey.nextLessonId
    ? { id: p.journey.nextLessonId, title: p.journey.nextLesson.title, href: p.journey.nextLesson.href, journey: p.journey.title }
    : null

  const now = new Date()
  const partOfDay = Number(now.toLocaleString('en-US', { timeZone: HOME_TZ, hour: '2-digit', hour12: false })) % 24
  const hello = partOfDay < 12 ? 'Good morning' : partOfDay < 18 ? 'Good afternoon' : 'Good evening'
  const dateLine = now.toLocaleDateString('en-US', { timeZone: HOME_TZ, weekday: 'long', month: 'long', day: 'numeric' })
  const clock = now.toLocaleTimeString('en-US', { timeZone: HOME_TZ, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  const todayDow = new Date(`${dayInZone(now, HOME_TZ)}T12:00:00Z`).getUTCDay()
  const rankOrder = SEASON_RANKS.find((r) => r.rank === p.standing.rank)?.order ?? 1
  const sort = p.sort === 'nearby' && !p.home ? 'relevant' : p.sort
  const nearby = p.home ? { ...p.home, radiusM: p.radiusM } : null

  return (
    <div className="fa-col">
      <div className="fa-greet" data-visual-mask="feed-greeting">
        <div className="fa-greet-txt">
          <span className="meta">{[dateLine, clock, p.locationLabel].filter(Boolean).join(' · ')}</span>
          <h1 className="h1">
            {p.firstName ? (
              <>
                {hello}, <em>{p.firstName}.</em>
              </>
            ) : (
              `${hello}.`
            )}
          </h1>
          <Suspense fallback={<span className="fa-ctx">&nbsp;</span>}>
            <ContextLine eventsP={eventsP} />
          </Suspense>
        </div>
        <CreateButton />
      </div>

      {/* Get started leads the right rail (README §3.1). Below 680px the rails are hidden, so the
          Feed carries the same box inline there and nowhere else (.fqm-gs-inline). It sits above
          Standing for the rail's own order (Get started, then Stats and streaks): on a phone,
          Standing IS the stats box. The rail's other panels follow Up next (FrequencyPhonePanels). */}
      {p.onboarding && <GetStarted steps={p.onboarding} className="fqm-gs-inline" />}

      {/* Hidden on desktop while the right rail shows its full Stats & streaks box (members-shell.css). */}
      <div className="fa-standing">
        <Standing
          streak={p.standing.streak}
          loggedToday={p.standing.loggedToday}
          atRisk={p.standing.atRisk}
          freezeTokens={p.standing.freezeTokens}
          nextMilestone={p.standing.nextMilestone}
          toNext={p.standing.toNext}
          zaps={p.standing.zaps}
          gems={p.standing.gems}
          rankLabel={RANK_LABELS[p.standing.rank]}
          ranks={SEASON_RANKS.map((r) => ({ label: r.label, reached: r.order <= rankOrder }))}
          journeysFinished={p.standing.journeysFinished}
          nextRankLabel={p.standing.nextRankLabel}
          journeysToNext={p.standing.journeysToNext}
          zapRows={zapRows}
          tuneOutHref={p.tuneOutHref}
          todayDow={todayDow}
          practices={p.practices}
        />
      </div>

      {/* Four ways to your own things (owner, 2026-10-13, "smart mix"): the Spaces you run, or your
          Circles; then events, messages and practices. */}
      <nav className="fa-quick" aria-label="Your shortcuts">
        {quickLinks(operates).map((l) => (
          <Link key={l.href} href={l.href}>
            <FqIcon name={l.icon} />
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>

      <Suspense fallback={<section className="fa-hero" aria-busy="true"><div className="fa-hero-body"><span className="k">Up next for you</span></div></section>}>
        <PlannerSection eventsP={eventsP} hasHome={!!p.home} profileId={p.profileId} />
      </Suspense>

      {/* The right rail's panels, on a phone only (hidden at 768px and up). loadGameStats is the
          layout's request-cached read, so this is the same promise's data, not a second query. */}
      <FrequencyPhonePanels profileId={p.profileId} stats={loadGameStats(p.profileId).catch(() => null)} />

      <Suspense fallback={null}>
        <NeedsSection profileId={p.profileId} nextLesson={nextLesson} />
      </Suspense>

      <FeedComposer scopeId={p.profileId} avatarUrl={p.avatarUrl} name={p.displayName} practiceHref={p.tuneOutHref} />

      <nav className="tabs fa-lens" aria-label="Sort the feed">
        {SORTS.filter(([k]) => k !== 'nearby' || p.home).map(([k, label]) => (
          <Link key={k} href={`/feed?sort=${k}`} className={sort === k ? 'on' : undefined} aria-current={sort === k ? 'page' : undefined} scroll={false}>
            {label}
          </Link>
        ))}
      </nav>
      {sort === 'story' && <p className="fa-story">A record of what the community lived, not a scroll to consume.</p>}

      <Suspense fallback={<div className="fa-post" aria-busy="true"><span className="t2">Loading your people’s posts</span></div>}>
        <FeedStream
          myProfileId={p.profileId}
          viewerRole={p.role}
          sort={sort}
          nearby={nearby}
          circleIds={circles.map((c) => c.id)}
          journey={p.journey}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CaughtUp eventsP={eventsP} />
      </Suspense>
    </div>
  )
}

function quickLinks(operatesSpaces: boolean): { label: string; href: string; icon: FqIconName }[] {
  return [
    operatesSpaces
      ? { label: 'Your Spaces', href: '/spaces/operating', icon: 'space' }
      : { label: 'Your Circles', href: '/circles', icon: 'circle' },
    { label: 'Events', href: '/events', icon: 'event' },
    { label: 'Messages', href: '/messages', icon: 'message' },
    { label: 'Practices', href: '/practices', icon: 'checkin' },
  ]
}

async function ContextLine({ eventsP }: { eventsP: Promise<HomeEvents> }) {
  const { ranked } = await eventsP
  const live = ranked.filter((e) => e.slot === 'now').length
  const tonight = ranked.filter((e) => e.slot === 'tonight').length
  const line =
    live > 0
      ? `${live === 1 ? 'One thing is' : `${live} things are`} on near you right now.`
      : tonight > 0
        ? `Nothing on this minute. ${tonight === 1 ? 'One thing' : `${tonight} things`} later today.`
        : 'A quiet day near you so far.'
  return <span className="fa-ctx">{line}</span>
}

async function PlannerSection({ eventsP, hasHome, profileId }: { eventsP: Promise<HomeEvents>; hasHome: boolean; profileId: string }) {
  const [{ ranked, plans, doorZaps }, showWhy] = await Promise.all([eventsP, feedWhyShown(profileId)])
  return <FeedPlanner events={ranked} plans={plans} doorZaps={doorZaps} hasHome={hasHome} showWhy={showWhy} />
}

async function NeedsSection({ profileId, nextLesson }: { profileId: string; nextLesson: Parameters<typeof loadNeedsYou>[0]['nextLesson'] }) {
  const items = await loadNeedsYou({ profileId, nextLesson })
  return <NeedsYou items={items} />
}

async function CaughtUp({ eventsP }: { eventsP: Promise<HomeEvents> }) {
  const { ranked } = await eventsP
  const alt = ranked.find((e) => (e.slot === 'now' || e.slot === 'tonight') && e.myStatus !== 'going')
  const dist = alt ? distanceLabel(alt.distanceMi) : null
  const where = alt ? `${alt.live ? 'still on' : `on ${alt.when.toLowerCase()}`}${dist ? `, ${dist} away` : ''}` : null
  return (
    <div className="soft fa-end">
      <span className="fq-breathe" aria-hidden />
      <b>You’re caught up.</b>
      <p>
        That’s everything in your feed right now.
        {alt && where ? ` ${alt.title} is ${where}.` : ''}
      </p>
      <CaughtUpButton />
    </div>
  )
}
