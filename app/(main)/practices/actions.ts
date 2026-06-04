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
  type PracticeEdit,
} from '@/lib/practices'

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
  if (existing.created_by !== profileId) return fail('You can only edit practices you created')
  const saved = await updatePractice(id, patch)
  if (!saved) return fail('Could not save')
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
