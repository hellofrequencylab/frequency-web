import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { getMemberRunForPlan, getCohortProgress, getSoloEnrollmentStart } from '@/lib/journeys/runs'
import { JourneyPlayer } from '@/components/journey/v2/journey-player'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { DetailTemplate } from '@/components/templates'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import type { CohortProgress } from '@/lib/journeys/cohort'

// Journeys v2 — the learner player route (ADR-252, J1b). The clean, focused "take this journey"
// surface. Renders the Phase → Module → Lesson tree for the signed-in member. Works on existing
// (flat) journeys too — the tree wraps loose lessons in an implicit phase — so it's reachable
// before the full v2 cutover (J5).
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

  // If the member is in a Circle Run of this Journey, show the shared cohort meter.
  // Best-effort: hidden (and harmless) until the Runs tables are live.
  // We also resolve the phase-drip ANCHOR here (build item §11.1 #1): a cohort drips from the
  // Run's start, a solo learner from their own enrollment start. null = no drip lock.
  const { plan } = view
  const planDrip = (plan as { drip_interval_days?: number }).drip_interval_days ?? 7
  let cohort: CohortProgress | null = null
  let anchorStart: string | null = null
  let dripIntervalDays = planDrip
  try {
    const run = await getMemberRunForPlan(profileId, view.plan.id)
    if (run) {
      cohort = await getCohortProgress(run.id, view.plan.id)
      anchorStart = run.startedAt
      dripIntervalDays = run.dripIntervalDays
    } else {
      anchorStart = await getSoloEnrollmentStart(profileId, view.plan.id)
    }
  } catch {
    /* Runs not enabled yet */
  }

  const isAuthor = view.plan.author_id === profileId
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  return (
    <DetailTemplate
      back={{ href: '/journeys', label: 'Journeys' }}
      hero={
        plan.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plan.cover_image} alt="" className="h-32 w-full rounded-2xl border border-border object-cover sm:h-40" />
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
      {cohort && (
        <div className="mb-4">
          <CohortMeter progress={cohort} />
        </div>
      )}
      <JourneyPlayer
        slug={slug}
        title={plan.title}
        tree={view.tree}
        lessonsById={view.lessonsById}
        certificateEnabled={plan.certificate_enabled}
        anchorStart={anchorStart}
        dripIntervalDays={dripIntervalDays}
      />
    </DetailTemplate>
  )
}
