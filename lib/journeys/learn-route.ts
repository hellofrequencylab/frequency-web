import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { loadJourneyEntryFacts } from '@/lib/journeys/entry-door'
import { canEnterJourney } from '@/lib/journeys/entry-gate'
import { getJourneyLearnExtras } from '@/lib/journeys/learn'
import { getMemberRunForPlan, getCohortProgress, getSoloEnrollmentStart, getKickoffEvent, getPhaseEvents, type KickoffEvent } from '@/lib/journeys/runs'
import type { CohortProgress } from '@/lib/journeys/cohort'
import { cadenceUnit, ongoingCycle } from '@/lib/journeys/schedule'

// The ONE loader behind the enrolled side of a Journey: the course home (/journeys/<slug>/learn)
// and the focus player (/journeys/<slug>/play). Both pages used to be one page, so the door, the
// drip anchor and the Run reads lived in it. Split into two routes, they would have been two copies
// of the door, which is exactly the drift SCAN-725 fixed for the lesson-complete action. One place.

/** A Run's dated touchpoints for one phase, serialized for the client player. */
type PhaseEventsById = Record<
  string,
  { meetup: { slug: string; title: string; startsAt: string } | null; gathering: { slug: string; title: string; startsAt: string } | null }
>

export async function loadJourneyLearnRoute(slug: string, from: 'learn' | 'play') {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/sign-in?next=/journeys/${slug}/${from}`)

  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  const profileId = (profile as { id: string }).id
  const view = await getJourneyPlayerView(slug, profileId)
  if (!view) notFound()
  const { plan } = view

  // A PRIVATE Journey is readable only by its author (getJourneyPlayerView loads by slug with no
  // visibility filter, so without this any member could open a draft's lesson bodies by URL).
  if (plan.visibility === 'private' && plan.author_id !== profileId) notFound()

  // ── THE DOOR (ADR-1397). Every Journey checks enrolment. A refusal goes to the Journey's own
  //    page, which is its sales page: notFound() would hide the one page built to convert them.
  const entry = await loadJourneyEntryFacts(profileId, plan)
  if (!canEnterJourney(entry)) redirect(`/journeys/${plan.slug}`)

  const extras = await getJourneyLearnExtras(slug)

  // The drip ANCHOR: a cohort drips from the Run's start, a solo learner from their own enrolment
  // start. null = no drip lock. Best-effort: hidden (and harmless) until the Runs tables are live.
  let cohort: CohortProgress | null = null
  let kickoff: KickoffEvent | null = null
  let anchorStart: string | null = null
  let dripIntervalDays = (plan as { drip_interval_days?: number }).drip_interval_days ?? 7
  let runId: string | null = null
  let isRunHost = false
  let phaseEventsById: PhaseEventsById = {}
  try {
    const run = await getMemberRunForPlan(profileId, plan.id)
    if (run) {
      runId = run.id
      isRunHost = run.hostId === profileId
      anchorStart = run.startedAt
      dripIntervalDays = run.dripIntervalDays
      const [cohortProgress, kickoffEvent, pe] = await Promise.all([
        getCohortProgress(run.id, plan.id),
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
      anchorStart = await getSoloEnrollmentStart(profileId, plan.id)
    }
  } catch {
    /* Runs not enabled yet */
  }

  // An ONGOING Journey (journey_plans.ongoing) repeats each year: once every phase has opened it
  // names the calendar's phase as current ("Month 5 of Year 2") instead of reading as finished.
  const cycle =
    (plan as { ongoing?: boolean }).ongoing && anchorStart
      ? ongoingCycle(anchorStart, dripIntervalDays, view.tree.phases.length)
      : null

  return {
    profileId,
    plan,
    tree: view.tree,
    lessonsById: view.lessonsById,
    extras,
    entry,
    isAuthor: plan.author_id === profileId,
    cohort,
    kickoff,
    anchorStart,
    dripIntervalDays,
    unit: cadenceUnit(dripIntervalDays),
    cycle,
    runId,
    isRunHost,
    phaseEventsById,
  }
}
