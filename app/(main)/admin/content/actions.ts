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
import { setPlanStatus, setPlanOfficial, type PlanStatus } from '@/lib/journey-plans'
import { setPracticeFlags } from '@/lib/practices'
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

export async function setPracticeStatusAction(
  id: string,
  status: 'approved' | 'rejected',
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }
  try {
    await setPracticeStatus(id, status)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the practice.')
  }
  revalidateContent('practices')
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

  // New seasons open as 'upcoming' — the season reset (in /admin/gamification)
  // is what closes the active season and opens the next, and the schema enforces
  // at most one active season.
  const { error } = await client.from('seasons').insert({
    season_number: nextNumber,
    name,
    theme: input.theme?.trim().slice(0, 200) || null,
    status: 'upcoming',
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
    difficulty?: string
    target?: number
    zapsReward?: number
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
  if (patch.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(patch.difficulty as Difficulty)) return fail('Unknown difficulty.')
    update.difficulty = patch.difficulty
  }
  if (patch.target !== undefined) update.target = clampInt(patch.target, 1, 10000)
  if (patch.zapsReward !== undefined) update.zaps_reward = clampInt(patch.zapsReward, 0, 1000)

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
