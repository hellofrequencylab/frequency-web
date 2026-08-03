'use server'

// Practice builder — create from the guided Spark (ADR-358). Mirrors the Journey builder's
// create-actions.ts: Vera interviews the author (who · the act · outcome · cadence · time), drafts
// the WHOLE Practice's identity, and the author reviews it before anything persists. DEFERRED
// CREATION holds, exactly like Journeys: a practices row is created ONLY once the author commits a
// (reviewed) title. Then the author lands in the full editor to refine, add a guide, set the Pillar,
// and publish. Authoring a library Practice is a Crew+ act (ADR-109), gated the same way as the
// existing createPracticeAction.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { canCreate } from '@/lib/core/load-capabilities'
import { crewCreateUpsell } from '@/lib/core/beta-notices'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { MovementConfig } from '@/lib/movement'
import {
  createPractice,
  updatePractice,
  getPractice,
  setPracticeStatus,
  notifyStaffOfPendingPractice,
  MINDLESS_MODES,
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
  // Real-Crew create gate (ADR-414) — reads the true tier (pre beta-override) so a free
  // member is sold the one-tap free-beta upgrade rather than silently allowed.
  if (!(await canCreate('practice.create'))) {
    return { error: crewCreateUpsell('a practice') }
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
  /** The timer half of the draft (ADR-920 Phase 5): how the practice is DONE. Vera proposes
   *  it in the same forced-tool pass; every field re-validates in updatePractice
   *  (sanitizeMovementConfig, BREATH_PATTERNS, the warm-up clamps), so a hostile payload can
   *  only ever produce a valid preset. Omitted = the plain mindless default (pre-ADR-920). */
  timer?: {
    timerKind: 'mindless' | 'movement' | 'none'
    mindlessMode?: string | null
    breathPattern?: string | null
    movementMode?: string | null
    warmupMessage?: string | null
  } | null
}): Promise<void> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) redirect('/practices')
  const { profileId, autoApprove } = gate as { profileId: string; autoApprove: boolean }

  const title = input.title.trim().slice(0, 80)
  if (!title) redirect('/practices/new')

  // Create the row first (deferred creation). DRAFT-UNTIL-SUBMIT (ADR-920 Phase 5): a Crew
  // author's practice is born a private DRAFT, not 'pending' — the review queue used to
  // receive half-built rows at the moment of creation, before the author had written a guide
  // or set a timer. Submitting for review is now the author's explicit act (the builder's
  // publish section → submitPracticeForReviewAction). Host+/staff stay live at birth.
  const practice = await createPractice({
    title,
    description: input.description?.trim() || null,
    createdBy: profileId,
    isPublic: autoApprove,
    status: autoApprove ? 'approved' : 'draft',
  })
  if (!practice) redirect('/practices')

  // Map the chosen Pillar slugs to real Focus ids (a Practice can span multiple Focuses).
  // updatePractice mirrors domain_id to the FIRST focus_details key for back-compat.
  const patch: PracticeEdit = {}
  if (input.summary?.trim()) patch.summary = input.summary.trim()
  if (input.body?.trim()) patch.body = input.body.trim()
  if (input.cadence?.trim()) patch.cadence = input.cadence.trim()
  if (input.durationMin != null) patch.duration_min = input.durationMin
  // The timer half (ADR-920 Phase 5): before this, every Vera-drafted practice shipped as a
  // default silent sit and the author had to find ~350 lines of nested controls unprompted.
  const t = input.timer
  if (t) {
    patch.timer_kind = t.timerKind === 'movement' || t.timerKind === 'none' ? t.timerKind : 'mindless'
    if (patch.timer_kind === 'mindless') {
      patch.mindless_mode = (MINDLESS_MODES as readonly string[]).includes(t.mindlessMode ?? '')
        ? (t.mindlessMode as PracticeEdit['mindless_mode'])
        : null
      if (t.breathPattern && patch.mindless_mode === 'breathe') patch.breath_pattern = t.breathPattern
    }
    if (patch.timer_kind === 'movement') {
      // The mode alone; the full work/rest/rounds tuning stays the author's in the builder.
      patch.movement_config = { mode: (t.movementMode ?? 'walk') as MovementConfig['mode'] }
    }
    if (t.warmupMessage?.trim() && patch.timer_kind !== 'none') {
      patch.warmup_message = t.warmupMessage.trim()
    }
  }
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

  redirect(`/practices/${practice.id}/edit`)
}

/** The author's explicit "Submit to the library" (ADR-920 Phase 5): a private draft moves to
 *  'pending' and the curators are pinged — the step the old born-pending flow skipped, which
 *  filled the review queue with half-built rows. Author-scoped; Host+/staff never need it
 *  (they are live at birth). */
export async function submitPracticeForReviewAction(practiceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const practice = await getPractice(practiceId)
  if (!practice || practice.created_by !== profileId) return fail('Not yours to submit.')
  if (practice.status === 'pending') return ok()
  if (practice.status === 'approved' || practice.is_public) return fail('Already live.')
  await setPracticeStatus(practiceId, 'pending')
  await notifyStaffOfPendingPractice({ practiceId, title: practice.title, proposedBy: profileId })
  revalidatePath(`/practices/${practiceId}/edit`)
  return ok()
}
