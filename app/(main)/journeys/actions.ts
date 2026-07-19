'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  updatePlan,
  publishPlan,
  setPlanVisibility,
  setPlanStatus,
  setPlanOfficial,
  setPlanWindow,
  adoptPlan,
  forkPlan,
  duplicatePlan,
  planAuthorId,
  planMeta,
  applyVeraReview,
  deletePlan,
  normalizeJourneyMeeting,
  planSpaceId,
  setPlanSpace,
  type PlanVisibility,
  type PlanStatus,
  type PageWidgetConfig,
  type StoredVeraReview,
  type JourneyMeeting,
} from '@/lib/journey-plans'
import { getSeasonalQuests } from '@/lib/quests'
import { checkJourneyPublish } from '@/lib/journeys/publish-gate'
import { canEditJourney } from '@/lib/journeys/authoring'
import { normalizeJourneyCoverFocus } from '@/lib/journeys/header'
import { reviewJourneyForLibrary } from '@/lib/ai/journey-review'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

// Server actions for the Journeys builder (ADR-096; free, ADR-152).
// Building, editing, publishing to the community library, and adopting/forking
// anyone's public journey are ALL free — Journeys carry no paywall. FormData-based
// so the builder works without client JS.

/** Caller must be able to EDIT this Journey: its author, a platform operator (admin.access), OR a
 *  manager of the Space it belongs to (team authoring — canEditJourney). Returns the caller's profile
 *  id, or null. One gate shared with the editor route so the console and the editor never drift. */
async function assertOwner(planId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  return (await canEditJourney(planId, profileId)) ? profileId : null
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

/**
 * Upload a Journey cover image SERVER-SIDE through the service-role admin client (ADR-246), so it
 * never depends on a live browser Storage session token reaching Storage — the fragile browser path
 * that returned "new row violates row-level security policy" on the `event-media` bucket. Mirrors
 * uploadSpaceImage: gated on editing the Journey (assertOwner = author / operator / Space manager),
 * scoped to the Journey (so co-managers can set the cover too), returns the public URL for the
 * ImageUpload control. Validates type + size before the write.
 */
export async function uploadJourneyCover(
  planId: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  if (!(await assertOwner(planId))) return { error: 'Not allowed.' }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10 MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `journeys/${planId}/covers/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true })
  if (error) return { error: error.message }
  return { url: admin.storage.from('event-media').getPublicUrl(path).data.publicUrl }
}

// --- Reassign owner (personal <-> a Space you run) -------------------------
// A Journey belongs to its AUTHOR personally (space_id = the root space) or to a SPACE (space_id =
// that Space), which decides where it shows and whose plan the free-vs-paid publish lever reads. The
// same person can move their own Journey between the two: keep it on their personal account as the
// creator, or hand it to a Space they run so it lives on that Space's page + manager.

/** A place a Journey can be assigned to: the caller's personal account, or a Space they run. */
export interface JourneyOwnerTarget {
  /** 'personal' (the root space) or a Space id. */
  id: string
  label: string
  kind: 'personal' | 'space'
}

/**
 * The owner targets for a Journey: where it lives now, and every place the caller may move it —
 * their personal account plus each Space they own/admin (listOperatedSpaces). Owner-gated
 * (assertOwner: author / operator / a manager of the current Space). Lazy-loaded by the manage card
 * so the pages stay dumb.
 */
export async function listJourneyOwnerTargets(
  planId: string,
): Promise<ActionResult<{ current: string; targets: JourneyOwnerTarget[] }>> {
  const profileId = await assertOwner(planId)
  if (!profileId) return fail('Not allowed.')
  const [spaceId, root, spaces] = await Promise.all([
    planSpaceId(planId),
    loadRootSpaceId(),
    listOperatedSpaces(profileId),
  ])
  const current = !spaceId || spaceId === root ? 'personal' : spaceId
  const targets: JourneyOwnerTarget[] = [
    { id: 'personal', label: 'Your personal account', kind: 'personal' },
    ...spaces.map((s) => ({ id: s.id, label: s.name, kind: 'space' as const })),
  ]
  return ok({ current, targets })
}

/**
 * Move a Journey between the caller's personal account and a Space they run. `target` is 'personal'
 * (the root space) or a Space id. Gated: the caller must be able to edit the Journey (assertOwner);
 * pulling it to personal requires the author (or an operator); handing it to a Space requires the
 * caller to operate that Space (operatesSpace). Re-checks server-side; the client is never trusted.
 */
export async function reassignJourneyOwner(
  planId: string,
  target: string,
): Promise<ActionResult> {
  const profileId = await assertOwner(planId)
  if (!profileId) return fail('Not allowed.')
  const root = await loadRootSpaceId()
  if (!root) return fail('Could not resolve your account. Try again in a moment.')

  // Build the server-side ALLOW-LIST of destinations this caller may move the Journey to, then require
  // the requested `target` to be one of them. The tainted client value never decides WHICH check runs;
  // it is only looked up in a set derived entirely from the caller's real authority (the author/operator
  // rule for 'personal', the operated Spaces for a hand-off), which resolves the destination space id.
  const [author, isAdmin, operated] = await Promise.all([
    planAuthorId(planId),
    getGlobalCapabilities().then((c) => c.has('admin.access')),
    listOperatedSpaces(profileId),
  ])
  const allowed = new Map<string, string>() // target key -> resolved space id
  // Pulling a Journey onto a personal account makes it the author's own, so only the author (or an
  // operator) may do that; a Space admin can't quietly hand a teammate's Journey to themselves.
  if (author === profileId || isAdmin) allowed.set('personal', root)
  // Handing it to a Space requires the caller to actually run that Space (owner / active admin).
  for (const s of operated) allowed.set(s.id, s.id)

  const targetSpaceId = allowed.get(target)
  if (targetSpaceId === undefined) return fail('You cannot move this journey there.')

  await setPlanSpace(planId, targetSpaceId)
  revalidatePath('/journeys/mine')
  revalidatePath('/journeys', 'layout')
  return ok()
}

// --- Studio (client builder) actions — JSON args, return ActionResult ---------
// These power the interactive Studio window (components/studio/journey). The
// FormData actions above stay as the no-JS fallback. Ownership + Crew gating are
// re-checked here (the client is never trusted).

export async function saveJourneyMeta(
  planId: string,
  patch: {
    title?: string
    summary?: string | null
    intro?: string | null
    emoji?: string | null
    accent?: string | null
    coverImage?: string | null
    logoImage?: string | null
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

/** Header focal point (the cover's `object-position`): where the cover banner sits inside its cropped
 *  hero window. Written to the dedicated `journey_plans.cover_focus` column, normalized to null for the
 *  centered default so the column stays sparse. Owner-gated (assertOwner). The column is newer than the
 *  generated types, so the payload is cast (ADR-246), never the admin client — mirrors setJourneyMeeting. */
export async function setJourneyHeaderFocus(planId: string, focus: string): Promise<ActionResult> {
  if (!(await assertOwner(planId))) return fail('Not allowed.')
  const admin = createAdminClient()
  const payload = { cover_focus: normalizeJourneyCoverFocus(focus) }
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
  // The author, a platform operator (admin.access), or a manager of the owning Space (team
  // authoring) — the same gate assertOwner + the editor route grant, so a Space's editors can
  // publish/unpublish the Space's Journeys, not only their original author.
  if (!(await canEditJourney(planId, caller.id))) return fail('Not allowed.')

  // Free-vs-paid publish lever (the Journey upsell): a free owner publishes one Journey, and the
  // public library is paid-only. Space-owned Journeys read the Space plan; personal ones read the
  // author's tier. Going back to a private draft is always allowed. (checkJourneyPublish fail-opens
  // on an unresolved row, so this never blocks an operator's legitimate edit by accident.)
  const gate = await checkJourneyPublish(planId, visibility)
  if (!gate.ok) return fail(gate.message ?? 'That is a paid feature.')

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
