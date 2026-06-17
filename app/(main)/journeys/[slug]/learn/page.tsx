import Image from 'next/image'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Pencil, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { getMemberRunForPlan, getCohortProgress, getSoloEnrollmentStart, getKickoffEvent, type KickoffEvent } from '@/lib/journeys/runs'
import { getPlanAuthor } from '@/lib/journey-plans'
import { getJourneyLearnExtras, getLinkedEvent, pillarsById } from '@/lib/journeys/learn'
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

  // The follow-along extras: the library practice behind each `practice` step, each phase's focus
  // copy, the normalized meeting, and the four-Pillar balance — composed over the existing reads
  // (lib/journeys/learn.ts), plus the author. Loaded in parallel with the Run/cohort resolution.
  const [extras, author] = await Promise.all([getJourneyLearnExtras(slug), getPlanAuthor(plan.author_id)])

  // The Event this Journey gathers around (meeting.eventId, set from the "Create Event" flow),
  // resolved to a link target. Null when unset or gone — the meeting block then shows a plain line.
  const linkedEvent = await getLinkedEvent(extras.meeting.eventId)

  // If the member is in a Circle Run of this Journey, show the shared cohort meter.
  // Best-effort: hidden (and harmless) until the Runs tables are live.
  // We also resolve the phase-drip ANCHOR here (build item §11.1 #1): a cohort drips from the
  // Run's start, a solo learner from their own enrollment start. null = no drip lock.
  const planDrip = (plan as { drip_interval_days?: number }).drip_interval_days ?? 7
  let cohort: CohortProgress | null = null
  let kickoff: KickoffEvent | null = null
  let anchorStart: string | null = null
  let dripIntervalDays = planDrip
  try {
    const run = await getMemberRunForPlan(profileId, view.plan.id)
    if (run) {
      cohort = await getCohortProgress(run.id, view.plan.id)
      anchorStart = run.startedAt
      dripIntervalDays = run.dripIntervalDays
      kickoff = await getKickoffEvent(run.id)
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
  for (const [itemId, practice] of extras.practiceByItem) {
    const pillar = practice.domain_id ? byId.get(practice.domain_id) ?? null : null
    detailById[itemId] = <PracticeDetail practice={practice} pillar={pillar} />
    if (pillar) pillarByLesson[itemId] = pillar.name
    practiceIdByLesson[itemId] = practice.id
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
          <Link
            href={`/journeys/${slug}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit journey
          </Link>
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
        <div className="mb-4">
          <CohortMeter progress={cohort} />
        </div>
      )}

      {/* Overview + course context — what this is, how it's shaped, how it meets, who guides it —
          read above the player so the Journey lands as a cohesive course, not a bare lesson list.
          The hero is two-column: the description on the left, the stat band + key details right. */}
      <div className="mb-6 space-y-6">
        <AboutThisJourneyHero plan={plan} phaseCount={view.tree.phases.length} pillarBalance={extras.pillarBalance} />
        <MeetingBlock meeting={extras.meeting} linkedEvent={linkedEvent} />
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
        certificateEnabled={plan.certificate_enabled}
        anchorStart={anchorStart}
        dripIntervalDays={dripIntervalDays}
      />
    </DetailTemplate>
  )
}
