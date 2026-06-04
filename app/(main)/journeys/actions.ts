'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import {
  createPlan,
  addItem,
  removeItem,
  publishPlan,
  adoptPlan,
  forkPlan,
  planAuthorId,
  planMeta,
} from '@/lib/journey-plans'

// Server actions for the Journeys builder. Writes go through the lib's service-role
// client; ownership is enforced here (the author lane). FormData-based so the
// builder works without client JS.

/** Caller must be the plan's author. Returns the caller's profile id, or null. */
async function assertOwner(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await planAuthorId(planId)
  return author && author === profileId ? profileId : null
}

export async function createPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return
  const summary = String(formData.get('summary') ?? '')
  const plan = await createPlan({ authorId: profileId, title, summary })
  if (plan) redirect(`/journeys/${plan.slug}`)
}

export async function addItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  if (!practiceId) return
  const domainId = (formData.get('domainId') as string) || null
  await addItem({ planId, practiceId, domainId })
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)
}

export async function removeItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  await removeItem(planId, practiceId)
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)
}

export async function publishPlanAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  await publishPlan(planId)
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)
}

export async function adoptPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  const meta = await planMeta(planId)
  // Adoptable when it's a shared plan, or your own.
  if (!meta || (meta.visibility === 'private' && meta.author_id !== profileId)) return
  await adoptPlan(profileId, planId)
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)
}

export async function forkPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  // forkPlan only forks PUBLIC plans (enforced in the lib).
  const fork = await forkPlan(profileId, planId)
  if (fork) redirect(`/journeys/${fork.slug}`)
}
