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
  return createAdminClient() as unknown as SupabaseClient
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

const clampInt = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)))

export async function updateChallengeAction(
  id: string,
  patch: {
    name?: string
    description?: string
    difficulty?: string
    target?: number
    zapsReward?: number
  },
): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

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
  if (Object.keys(update).length === 0) return ok()

  const { error } = await ub().from('season_challenges').update(update).eq('id', id)
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
}): Promise<ActionResult> {
  try {
    await requireCurator()
  } catch {
    return fail('You need curation access for this.')
  }

  const name = input.name.trim().slice(0, 120)
  if (!name) return fail('Give the challenge a name.')
  if (!DIFFICULTIES.includes(input.difficulty as Difficulty)) return fail('Unknown difficulty.')
  const categories = ['social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special']
  if (!categories.includes(input.category)) return fail('Unknown category.')

  const client = ub()
  const { data: seasonRow } = await client
    .from('seasons')
    .select('season_number')
    .eq('status', 'active')
    .maybeSingle()
  const season = (seasonRow as { season_number: number } | null)?.season_number
  if (!season) return fail('No active season to add a challenge to.')

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
    category: input.category,
    difficulty: input.difficulty,
    criteria: {},
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
