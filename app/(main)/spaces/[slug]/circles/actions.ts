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
import { transferCircle, type TransferTarget } from '@/lib/circles/transfer'
import { listManagedSpaces } from '@/lib/spaces/managed'
import type { RunEndState } from '@/lib/journeys/runs'
import { startJourneyRunAction, endJourneyRunAction } from '@/app/(main)/journeys/run-actions'

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

/**
 * End a Run from the Space surface: finished, or called off. Delegates to the shared Run action,
 * which re-checks that the caller may act on this Run's Circle.
 */
export async function endSpaceCircleRunAction(
  slug: string,
  input: { runId: string; state: RunEndState },
): Promise<ActionResult<void>> {
  const gate = await requireSpaceEditor(slug)
  if (typeof gate === 'string') return fail(gate)

  const res = await endJourneyRunAction({ runId: input.runId, state: input.state })
  if (!isError(res)) revalidatePath(`/spaces/${slug}/circles`)
  return res
}

/**
 * Move a Circle out of this Space: to another Space the caller helps run, or to the caller as
 * their own Circle (ADR-843). The gate in lib/circles/transfer is the authority on both sides.
 */
export async function transferSpaceCircleAction(
  slug: string,
  input: { circleId: string; target: TransferTarget },
): Promise<ActionResult<void>> {
  const gate = await requireSpaceEditor(slug)
  if (typeof gate === 'string') return fail(gate)

  const res = await transferCircle(input.circleId, input.target, gate.profileId)
  if (!res.ok) return fail(res.reason || 'Could not move that circle.')

  revalidatePath(`/spaces/${slug}/circles`)
  if (res.slug) revalidatePath(`/circles/${res.slug}`)
  return ok()
}

/**
 * The Spaces this caller could move a Circle INTO: the ones they help run, minus this one. Read
 * by the transfer control so the picker only ever offers destinations the gate will accept.
 */
export async function listTransferTargetsAction(
  slug: string,
): Promise<ActionResult<{ id: string; name: string; slug: string }[]>> {
  const gate = await requireSpaceEditor(slug)
  if (typeof gate === 'string') return fail(gate)

  // listManagedSpaces is already scoped to the CALLER (owner or active editor+), so the picker
  // can only ever offer destinations the transfer gate will accept.
  const mine = await listManagedSpaces()
  return ok(
    mine
      .filter((s) => s.id !== gate.spaceId && s.type !== 'root')
      .map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
  )
}
