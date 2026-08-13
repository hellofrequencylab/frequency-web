import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Sprout } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { getCohortProgress } from '@/lib/journeys/runs'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { UpcomingEventRows } from '@/components/events/upcoming-event-rows'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonClasses } from '@/components/ui/button'
import {
  circleEventInsider,
  loadCircleActiveRun,
  loadCirclePractice,
  loadCircleUpcomingEvents,
} from '../tab-facts'

// ── THE PROGRAM TAB ─────────────────────────────────────────────────────────────────────────────
//
// A BODY, not a shell: the cover, the title and the tab strip belong to the route-segment layout
// one directory up, which owns the single page <h1> (composing a template here would emit a second
// one and trip `check:headers`).
//
// ONE TAB FOR WHAT THE CIRCLE IS DOING (owner ruling, 2026-08-12). Practice, Events and Journey
// were three sibling tabs, and a member who found one rarely learned the other two existed. They
// are not three subjects: they are the same subject at three horizons — this week, the weeks ahead,
// and the arc the Circle is walking together. So they read top to bottom on one page, in that
// order, and /circles/<slug>/practice, /events and /journey redirect here.
//
// EACH SECTION STILL HIDES WHEN IT HAS NOTHING, which is exactly what the old tab strip did for it
// (lib/circles/tabs.ts): a Circle with nothing booked showed no Events tab, a Circle with no Run
// showed no Journey tab. Folding them together must not turn three hidden tabs into three empty
// rooms stacked on one page. When all three are empty, ONE empty state speaks for the tab rather
// than three saying the same thing in different words.
//
// EVERY READ IS THE SHELL'S OWN MEMOIZED LOADER (../tab-facts.ts). The shell already asked all
// three questions to decide whether this tab exists, so the three loads below are request-memo
// hits: one page, three sections, no extra round trips.
//
// SELECTION RULES stay where they were. Which events belong to a Circle and who may see them listed
// is pure and unit-tested in lib/events/circle-upcoming.ts + lib/events/series.ts; a Circle goes
// through one Journey at a time (ADR-252), which is why there is one Run here and one shared meter.
//
// MEMBER COPY SAYS "RUN", NEVER "COHORT" (docs/NAMING.md). `getCohortProgress` is the internal name
// of the read; nothing it produces is labelled that way on screen.

export const metadata = { title: "What's On" }

export default async function CircleWhatsOnPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The same request-memoized load the shell made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, members } = shell

  const [myProfileId, caps] = await Promise.all([getMyProfileId(), circleCapabilities(circle.id)])
  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId
  const canManage = caps.has('circle.editSettings')

  // The three content reads, in parallel and all memoized by the shell. `insider` is derived from
  // the roster (not from caps) so this page derives the SAME events key the strip did and hits the
  // memo. See circleEventInsider.
  const [practice, events, run] = await Promise.all([
    loadCirclePractice(circle.id),
    loadCircleUpcomingEvents(circle.id, circleEventInsider({ isMember, isHost })),
    loadCircleActiveRun(circle.id),
  ])

  const hasEvents = events.events.length > 0

  // Nothing on any horizon. One answer for the tab, with the manager's next step attached, rather
  // than three empty sections that each say a smaller version of it.
  if (!practice && !hasEvents && !run) {
    return (
      <EmptyState
        variant="first-use"
        icon={Sprout}
        title="Nothing scheduled yet"
        description={
          canManage
            ? 'Set a practice, book an event, or start a journey from the circle tools. Whatever this circle has going shows up here.'
            : 'The host has not set a practice, booked an event, or started a journey yet. All three show up here when they do.'
        }
        action={
          canManage ? (
            <Link href={`/events/new?circle=${circle.id}`} className={buttonClasses('primary', 'sm')}>
              Create an event
            </Link>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-8">
      {/* 1. THIS WEEK. The host-assigned practice, and for a member the one button that turns it
             into a logged day. */}
      {practice && (
        <section aria-labelledby="circle-practice-heading">
          <SectionHeader id="circle-practice-heading" title="This week's practice" />
          <div className="rounded-card border border-border bg-surface px-5 py-4">
            <p className="font-medium text-text">{practice.title}</p>
            {practice.description && (
              <p className="mt-0.5 text-body-sm text-muted">{practice.description}</p>
            )}
            {isMember && (
              <div className="mt-3">
                <LogPracticeButton practiceId={practice.id} circleId={circle.id} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. THE WEEKS AHEAD. The Circle's own calendar: the same selection rules the info rail's
             five-row teaser used, thirty rows instead of five, and a repeating series folded to its
             next date (ADR-897). */}
      {hasEvents && (
        <section aria-labelledby="circle-events-heading" className="space-y-4">
          <div>
            <SectionHeader
              id="circle-events-heading"
              title="Coming up"
              count={events.events.length}
            />
            <p className="-mt-2 text-body-sm text-muted">
              {isMember || canManage
                ? 'Every gathering this circle has booked, soonest first. A repeating event shows its next date.'
                : 'The gatherings this circle has booked, soonest first.'}
            </p>
          </div>

          <UpcomingEventRows events={events.events} />
          {events.hasMore && (
            <p className="px-1">
              <Link href="/events" className="text-meta font-medium text-primary-strong hover:underline">
                See all events
              </Link>
            </p>
          )}
        </section>
      )}

      {/* 3. THE ARC. How far the Circle has got through the Journey it is walking together. The
             meter is cooperative by design and that is the whole reason it is not a leaderboard:
             one shared bar for the Circle, no per-member ranking (JOURNEYS.md §3). */}
      {run && (
        <section aria-labelledby="circle-journey-heading" className="space-y-3">
          <div>
            <SectionHeader
              id="circle-journey-heading"
              title={run.plan.emoji ? `${run.plan.emoji} ${run.plan.title}` : run.plan.title}
              action={
                <Link href={`/journeys/${run.plan.slug}`} className={buttonClasses('secondary', 'sm')}>
                  Open the journey
                </Link>
              }
            />
            {run.plan.summary && <p className="-mt-2 text-body-sm text-muted">{run.plan.summary}</p>}
          </div>

          {/* The progress read walks every enrolled member's tree, so it streams behind its own
              boundary while everything above it paints (PAGE-FRAMEWORK §5.2/§5.3). */}
          <Suspense fallback={<Skeleton className="h-28 w-full rounded-card" />}>
            <RunProgress runId={run.id} planId={run.plan.id} circleName={circle.name} />
          </Suspense>
        </section>
      )}
    </div>
  )
}

async function RunProgress({
  runId,
  planId,
  circleName,
}: {
  runId: string
  planId: string
  circleName: string
}) {
  const progress = await getCohortProgress(runId, planId)

  // CohortMeter renders nothing when nobody is enrolled yet, which is a real state on the day a
  // host starts a Run. Say so plainly rather than leaving a gap where a meter should be.
  if (progress.memberCount === 0) {
    return (
      <p className="text-body-sm text-muted">
        Nobody has started yet. Progress shows up here as soon as the first person opens a lesson.
      </p>
    )
  }

  return <CohortMeter progress={progress} circleName={circleName} />
}
