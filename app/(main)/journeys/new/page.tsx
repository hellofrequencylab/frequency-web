import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canCreate } from '@/lib/core/load-capabilities'
import { getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/access-matrix'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { asSpacePlan } from '@/lib/pricing/plans'
import { JourneySpark } from '@/components/journey/v2/journey-spark'
import { AuthoringAccessNote } from '@/components/pricing/authoring-access-note'
import { JOURNEY_TEMPLATES } from '@/lib/journeys/templates'
import { getSpacePlan } from '@/lib/calendar/plans-store'

// Create a Journey (ADR-302). New Journeys open in the guided builder: Vera's short Spark wizard
// (who · about · outcome · weeks · pace) drafts the identity, then creates the row + one weekly
// Phase per week and drops the author into the editor. NOTHING persists until the author commits a
// reviewed title (no untitled drafts). "Skip — I'll build it myself" hands off to the manual draft
// editor. Refining (cover, story, practices, publish) happens in the editor.
//
// The SAME page serves a Space's "New journey" via `?space=<slug>` (owner directive): a Space manager
// gets the identical guided builder, and the Journey is stamped to their Space instead of their
// personal account. The gate then reads MANAGING the Space (owner / admin / editor), not the member
// tier, so a free member who runs a Space can build for their members.
//
// ── AND `?plan=<space_plans.id>`, THE PRODUCTION ROAD (PROG-CAL8, ADR-1386) ─────────────────────
// "Make it a Production" on the Plan board opens this page for a Plan whose target kind is
// `journey`. It has sent `&plan=` since 2026-09-19 and this page never declared the parameter, so
// every Journey created that way arrived holding nothing of the Plan it came from. (It never got
// that far in practice: the same href sent a Space UUID to a `?space=` this page resolves by SLUG,
// so `getVisibleSpaceBySlug` missed and `redirect('/spaces')` fired. Both halves are fixed — see
// PLAN_TARGET_DEFS in lib/calendar/plans.ts.)
//
// The Plan is resolved HERE only to seed and to name itself on screen. The authority that decides
// whether the link may be MADE lives in create-actions.ts, which re-resolves it through the same
// `getSpacePlan` on the caller's own session at write time; a page-level read is never a permit.
// A `?plan=` with no `?space=` is meaningless — a Plan belongs to a Space — and is reported rather
// than dropped, the same way /events/new reports a `?space=` it could not honour.
export const dynamic = 'force-dynamic'

export default async function NewJourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; plan?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { space: spaceSlug, plan: planParam } = await searchParams
  const caller = await getCallerProfile()
  const planId = typeof planParam === 'string' ? planParam.trim() : ''

  // The paid signal drives only the authoring-access note (what changes after the beta). Personal
  // Journeys read the caller's real tier; a Space's read the Space plan.
  let paidOwner = isPaid(caller?.realMembershipTier)

  // The Plan this Journey is being produced from, once the Space is known and the caller has been
  // found to manage it. Null when there is no `?plan=`, when it is not one this Space runs, or when
  // RLS does not let this caller see it.
  let spacePlan: { id: string; title: string } | null = null

  if (spaceSlug) {
    // Space-authored: gate on managing the Space, not the personal journey.create capability.
    const space = await getVisibleSpaceBySlug(spaceSlug, caller?.id ?? null)
    if (!space) redirect('/spaces')
    const caps = await getSpaceCapabilities(space, caller?.id ?? null)
    if (!caps.canEditProfile) redirect(`/spaces/${spaceSlug}`)
    paidOwner = asSpacePlan(space.plan) !== 'free'
    if (planId) {
      const found = await getSpacePlan(space.id, planId)
      if (found) spacePlan = { id: found.id, title: found.title }
    }
  } else {
    // Drafting is open to any signed-in member (FIRST ONE FREE, ADR-920/908/838); the free
    // limit is the journey_publish meter at the publish gate. Signed-out lands on sign-in.
    if (!(await canCreate('journey.create'))) redirect('/sign-in?next=/journeys/new')
  }

  // Lightweight template metadata for the "Start from a template" picker. The full template trees
  // (lib/journeys/templates.ts) pull in server-only compose code, so we map to a client-safe shape
  // here and hand it to the wizard as props rather than importing it into the client bundle.
  const templates = JOURNEY_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    emoji: t.emoji,
    phases: t.phases.length,
    lessons: t.phases.reduce((n, p) => n + p.modules.reduce((m, mod) => m + mod.lessons.length, 0), 0),
  }))

  // A `?plan=` that could not be honoured. Said out loud, never swallowed: the author would
  // otherwise build the whole Journey believing it was the Plan's Production and find the Plan
  // still sitting under Planning afterwards, with nothing anywhere explaining why.
  const droppedPlanLink = !!planId && !spacePlan

  return (
    <>
      <div className="mx-auto w-full max-w-lg px-4 pt-6">
        <AuthoringAccessNote kind="journey" paidOwner={paidOwner} />
        {droppedPlanLink && (
          <p className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/30 px-4 py-3 text-body-sm leading-relaxed text-text">
            You opened this from a Plan this space does not run, so the Journey below will not be
            linked to it. Open the Plan from the space Calendar and try again.
          </p>
        )}
      </div>
      <JourneySpark templates={templates} spaceSlug={spaceSlug ?? null} spacePlan={spacePlan} />
    </>
  )
}
