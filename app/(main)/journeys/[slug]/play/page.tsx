import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getLoggedTodayPracticeIds, pillarsById } from '@/lib/journeys/learn'
import { loadJourneyLearnRoute } from '@/lib/journeys/learn-route'
import { getPartialMapToday, type PartialToday } from '@/lib/practices'
import { LearnPlayer } from '@/components/journey/v2/learn/learn-player'
import { PracticeDetail } from '@/components/journey/v2/learn/practice-detail'
import { JourneyDock } from '@/components/journey/nav/journey-dock'

// THE FOCUS PLAYER (/journeys/<slug>/play) — one lesson at a time with nothing else on screen. The
// shell drops its header, rails and tab bar here (page-chrome's full-viewport list); the player's
// own strip carries the outline, Back/Next and progress, and the Journey dock sits on the bottom
// edge to get back to the course, the sales page or the Library. `?lesson=<id>` opens a step
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

  return (
    // A takeover drops the shell's page gutters, so the page pads itself (safe areas included).
    <div className="px-4 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
    <FocusTemplate
      width="wide"
      divider={false}
      back={{ href: `/journeys/${slug}/learn`, label: 'Course' }}
      eyebrow="Focus mode"
      title={plan.title}
    >
      <LearnPlayer
        slug={slug}
        title={plan.title}
        tree={tree}
        lessonsById={r.lessonsById}
        detailById={detailById}
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
        initialLessonId={lesson ?? null}
      />
      <JourneyDock slug={slug} active="focus" percent={tree.percent} aboutHref={isAuthor ? `/journeys/${slug}` : undefined} focus />
    </FocusTemplate>
    </div>
  )
}
