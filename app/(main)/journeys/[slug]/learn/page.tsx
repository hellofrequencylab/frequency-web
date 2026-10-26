import Link from 'next/link'
import { Eye, SlidersHorizontal, Tag } from 'lucide-react'
import { JourneyAuthorActions } from '@/components/journey/v2/learn/journey-author-actions'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { getJourneyOffer, seatLine } from '@/lib/journeys/paid'
import { HostSchedule } from '@/components/journey/v2/learn/host-schedule'
import { getPlanAuthor, countActiveAdopters } from '@/lib/journey-plans'
import { getLinkedEvent, pillarsById } from '@/lib/journeys/learn'
import { loadJourneyLearnRoute } from '@/lib/journeys/learn-route'
import { phaseLockStates, phaseUnlockAt } from '@/lib/journeys/schedule'
import { MeetingBlock } from '@/components/journey/v2/learn/journey-overview'
import { upNext, playHref } from '@/components/journey/v2/learn/course-home'
import { LeaveJourneyButton } from '@/components/journey/v2/learn/leave-journey-button'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { JourneyDock } from '@/components/journey/nav/journey-dock'
import { ShareImageProvider } from '@/modules/qr'
import { QrShareDropdown } from '@/modules/qr'
import { JourneyCourseBody } from '@/components/frequency/members/journey/journey-course-body'
import { OnThisJourneyPanel, MoreJourneysPanel, GuidePanel } from '@/components/frequency/members/journey/journey-side'
import { listFriendsOnJourney } from '@/lib/journeys/friends-on-journey'
import { listPublicJourneys } from '@/lib/journey-plans'

// THE COURSE HOME — where an enrolled member lands (ADR-252 J1b, split from the player). One of the
// four Journey views the dock links: About (the sales page, /journeys/<slug>), Course (here), Focus
// (the player, /journeys/<slug>/play) and Library (/journeys/library). This page answers how far
// am I, what do I do now, and what is the whole shape; the lesson itself opens in the player.
// The door, the drip anchor and the Run reads live in lib/journeys/learn-route.ts, shared with the
// player so the two routes cannot drift.
export const dynamic = 'force-dynamic'

export default async function JourneyLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const r = await loadJourneyLearnRoute(slug, 'learn')
  const { plan, tree, extras, entry, isAuthor, cohort, kickoff, anchorStart, dripIntervalDays, unit, cycle, runId, isRunHost, phaseEventsById } = r
  const canManageJourney = entry.canManage
  const journeyCaps = entry.caps

  const [author, meetupEvent, gatheringEvent] = await Promise.all([
    getPlanAuthor(plan.author_id),
    getLinkedEvent(extras.meeting.eventId),
    getLinkedEvent(extras.meeting.gathering?.eventId ?? null),
  ])

  // Members currently ON this Journey, named in the unpublish confirmation. Author + public only.
  const adopterCount = isAuthor && plan.visibility === 'public' ? await countActiveAdopters(plan.id, r.profileId) : 0

  // The sell chip's state (ADR-1397): a host already in the course can still price without leaving.
  const sellOffer = canManageJourney ? await getJourneyOffer(plan.id) : null
  const sellLabel = sellOffer
    ? [
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: (sellOffer.currency || 'usd').toUpperCase(),
          maximumFractionDigits: sellOffer.priceCents % 100 === 0 ? 0 : 2,
        }).format(sellOffer.priceCents / 100),
        seatLine(sellOffer),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Set a price'

  const byId = pillarsById(extras.pillars)
  const pillarByLesson: Record<string, string> = {}
  for (const [itemId, practice] of extras.practiceByItem) {
    const pillar = practice.domain_id ? byId.get(practice.domain_id) ?? null : null
    if (pillar) pillarByLesson[itemId] = pillar.name
  }
  const phaseFocusById = Object.fromEntries(extras.phaseFocus)
  const locks = phaseLockStates(tree.phases.length, anchorStart, dripIntervalDays)
  const next = upNext(tree, locks, cycle)

  // The Run's dates, one sentence (the same wording the DAWN course home prints under the meter).
  const runLine =
    cohort && anchorStart
      ? cycle
        ? `Your Run started ${new Date(anchorStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} and repeats each year.`
        : `Your Run runs ${new Date(anchorStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} through ${phaseUnlockAt(
            new Date(anchorStart),
            tree.phases.length,
            dripIntervalDays,
          ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`
      : null
  const [friends, publicJourneys] = await Promise.all([listFriendsOnJourney(r.profileId, plan.id), listPublicJourneys()])
  const more = publicJourneys
    .filter((j) => j.id !== plan.id)
    .slice(0, 3)
    .map((j) => ({ slug: j.slug, title: j.title, coverImage: j.cover_image, adoptCount: j.adopt_count }))
  const adoptCount = (plan as { adopt_count?: number }).adopt_count ?? 0
  return (
    <ShareImageProvider imageUrl={plan.cover_image ?? null}>
      <JourneyCourseBody
        slug={slug}
        title={plan.title}
        summary={plan.summary ?? null}
        adoptCount={adoptCount}
        tree={tree}
        locks={locks}
        unit={unit}
        cycle={cycle}
        anchorLessonId={extras.anchorItemId}
        phaseFocusById={phaseFocusById}
        pillarByLesson={pillarByLesson}
        phaseEvents={phaseEventsById}
        kickoff={kickoff}
        runLine={runLine}
        actions={
          <>
            {canManageJourney && (
              <OpenAdminBarButton
                scope={{ kind: 'journey', id: plan.id }}
                caps={Array.from(journeyCaps)}
                label="Manage"
                icon={<SlidersHorizontal className="h-4 w-4" />}
                className="btn sm"
              />
            )}
            {canManageJourney && (
              <OpenAdminBarButton
                scope={{ kind: 'journey', id: plan.id }}
                caps={Array.from(journeyCaps)}
                label={sellLabel}
                icon={<Tag className="h-4 w-4" />}
                className="btn sm"
              />
            )}
            {canManageJourney && (
              <Link href={`/journeys/${slug}`} className="btn sm">
                <Eye className="h-4 w-4" aria-hidden /> Sales page
              </Link>
            )}
            {isAuthor && (
              <JourneyAuthorActions slug={slug} planId={plan.id} visibility={plan.visibility} adopterCount={adopterCount} />
            )}
            <QrShareDropdown manager={canManageJourney} className="btn sm" />
          </>
        }
        side={
          <>
            <OnThisJourneyPanel friends={friends} adoptCount={adoptCount}>
              {cohort && <CohortMeter progress={cohort} />}
            </OnThisJourneyPanel>
            <GuidePanel author={author} />
            <MoreJourneysPanel more={more} />
          </>
        }
        details={
          <>
            <MeetingBlock meeting={extras.meeting} meetupEvent={meetupEvent} gatheringEvent={gatheringEvent} />
            {isRunHost && runId && (
              <HostSchedule
                slug={slug}
                runId={runId}
                phases={tree.phases
                  .map((p, i) => ({ id: p.id, label: p.title?.trim() || `${unit === 'month' ? 'Month' : 'Week'} ${i + 1}` }))
                  .filter((p) => p.id !== 'implicit-phase')}
                scheduled={phaseEventsById}
              />
            )}
          </>
        }
        leave={entry.enrolled ? <LeaveJourneyButton planId={plan.id} journeyTitle={plan.title} /> : null}
      />
      <JourneyDock
        slug={slug}
        active="course"
        percent={tree.percent}
        aboutHref={isAuthor ? `/journeys/${slug}` : undefined}
        focusHref={playHref(slug, next?.lesson.id)}
      />
    </ShareImageProvider>
  )
}
