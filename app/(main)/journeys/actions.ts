'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
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

// Server actions for the Journeys builder (ADR-096; free, ADR-152).
// Building, editing, publishing to the community library, and adopting/forking
// anyone's public journey are ALL free — Journeys carry no paywall. FormData-based
// so the builder works without client JS.

/** Caller must be the plan's author. Returns the caller's profile id, or null. */
async function assertOwner(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await planAuthorId(planId)
  return author && author === profileId ? profileId : null
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

// --- The library (free for everyone) --------------------------------------

export async function publishPlanAction(formData: FormData) {
  const planId = String(formData.get('planId') ?? '')
  if (!(await assertOwner(planId))) return
  await publishPlan(planId)
  revalidateSlug(formData)
}

export async function adoptPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  const meta = await planMeta(planId)
  if (!meta) return
  // You can adopt your own journey or any non-private one — all free.
  if (meta.author_id !== profileId && meta.visibility === 'private') return
  await adoptPlan(profileId, planId)
  revalidateSlug(formData)
}

export async function forkPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  const fork = await forkPlan(profileId, planId)
  if (fork) redirect(`/journeys/${fork.slug}`)
}

// --- Studio (client builder) actions — JSON args, return ActionResult ---------
// These power the interactive Studio window (components/studio/journey). The
// FormData actions above stay as the no-JS fallback. Ownership + Crew gating are
// re-checked here (the client is never trusted).

export async function createJourney(input: {
  title: string
  summary?: string
  emoji?: string
  accent?: string
}): Promise<ActionResult<{ slug: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to create a journey.')
  const title = (input.title ?? '').trim()
  if (!title) return fail('Give your journey a name.')
  const plan = await createPlan({
    authorId: profileId,
    title,
    summary: input.summary,
    emoji: input.emoji,
    accent: input.accent,
  })
  if (!plan) return fail('Could not create the journey. Try again.')
  revalidatePath('/journeys', 'layout')
  return ok({ slug: plan.slug })
}

export async function saveJourneyMeta(
  planId: string,
  patch: {
    title?: string
    summary?: string | null
    intro?: string | null
    emoji?: string | null
    accent?: string | null
    coverImage?: string | null
  },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updatePlan(planId, patch)
  revalidatePath('/journeys', 'layout')
  return ok()
}

export async function addPracticeToJourney(
  planId: string,
  practiceId: string,
  domainId: string | null,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  if (!practiceId) return fail('No practice given.')
  await addItem({ planId, practiceId, domainId })
  return ok()
}

export async function removeJourneyStep(planId: string, practiceId: string): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await removeItem(planId, practiceId)
  return ok()
}

export async function reorderJourneySteps(planId: string, order: string[]): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await reorderItems(planId, order)
  return ok()
}

export async function setJourneyStep(
  planId: string,
  practiceId: string,
  patch: { note?: string | null; cadence?: string | null },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updateItem(planId, practiceId, patch)
  return ok()
}

/** Set visibility. Public = publish to the community library (free; stamps published_at). */
export async function setJourneyVisibility(
  planId: string,
  visibility: PlanVisibility,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  if (visibility === 'public') {
    await publishPlan(planId)
  } else {
    await setPlanVisibility(planId, visibility)
  }
  revalidatePath('/journeys', 'layout')
  return ok()
}
