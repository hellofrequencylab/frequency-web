'use server'

// Practice builder — create from the guided Spark (ADR-358). Mirrors the Journey builder's
// create-actions.ts: Vera interviews the author (who · the act · outcome · cadence · time), drafts
// the WHOLE Practice's identity, and the author reviews it before anything persists. DEFERRED
// CREATION holds, exactly like Journeys: a practices row is created ONLY once the author commits a
// (reviewed) title. Then the author lands in the full editor to refine, add a guide, set the Pillar,
// and publish. Authoring a library Practice is a Crew+ act (ADR-109), gated the same way as the
// existing createPracticeAction.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { BETA_OPEN_ACCESS } from '@/lib/core/beta'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  createPractice,
  updatePractice,
  notifyStaffOfPendingPractice,
  type PracticeEdit,
} from '@/lib/practices'
import { pillarIdsBySlug } from '@/lib/journeys/compose'
import {
  draftPracticeSpark,
  type PracticeSparkAnswers,
  type PracticeSpark,
} from '@/lib/ai/practice-spark'

/**
 * Authorize a caller to CREATE a practice and decide its review status. Identical gate to
 * app/(main)/practices/actions.ts `authorizeCreatePractice` (a Crew+ trust-ladder act, ADR-109,
 * Host+/staff auto-approve); duplicated here rather than exported across the action boundary so
 * each 'use server' module owns its own gate. The server is the source of truth — the hidden UI
 * button is only convenience.
 */
async function authorizeCreatePractice(): Promise<
  { profileId: string; autoApprove: boolean } | { error: string }
> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Not signed in' }
  if (!BETA_OPEN_ACCESS && !atLeastRole(caller.community_role, 'crew')) {
    return { error: 'Only Crew and above can create a practice.' }
  }
  const autoApprove = atLeastRole(caller.community_role, 'host') || caller.webRole !== 'none'
  return { profileId: caller.id, autoApprove }
}

/** Vera drafts the whole Practice from the spark answers. Returns the draft for the author to
 *  review/edit; creates nothing (deferred creation). Null-safe: when Vera is offline the wizard
 *  lets them type the identity by hand. */
export async function sparkPracticeAction(
  answers: PracticeSparkAnswers,
  sourceText?: string,
): Promise<ActionResult<PracticeSpark>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const spark = await draftPracticeSpark({ ...answers, sourceText, profileId: gate.profileId })
  if (!spark) return fail('Vera is offline right now. Name it yourself and keep going.')
  return ok(spark)
}

/** Create the Practice from the reviewed identity, then drop the author into the editor to refine
 *  (add the full guide, confirm the Pillar, publish). The deferred-creation rule holds: a row
 *  exists only once the author commits a (reviewed) title here. A Crew draft lands non-public +
 *  pending so it goes through Host+ review on publish; a Host+/staff draft is auto-approved. */
export async function createPracticeFromSparkAction(input: {
  title: string
  summary?: string | null
  description?: string | null
  body?: string | null
  /** The Pillar slugs the author chose (a Practice can span more than one Focus). */
  pillars?: Array<'mind' | 'body' | 'spirit' | 'expression'>
  cadence?: string | null
  durationMin?: number | null
}): Promise<void> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) redirect('/practices')
  const { profileId, autoApprove } = gate as { profileId: string; autoApprove: boolean }

  const title = input.title.trim().slice(0, 80)
  if (!title) redirect('/practices/new')

  // Create the row first (deferred creation): a Crew draft stays out of the public library until a
  // Host+ approves it on publish; a Host+/staff author is live at birth (the column default).
  const practice = await createPractice({
    title,
    description: input.description?.trim() || null,
    createdBy: profileId,
    isPublic: autoApprove,
    status: autoApprove ? 'approved' : 'pending',
  })
  if (!practice) redirect('/practices')

  // Map the chosen Pillar slugs to real Focus ids (a Practice can span multiple Focuses).
  // updatePractice mirrors domain_id to the FIRST focus_details key for back-compat.
  const patch: PracticeEdit = {}
  if (input.summary?.trim()) patch.summary = input.summary.trim()
  if (input.body?.trim()) patch.body = input.body.trim()
  if (input.cadence?.trim()) patch.cadence = input.cadence.trim()
  if (input.durationMin != null) patch.duration_min = input.durationMin
  if (input.pillars?.length) {
    const ids = await pillarIdsBySlug()
    const fd: Record<string, { instructions: string; timing: string }> = {}
    for (const slug of input.pillars) {
      const pid = ids[slug]
      if (pid) fd[pid] = { instructions: '', timing: '' }
    }
    if (Object.keys(fd).length) patch.focus_details = fd
  }
  if (Object.keys(patch).length) await updatePractice(practice.id, patch)

  if (!autoApprove) {
    // Best-effort — never blocks creation. The pending draft is hidden until published + approved.
    await notifyStaffOfPendingPractice({ practiceId: practice.id, title, proposedBy: profileId })
  }

  redirect(`/practices/${practice.id}/edit`)
}
