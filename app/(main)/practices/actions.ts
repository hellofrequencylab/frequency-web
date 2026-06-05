'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { redirect } from 'next/navigation'
import {
  logPractice,
  adoptPractice,
  dropMemberPractice,
  setCirclePractice,
  createPractice,
  getPractice,
  updatePractice,
  forkPractice,
  claimPractice,
  setPracticeTags,
  setPracticeFlags,
  deletePractice,
  type PracticeEdit,
} from '@/lib/practices'
import { personalizePractice, type PracticeSuggestion } from '@/lib/ai/practice-wizard'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'

// Log that you did a practice → practice.verified (WAM) + zaps + streak.
export async function logPracticeAction(
  practiceId: string,
  circleId?: string | null,
): Promise<ActionResult<{ logged: boolean; zapsAwarded: number }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const res = await logPractice({ profileId, practiceId, circleId: circleId ?? null })
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

export async function createPracticeAction(
  title: string,
  description?: string,
): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const t = title.trim()
  if (!t) return fail('Title is required')
  const p = await createPractice({
    title: t,
    description: description?.trim() || null,
    createdBy: profileId,
  })
  if (!p) return fail('Could not create practice')
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
