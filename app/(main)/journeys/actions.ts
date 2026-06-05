'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import {
  createPlan,
  addItem,
  removeItem,
  updateItem,
  updatePlan,
  reorderItems,
  publishPlan,
  setPlanVisibility,
  adoptPlan,
  forkPlan,
  getPlan,
  planAuthorId,
  planMeta,
  type PlanVisibility,
} from '@/lib/journey-plans'

// Server actions for the Journeys builder (ADR-096). Building + editing a PERSONAL
// journey is free; the public library/marketplace is the Crew (paid) surface —
// publishing, and adopting/forking someone else's public journey, require Crew.
// FormData-based so the builder works without client JS.

/** Caller must be the plan's author. Returns the caller's profile id, or null. */
async function assertOwner(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await planAuthorId(planId)
  return author && author === profileId ? profileId : null
}

/** True when the caller is Crew or higher (the paid tier; free in Beta). */
async function callerIsCrew(): Promise<boolean> {
  const c = await getCallerProfile()
  return !!c && atLeastRole(c.community_role, 'crew')
}

const revalidateSlug = (formData: FormData) =>
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)

// --- Build / edit your own (free) -----------------------------------------

export async function createPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return
  const summary = String(formData.get('summary') ?? '')
  const plan = await createPlan({ authorId: profileId, title, summary })
  if (plan) redirect(`/journeys/${plan.slug}`)
}

export async function updatePlanAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  await updatePlan(planId, {
    title: String(formData.get('title') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    coverImage: String(formData.get('coverImage') ?? ''),
  })
  revalidateSlug(formData)
}

export async function addItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  if (!practiceId) return
  const domainId = (formData.get('domainId') as string) || null
  await addItem({ planId, practiceId, domainId })
  revalidateSlug(formData)
}

export async function removeItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  await removeItem(planId, practiceId)
  revalidateSlug(formData)
}

/** Set a single item's per-journey cadence + note. */
export async function updateItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  if (!practiceId) return
  await updateItem(planId, practiceId, {
    note: String(formData.get('note') ?? ''),
    cadence: String(formData.get('cadence') ?? ''),
  })
  revalidateSlug(formData)
}

/** Move one practice up or down in the path (no-JS reorder). */
export async function moveItemAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const practiceId = String(formData.get('practiceId') ?? '')
  const dir = String(formData.get('dir') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const loaded = await getPlan(slug)
  if (!loaded) return
  const order = loaded.items.map((i) => i.practice_id)
  const idx = order.indexOf(practiceId)
  const swap = dir === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swap < 0 || swap >= order.length) return
  ;[order[idx], order[swap]] = [order[swap], order[idx]]
  await reorderItems(planId, order)
  revalidateSlug(formData)
}

/** Keep a journey personal (private/unlisted) — free. Public goes through publish. */
export async function setVisibilityAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  const visibility = String(formData.get('visibility') ?? '') as PlanVisibility
  if (visibility !== 'private' && visibility !== 'unlisted') return
  await setPlanVisibility(planId, visibility)
  revalidateSlug(formData)
}

// --- The library / marketplace (Crew, paid) -------------------------------

export async function publishPlanAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  if (!(await callerIsCrew())) redirect('/upgrade')
  await publishPlan(planId)
  revalidateSlug(formData)
}

export async function adoptPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  const meta = await planMeta(planId)
  if (!meta) return
  const isOwn = meta.author_id === profileId
  // Adopting your OWN journey is free; adopting someone else's (the library) is Crew.
  if (!isOwn) {
    if (meta.visibility === 'private') return
    if (!(await callerIsCrew())) redirect('/upgrade')
  }
  await adoptPlan(profileId, planId)
  revalidateSlug(formData)
}

export async function forkPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  // Remixing a library journey into your own is a library benefit → Crew.
  if (!(await callerIsCrew())) redirect('/upgrade')
  const planId = String(formData.get('planId') ?? '')
  const fork = await forkPlan(profileId, planId)
  if (fork) redirect(`/journeys/${fork.slug}`)
}
