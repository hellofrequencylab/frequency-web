import '@/app/themes/frequency/members-a.css'
import Link from 'next/link'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHomeEvents, loadNeedsYou, loadZapBreakdown, type HomeEvents } from '@/lib/feed/frequency-home'
import { SEASON_RANKS, RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { distanceLabel } from '@/lib/feed/home-rank'
import type { CommunityRole } from '@/lib/community-roles'
import { Standing } from './standing'
import { FeedPlanner } from './planner'
import { feedWhyShown } from '@/lib/feed/why-pref'
import { CreateButton, FeedComposer, GetStarted, NeedsYou, CaughtUpButton, type GsStep } from './islands'
import { FeedStream, type FeedSort, type JourneyRun } from './posts'

// THE FREQUENCY MEMBER FEED (design_handoff/frequency/templates/members/README.md, the centre
// column). Order: greeting, standing, Get started, one ranked pick, Near you, your people's plans,
// Needs you, the composer, the sort lens, the posts, and the hard stop. The shell lane owns the
// header, rails, footer and the [data-kit="members"] root; this is the body only.
//
// Server Component. The slow reads (ranked events, the queue, the stream) stream behind their
// own <Suspense>, so the greeting and standing paint first (PAGE-FRAMEWORK §5).

export interface FrequencyFeedProps {
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
}

const SORTS: [FeedSort, string][] = [
  ['nearby', 'Nearby'],
  ['relevant', 'Resonance'],
  ['recent', 'Recent'],
  ['popular', 'Popular'],
  ['story', 'Story'],
]

export async function FrequencyFeed(p: FrequencyFeedProps) {
  const admin = createAdminClient()
  const [{ data: memberships }, zapRows] = await Promise.all([
    admin
      .from('memberships')
      .select('circle_id, circles!circle_id ( id, name )')
      .eq('profile_id', p.profileId)
      .eq('status', 'active'),
    loadZapBreakdown(p.profileId),
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
      />

      {/* Get started leads the right rail (README §3.1). Below 680px the rails are hidden, so the
          Feed carries the same box inline there and nowhere else (.fqm-gs-inline). */}
      {p.onboarding && <GetStarted steps={p.onboarding} className="fqm-gs-inline" />}

      <Suspense fallback={<section className="fa-hero" aria-busy="true"><div className="fa-hero-body"><span className="k">Up next for you</span></div></section>}>
        <PlannerSection eventsP={eventsP} hasHome={!!p.home} profileId={p.profileId} />
      </Suspense>

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
