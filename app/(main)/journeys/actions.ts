'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
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
  setPlanStatus,
  setPlanOfficial,
  adoptPlan,
  forkPlan,
  getPlan,
  planAuthorId,
  planMeta,
  type PlanVisibility,
  type PlanStatus,
  type PageWidgetConfig,
} from '@/lib/journey-plans'
import type { IntensityTier } from '@/lib/journey-tiers'
import { getSeasonalQuests } from '@/lib/quests'

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
  patch: { note?: string | null; cadence?: string | null; defaultTier?: IntensityTier },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updateItem(planId, practiceId, patch)
  return ok()
}

/**
 * Set visibility + drive the review workflow (docs/JOURNEYS.md §11–§12).
 * Public = publish to the community library (free; stamps published_at):
 *  - a member-built Journey goes to `status='pending'` (Guide+ review backlog),
 *  - a Guide/Mentor's own Journey auto-approves (`status='approved'`).
 * Private/Unlisted just sets visibility (no status change).
 *
 * Returns the resolved review state so the builder can show the right celebration
 * ("live" vs "in review").
 */
export async function setJourneyVisibility(
  planId: string,
  visibility: PlanVisibility,
): Promise<ActionResult<{ status: PlanStatus }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not allowed.')
  const author = await planAuthorId(planId)
  if (!author || author !== caller.id) return fail('Not allowed.')

  if (visibility === 'public') {
    await publishPlan(planId)
    // Mentor+ (guide/mentor) auto-approve; everyone else enters the review queue.
    const status: PlanStatus = canMakeOfficial(caller.community_role) ? 'approved' : 'pending'
    await setPlanStatus(planId, status)
    revalidatePath('/journeys', 'layout')
    return ok({ status })
  }

  await setPlanVisibility(planId, visibility)
  revalidatePath('/journeys', 'layout')
  return ok({ status: 'draft' })
}

// --- New editor sections (docs/JOURNEYS.md §11) — all autosaved, JSON args -----
// These extend the Studio builder with completion rules, rewards, the page-layout
// widget config, the publishing review workflow, and the official program. Each
// re-checks ownership (the client is never trusted); the official actions also
// re-check the community role (only Guide/Mentor may flag a Journey official).

/** True for the roles that may flag a Journey official + auto-approve on publish
 *  (docs/JOURNEYS.md §12: `community_role IN ('guide','mentor')`). */
function canMakeOfficial(role: string): boolean {
  return role === 'guide' || role === 'mentor'
}

/** Per-step intensity default tier (Initiate/Adept/Master) → updateItem defaultTier. */
export async function setJourneyStepTier(
  planId: string,
  practiceId: string,
  tier: IntensityTier,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  if (!practiceId) return fail('No step given.')
  await updateItem(planId, practiceId, { defaultTier: tier })
  return ok()
}

/** Completion-rules section: min practices/day, target weeks, season-locked. */
export async function setJourneyCompletionRules(
  planId: string,
  patch: { minPracticesPerDay?: number; targetWeeks?: number; seasonLocked?: boolean },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updatePlan(planId, patch)
  revalidatePath('/journeys', 'layout')
  return ok()
}

/** Rewards section: completion Gems (10–100, clamped in updatePlan). */
export async function setJourneyRewards(
  planId: string,
  completionGems: number,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updatePlan(planId, { completionGems })
  revalidatePath('/journeys', 'layout')
  return ok()
}

/** Page-layout section: the ordered widget toggle/reorder config. */
export async function setJourneyPageConfig(
  planId: string,
  pageConfig: PageWidgetConfig[] | null,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updatePlan(planId, { pageConfig })
  revalidatePath('/journeys', 'layout')
  return ok()
}

/**
 * Official section (Guide/Mentor only): toggle the official flag + link a Seasonal
 * Quest. Re-checks the community role server-side — a member calling this is denied
 * even if the toggle somehow rendered.
 */
export async function setJourneyOfficial(
  planId: string,
  opts: { official: boolean; questId?: string | null },
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not allowed.')
  const author = await planAuthorId(planId)
  if (!author || author !== caller.id) return fail('Not allowed.')
  if (!canMakeOfficial(caller.community_role)) return fail('Only Guides and Mentors can flag a Journey official.')
  await setPlanOfficial(planId, opts)
  revalidatePath('/journeys', 'layout')
  return ok()
}

/**
 * Lazy context for the builder's role-gated Official section, fetched on mount so
 * the editor works even before the page passes the new props. Returns whether the
 * caller may make a Journey official + the assignable Quests. Owner-checked.
 * The plan's current official/quest/status come from the builder's own props.
 */
export async function loadJourneyOfficialContext(
  planId: string,
): Promise<ActionResult<{
  canMakeOfficial: boolean
  quests: { id: string; name: string; emoji: string | null }[]
}>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not allowed.')
  const author = await planAuthorId(planId)
  if (!author || author !== caller.id) return fail('Not allowed.')
  const allowed = canMakeOfficial(caller.community_role)
  const quests = allowed
    ? (await getSeasonalQuests()).map((q) => ({ id: q.id, name: q.name, emoji: q.emoji }))
    : []
  return ok({ canMakeOfficial: allowed, quests })
}
