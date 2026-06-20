'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { BETA_OPEN_ACCESS } from '@/lib/core/beta'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { redirect } from 'next/navigation'
import {
  logPractice,
  adoptPractice,
  dropMemberPractice,
  setCirclePractice,
  createPractice,
  notifyStaffOfPendingPractice,
  getPractice,
  updatePractice,
  forkPractice,
  claimPractice,
  setPracticeTags,
  setPracticeFlags,
  setPracticeReward,
  deletePractice,
  type PracticeEdit,
  type LogPracticeResult,
} from '@/lib/practices'
import { personalizePractice, type PracticeSuggestion } from '@/lib/ai/practice-wizard'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'

// Log that you did a practice → practice.verified (WAM) + zaps + streak.
export async function logPracticeAction(
  practiceId: string,
  circleId?: string | null,
): Promise<ActionResult<LogPracticeResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const res = await logPractice({ profileId, practiceId, circleId: circleId ?? null })
  // Re-seed the "your practices" tight rows so an already-logged practice paints in
  // its collapsed state on the next server render (B.4). The client wrapper collapses
  // optimistically too, so this is the durable, refresh-safe path, not the live one.
  revalidatePath('/practices')
  return ok(res)
}

export async function adoptPracticeAction(practiceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  await adoptPractice(profileId, practiceId)
  revalidatePath('/practices')
  return ok()
}

export async function dropPracticeAction(practiceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  await dropMemberPractice(profileId, practiceId)
  revalidatePath('/practices')
  return ok()
}

/**
 * Authorize a caller to CREATE a practice and decide its review status (SECURITY-sensitive,
 * ADR-109). Authoring a library practice is a CREW+ act on the community trust ladder — a plain
 * Member may adopt, claim, fork, and log practices, but never author one into the library. The
 * gate is the canonical trust-ladder helper (`atLeastRole(role, 'crew')`), read from the caller's
 * EFFECTIVE community_role (view-as aware via getCallerProfile), so it's the single source of
 * truth — the hidden UI button is only convenience.
 *
 * Returns the caller's id + whether host+ standing (the curation tier) lets the practice
 * auto-approve. A non-host author creates PENDING: the practice stays out of the public pool
 * until a Host+ approves it. Returns an error string when the caller is signed out (or, outside
 * beta, a plain Member — see BETA_OPEN_ACCESS).
 */
async function authorizeCreatePractice(): Promise<
  { profileId: string; autoApprove: boolean } | { error: string }
> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Not signed in' }
  // BETA open access: any signed-in member may author (kept pending for Host+ review below, so
  // nothing unvetted goes public). Outside beta the gate is CREW+ on the trust ladder — a plain
  // Member is rejected (server is the source of truth; the hidden UI button is only convenience).
  if (!BETA_OPEN_ACCESS && !atLeastRole(caller.community_role, 'crew')) {
    return { error: 'Only Crew and above can create a practice.' }
  }
  // Host+ (or platform staff, who curate the library) author live; everyone else pending review.
  const autoApprove = atLeastRole(caller.community_role, 'host') || caller.webRole !== 'none'
  return { profileId: caller.id, autoApprove }
}

export async function createPracticeAction(
  title: string,
  description?: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const t = title.trim()
  if (!t) return fail('Title is required')
  const p = await createPractice({
    title: t,
    description: description?.trim() || null,
    createdBy: gate.profileId,
    // A Crew proposal lands PENDING + hidden until a Host+ approves it (which publishes it);
    // a host+/staff author goes live at birth (the column default 'approved').
    isPublic: gate.autoApprove,
    status: gate.autoApprove ? 'approved' : 'pending',
  })
  if (!p) return fail('Could not create practice')
  if (!gate.autoApprove) {
    // Best-effort — never blocks creation.
    await notifyStaffOfPendingPractice({ practiceId: p.id, title: t, proposedBy: gate.profileId })
  }
  revalidatePath('/practices')
  return ok({ id: p.id })
}

// Create a blank DRAFT practice (non-public) and return its id, so the caller can open the full
// PracticeBuilder popup straight away — no separate "name it" step or full page. The draft stays
// out of the public library until it's published. Crew+ only (Members cannot author practices); a
// Crew draft carries 'pending' so when it is published it goes through Host+ review, while a
// host+/staff author's draft is auto-approved on publish.
export async function createPracticeDraftAction(): Promise<ActionResult<{ id: string }>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const p = await createPractice({
    title: 'Untitled practice',
    createdBy: gate.profileId,
    isPublic: false,
    status: gate.autoApprove ? 'approved' : 'pending',
  })
  if (!p) return fail('Could not create practice')
  if (!gate.autoApprove) {
    // Best-effort — never blocks creation. The pending draft is hidden until published + approved.
    await notifyStaffOfPendingPractice({
      practiceId: p.id,
      title: 'Untitled practice',
      proposedBy: gate.profileId,
    })
  }
  revalidatePath('/practices')
  return ok({ id: p.id })
}

// Edit a practice you created. Partial flexibility: members shape content + cadence
// on their OWN practices (ownership enforced); rewards stay admin-governed.
export async function updatePracticeAction(id: string, patch: PracticeEdit): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only edit practices you created')
  const saved = await updatePractice(id, patch)
  if (!saved) return fail('Could not save')
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// Set the author tags on a practice you created (hybrid model: new labels become
// folksonomy tags). Ownership enforced; Vera/other-member tags are left untouched.
export async function setPracticeTagsAction(id: string, labels: string[]): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only edit practices you created')
  await setPracticeTags(id, labels, { source: 'author', assignedBy: profileId })
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// Customize a library practice you don't own: fork a PRIVATE copy you own, adopt it
// into your program, and open the editor on the copy.
export async function forkPracticeAction(practiceId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const copy = await forkPractice(profileId, practiceId)
  if (!copy) return
  await adoptPractice(profileId, copy.id)
  redirect(`/practices/${copy.id}/edit`)
}

// Vera assist for the claim wizard: personalize a template to the member's goal +
// schedule. Returns null when AI is off or the call fails (the wizard falls back to
// the template's own content), so claiming never depends on the model being up.
export async function suggestPracticeAction(
  templateId: string,
  goal: string,
  schedule: string,
): Promise<ActionResult<{ suggestion: PracticeSuggestion | null }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const template = await getPractice(templateId)
  if (!template) return fail('Practice not found')
  const suggestion = await personalizePractice({
    template: {
      title: template.title,
      summary: template.summary,
      body: template.body,
      cadence: template.cadence,
    },
    goal,
    schedule,
    profileId,
  })
  return ok({ suggestion })
}

// Claim a template → your own private, adopted copy with the personalized content.
// First claim rewards zaps (member-keyed idempotency, so it fires once — no farming).
export async function claimPracticeAction(
  templateId: string,
  fields: { title: string; summary?: string | null; body?: string | null; cadence?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  if (!fields.title?.trim()) return fail('Give your practice a name')
  const copy = await claimPractice(profileId, templateId, fields)
  if (!copy) return fail('Could not claim this practice')
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `practice_claimed:${profileId}`,
      source: 'web',
      eventType: 'practice.claimed',
      actorProfileId: profileId,
      context: { practiceId: copy.id, templateId },
    })
    if (recorded) await awardZapsForAction(profileId, 'practice_claim')
  } catch {
    // a reward failure must never block the claim
  }
  revalidatePath('/practices')
  return ok({ id: copy.id })
}

// --- Admin curation of the library (gated on admin.access; host+) ----------

async function requirePracticeAdmin(): Promise<boolean> {
  return (await getGlobalCapabilities()).has('admin.access')
}

function revalidatePractice(id: string) {
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}`)
}

// Promote/demote a practice as a claimable starter template.
export async function setPracticeTemplateAction(id: string, value: boolean): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await setPracticeFlags(id, { is_template: value })
  revalidatePractice(id)
  return ok()
}

// Show/hide a practice in the public library (is_public).
export async function setPracticeVisibilityAction(id: string, value: boolean): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await setPracticeFlags(id, { is_public: value })
  revalidatePractice(id)
  return ok()
}

// Remove a practice from the library entirely.
export async function deletePracticeAction(id: string): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await deletePractice(id)
  revalidatePath('/practices')
  return ok()
}

// Delete a practice you created (or any practice as an operator). Owner-or-admin — mirrors the
// editor's edit gate, so an author can remove their own practice straight from the builder.
export async function deleteOwnPracticeAction(id: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only delete practices you created')
  await deletePractice(id)
  revalidatePath('/practices')
  return ok()
}

// Override a practice's per-log Zap reward + the card's reward note (admin-only: members
// must not set their own payout, so this is gated apart from the author-editable builder fields).
export async function setPracticeRewardAction(
  id: string,
  patch: { rewardZaps?: number | null; rewardNote?: string | null },
): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  const clean: { reward_zaps?: number | null; reward_note?: string | null } = {}
  if (patch.rewardZaps !== undefined) {
    clean.reward_zaps =
      patch.rewardZaps == null ? null : Math.max(0, Math.min(1000, Math.floor(patch.rewardZaps)))
  }
  if (patch.rewardNote !== undefined) {
    const n = patch.rewardNote?.trim()
    clean.reward_note = n ? n.slice(0, 120) : null
  }
  await setPracticeReward(id, clean)
  revalidatePractice(id)
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// Host sets the circle's current practice (one active per circle). Authz: the
// caller must hold circle.editSettings (host + janitors + scope leaders).
export async function setCirclePracticeAction(
  circleId: string,
  practiceId: string,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return fail('Not allowed')
  await setCirclePractice(circleId, practiceId, profileId)
  revalidatePath('/circles/[slug]', 'page')
  return ok()
}
