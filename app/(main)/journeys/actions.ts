'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import {
  createPlan,
  addItem,
  removeItem,
  publishPlan,
  planAuthorId,
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
