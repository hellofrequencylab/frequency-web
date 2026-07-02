import Image from 'next/image'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarClock } from 'lucide-react'
import { JourneyAuthorActions } from '@/components/journey/v2/learn/journey-author-actions'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { getMemberRunForPlan, getCohortProgress, getSoloEnrollmentStart, getKickoffEvent, getPhaseEvents, type KickoffEvent } from '@/lib/journeys/runs'
import { HostSchedule } from '@/components/journey/v2/learn/host-schedule'
import { getPlanAuthor } from '@/lib/journey-plans'
import { getJourneyLearnExtras, getLinkedEvent, getLoggedTodayPracticeIds, pillarsById } from '@/lib/journeys/learn'
import { getPartialMapToday, type PartialToday } from '@/lib/practices'
import { LearnPlayer } from '@/components/journey/v2/learn/learn-player'
import { PracticeDetail } from '@/components/journey/v2/learn/practice-detail'
import { AboutThisJourneyHero, MeetingBlock, AuthorBlock } from '@/components/journey/v2/learn/journey-overview'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { DetailTemplate } from '@/components/templates'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import type { CohortProgress } from '@/lib/journeys/cohort'

// Journeys v2 — the learner player route (ADR-252, J1b). The clean, focused "take this journey"
// surface — overhauled into a fully cohesive COURSE a member follows: the intro/overview, an
// "About this Journey" band (weeks · time · difficulty · reward · cadence · Pillar balance), how
// the Circle meets, the author, and the lesson player with each week's focus + the real practice
// detail (cadence · time · Pillar · the "Why it works / How to do it" write-up) inline. Renders the
// Phase → Module → Lesson tree for the signed-in member. Works on existing (flat) journeys too —
// the tree wraps loose lessons in an implicit phase — so it's reachable before the full v2 cutover.
export const dynamic = 'force-dynamic'

export default async function JourneyLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')

  const profileId = (profile as { id: string }).id
  const view = await getJourneyPlayerView(slug, profileId)
  if (!view) notFound()

  const { plan } = view

  // Visibility gate (mirrors the detail page at [slug]/page.tsx): a PRIVATE Journey is
  // readable only by its author. getJourneyPlayerView -> getPlan loads by slug with no
  // visibility filter, so without this any signed-in member could open an unpublished
  // draft's full lesson bodies + media by hitting /journeys/<slug>/learn directly.
  if (plan.visibility === 'private' && plan.author_id !== profileId) notFound()

  // The follow-along extras: the library practice behind each `practice` step, each phase's focus
  // copy, the normalized meeting, and the four-Pillar balance — composed over the existing reads
  // (lib/journeys/learn.ts), plus the author. Loaded in parallel with the Run/cohort resolution.
  const [extras, author, loggedToday, partialMap] = await Promise.all([
    getJourneyLearnExtras(slug),
    getPlanAuthor(plan.author_id),
    getLoggedTodayPracticeIds(profileId),
    // Banked-but-unfinished sits today, keyed by practice id — a timer practice step then offers
    // "Continue Practice" to resume the rest. One read, no per-step query.
    getPartialMapToday(profileId),
  ])
  const partialByPractice: Record<string, PartialToday> = Object.fromEntries(partialMap)

  // The Events each touchpoint gathers around (the Circle Meetup + the Weekend Gathering, ADR-307),
  // resolved to link targets. Null when unset or gone — the block then shows a plain line.
  const [meetupEvent, gatheringEvent] = await Promise.all([
    getLinkedEvent(extras.meeting.eventId),
    getLinkedEvent(extras.meeting.gathering?.eventId ?? null),
  ])

  // If the member is in a Circle Run of this Journey, show the shared cohort meter.
  // Best-effort: hidden (and harmless) until the Runs tables are live.
  // We also resolve the phase-drip ANCHOR here (build item §11.1 #1): a cohort drips from the
  // Run's start, a solo learner from their own enrollment start. null = no drip lock.
  const planDrip = (plan as { drip_interval_days?: number }).drip_interval_days ?? 7
  let cohort: CohortProgress | null = null
  let kickoff: KickoffEvent | null = null
  let anchorStart: string | null = null
  let dripIntervalDays = planDrip
  let runId: string | null = null
  let isRunHost = false
  // Per-week scheduled touchpoint Events (ADR-307), keyed by phase id, serialized for the client.
  let phaseEventsById: Record<
    string,
    { meetup: { slug: string; title: string; startsAt: string } | null; gathering: { slug: string; title: string; startsAt: string } | null }
  > = {}
  try {
    const run = await getMemberRunForPlan(profileId, view.plan.id)
    if (run) {
      runId = run.id
      isRunHost = run.hostId === profileId
      anchorStart = run.startedAt
      dripIntervalDays = run.dripIntervalDays
      // Three independent run reads — cohort progress, the kickoff Event, and the per-week
      // scheduled touchpoints — fetched together instead of in series (site audit 2026-06-18).
      const [cohortProgress, kickoffEvent, pe] = await Promise.all([
        getCohortProgress(run.id, view.plan.id),
        getKickoffEvent(run.id),
        getPhaseEvents(run.id),
      ])
      cohort = cohortProgress
      kickoff = kickoffEvent
      phaseEventsById = Object.fromEntries(
        [...pe.entries()].map(([pid, v]) => [
          pid,
          {
            meetup: v.meetup ? { slug: v.meetup.slug, title: v.meetup.title, startsAt: v.meetup.startsAt } : null,
            gathering: v.gathering ? { slug: v.gathering.slug, title: v.gathering.title, startsAt: v.gathering.startsAt } : null,
          },
        ]),
      )
    } else {
      anchorStart = await getSoloEnrollmentStart(profileId, view.plan.id)
    }
  } catch {
    /* Runs not enabled yet */
  }

  const isAuthor = view.plan.author_id === profileId
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  // Pre-render the rich practice detail ONCE per practice step (server-rendered markdown, no client
  // cost) and the per-step Pillar names — the player looks both up by the selected lesson id (the
  // RSC interleaving pattern: a Server Component handed to a Client Component as a node map).
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
  const phaseFocusById = Object.fromEntries(extras.phaseFocus)

  return (
    <DetailTemplate
      back={{ href: '/journeys', label: 'Journeys' }}
      hero={
        plan.cover_image ? (
          <div className="relative h-32 w-full sm:h-40">
            <Image fill sizes="100vw" src={plan.cover_image} alt="" className="rounded-2xl border border-border object-cover" />
          </div>
        ) : undefined
      }
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
          >
            <PlanIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 break-words">{plan.title}</span>
        </span>
      }
      subtitle={plan.summary ? <span className="block leading-relaxed">{plan.summary}</span> : undefined}
      actions={
        isAuthor ? (
          <JourneyAuthorActions slug={slug} planId={plan.id} visibility={plan.visibility} />
        ) : undefined
      }
    >
      {kickoff && (
        <Link
          href={`/events/${kickoff.slug}`}
          className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm transition-colors hover:border-primary"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" />
          <span className="font-medium text-text">Kickoff meetup</span>
          <span className="text-muted">
            {new Date(kickoff.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        </Link>
      )}
      {cohort && (
        <div className="mb-4 space-y-2">
          <CohortMeter progress={cohort} />
          {anchorStart && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              Your Run runs{' '}
              {new Date(anchorStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} through{' '}
              {new Date(
                new Date(anchorStart).getTime() + view.tree.phases.length * dripIntervalDays * 86_400_000,
              ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              .
            </p>
          )}
        </div>
      )}
      {isRunHost && runId && (
        <HostSchedule
          slug={slug}
          runId={runId}
          phases={view.tree.phases
            .map((p, i) => ({ id: p.id, label: p.title?.trim() || `Week ${i + 1}` }))
            .filter((p) => p.id !== 'implicit-phase')}
          scheduled={phaseEventsById}
        />
      )}

      {/* Overview + course context — what this is, how it's shaped, how it meets, who guides it —
          read above the player so the Journey lands as a cohesive course, not a bare lesson list.
          The hero is two-column: the description on the left, the stat band + key details right. */}
      <div className="mb-6 space-y-6">
        <AboutThisJourneyHero plan={plan} phaseCount={view.tree.phases.length} pillarBalance={extras.pillarBalance} />
        <MeetingBlock meeting={extras.meeting} meetupEvent={meetupEvent} gatheringEvent={gatheringEvent} />
        <AuthorBlock author={author} />
      </div>

      <LearnPlayer
        slug={slug}
        title={plan.title}
        tree={view.tree}
        lessonsById={view.lessonsById}
        detailById={detailById}
        phaseFocusById={phaseFocusById}
        pillarByLesson={pillarByLesson}
        practiceIdByLesson={practiceIdByLesson}
        usesTimerByLesson={usesTimerByLesson}
        anchorLessonId={extras.anchorItemId}
        phaseEventsById={phaseEventsById}
        loggedPracticeIds={loggedToday}
        partialByPractice={partialByPractice}
        certificateEnabled={plan.certificate_enabled}
        anchorStart={anchorStart}
        dripIntervalDays={dripIntervalDays}
      />
    </DetailTemplate>
  )
}
