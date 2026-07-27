'use server'

// The Space's own Circles (ADR-842): create one under the Space, and start a Run of a Journey
// the Space offers. A Space Circle is where the Space's people move through a program together;
// the Run is that Circle going through one Journey (ADR-252).
//
// Every action re-resolves the Space and the caller's standing on it server-side. The Run start
// delegates to startJourneyRunAction, which owns the WHO and WHAT gates (lib/journeys/run-gate),
// so this surface never becomes a second authority on who may run what.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { createBlankCircleDraft } from '@/lib/circles/draft'
import { startJourneyRunAction } from '@/app/(main)/journeys/run-actions'

/** The one door: the caller must edit this Space. Returns the space id, or the message to show. */
async function requireSpaceEditor(
  slug: string,
): Promise<{ spaceId: string; profileId: string } | string> {
  const caller = await getCallerProfile()
  if (!caller) return 'Sign in first.'
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return 'Space not found.'
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return 'Only the space team can do that.'
  return { spaceId: space.id, profileId: caller.id }
}

/**
 * Create a Circle that belongs to this Space. It starts as a DRAFT the same way every other new
 * Circle does, so the team can shape it before anyone sees it; the only difference is the
 * space_id stamp, which is what makes it the Space's Circle rather than a member's own.
 */
export async function createSpaceCircleAction(
  slug: string,
  name: string,
): Promise<ActionResult<{ circleSlug: string }>> {
  const gate = await requireSpaceEditor(slug)
  if (typeof gate === 'string') return fail(gate)

  const clean = name.trim()
  if (!clean) return fail('Give the circle a name first.')
  if (clean.length > 120) return fail('That name is too long. Keep it under 120 characters.')

  try {
    const { slug: circleSlug } = await createBlankCircleDraft({
      profileId: gate.profileId,
      name: clean,
      spaceId: gate.spaceId,
    })
    revalidatePath(`/spaces/${slug}/circles`)
    return ok({ circleSlug })
  } catch {
    return fail('Could not create that circle. Please try again.')
  }
}

/**
 * Start a Run: this Space's Circle takes on one of the Space's Journeys. Delegates to the shared
 * Run action, which re-checks that the caller may run this Circle and that the Journey is one
 * this Space offers.
 */
export async function startSpaceCircleRunAction(
  slug: string,
  input: { circleId: string; planId: string; kickoffAt?: string | null; journeyTitle?: string },
): Promise<ActionResult<{ runId: string }>> {
  const gate = await requireSpaceEditor(slug)
  if (typeof gate === 'string') return fail(gate)

  const res = await startJourneyRunAction({
    planId: input.planId,
    circleId: input.circleId,
    kickoffAt: input.kickoffAt ?? null,
    journeyTitle: input.journeyTitle,
  })
  if (!isError(res)) revalidatePath(`/spaces/${slug}/circles`)
  return res
}
