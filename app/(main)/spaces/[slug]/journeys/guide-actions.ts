'use server'

// JOURNEY GUIDES (owner 2026-11-17): the WRITES behind journey_plan_guides. The steward of a Journey's
// home Space adds and removes the people who lead it. journey_plan_guides is service-role only, so this
// gate IS the authority: a steward of the Journey's own Space (the same approver set the co-host invite
// uses). A guide is credited and may host Runs; nothing here touches content or settings access.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { listShareApproverIds } from '@/lib/events/event-share'
import { addJourneyGuide, removeJourneyGuide } from '@/lib/journeys/guides'
import { type ActionResult, ok, fail } from '@/lib/action-result'

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

/** The Journey's home Space and its slug, when the caller stewards it. */
async function stewardedPlan(planId: string, profileId: string): Promise<{ spaceId: string; spaceSlug: string; slug: string } | string> {
  const { data: plan } = await db().from('journey_plans').select('space_id, slug').eq('id', planId).maybeSingle()
  const p = plan as { space_id: string | null; slug: string } | null
  if (!p) return 'Journey not found.'
  if (!p.space_id || p.space_id === (await loadRootSpaceId())) return 'Only a Journey that belongs to a Space can have guides.'
  if (!(await listShareApproverIds(p.space_id)).includes(profileId)) return 'You do not manage the Space this Journey belongs to.'
  const space = await getSpaceById(p.space_id)
  return { spaceId: p.space_id, spaceSlug: space?.slug ?? '', slug: p.slug }
}

function refresh(spaceSlug: string, slug: string) {
  if (spaceSlug) revalidatePath(`/spaces/${spaceSlug}/journeys`)
  revalidatePath(`/journeys/${slug}`)
  revalidatePath(`/journeys/${slug}/learn`)
}

/** Add a guide by their @handle. */
export async function addJourneyGuideAction(input: { planId: string; handle: string }): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to add a guide.')
  const plan = await stewardedPlan(input.planId, me)
  if (typeof plan === 'string') return fail(plan)

  const handle = (input.handle ?? '').trim().replace(/^@/, '').replace(/^.*\/people\//, '').replace(/[/?#].*$/, '').toLowerCase()
  if (!handle) return fail('Enter the @handle of the person to add.')
  const { data: person } = await db().from('profiles').select('id, is_active').eq('handle', handle).maybeSingle()
  const p = person as { id: string; is_active: boolean | null } | null
  if (!p || p.is_active === false) return fail('No one on Frequency has that handle. Check it and try again.')

  if (!(await addJourneyGuide(input.planId, p.id, me))) return fail('Could not add that guide. Try again.')
  refresh(plan.spaceSlug, plan.slug)
  return ok()
}

/** Remove a guide. */
export async function removeJourneyGuideAction(input: { planId: string; profileId: string }): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to change guides.')
  const plan = await stewardedPlan(input.planId, me)
  if (typeof plan === 'string') return fail(plan)
  if (!(await removeJourneyGuide(input.planId, input.profileId))) return fail('Could not remove that guide. Try again.')
  refresh(plan.spaceSlug, plan.slug)
  return ok()
}
