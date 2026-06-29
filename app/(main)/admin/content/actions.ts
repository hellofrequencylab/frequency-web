'use server'

// Admin content suite actions (ADR-211). Every mutation gates explicitly:
//   - Curation (journey review/official/feature, practice flags/status/feature,
//     challenge edit/create): host+ on the community ladder OR the 'community'
//     staff domain — the same gate as the curation pages.
//   - Sensitive (season create, Vera tip lifecycle): janitor only.
// Writes go through the service-role libs behind these gates; sensitive actions
// also land in the admin audit log.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/database.types'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/admin/audit'
import { setPlanStatus, setPlanOfficial, deletePlan, type PlanStatus } from '@/lib/journey-plans'
import {
  setPracticeFlags,
  WEIGHT_CLASSES,
  archivePractices,
  restorePractices,
  resolveAdminPracticeIds,
  ADMIN_BULK_MAX,
  type WeightClass,
  type AdminPracticeSearchOpts,
} from '@/lib/practices'
import {
  setJourneyFeatured,
  setPracticeFeatured,
  setPracticeStatus,
} from '@/lib/admin/content-signals'
import {
  generateCreatorTips,
  updateTipText,
  approveTip,
  sendTip,
  dismissTip,
} from '@/lib/ai/creator-tips'
import { generatePosterReviews, resolveFlag } from '@/lib/ai/poster-observer'
import { AiUnavailableError } from '@/lib/ai/complete'

function ub(): SupabaseClient {
  return createAdminClient()
}

async function requireCurator() {
  const caller = await getCallerProfile()
  return authorizeAction(caller, 'host', 'community')
}

async function requireJanitor() {
  const caller = await getCallerProfile()
  return authorizeAction(caller, 'janitor')
}

function revalidateContent(sub?: string) {
  revalidatePath('/admin/content')
  if (sub) revalidatePath(`/admin/content/${sub}`)
}

// --- Journeys ----------------------------------------------------------------

export async function setJourneyStatusAction(id: string, status: PlanStatus): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  if (!['pending', 'approved', 'rejected'].includes(status)) return fail('Unknown status.')
  try {
    await setPlanStatus(id, status)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the journey.')
  }
  revalidateContent('journeys')
  return ok()
}

/** Delete a Journey from the library entirely (items + adoptions cascade). Curator-gated,
 *  irreversible; the admin library guards it behind a type-to-confirm modal. */
export async function deleteJourneyPlanAction(id: string): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await deletePlan(id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not delete the journey.')
  }
  revalidateContent('journeys')
  revalidatePath('/journeys', 'layout')
  return ok()
}

export async function setJourneyOfficialAction(
  id: string,
  official: boolean,
  questId?: string | null,
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setPlanOfficial(id, { official, questId })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the journey.')
  }
  revalidateContent('journeys')
  return ok()
}

export async function setJourneyFeaturedAction(id: string, featured: boolean): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setJourneyFeatured(id, featured)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the journey.')
  }
  revalidateContent('journeys')
  return ok()
}

// --- Practices -----------------------------------------------------------------

export async function setPracticeFlagsAction(
  id: string,
  flags: { is_public?: boolean; is_template?: boolean },
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setPracticeFlags(id, flags)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practice.')
  }
  revalidateContent('practices')
  return ok()
}

/** Bulk on/off for a library flag (the header master switch). Scoped to explicit
 *  ids so the review queue, or anything filtered out of the table, can never be
 *  flipped by accident. */
export async function setAllPracticeFlagsAction(
  ids: string[],
  flag: 'is_public' | 'is_template',
  value: boolean,
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  if (ids.length === 0) return ok()
  try {
    const admin = createAdminClient()
    // Build the patch by branch (no computed key): the flag union isn't enforced at
    // runtime, so a literal object per case avoids remote property injection (CodeQL).
    const patch = flag === 'is_public' ? { is_public: value } : { is_template: value }
    const { error } = await admin
      .from('practices')
      .update(patch)
      .in('id', ids.slice(0, 500))
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practices.')
  }
  revalidateContent('practices')
  return ok()
}

/** What a multi-select bulk edit may change on the chosen practices. Each field is
 *  optional; only the ones present are written. Kept to the operator-safe library
 *  controls (the payout tier + public visibility) — never the content fields. */
export interface PracticeBulkPatch {
  /** Payout tier: 'light' (8⚡) | 'standard' (12⚡) | 'heavy' (15⚡). */
  weightClass?: WeightClass
  /** Library visibility (publish / unpublish). */
  isPublic?: boolean
}

/**
 * Bulk-edit a chosen set of library practices (the multi-select bulk-action bar). Scoped
 * to the explicit ids the operator selected — nothing outside the selection can be touched
 * — and curator-gated, re-checked server-side: the client never carries authority. Every
 * field is validated before it is written (a junk weight class is rejected, not coerced),
 * and the patch is built field-by-field as a literal object so no remote key can be
 * injected (CodeQL). Returns the number of rows the patch was applied to.
 */
export async function bulkUpdatePracticesAction(
  ids: string[],
  patch: PracticeBulkPatch,
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

  // De-dupe + bound the selection server-side (never trust the client's list length).
  const cleanIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 500)
  if (cleanIds.length === 0) return fail('Select at least one practice.')

  // Build the update literal field-by-field, validating each value. A precise shape (not
  // Record<string, unknown>) keeps PostgREST's column typing + avoids remote key injection.
  const update: { weight_class?: string; is_public?: boolean } = {}
  if (patch.weightClass !== undefined) {
    if (!WEIGHT_CLASSES.includes(patch.weightClass)) return fail('Unknown weight class.')
    update.weight_class = patch.weightClass
  }
  if (patch.isPublic !== undefined) {
    update.is_public = patch.isPublic === true
  }
  if (Object.keys(update).length === 0) return fail('Nothing to change.')

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('practices').update(update).in('id', cleanIds)
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practices.')
  }
  revalidateContent('practices')
  return ok({ count: cleanIds.length })
}

// --- Archive / restore (Phase 1 item 1.4) --------------------------------------

/**
 * Bulk-archive the chosen practices (the bulk bar's Archive action). Archiving sets
 * status='archived' AND is_public=false in one write, so a deprecated practice drops out
 * of every member-facing read (they gate on is_public=true) while its history is kept and
 * admins can still filter status='archived' to find it. Curator-gated, re-checked
 * server-side; scoped to the explicit ids the operator selected. Idempotent + race-safe
 * (the patch is the same whatever the prior status). Returns the affected count.
 */
export async function archivePracticesAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    const count = await archivePractices(ids.slice(0, ADMIN_BULK_MAX))
    if (count === 0) return fail('Select at least one practice.')
    revalidateContent('practices')
    revalidatePath('/practices', 'layout')
    return ok({ count })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not archive the practices.')
  }
}

/** Restore archived practices to 'approved' (it does NOT auto-republish — the operator's
 *  Public switch controls visibility, so a restore can't surprise the library). Curator-
 *  gated, re-checked server-side; scoped to explicit ids. Returns the affected count. */
export async function restorePracticesAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    const count = await restorePractices(ids.slice(0, ADMIN_BULK_MAX))
    if (count === 0) return fail('Select at least one archived practice.')
    revalidateContent('practices')
    revalidatePath('/practices', 'layout')
    return ok({ count })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not restore the practices.')
  }
}

// --- Bulk on the WHOLE filtered set (Phase 1 item 1.6) -------------------------
//
// The explicit-ids actions above act on checkbox selection. These act on EVERYTHING that
// matches the current filter — the operator's "select all 1,240 results, not just this
// page" path. The client never sends ids; it sends the filter spec, and the server re-runs
// the SAME query (resolveAdminPracticeIds, capped at ADMIN_BULK_MAX) to resolve the target
// set, then applies the mutation. Authz is re-checked on every path; the resolve is bounded
// so "act on everything" can never become an unbounded write.

/** What a filter-scoped bulk action may do. Discriminated so each value is validated
 *  by branch (no computed key — remote-property-injection guard, mirrors the ids path). */
export type BulkFilteredOp =
  | { kind: 'setFlag'; flag: 'is_public' | 'is_template'; value: boolean }
  | { kind: 'setWeight'; weightClass: WeightClass }
  | { kind: 'archive' }
  | { kind: 'restore' }

/**
 * Apply a bulk operation to the WHOLE filtered set. The filter is the same
 * AdminPracticeSearchOpts shape searchAdminPractices takes, so "act on what I'm looking
 * at" runs the identical query server-side. Curator-gated, re-checked here; the resolve is
 * capped at ADMIN_BULK_MAX. Returns the affected count + whether the cap truncated the set
 * (so the UI can warn "acted on the first N of M"). Idempotent per op.
 */
export async function bulkPracticesByFilterAction(
  filter: AdminPracticeSearchOpts,
  op: BulkFilteredOp,
): Promise<ActionResult<{ count: number; capped: boolean }>> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

  // Validate the op BEFORE resolving ids (cheap reject of a junk weight class).
  if (op.kind === 'setWeight' && !WEIGHT_CLASSES.includes(op.weightClass)) {
    return fail('Unknown weight class.')
  }
  if (op.kind === 'setFlag' && op.flag !== 'is_public' && op.flag !== 'is_template') {
    return fail('Unknown flag.')
  }

  let ids: string[]
  let capped: boolean
  try {
    ;({ ids, capped } = await resolveAdminPracticeIds(filter))
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not resolve the filtered set.')
  }
  if (ids.length === 0) return fail('No practices match the current filter.')

  try {
    if (op.kind === 'archive') {
      const count = await archivePractices(ids)
      revalidateContent('practices')
      revalidatePath('/practices', 'layout')
      return ok({ count, capped })
    }
    if (op.kind === 'restore') {
      const count = await restorePractices(ids)
      revalidateContent('practices')
      revalidatePath('/practices', 'layout')
      return ok({ count, capped })
    }
    // Flag / weight: a literal patch built by branch (no computed key — CodeQL).
    const admin = createAdminClient()
    const update =
      op.kind === 'setFlag'
        ? op.flag === 'is_public'
          ? { is_public: op.value }
          : { is_template: op.value }
        : { weight_class: op.weightClass }
    const { error } = await admin.from('practices').update(update).in('id', ids)
    if (error) return fail(error.message)
    revalidateContent('practices')
    return ok({ count: ids.length, capped })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practices.')
  }
}

/**
 * Curator decision on a member-proposed practice (the review queue's Approve / Reject).
 * Host+ on the trust ladder OR the 'community' staff domain — the curation gate, re-checked
 * server-side (the client never carries authority). Approving publishes the practice into
 * the public library and stamps the reviewer; rejecting leaves it hidden. The 'practice
 * created pending → Host+ approves' half of the approval flow.
 */
export async function setPracticeStatusAction(
  id: string,
  status: 'approved' | 'rejected',
): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setPracticeStatus(id, status, caller.id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practice.')
  }
  revalidateContent('practices')
  revalidatePath('/practices', 'layout')
  return ok()
}

export async function setPracticeFeaturedAction(id: string, featured: boolean): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setPracticeFeatured(id, featured)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practice.')
  }
  revalidateContent('practices')
  return ok()
}

// --- Seasons (create is janitor-only; ending lives in /admin/gamification) -----

export async function createSeasonAction(input: {
  name: string
  theme?: string | null
  startsAt?: string | null
  endsAt?: string | null
}): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }

  const name = input.name.trim().slice(0, 120)
  if (!name) return fail('Give the season a name.')
  const startsAt = input.startsAt ? new Date(input.startsAt) : null
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (startsAt && Number.isNaN(startsAt.getTime())) return fail('Start date is not a valid date.')
  if (endsAt && Number.isNaN(endsAt.getTime())) return fail('End date is not a valid date.')
  if (startsAt && endsAt && endsAt <= startsAt) return fail('The end date must be after the start date.')

  const client = ub()
  const { data: maxRow } = await client
    .from('seasons')
    .select('season_number')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextNumber = ((maxRow as { season_number: number } | null)?.season_number ?? 0) + 1

  // New seasons open as 'draft' (the lifecycle entry state): composing, not public.
  // The Composer's transitions take it Scheduled -> Live (= stored 'active') -> Ended;
  // the destructive season reset (in /admin/gamification) closes the live season and
  // opens the next, and the schema enforces at most one 'active' season.
  const { error } = await client.from('seasons').insert({
    season_number: nextNumber,
    name,
    theme: input.theme?.trim().slice(0, 200) || null,
    status: 'draft',
    ...(startsAt ? { starts_at: startsAt.toISOString() } : {}),
    ...(endsAt ? { ends_at: endsAt.toISOString() } : {}),
  })
  if (error) return fail(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'content.season.create',
    targetType: 'season',
    detail: { season_number: nextNumber, name },
  })
  revalidateContent('seasons')
  return ok()
}

/**
 * Edit an existing season's identity + window (name / theme / starts_at / ends_at).
 * Janitor-only (the same gate as create), re-checked server-side; the client is never
 * trusted for authority. A patch is incremental — only the keys present are written —
 * so a no-op save is cheap. The status/lifecycle is NOT edited here (use the transition
 * actions below); this is the editable identity only.
 */
export async function updateSeasonAction(
  id: string,
  patch: {
    name?: string
    theme?: string | null
    startsAt?: string | null
    endsAt?: string | null
  },
): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120)
    if (!name) return fail('Give the season a name.')
    update.name = name
  }
  if (patch.theme !== undefined) {
    update.theme = patch.theme?.trim().slice(0, 200) || null
  }
  let startsAt: Date | null | undefined
  let endsAt: Date | null | undefined
  if (patch.startsAt !== undefined) {
    startsAt = patch.startsAt ? new Date(patch.startsAt) : null
    if (startsAt && Number.isNaN(startsAt.getTime())) return fail('Start date is not a valid date.')
    update.starts_at = startsAt ? startsAt.toISOString() : null
  }
  if (patch.endsAt !== undefined) {
    endsAt = patch.endsAt ? new Date(patch.endsAt) : null
    if (endsAt && Number.isNaN(endsAt.getTime())) return fail('End date is not a valid date.')
    update.ends_at = endsAt ? endsAt.toISOString() : null
  }
  // When both ends of the window are being set together, keep them ordered.
  if (startsAt && endsAt && endsAt <= startsAt) {
    return fail('The end date must be after the start date.')
  }

  if (Object.keys(update).length === 0) return ok()

  const client = ub()
  const { error } = await client.from('seasons').update(update).eq('id', id)
  if (error) return fail(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'content.season.update',
    targetType: 'season',
    targetId: id,
    detail: { fields: Object.keys(update) },
  })
  revalidateContent('seasons')
  return ok()
}

// The lifecycle a season moves through. Live === the stored 'active' status, so
// getCurrentSeason() (which reads status='active') keeps working untouched. 'draft'
// and 'scheduled' are new text values on the same column (no migration; the column is
// free text and the only DB constraint is "at most one active", which we honor below).
type SeasonStatus = 'draft' | 'scheduled' | 'active' | 'ended'

/** Read a season's current stored status (for transition guards). */
async function seasonStatus(client: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await client.from('seasons').select('status').eq('id', id).maybeSingle()
  return (data as { status: string } | null)?.status ?? null
}

/**
 * Move a season through its lifecycle: Draft -> Scheduled -> Live -> Ended. Janitor-only,
 * re-checked server-side. Each target enforces only the legal source states + sets the
 * dates that the state implies (Scheduled needs a future go-live date; Live stamps a
 * start; Ended stamps a close). Going Live is the one place the "at most one active
 * season" rule matters: the DB unique index enforces it, and we surface a friendly error
 * if another season already holds 'active'. The destructive season RESET (trophies, Zap
 * to Gem conversion) still lives in /admin/gamification; this only moves the status flag.
 */
export async function setSeasonStatusAction(
  id: string,
  target: SeasonStatus,
  opts?: { goLiveAt?: string | null },
): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }

  const client = ub()
  const current = await seasonStatus(client, id)
  if (current == null) return fail('That season no longer exists.')

  // A legacy 'upcoming' season reads as a pre-live draft, so it may move like one.
  const isPreLive = (s: string) => s === 'draft' || s === 'scheduled' || s === 'upcoming'

  const update: Record<string, unknown> = { status: target }

  if (target === 'draft') {
    if (!isPreLive(current)) return fail('Only a season that has not gone live can return to draft.')
  } else if (target === 'scheduled') {
    if (!isPreLive(current)) return fail('Only a draft season can be scheduled.')
    if (!opts?.goLiveAt) return fail('Pick the date the season goes live.')
    const at = new Date(opts.goLiveAt)
    if (Number.isNaN(at.getTime())) return fail('The go-live date is not a valid date.')
    if (at.getTime() <= Date.now()) return fail('The go-live date must be in the future.')
    update.starts_at = at.toISOString()
  } else if (target === 'active') {
    if (!isPreLive(current)) return fail('Only a draft or scheduled season can go live.')
    // Honor the "at most one active season" rule with a clear message before the
    // unique index would reject the write.
    const { data: live } = await client
      .from('seasons')
      .select('id, name')
      .eq('status', 'active')
      .neq('id', id)
      .maybeSingle()
    if (live) {
      return fail(`${(live as { name: string }).name} is live. End it before another season goes live.`)
    }
    update.starts_at = new Date().toISOString()
  } else if (target === 'ended') {
    if (current !== 'active') return fail('Only the live season can be ended.')
    update.ends_at = new Date().toISOString()
  } else {
    return fail('Unknown season state.')
  }

  const { error } = await client.from('seasons').update(update).eq('id', id)
  if (error) return fail(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'content.season.status',
    targetType: 'season',
    targetId: id,
    detail: { from: current, to: target },
  })
  revalidateContent('seasons')
  return ok()
}

/**
 * Clone a whole season's STRUCTURE into a brand-new season opened as Draft. The
 * Shopify safety rule applies: a clone NEVER auto-publishes — the copy lands as a
 * 'draft' with its windows cleared so the operator re-schedules and renames before
 * anything goes live. Janitor-only, re-checked server-side; every write goes through
 * the service-role admin client.
 *
 * Copy scope (what's DUPLICATED into the new season):
 *   - A new `seasons` row: next season_number, name "<source> (copy)", theme carried,
 *     status='draft', NO starts_at/ends_at (windows cleared).
 *   - A new `quests` container for the new season (mirrors the source Quest's name /
 *     description / emoji / accent; a fresh unique slug; season = the new number).
 *   - Each official Journey under the source Quest → a NEW `journey_plans` row: a fresh
 *     unique slug (source slug + "-s<n>"), title/summary/intro/accent/emoji/official/
 *     completion_gems/ranked_eligible carried, windows cleared, linked to the new Quest,
 *     visibility 'public', status 'approved'.
 *   - Each Journey's items → new `journey_plan_items` rows (same practice_id + domain_id +
 *     sort_order + note + cadence + the block fields). Practices are SHARED library rows —
 *     they are referenced, never duplicated.
 *   - Each Journey's Expression Challenge → a new `season_challenges` row: season = the new
 *     number, a fresh unique slug, name/description/category/difficulty/criteria/target/
 *     zaps_reward carried, journey_id re-pointed to the new Journey, is_active true. The
 *     criteria.journey_slug is rewritten to the new Journey's slug so the member lookup
 *     resolves under the new season.
 *
 * Best-effort atomicity: there is no single SQL function here, so the writes are ordered
 * season → quest → journeys → items → challenges, and a failure at any step returns the
 * error (the half-built draft is inert — nothing public references a draft season).
 * Returns the new season's id on success.
 */
export async function cloneSeasonAction(
  sourceSeasonId: string,
): Promise<ActionResult<{ seasonId: string }>> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }

  const client = ub()

  // 1. The source season identity.
  const { data: srcSeasonRow } = await client
    .from('seasons')
    .select('id, season_number, name, theme')
    .eq('id', sourceSeasonId)
    .maybeSingle()
  const srcSeason = srcSeasonRow as {
    id: string
    season_number: number
    name: string
    theme: string | null
  } | null
  if (!srcSeason) return fail('That season no longer exists.')

  // 2. The next season number (one past the highest existing).
  const { data: maxRow } = await client
    .from('seasons')
    .select('season_number')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextNumber = ((maxRow as { season_number: number } | null)?.season_number ?? 0) + 1

  // 3. The new season — Draft, theme carried, windows CLEARED (operator re-schedules).
  const newName = `${srcSeason.name} (copy)`.slice(0, 120)
  const { data: newSeasonRow, error: seasonErr } = await client
    .from('seasons')
    .insert({
      season_number: nextNumber,
      name: newName,
      theme: srcSeason.theme,
      status: 'draft',
    })
    .select('id')
    .maybeSingle()
  if (seasonErr) return fail(seasonErr.message)
  const newSeasonId = (newSeasonRow as { id: string } | null)?.id
  if (!newSeasonId) return fail('Could not open the new season.')

  // 4. The source Quest container (its official Journeys hang under it).
  const { data: srcQuestRow } = await client
    .from('quests')
    .select('id, name, description, emoji, accent')
    .eq('season', srcSeason.season_number)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  const srcQuest = srcQuestRow as {
    id: string
    name: string
    description: string | null
    emoji: string | null
    accent: string | null
  } | null

  // No Quest on the source = an empty season: the new Draft season stands on its own
  // (the operator can compose it from scratch). Nothing more to copy.
  if (!srcQuest) {
    await logAdminAction({
      actorId: caller.id,
      action: 'content.season.clone',
      targetType: 'season',
      targetId: newSeasonId,
      detail: { source: srcSeason.season_number, season_number: nextNumber, journeys: 0 },
    })
    revalidateContent('seasons')
    return ok({ seasonId: newSeasonId })
  }

  // 5. A new Quest container for the new season (mirrors the source; fresh unique slug).
  const questSlug = `season-quest-${nextNumber}-${Math.random().toString(36).slice(2, 8)}`
  const { data: newQuestRow, error: questErr } = await client
    .from('quests')
    .insert({
      slug: questSlug,
      season: nextNumber,
      name: srcQuest.name,
      description: srcQuest.description,
      emoji: srcQuest.emoji,
      accent: srcQuest.accent,
      status: 'active',
      sort_order: 0,
    })
    .select('id')
    .maybeSingle()
  if (questErr) return fail(questErr.message)
  const newQuestId = (newQuestRow as { id: string } | null)?.id
  if (!newQuestId) return fail('Could not create the new Quest.')

  // 6. The source's official Journeys, in their existing order.
  const { data: srcJourneyRows } = await client
    .from('journey_plans')
    .select(
      'id, slug, title, summary, intro, emoji, accent, official, completion_gems, ranked_eligible',
    )
    .eq('quest_id', srcQuest.id)
    .eq('official', true)
    .order('window_starts_at', { ascending: true, nullsFirst: true })
    .order('title', { ascending: true })
  const srcJourneys = (srcJourneyRows ?? []) as {
    id: string
    slug: string
    title: string
    summary: string | null
    intro: string | null
    emoji: string | null
    accent: string | null
    official: boolean
    completion_gems: number | null
    ranked_eligible: boolean | null
  }[]

  let journeyCount = 0
  for (const j of srcJourneys) {
    // New Journey: windows CLEARED, linked to the new Quest, fresh unique slug.
    const newSlug = `${j.slug}-s${nextNumber}-${Math.random().toString(36).slice(2, 6)}`
    const { data: newJourneyRow, error: journeyErr } = await client
      .from('journey_plans')
      .insert({
        slug: newSlug,
        title: j.title,
        summary: j.summary,
        intro: j.intro,
        emoji: j.emoji,
        accent: j.accent,
        visibility: 'public',
        official: j.official,
        quest_id: newQuestId,
        status: 'approved',
        completion_gems: j.completion_gems ?? 30,
        ranked_eligible: j.ranked_eligible ?? false,
        window_starts_at: null,
        window_ends_at: null,
      })
      .select('id')
      .maybeSingle()
    if (journeyErr) return fail(journeyErr.message)
    const newJourneyId = (newJourneyRow as { id: string } | null)?.id
    if (!newJourneyId) return fail('Could not copy a Journey.')
    journeyCount += 1

    // The Journey's items — practices are SHARED, so copy the references only.
    const { data: itemRows } = await client
      .from('journey_plan_items')
      .select(
        'practice_id, domain_id, sort_order, note, cadence, block_type, parent_id, title, body, media, settings, required, est_minutes',
      )
      .eq('plan_id', j.id)
      .order('sort_order', { ascending: true })
    const items = (itemRows ?? []) as Record<string, unknown>[]
    if (items.length > 0) {
      const { error: itemsErr } = await client
        .from('journey_plan_items')
        .insert(items.map((it) => ({ ...it, plan_id: newJourneyId })))
      if (itemsErr) return fail(itemsErr.message)
    }

    // The Journey's Expression Challenge (if any) — re-pointed to the new Journey, with
    // its criteria.journey_slug rewritten so the member lookup resolves this season.
    const { data: srcChallengeRow } = await client
      .from('season_challenges')
      .select('slug, name, description, category, difficulty, criteria, target, zaps_reward, sort_order')
      .eq('season', srcSeason.season_number)
      .eq('journey_id', j.id)
      .maybeSingle()
    const srcChallenge = srcChallengeRow as {
      slug: string
      name: string
      description: string
      category: string
      difficulty: string
      criteria: Json
      target: number
      zaps_reward: number
      sort_order: number
    } | null
    if (srcChallenge) {
      // Rewrite the criteria's journey_slug to the new Journey's slug; keep everything else.
      let criteria: Json = srcChallenge.criteria
      if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
        criteria = { ...(criteria as Record<string, Json>), journey_slug: newSlug }
      }
      const challengeSlug = `${srcChallenge.slug}-s${nextNumber}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 64)
      const { error: challengeErr } = await client.from('season_challenges').insert({
        season: nextNumber,
        slug: challengeSlug,
        name: srcChallenge.name,
        description: srcChallenge.description,
        category: srcChallenge.category,
        difficulty: srcChallenge.difficulty,
        criteria,
        target: srcChallenge.target,
        zaps_reward: srcChallenge.zaps_reward,
        sort_order: srcChallenge.sort_order,
        is_active: true,
        journey_id: newJourneyId,
      })
      if (challengeErr) return fail(challengeErr.message)
    }
  }

  await logAdminAction({
    actorId: caller.id,
    action: 'content.season.clone',
    targetType: 'season',
    targetId: newSeasonId,
    detail: { source: srcSeason.season_number, season_number: nextNumber, journeys: journeyCount },
  })
  revalidateContent('seasons')
  return ok({ seasonId: newSeasonId })
}

// --- Challenges ------------------------------------------------------------------

const DIFFICULTIES = ['easy', 'normal', 'hard', 'legendary'] as const
type Difficulty = (typeof DIFFICULTIES)[number]
const CATEGORIES = ['social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special'] as const

const clampInt = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)))

/** A season's official Journey, surfaced in the Expression Challenge authoring path. */
export interface ExpressionJourneyOption {
  id: string
  slug: string
  title: string
}

/** The active season's number, or null when no season is active. */
async function activeSeasonNumber(client: SupabaseClient): Promise<number | null> {
  const { data } = await client
    .from('seasons')
    .select('season_number')
    .eq('status', 'active')
    .maybeSingle()
  return (data as { season_number: number } | null)?.season_number ?? null
}

/**
 * The active season's official Journeys — the only Journeys an Expression Challenge can
 * cap. A Journey is official under the season's Quest (`quests.season = <active number>`,
 * `journey_plans.quest_id` set + `official = true`). Server-only read. Returns [] when
 * there is no active season or no Quest yet, so the form degrades to an empty selector.
 */
export async function activeSeasonJourneys(): Promise<ExpressionJourneyOption[]> {
  const client = ub()
  const season = await activeSeasonNumber(client)
  if (season == null) return []

  const { data: questRows } = await client
    .from('quests')
    .select('id')
    .eq('season', season)
    .eq('status', 'active')
  const questIds = ((questRows ?? []) as { id: string }[]).map((q) => q.id)
  if (questIds.length === 0) return []

  const { data: journeyRows } = await client
    .from('journey_plans')
    .select('id, slug, title')
    .in('quest_id', questIds)
    .eq('official', true)
    .order('title', { ascending: true })
  return ((journeyRows ?? []) as ExpressionJourneyOption[]).map((j) => ({
    id: j.id,
    slug: j.slug,
    title: j.title,
  }))
}

/**
 * Resolve an Expression Challenge's Journey server-side: confirm the id is a real official
 * Journey under the active season's Quest, and that no OTHER Expression Challenge already
 * caps it this season (the member lookup is `.maybeSingle()` on journey_id + season, so a
 * Journey may carry at most one). `excludeChallengeId` skips the row being edited.
 * Returns the Journey's slug (the criteria's `journey_slug`) or an inline error message.
 */
async function resolveExpressionJourney(
  client: SupabaseClient,
  season: number,
  journeyId: string,
  excludeChallengeId?: string,
): Promise<{ slug: string } | { error: string }> {
  const journey = (await activeSeasonJourneys()).find((j) => j.id === journeyId)
  if (!journey) return { error: 'Pick an official Journey from this season to cap.' }

  let dupeQuery = client
    .from('season_challenges')
    .select('id')
    .eq('season', season)
    .eq('journey_id', journeyId)
  if (excludeChallengeId) dupeQuery = dupeQuery.neq('id', excludeChallengeId)
  const { data: dupe } = await dupeQuery.maybeSingle()
  if (dupe) return { error: 'That Journey already has an Expression Challenge this season.' }

  return { slug: journey.slug }
}

export async function updateChallengeAction(
  id: string,
  patch: {
    name?: string
    description?: string
    category?: string
    difficulty?: string
    target?: number
    zapsReward?: number
    /** Soft enable/disable: a paused challenge stays on the board for history but stops
     *  counting toward members. */
    isActive?: boolean
    /** For an Expression Challenge: re-point it to a different official Journey. When set,
     *  `journey_id` and the `criteria.journey_slug` are kept in sync server-side. */
    journeyId?: string
  },
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

  const client = ub()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120)
    if (!name) return fail('The challenge needs a name.')
    update.name = name
  }
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 500)
  if (patch.category !== undefined) {
    if (!CATEGORIES.includes(patch.category as (typeof CATEGORIES)[number])) return fail('Unknown category.')
    update.category = patch.category
  }
  if (patch.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(patch.difficulty as Difficulty)) return fail('Unknown difficulty.')
    update.difficulty = patch.difficulty
  }
  if (patch.target !== undefined) update.target = clampInt(patch.target, 1, 10000)
  if (patch.zapsReward !== undefined) update.zaps_reward = clampInt(patch.zapsReward, 0, 1000)
  if (patch.isActive !== undefined) update.is_active = patch.isActive

  // Re-pointing an Expression Challenge: only allowed on a row that already caps a Journey,
  // and only to another official Journey in the same season. Keep journey_id + the criteria
  // slug in lockstep so the member-side lookup stays valid.
  if (patch.journeyId !== undefined) {
    const { data: existing } = await client
      .from('season_challenges')
      .select('season, journey_id')
      .eq('id', id)
      .maybeSingle()
    const row = existing as { season: number; journey_id: string | null } | null
    if (!row) return fail('That challenge no longer exists.')
    if (!row.journey_id) return fail('Only an Expression Challenge can point at a Journey.')
    const resolved = await resolveExpressionJourney(client, row.season, patch.journeyId, id)
    if ('error' in resolved) return fail(resolved.error)
    update.journey_id = patch.journeyId
    update.criteria = { type: 'expression', journey_slug: resolved.slug }
  }

  if (Object.keys(update).length === 0) return ok()

  const { error } = await client.from('season_challenges').update(update).eq('id', id)
  if (error) return fail(error.message)
  revalidateContent('challenges')
  return ok()
}

/** Remove a challenge from the board entirely (curator-gated, irreversible). */
export async function deleteChallengeAction(id: string): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  const { error } = await ub().from('season_challenges').delete().eq('id', id)
  if (error) return fail(error.message)
  revalidateContent('challenges')
  return ok()
}

/** Reorder a challenge within its season by swapping sort_order with its neighbor. */
export async function moveChallengeAction(id: string, dir: 'up' | 'down'): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  const client = ub()
  const { data: self } = await client
    .from('season_challenges')
    .select('id, season, sort_order')
    .eq('id', id)
    .maybeSingle()
  const s = self as { id: string; season: number; sort_order: number } | null
  if (!s) return fail('That challenge no longer exists.')
  const { data: sibs } = await client
    .from('season_challenges')
    .select('id, sort_order')
    .eq('season', s.season)
    .order('sort_order', { ascending: true })
  const list = (sibs ?? []) as { id: string; sort_order: number }[]
  const idx = list.findIndex((x) => x.id === id)
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return ok() // already at the edge
  const neighbor = list[swapIdx]
  await client.from('season_challenges').update({ sort_order: neighbor.sort_order }).eq('id', s.id)
  await client.from('season_challenges').update({ sort_order: s.sort_order }).eq('id', neighbor.id)
  revalidateContent('challenges')
  return ok()
}

export async function createChallengeAction(input: {
  name: string
  description: string
  category: string
  difficulty: string
  target: number
  zapsReward: number
  /** 'season' = a season-wide challenge (today's flow, no Journey). 'expression' = the
   *  capstone for one Journey: the action sets journey_id + criteria server-side. */
  kind?: 'season' | 'expression'
  /** Required when kind === 'expression': the official Journey this Challenge caps. */
  journeyId?: string
}): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

  const name = input.name.trim().slice(0, 120)
  if (!name) return fail('Give the challenge a name.')
  if (!DIFFICULTIES.includes(input.difficulty as Difficulty)) return fail('Unknown difficulty.')
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) return fail('Unknown category.')

  const isExpression = input.kind === 'expression'

  const client = ub()
  const season = await activeSeasonNumber(client)
  if (season == null) return fail('No active season to add a challenge to.')

  // Expression Challenge: validate the Journey + uniqueness, then derive journey_id +
  // criteria server-side (the operator never hand-edits raw jsonb).
  let journeyId: string | null = null
  let criteria: Json = {}
  if (isExpression) {
    if (!input.journeyId) return fail('An Expression Challenge needs a Journey to cap.')
    const resolved = await resolveExpressionJourney(client, season, input.journeyId)
    if ('error' in resolved) return fail(resolved.error)
    journeyId = input.journeyId
    criteria = { type: 'expression', journey_slug: resolved.slug }
  }

  const { data: lastRow } = await client
    .from('season_challenges')
    .select('sort_order')
    .eq('season', season)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = ((lastRow as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const slugBase =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'challenge'
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`

  const { error } = await client.from('season_challenges').insert({
    season,
    slug,
    name,
    description: input.description.trim().slice(0, 500),
    // An Expression Challenge always sorts under 'special' (the capstone category).
    category: isExpression ? 'special' : input.category,
    difficulty: input.difficulty,
    criteria,
    journey_id: journeyId,
    target: clampInt(input.target, 1, 10000),
    zaps_reward: clampInt(input.zapsReward, 0, 1000),
    sort_order: sortOrder,
  })
  if (error) return fail(error.message)
  revalidateContent('challenges')
  return ok()
}

// --- Vera's creator tips (janitor only; draft-and-approve) -----------------------

export async function generateTipsAction(): Promise<ActionResult<{ created: number; skipped: number }>> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }
  try {
    const result = await generateCreatorTips(caller.id)
    revalidateContent('tips')
    return ok(result)
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return fail('AI is off or this feature is over budget for today. Try again later.')
    }
    return fail(e instanceof Error ? e.message : 'Could not generate tips.')
  }
}

export async function generatePosterReviewsAction(): Promise<ActionResult<{ created: number; skipped: number }>> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }
  try {
    const result = await generatePosterReviews(caller.id)
    revalidateContent('tips')
    return ok(result)
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return fail('AI is off or this feature is over budget for today. Try again later.')
    }
    return fail(e instanceof Error ? e.message : 'Could not generate poster reviews.')
  }
}

/** Mark an internal spam flag reviewed. No notification ever goes out for a
 *  flag; the honesty bands already throttle the reward automatically. */
export async function resolveFlagAction(id: string): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }
  try {
    await resolveFlag(id, caller.id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not resolve the flag.')
  }
  await logAdminAction({
    actorId: caller.id,
    action: 'content.flag.resolve',
    targetType: 'creator_tip',
    targetId: id,
  })
  revalidateContent('tips')
  return ok()
}

export async function approveAndSendTipAction(id: string, text: string): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }
  try {
    await updateTipText(id, text)
    await approveTip(id, caller.id)
    await sendTip(id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not send the tip.')
  }
  await logAdminAction({
    actorId: caller.id,
    action: 'content.tip.send',
    targetType: 'creator_tip',
    targetId: id,
  })
  revalidateContent('tips')
  return ok()
}

export async function dismissTipAction(id: string): Promise<ActionResult> {
  let caller: { id: string }
  try {
    caller = await requireJanitor()
  } catch {
    return fail('Janitor only.')
  }
  try {
    await dismissTip(id, caller.id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not dismiss the tip.')
  }
  revalidateContent('tips')
  return ok()
}
