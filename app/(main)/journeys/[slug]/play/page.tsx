import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getLoggedTodayPracticeIds, pillarsById } from '@/lib/journeys/learn'
import { loadJourneyLearnRoute } from '@/lib/journeys/learn-route'
import { getPartialMapToday, type PartialToday } from '@/lib/practices'
import { LearnPlayer } from '@/components/journey/v2/learn/learn-player'
import { PracticeDetail } from '@/components/journey/v2/learn/practice-detail'
import { LessonProse } from '@/components/journey/v2/learn/lesson-prose'
import { parseVideoEmbed } from '@/lib/video-embed'
import { JourneyDock } from '@/components/journey/nav/journey-dock'
import { upNext } from '@/components/journey/v2/learn/course-home'
import { phaseLockStates } from '@/lib/journeys/schedule'

// THE FOCUS PLAYER (/journeys/<slug>/play) — one lesson at a time with nothing else on screen. The
// shell drops its header, rails and tab bar here (page-chrome's full-viewport list); the player's
// own bar carries the way back, the outline, the Journey week by week and Back/Next, the lesson's
// title is the page's h1, and the Journey dock sits on the bottom edge to get back to the course,
// the sales page or the Library. `?lesson=<id>` opens a step
// directly (the course home's rows, Continue, the rail's next-lesson nudge). Same door as the
// course home: lib/journeys/learn-route.ts.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Focus', robots: { index: false } }

export default async function JourneyPlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lesson?: string }>
}) {
  const { slug } = await params
  const { lesson } = await searchParams
  const r = await loadJourneyLearnRoute(slug, 'play')
  const { plan, tree, extras, isAuthor } = r

  const [loggedToday, partialMap] = await Promise.all([
    getLoggedTodayPracticeIds(r.profileId),
    // Banked-but-unfinished sits today, keyed by practice id: a timer step offers "Continue Practice".
    getPartialMapToday(r.profileId),
  ])
  const partialByPractice: Record<string, PartialToday> = Object.fromEntries(partialMap)

  // Which weeks have opened (the drip), shared by the open-at pick and the lesson bodies below.
  const locks = phaseLockStates(tree.phases.length, r.anchorStart, r.dripIntervalDays)

  // With no ?lesson, an ONGOING Journey opens on this month's next step (the calendar's phase),
  // not the first gap in the backlog. A Journey that ends leaves the choice to the player.
  const openAt = r.cycle
    ? upNext(tree, locks, r.cycle)?.lesson.id ?? null
    : null

  // Pre-render the rich practice detail ONCE per practice step (server markdown, no client cost),
  // handed to the client player as a node map keyed by lesson id (the RSC interleaving pattern).
  const byId = pillarsById(extras.pillars)
  const detailById: Record<string, ReactNode> = {}
  const pillarByLesson: Record<string, string> = {}
  const practiceIdByLesson: Record<string, string> = {}
  const usesTimerByLesson: Record<string, boolean> = {}
  for (const [itemId, practice] of extras.practiceByItem) {
    const pillar = practice.domain_id ? byId.get(practice.domain_id) ?? null : null
    detailById[itemId] = <PracticeDetail practice={practice} pillar={pillar} />
    if (pillar) pillarByLesson[itemId] = pillar.name
    practiceIdByLesson[itemId] = practice.id
    usesTimerByLesson[itemId] = practice.uses_timer
  }

  // Every OPEN lesson's body, rendered once on the server as a lesson (real lists, headings, pull
  // quotes: LessonProse), handed to the player as a node map like the practice detail above. A
  // week that has not opened sends nothing: its words stay on the server until its day.
  const bodyById: Record<string, ReactNode> = {}
  const lessonsById = { ...r.lessonsById }
  tree.phases.forEach((p, i) => {
    for (const m of p.modules)
      for (const l of m.lessons) {
        const content = lessonsById[l.id]
        if (!content?.body) continue
        if (locks[i]?.locked) lessonsById[l.id] = { ...content, body: null }
        else if (!parseVideoEmbed(content.body)) bodyById[l.id] = <LessonProse>{content.body}</LessonProse>
      }
  })

  return (
    // A takeover drops the shell's page gutters, so the page pads itself (safe areas included).
    <div className="px-4 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
    <FocusTemplate
      width="wide"
    >
      <LearnPlayer
        slug={slug}
        title={plan.title}
        tree={tree}
        lessonsById={lessonsById}
        detailById={detailById}
        bodyById={bodyById}
        phaseFocusById={Object.fromEntries(extras.phaseFocus)}
        pillarByLesson={pillarByLesson}
        practiceIdByLesson={practiceIdByLesson}
        usesTimerByLesson={usesTimerByLesson}
        anchorLessonId={extras.anchorItemId}
        phaseEventsById={r.phaseEventsById}
        loggedPracticeIds={loggedToday}
        partialByPractice={partialByPractice}
        certificateEnabled={plan.certificate_enabled}
        anchorStart={r.anchorStart}
        dripIntervalDays={r.dripIntervalDays}
        initialLessonId={lesson ?? openAt}
      />
      <JourneyDock slug={slug} active="focus" percent={tree.percent} aboutHref={isAuthor ? `/journeys/${slug}` : undefined} focus />
    </FocusTemplate>
    </div>
  )
}
