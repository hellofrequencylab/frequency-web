'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  logPractice,
  adoptPractice,
  dropMemberPractice,
  setCirclePractice,
  createPractice,
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
