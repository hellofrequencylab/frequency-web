'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  createPlan,
  addItem,
  updateItem,
  updatePlan,
  publishPlan,
  setPlanVisibility,
  setPlanStatus,
  setPlanOfficial,
  setPlanWindow,
  adoptPlan,
  forkPlan,
  duplicatePlan,
  addBlock,
  updateBlock,
  removeBlock,
  planAuthorId,
  planMeta,
  applyVeraReview,
  deletePlan,
  normalizeJourneyMeeting,
  type PlanVisibility,
  type PlanStatus,
  type PageWidgetConfig,
  type StoredVeraReview,
  type JourneyMeeting,
} from '@/lib/journey-plans'
import { getSeasonalQuests } from '@/lib/quests'
import { reviewJourneyForLibrary } from '@/lib/ai/journey-review'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

// Server actions for the Journeys builder (ADR-096; free, ADR-152).
// Building, editing, publishing to the community library, and adopting/forking
// anyone's public journey are ALL free — Journeys carry no paywall. FormData-based
// so the builder works without client JS.

/** Caller must be the plan's author OR an operator (admin.access — they may manage any
 *  Journey in the library, the same bypass updatePracticeAction grants). Returns the caller's
 *  profile id, or null. */
async function assertOwner(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await planAuthorId(planId)
  if (author && author === profileId) return profileId
  if ((await getGlobalCapabilities()).has('admin.access')) return profileId
  return null
}

const revalidateSlug = (formData: FormData) =>
  revalidatePath(`/journeys/${String(formData.get('slug') ?? '')}`)

// --- The library (free for everyone) --------------------------------------

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

/** JSON counterpart to adoptPlanAction: adopt a Journey by id (e.g. the author adopting their
 *  own on publish), which assigns the adopter all its practices. Same access rule — your own, or
 *  any non-private Journey. */
export async function adoptJourney(planId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not allowed.')
  const meta = await planMeta(planId)
  if (!meta) return fail('Journey not found.')
  if (meta.author_id !== profileId && meta.visibility === 'private') return fail('Not allowed.')
  await adoptPlan(profileId, planId)
  revalidatePath('/journeys', 'layout')
  return ok()
}

export async function forkPlanAction(formData: FormData) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const planId = String(formData.get('planId') ?? '')
  const fork = await forkPlan(profileId, planId)
  if (fork) redirect(`/journeys/${fork.slug}`)
}

/** Duplicate one of your OWN Journeys (owner-or-admin) into a fresh private draft, full v2
 *  structure + settings copied. Returns the copy's slug so the management space can open its
 *  editor. JSON action for the "Your Journeys" workspace (the FormData forkPlanAction is the
 *  legacy public-remix path). */
export async function duplicateJourney(planId: string): Promise<ActionResult<{ slug: string }>> {
  const profileId = await assertOwner(planId)
  if (!profileId) return fail('Not allowed.')
  const dup = await duplicatePlan(profileId, planId)
  if (!dup) return fail('Could not duplicate this journey.')
  revalidatePath('/journeys/mine')
  revalidatePath('/journeys', 'layout')
  return ok({ slug: dup.slug })
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

/** Discovery + delivery attributes (ADR-302 settings expansion): difficulty, category + tags,
 *  daily time, and an optional enrollment cap. New columns (migration 20260630000000) aren't in the
 *  generated types yet, so this uses the untyped admin handle (the repo convention). */
export async function setJourneyAttributes(
  planId: string,
  patch: {
    difficulty?: string | null
    category?: string | null
    tags?: string[]
    dailyMinutes?: number | null
    enrollCap?: number | null
  },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.difficulty !== undefined) update.difficulty = patch.difficulty?.trim() ? patch.difficulty.trim().slice(0, 40) : null
  if (patch.category !== undefined) update.category = patch.category?.trim() ? patch.category.trim().slice(0, 60) : null
  if (patch.tags !== undefined) update.tags = patch.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12)
  if (patch.dailyMinutes !== undefined) update.daily_minutes = patch.dailyMinutes && patch.dailyMinutes > 0 ? Math.min(600, Math.floor(patch.dailyMinutes)) : null
  if (patch.enrollCap !== undefined) update.enroll_cap = patch.enrollCap && patch.enrollCap > 0 ? Math.min(100000, Math.floor(patch.enrollCap)) : null
  // New columns (migration 20260630000000) aren't in the generated types yet — cast the payload.
  if (Object.keys(update).length) {
    await admin.from('journey_plans').update(update as unknown as Database['public']['Tables']['journey_plans']['Update']).eq('id', planId)
  }
  revalidatePath('/journeys', 'layout')
  return ok()
}

/** Meeting and format section (ADR-302, owner's item 13): how a Circle gathers around the Journey —
 *  virtual/in-person/hybrid, when it meets, where, a join link, and any other details. Sanitized +
 *  bounded through normalizeJourneyMeeting (one source of truth with the learn page). The `meeting`
 *  jsonb column is `Json` in the generated types, so cast the payload (ADR-246), never the admin
 *  client. */
export async function setJourneyMeeting(
  planId: string,
  meeting: JourneyMeeting,
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  const admin = createAdminClient()
  const payload = { meeting: normalizeJourneyMeeting(meeting) }
  await admin.from('journey_plans').update(payload as unknown as Database['public']['Tables']['journey_plans']['Update']).eq('id', planId)
  revalidatePath('/journeys', 'layout')
  return ok()
}

/** A lightweight Event row for the Meeting section's link/picker: enough to choose one and to
 *  show the currently-linked event (its title + when). The `events` table carries newer columns
 *  than the generated types, so reads go through the untyped admin handle (repo convention; see
 *  app/(main)/events/page.tsx). */
export interface JourneyEventOption {
  id: string
  title: string
  slug: string
  startsAt: string | null
}

/** List the caller's own (hosted) upcoming + recent events to LINK to a Journey's meeting
 *  (ADR-302, owner's item 14). Owner-gated through assertOwner: only the Journey's author (or an
 *  operator) may read the picker, and the events are scoped to that same caller as host. Cancelled
 *  events are excluded; soonest-first, capped. */
export async function listMyJourneyEvents(
  planId: string,
): Promise<ActionResult<{ events: JourneyEventOption[] }>> {
  const profileId = await assertOwner(planId)
  if (!profileId) return fail('Not allowed.')
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('id, title, slug, starts_at, is_cancelled')
    .eq('host_id', profileId)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: false })
    .limit(50)
  const rows = (data as { id: string; title: string; slug: string; starts_at: string | null }[] | null) ?? []
  return ok({ events: rows.map((e) => ({ id: e.id, title: e.title, slug: e.slug, startsAt: e.starts_at })) })
}

/** Resolve a single linked Event for the Meeting section's linked-event chip (title + when +
 *  slug to open it). Owner-gated. Returns null when the event is gone (so the chip can show a
 *  graceful "linked event unavailable" and let the author unlink). */
export async function getJourneyMeetingEvent(
  planId: string,
  eventId: string,
): Promise<ActionResult<{ event: JourneyEventOption | null }>> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  if (!eventId) return ok({ event: null })
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('id, title, slug, starts_at')
    .eq('id', eventId)
    .maybeSingle()
  const e = data as { id: string; title: string; slug: string; starts_at: string | null } | null
  return ok({ event: e ? { id: e.id, title: e.title, slug: e.slug, startsAt: e.starts_at } : null })
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

// --- Lesson/section block authoring (ADR-244) — owner-only -------------------
export async function addJourneyLesson(
  planId: string,
  input: { kind: 'lesson' | 'section'; title?: string; body?: string },
): Promise<ActionResult<{ id: string }>> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  const id = await addBlock(planId, { blockType: input.kind, title: input.title, body: input.body })
  return id ? ok({ id }) : fail('Could not add it.')
}

export async function updateJourneyLesson(
  planId: string,
  itemId: string,
  patch: { title?: string | null; body?: string | null },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updateBlock(itemId, patch)
  return ok()
}

export async function removeJourneyLesson(planId: string, itemId: string): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await removeBlock(itemId)
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

/**
 * Set visibility + drive the review workflow (docs/JOURNEYS.md §11–§12) and, on publish,
 * run Vera's rank quality gate (ADR-Quest "Gate + coach").
 *
 * Public = publish to the community library (free; stamps published_at):
 *  - a member-built Journey goes to `status='pending'` (Guide+ moderation backlog),
 *  - a Guide/Mentor's own Journey auto-approves (`status='approved'`),
 *  - and SEPARATELY Vera reviews it for RANK eligibility: only a Vera-approved Journey
 *    becomes `ranked_eligible` (finishing it can count toward season rank). Publishing is
 *    never blocked — a failed/over-budget/disabled review still ships the Journey to the
 *    library, just not ranked-eligible (fail-closed). The verdict + coaching come back so
 *    the builder can show "added to the ranked library" or Vera's notes to fix.
 * Private/Unlisted just sets visibility (no status change, eligibility untouched).
 *
 * Returns the resolved moderation state + Vera's review so the builder can show the right
 * celebration ("live" vs "in review") and the rank-eligibility coaching.
 */
export async function setJourneyVisibility(
  planId: string,
  visibility: PlanVisibility,
): Promise<ActionResult<{ status: PlanStatus; review: StoredVeraReview | null }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not allowed.')
  const author = await planAuthorId(planId)
  // The author, or an operator (admin.access) managing any Journey — same bypass assertOwner
  // grants, so an operator who opens a member's Journey in the editor can publish/unpublish it.
  const isOwnerOrAdmin = author === caller.id || (await getGlobalCapabilities()).has('admin.access')
  if (!isOwnerOrAdmin) return fail('Not allowed.')

  if (visibility === 'public') {
    await publishPlan(planId)
    // Mentor+ (guide/mentor) auto-approve moderation; everyone else enters the queue.
    const status: PlanStatus = canMakeOfficial(caller.community_role) ? 'approved' : 'pending'
    await setPlanStatus(planId, status)
    // Vera's rank gate. Best-effort: it never throws (fail-closed verdicts), and we persist
    // the result through the admin client (members can't self-approve). A failed review must
    // not block publishing — the Journey is already live above.
    const review = await runVeraGate(planId)
    revalidatePath('/journeys', 'layout')
    return ok({ status, review })
  }

  await setPlanVisibility(planId, visibility)
  revalidatePath('/journeys', 'layout')
  return ok({ status: 'draft', review: null })
}

/**
 * Re-run Vera's rank quality gate for a published Journey the author edited (the
 * "submit for review" / resubmit path). Owner-checked; the verdict is persisted through the
 * admin client and `ranked_eligible` is set from it (so a stale approval can't survive a
 * material edit). Returns the fresh verdict + coaching for the builder.
 */
/** Delete a Journey. The author OR an operator (admin.access) may delete — same owner-or-admin
 *  gate as every other editor action (assertOwner). Mirrors the admin library delete, but lets
 *  the author remove their own Journey straight from the editor. */
export async function deleteJourney(planId: string): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await deletePlan(planId)
  revalidatePath('/journeys', 'layout')
  return ok()
}

export async function submitJourneyForReview(
  planId: string,
): Promise<ActionResult<{ review: StoredVeraReview }>> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  const review = await runVeraGate(planId)
  revalidatePath('/journeys', 'layout')
  return ok({ review })
}

/** Run the Vera gate for a planId and persist the verdict + eligibility through the admin
 *  client. Internal; both publish and resubmit go through here so the write rule is one place.
 *  Authorship is the caller's responsibility — this only ever sets eligibility from Vera. */
async function runVeraGate(planId: string): Promise<StoredVeraReview> {
  const review = await reviewJourneyForLibrary(planId)
  const stored: StoredVeraReview = {
    status: review.status,
    score: review.score,
    feedback: review.feedback,
    reviewedAt: review.reviewedAt,
  }
  await applyVeraReview(planId, stored)
  return stored
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

/** Delivery section (ADR-252): the completion certificate + the Run phase-drip interval. */
export async function setJourneyDelivery(
  planId: string,
  patch: { certificateEnabled?: boolean; dripIntervalDays?: number },
): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  await updatePlan(planId, patch)
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
 * Quest play-window (Guide/Mentor only): the ~4-week span that sequences a season's
 * Journeys (weeks 1-4 / 5-8 / 9-12). Either bound may be null (always-open / no-close).
 * Same role gate as setJourneyOfficial — the window is a Quest-Journey concern. The
 * lib layer normalizes the dates and drops an inverted span.
 */
export async function setJourneyWindow(
  planId: string,
  opts: { startsAt?: string | null; endsAt?: string | null },
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Not allowed.')
  const author = await planAuthorId(planId)
  if (!author || author !== caller.id) return fail('Not allowed.')
  if (!canMakeOfficial(caller.community_role)) return fail('Only Guides and Mentors can set a play window.')
  await setPlanWindow(planId, opts)
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
