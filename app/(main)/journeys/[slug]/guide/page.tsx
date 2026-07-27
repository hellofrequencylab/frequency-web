import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getPlan } from '@/lib/journey-plans'
import { canEditJourney } from '@/lib/journeys/authoring'
import { resolveJourneyAccess } from '@/lib/journeys/journey-access'
import { readWizardState, furthestIncompletePhase, isGuidePhase } from '@/lib/journeys/wizard'
import { JOURNEY_TEMPLATES } from '@/lib/journeys/templates'
import { JourneyGuide, type GuidePhaseNode } from '@/components/journey/v2/journey-guide'

// The guided creation wizard, phases 3 to 5 (ADR-839): Shape · Schedule · Ready. Spark and
// Review ran on /journeys/new before the row existed; creating drops the author here, and a
// member who left mid-flow resumes on the FURTHEST INCOMPLETE phase (from the wizard entry in
// page_config). Author-gated like the editor; everyone else goes to the player. The editable
// counterpart of every phase lives at /journeys/<slug>/edit, one tap away from each step.
export const dynamic = 'force-dynamic'

export default async function JourneyGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ phase?: string }>
}) {
  const [{ slug }, { phase: requestedPhase }] = await Promise.all([params, searchParams])

  const caller = await getCallerProfile()
  if (!caller) redirect(`/journeys/${slug}/learn`)

  const loaded = await getPlan(slug)
  if (!loaded) notFound()
  if (!(await canEditJourney(loaded.plan.id, caller.id))) redirect(`/journeys/${slug}/learn`)

  const { plan, items } = loaded

  // Role/tier flags (lane J1's resolver): what to show, hide, or upsell. The real
  // enforcement stays in the server actions and the publish chokepoint.
  const access = await resolveJourneyAccess(
    { profileId: caller.id },
    { planId: plan.id, spaceId: plan.space_id },
  )

  // Flatten the block tree for the Shape phase: top-level phases, each with its steps
  // (module children fold into their phase; modules themselves are containers, not steps).
  // block_type widens at runtime to the v2 set (phase/module/...) beyond the BlockType union,
  // so coerce to string for those checks — the same idiom the learn loader uses.
  const phaseRows = items
    .filter((i) => String(i.block_type ?? 'practice') === 'phase' && !i.parent_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const moduleIdsByPhase = new Map<string, Set<string>>()
  for (const i of items) {
    if (String(i.block_type ?? 'practice') === 'module' && i.parent_id) {
      const set = moduleIdsByPhase.get(i.parent_id) ?? new Set<string>()
      set.add(i.id)
      moduleIdsByPhase.set(i.parent_id, set)
    }
  }
  const phases: GuidePhaseNode[] = phaseRows.map((p) => {
    const moduleIds = moduleIdsByPhase.get(p.id) ?? new Set<string>()
    const steps = items
      .filter((i) => {
        const type = String(i.block_type ?? 'practice')
        if (type === 'phase' || type === 'module') return false
        return i.parent_id === p.id || (i.parent_id ? moduleIds.has(i.parent_id) : false)
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({
        id: i.id,
        title: i.title ?? i.practice?.title ?? '',
        type: i.block_type ?? 'practice',
      }))
    return { id: p.id, title: p.title ?? '', steps }
  })

  // Resume on the furthest incomplete phase; a ?phase= deep link (e.g. from the editor)
  // may jump anywhere.
  const wizard = readWizardState(plan.page_config)
  const initialPhase = isGuidePhase(requestedPhase) ? requestedPhase : furthestIncompletePhase(wizard)

  // Client-safe template metadata for the Shape phase's empty-state picker (same mapping
  // as /journeys/new — the full trees pull server-only compose code).
  const templates = JOURNEY_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    emoji: t.emoji,
    phases: t.phases.length,
    lessons: t.phases.reduce((n, p) => n + p.modules.reduce((m, mod) => m + mod.lessons.length, 0), 0),
  }))

  return (
    <JourneyGuide
      plan={{
        planId: plan.id,
        slug,
        title: plan.title,
        summary: plan.summary,
        intro: plan.intro,
        coverImage: plan.cover_image,
        visibility: plan.visibility,
        dripIntervalDays: plan.drip_interval_days,
        windowStartsAt: plan.window_starts_at,
        windowEndsAt: plan.window_ends_at,
      }}
      phases={phases}
      templates={templates}
      access={{
        canPublish: access.canPublish,
        canRunCohorts: access.canRunCohorts,
        dripAllowed: access.dripAllowed,
        publishCap: access.publishCap,
      }}
      initialPhase={initialPhase}
    />
  )
}
