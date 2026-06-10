// The "Journeys" library (backlog §Q1, ADR-087): members curate combos of
// practices — organized by the 4 Pillars — with per-item cadence + notes (ADR-096),
// and share/fork them. Building + using a PERSONAL journey is free (it rides the
// free practice loop — adopting adds its practices to your daily log); the public
// LIBRARY/marketplace is the Crew (paid) surface (publish + adopt/fork others'),
// gated in the actions. Distinct from the gamified engine (quest_*).
//
// Server-only. Writes go through the service-role admin client behind app-code
// authz (callers enforce: author owns the plan). The journey_plan* tables are new;
// until `supabase gen types` is re-run they aren't in the generated Database types,
// so this module reads/writes through an untyped admin handle (repo convention —
// see lib/practices.ts). Drop the cast after regen.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adoptPractice } from '@/lib/practices'
import { resolveTier, type IntensityTier } from '@/lib/journey-tiers'
import { currentSeasonWeek, qualifyingWeeks, DEFAULT_TARGET_WEEKS } from '@/lib/journey-quest-clock'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export type PlanVisibility = 'private' | 'unlisted' | 'public'
export type PlanStatus = 'draft' | 'pending' | 'approved' | 'rejected'

/** A single Journey-page widget descriptor stored in journey_plans.page_config. The
 *  canonical widget ids + default layout live in lib/journey-page-config.ts. */
export interface PageWidgetConfig {
  id: string
  enabled: boolean
  settings?: Record<string, unknown>
}

/** The content for one intensity tier of a practice (from practice_tiers; ADR-198). */
export interface PracticeTierContent {
  tier: IntensityTier
  title: string | null
  body: string | null
  est_minutes: number | null
}

export interface JourneyPlan {
  id: string
  slug: string
  title: string
  summary: string | null
  /** Longer "why this journey" body (markdown) — the depth that turns a combo into
   *  a course. Optional. */
  intro: string | null
  /** A single emoji giving the journey a face without an image. Optional. */
  emoji: string | null
  /** Accent color token (a pillar/brand token name, e.g. 'jade'). Optional. */
  accent: string | null
  author_id: string | null
  visibility: PlanVisibility
  fork_of: string | null
  forked_count: number
  adopt_count: number
  cover_image: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  /** Quest this Journey is official under (null = open-library Journey). */
  quest_id: string | null
  /** Official season Journey (Guide/Mentor flagged). */
  official: boolean
  /** Review state (default 'approved' grandfathers existing plans; ADR-197). */
  status: PlanStatus
  /** Per-Journey page layout (ordered widgets). Null = the hardcoded default. */
  page_config: PageWidgetConfig[] | null
  /** A day qualifies toward completion at ≥ this many logs of the plan's practices. */
  min_practices_per_day: number
  /** Qualifying weeks needed to complete (default 8 of 13). */
  target_weeks: number
  /** Official plans lock to their quest's season; library plans can be evergreen. */
  season_locked: boolean
  /** Gems granted on completion (default 30). */
  completion_gems: number
}

export interface JourneyPlanItem {
  id: string
  plan_id: string
  practice_id: string
  domain_id: string | null
  sort_order: number
  note: string | null
  /** Per-journey cadence override (ADR-096). Null = the practice's own cadence. */
  cadence: string | null
  /** The author's default intensity tier for this step (ADR-198). */
  default_tier: IntensityTier
  practice:
    | {
        id: string
        title: string
        description: string | null
        domain_id: string | null
        cadence: string | null
        tiers?: PracticeTierContent[] | null
      }
    | null
}

const PLAN_COLS =
  'id, slug, title, summary, intro, emoji, accent, author_id, visibility, fork_of, ' +
  'forked_count, adopt_count, cover_image, created_at, updated_at, published_at, ' +
  'quest_id, official, status, page_config, min_practices_per_day, target_weeks, season_locked, completion_gems'

const ITEM_COLS =
  'id, plan_id, practice_id, domain_id, sort_order, note, cadence, default_tier, ' +
  'practice:practices(id, title, description, domain_id, cadence, ' +
  'tiers:practice_tiers(tier, title, body, est_minutes))'

/** A url-safe slug from the title + a short random suffix (slugs are unique). */
function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'journey'
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

const touch = () => ({ updated_at: new Date().toISOString() })

// --- Reads ----------------------------------------------------------------

/** A member's own plans, newest-touched first. */
export async function getMyPlans(authorId: string): Promise<JourneyPlan[]> {
  const { data } = await db()
    .from('journey_plans')
    .select(PLAN_COLS)
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false })
  return (data as JourneyPlan[] | null) ?? []
}

/** Public, published plans for the open library, most-adopted first. */
export async function listPublicPlans(): Promise<JourneyPlan[]> {
  const { data } = await db()
    .from('journey_plans')
    .select(PLAN_COLS)
    .eq('visibility', 'public')
    .order('adopt_count', { ascending: false })
    .order('published_at', { ascending: false })
  return (data as JourneyPlan[] | null) ?? []
}

// --- Public (anon) discover reads ------------------------------------------
// The /discover/journeys route is the only PUBLIC, indexable Journey surface.
// Events/circles redact through SECURITY DEFINER RPCs because they carry precise
// location; a published library Journey carries no private data, so these reads
// go through the same admin handle the rest of this module uses, guarded in code
// to PUBLISHED, non-rejected plans only. Service-role key stays server-side.

/** Indexable library Journeys for the anon discover index — published and not
 *  rejected, most-adopted first. (Mirrors listPublicPlans but excludes rejected
 *  plans, which shouldn't be promoted on a crawlable surface.) */
export async function listPublicJourneys(): Promise<JourneyPlan[]> {
  const { data } = await db()
    .from('journey_plans')
    .select(PLAN_COLS)
    .eq('visibility', 'public')
    .neq('status', 'rejected')
    .order('adopt_count', { ascending: false })
    .order('published_at', { ascending: false })
  return (data as JourneyPlan[] | null) ?? []
}

/** One PUBLIC Journey + its items for the anon discover detail page. Null unless
 *  the plan is published to the open library and not rejected. */
export async function getPublicJourney(
  slug: string,
): Promise<{ plan: JourneyPlan; items: JourneyPlanItem[] } | null> {
  const base = await getPlan(slug)
  if (!base) return null
  if (base.plan.visibility !== 'public' || base.plan.status === 'rejected') return null
  return base
}

/** A plan + its ordered items (with each practice). Null if not found. */
export async function getPlan(
  slug: string,
): Promise<{ plan: JourneyPlan; items: JourneyPlanItem[] } | null> {
  const { data: planRow } = await db().from('journey_plans').select(PLAN_COLS).eq('slug', slug).maybeSingle()
  const plan = (planRow ?? null) as unknown as JourneyPlan | null
  if (!plan) return null
  const { data: itemRows } = await db()
    .from('journey_plan_items')
    .select(ITEM_COLS)
    .eq('plan_id', plan.id)
    .order('sort_order', { ascending: true })
  return { plan, items: (itemRows ?? []) as unknown as JourneyPlanItem[] }
}

/** The author of a plan (for ownership checks in server actions). */
export async function planAuthorId(planId: string): Promise<string | null> {
  const { data } = await db().from('journey_plans').select('author_id').eq('id', planId).maybeSingle()
  return (data as { author_id: string | null } | null)?.author_id ?? null
}

/** Visibility + author of a plan (for the adopt/fork access checks). */
export async function planMeta(planId: string): Promise<{ visibility: PlanVisibility; author_id: string | null } | null> {
  const { data } = await db().from('journey_plans').select('visibility, author_id').eq('id', planId).maybeSingle()
  return (data as { visibility: PlanVisibility; author_id: string | null } | null) ?? null
}

// --- Mutations (callers enforce: the author owns the plan) -----------------

export async function createPlan(input: {
  authorId: string
  title: string
  summary?: string | null
  emoji?: string | null
  accent?: string | null
}): Promise<JourneyPlan | null> {
  const { data } = await db()
    .from('journey_plans')
    .insert({
      slug: slugify(input.title),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      emoji: input.emoji?.trim() || null,
      accent: input.accent?.trim() || null,
      author_id: input.authorId,
      visibility: 'private',
    })
    .select(PLAN_COLS)
    .maybeSingle()
  return (data as JourneyPlan | null) ?? null
}

/** Add a practice to a plan (snapshotting its Pillar). Appends at the end. */
export async function addItem(input: {
  planId: string
  practiceId: string
  domainId?: string | null
  note?: string | null
  cadence?: string | null
}): Promise<void> {
  const client = db()
  const { data: last } = await client
    .from('journey_plan_items')
    .select('sort_order')
    .eq('plan_id', input.planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1

  await client.from('journey_plan_items').upsert(
    {
      plan_id: input.planId,
      practice_id: input.practiceId,
      domain_id: input.domainId ?? null,
      note: input.note?.trim() || null,
      cadence: input.cadence?.trim() || null,
      sort_order: nextOrder,
    },
    { onConflict: 'plan_id,practice_id' },
  )
  await client.from('journey_plans').update(touch()).eq('id', input.planId)
}

/** Update a single item's per-journey controls (note, cadence override, default tier). */
export async function updateItem(
  planId: string,
  practiceId: string,
  patch: { note?: string | null; cadence?: string | null; defaultTier?: IntensityTier },
): Promise<void> {
  const client = db()
  const update: Record<string, unknown> = {}
  if (patch.note !== undefined) update.note = patch.note?.trim() || null
  if (patch.cadence !== undefined) update.cadence = patch.cadence?.trim() || null
  if (patch.defaultTier !== undefined) update.default_tier = patch.defaultTier
  if (Object.keys(update).length === 0) return
  await client.from('journey_plan_items').update(update).eq('plan_id', planId).eq('practice_id', practiceId)
  await client.from('journey_plans').update(touch()).eq('id', planId)
}

/** Set a circle's default intensity tier — the Host control (ADR-198). Null clears it. */
export async function setCircleTier(circleId: string, tier: IntensityTier | null): Promise<void> {
  await db().from('circles').update({ default_intensity_tier: tier }).eq('id', circleId)
}

/** Set a member's per-Journey tier override (ADR-198). Null clears it (inherit the chain). */
export async function setAdoptionTier(
  profileId: string,
  planId: string,
  tier: IntensityTier | null,
): Promise<void> {
  await db()
    .from('journey_plan_adoptions')
    .update({ tier_override: tier })
    .eq('profile_id', profileId)
    .eq('plan_id', planId)
}

/** Set a plan's review status (draft/pending/approved/rejected). Caller enforces authz. */
export async function setPlanStatus(planId: string, status: PlanStatus): Promise<void> {
  await db().from('journey_plans').update({ status, ...touch() }).eq('id', planId)
}

/** Flag a plan official + link it to a Quest. Guide/Mentor only — caller enforces. */
export async function setPlanOfficial(
  planId: string,
  opts: { official: boolean; questId?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = { official: opts.official }
  if (opts.questId !== undefined) update.quest_id = opts.questId || null
  await db().from('journey_plans').update({ ...update, ...touch() }).eq('id', planId)
}

/** Edit a plan's own fields (identity + intro). Caller enforces ownership. */
export async function updatePlan(
  planId: string,
  patch: {
    title?: string
    summary?: string | null
    intro?: string | null
    emoji?: string | null
    accent?: string | null
    coverImage?: string | null
    status?: PlanStatus
    minPracticesPerDay?: number
    targetWeeks?: number
    seasonLocked?: boolean
    completionGems?: number
    pageConfig?: PageWidgetConfig[] | null
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || 'Untitled journey'
  if (patch.summary !== undefined) update.summary = patch.summary?.trim().slice(0, 280) || null
  if (patch.intro !== undefined) update.intro = patch.intro?.trim().slice(0, 8000) || null
  if (patch.emoji !== undefined) update.emoji = patch.emoji?.trim().slice(0, 16) || null
  if (patch.accent !== undefined) update.accent = patch.accent?.trim().slice(0, 24) || null
  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage?.trim().slice(0, 500) || null
  // Completion rules + page layout (ADR-197). Clamped to their schema bounds.
  if (patch.status !== undefined) update.status = patch.status
  if (patch.minPracticesPerDay !== undefined)
    update.min_practices_per_day = Math.min(4, Math.max(1, Math.round(patch.minPracticesPerDay)))
  if (patch.targetWeeks !== undefined)
    update.target_weeks = Math.min(13, Math.max(1, Math.round(patch.targetWeeks)))
  if (patch.seasonLocked !== undefined) update.season_locked = patch.seasonLocked
  if (patch.completionGems !== undefined)
    update.completion_gems = Math.min(100, Math.max(0, Math.round(patch.completionGems)))
  if (patch.pageConfig !== undefined) update.page_config = patch.pageConfig
  if (Object.keys(update).length === 0) return
  await db().from('journey_plans').update({ ...update, ...touch() }).eq('id', planId)
}

export async function removeItem(planId: string, practiceId: string): Promise<void> {
  const client = db()
  await client.from('journey_plan_items').delete().eq('plan_id', planId).eq('practice_id', practiceId)
  await client.from('journey_plans').update(touch()).eq('id', planId)
}

/** Persist a new order (array of practice ids in the desired sequence). */
export async function reorderItems(planId: string, practiceIdsInOrder: string[]): Promise<void> {
  const client = db()
  await Promise.all(
    practiceIdsInOrder.map((practiceId, i) =>
      client
        .from('journey_plan_items')
        .update({ sort_order: i })
        .eq('plan_id', planId)
        .eq('practice_id', practiceId),
    ),
  )
  await client.from('journey_plans').update(touch()).eq('id', planId)
}

/** Make a plan visible in the open library (first publish stamps published_at). */
export async function publishPlan(planId: string): Promise<void> {
  const client = db()
  const { data: existing } = await client
    .from('journey_plans')
    .select('published_at')
    .eq('id', planId)
    .maybeSingle()
  const firstPublish = !(existing as { published_at: string | null } | null)?.published_at
  await client
    .from('journey_plans')
    .update({
      visibility: 'public',
      ...(firstPublish ? { published_at: new Date().toISOString() } : {}),
      ...touch(),
    })
    .eq('id', planId)
}

export async function setPlanVisibility(planId: string, visibility: PlanVisibility): Promise<void> {
  await db().from('journey_plans').update({ visibility, ...touch() }).eq('id', planId)
}

// --- Adopt / fork (acting on a community journey) --------------------------

/** Is this plan currently adopted by the member? */
export async function isPlanAdopted(profileId: string, planId: string): Promise<boolean> {
  const { data } = await db()
    .from('journey_plan_adoptions')
    .select('active')
    .eq('plan_id', planId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!(data as { active: boolean } | null)?.active
}

/** Adopt a community journey: its practices flow into the member's own
 *  member_practices (the free loop, via adoptPractice), and we record the
 *  adoption (incrementing adopt_count on first adoption only). */
export async function adoptPlan(profileId: string, planId: string): Promise<void> {
  const client = db()
  const { data: itemRows } = await client.from('journey_plan_items').select('practice_id').eq('plan_id', planId)
  const practiceIds = ((itemRows as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id)
  for (const pid of practiceIds) await adoptPractice(profileId, pid)

  const { data: existingRow } = await client
    .from('journey_plan_adoptions')
    .select('id, active')
    .eq('plan_id', planId)
    .eq('profile_id', profileId)
    .maybeSingle()
  const existing = existingRow as { id: string; active: boolean } | null

  if (!existing) {
    await client.from('journey_plan_adoptions').insert({ plan_id: planId, profile_id: profileId, active: true })
    const { data: planRow } = await client.from('journey_plans').select('adopt_count').eq('id', planId).maybeSingle()
    const count = (planRow as { adopt_count: number } | null)?.adopt_count ?? 0
    await client.from('journey_plans').update({ adopt_count: count + 1 }).eq('id', planId)
  } else if (!existing.active) {
    await client.from('journey_plan_adoptions').update({ active: true }).eq('id', existing.id)
  }
}

/** Fork (remix) a PUBLIC plan into a new private plan owned by the caller,
 *  copying its items and recording lineage (fork_of + source forked_count). */
export async function forkPlan(profileId: string, planId: string): Promise<JourneyPlan | null> {
  const client = db()
  const { data: srcRow } = await client.from('journey_plans').select(PLAN_COLS).eq('id', planId).maybeSingle()
  const src = srcRow as unknown as JourneyPlan | null
  if (!src || src.visibility !== 'public') return null

  const { data: itemRows } = await client
    .from('journey_plan_items')
    .select('practice_id, domain_id, sort_order, note, cadence')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
  const items = (itemRows ?? []) as { practice_id: string; domain_id: string | null; sort_order: number; note: string | null; cadence: string | null }[]

  const { data: forkRow } = await client
    .from('journey_plans')
    .insert({
      slug: slugify(src.title),
      title: src.title,
      summary: src.summary,
      author_id: profileId,
      visibility: 'private',
      fork_of: planId,
    })
    .select(PLAN_COLS)
    .maybeSingle()
  const fork = forkRow as unknown as JourneyPlan | null
  if (!fork) return null

  if (items.length > 0) {
    await client
      .from('journey_plan_items')
      .insert(items.map((it) => ({ plan_id: fork.id, practice_id: it.practice_id, domain_id: it.domain_id, sort_order: it.sort_order, note: it.note, cadence: it.cadence })))
  }
  const { data: cntRow } = await client.from('journey_plans').select('forked_count').eq('id', planId).maybeSingle()
  const forked = (cntRow as { forked_count: number } | null)?.forked_count ?? 0
  await client.from('journey_plans').update({ forked_count: forked + 1 }).eq('id', planId)

  return fork
}

// --- Demo cleanup ---------------------------------------------------------

/** Delete every plan authored by any of these profiles (items + adoptions cascade).
 *  Demo journeys carry no is_demo flag and author_id is ON DELETE SET NULL, so demo
 *  plans must be removed by their author BEFORE the profiles go, or they'd orphan.
 *  Batched; safe to call with an empty list. */
export async function deletePlansByAuthors(authorIds: string[]): Promise<void> {
  if (!authorIds.length) return
  const client = db()
  for (let i = 0; i < authorIds.length; i += 200) {
    await client.from('journey_plans').delete().in('author_id', authorIds.slice(i, i + 200))
  }
}

// --- Pillar map -----------------------------------------------------------

export interface PlanPillarSlice {
  domainId: string | null
  count: number
}

/** Count a plan's items per Pillar (domain) — the plan's "coverage" read. */
export function planPillarMap(items: JourneyPlanItem[]): PlanPillarSlice[] {
  const counts = new Map<string | null, number>()
  for (const it of items) {
    const key = it.domain_id ?? it.practice?.domain_id ?? null
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([domainId, count]) => ({ domainId, count }))
}

// --- Active-journey progress (no schema; derived from the practice log) --------

export interface JourneyProgressItem extends JourneyPlanItem {
  /** Distinct days this practice was logged in the last 7 days (the Rhythm clock). */
  loggedThisWeek: number
  /** Weekly target parsed from the item's (or practice's) cadence (1–7). */
  target: number
  /** Cadence met this week → the step counts as on track. */
  met: boolean
  /** The intensity tier this viewer sees, resolved member→circle→item→adept (ADR-198). */
  resolvedTier: IntensityTier
  /** Content for the resolved tier (falls back to the 'adept' tier, then null). */
  tierContent: PracticeTierContent | null
}

export interface JourneyProgress {
  plan: JourneyPlan
  items: JourneyProgressItem[]
  total: number
  done: number
  percent: number
  /** First item not yet on track this week, in order — the "current step". */
  nextItem: JourneyProgressItem | null
  /** Members of the viewer's circles also on this journey (0 unless requested via
   *  { withCompanions }). The "doing it with your circle" signal (Path A). */
  circleCompanions: number
  // --- Arc clock (season completion; docs/JOURNEYS.md §3–§4) ---
  /** The season-window start (YYYY-MM-DD): the quest's season for official plans, else the
   *  member's adoption date for evergreen plans. Null if it can't be resolved. */
  anchorStart: string | null
  /** Stable token for this plan's season cycle, used in reward idempotency keys. */
  seasonToken: string | number
  /** The current 1-based season week (1–13), or null outside the window. */
  seasonWeek: number | null
  /** Distinct qualifying weeks banked so far (a day qualifies at ≥ min_practices_per_day
   *  distinct logs of this plan's practices). */
  qualifyingWeeks: number
  /** Weeks needed to complete (plan.target_weeks, default 8). */
  targetWeeks: number
  /** qualifyingWeeks ≥ targetWeeks. */
  complete: boolean
  /** Whole season weeks left in the window (max(0, 13 − seasonWeek)). */
  weeksRemaining: number
}

/** Parse a free-text cadence ("Daily", "3x a week", "Weekly", …) into a weekly
 *  target: how many of the last 7 days the practice should be logged. Unknown,
 *  weekly, or monthly cadences fall back to 1 (lenient — "did it recently" counts).
 *  Clamped to 1–7 since a 7-day window can't exceed 7 distinct days. */
export function weeklyTargetFromCadence(cadence: string | null): number {
  const c = (cadence ?? '').toLowerCase()
  const clamp = (n: number) => Math.min(7, Math.max(1, n))
  const num = c.match(/(\d+)\s*(x|×|times|day|\/|per)/)
  if (num) return clamp(parseInt(num[1], 10))
  if (/(daily|every ?day|each day)/.test(c)) return 7
  if (/(thrice|three times)/.test(c)) return 3
  if (/(twice|two times)/.test(c)) return 2
  return 1
}

/** A member's active (adopted) journeys with progress derived from their practice
 *  log. A step is "done" when its cadence is MET this week — logged on at least
 *  `target` of the last 7 days — so the current step is the first one off track.
 *  No progress schema; it rides the same practice_logs the gamification runs on,
 *  so logging a journey's practice advances it AND earns the rewards. */
export async function getActiveJourneyProgress(
  profileId: string,
  opts: { withCompanions?: boolean; circleId?: string | null } = {},
): Promise<JourneyProgress[]> {
  const client = db()

  const { data: adoptionRows } = await client
    .from('journey_plan_adoptions')
    .select(`created_at, tier_override, plan:journey_plans(${PLAN_COLS})`)
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  const adoptions = ((adoptionRows ?? []) as unknown as {
    created_at: string | null
    tier_override: IntensityTier | null
    plan: JourneyPlan | null
  }[]).filter((a) => !!a.plan)
  const plans = adoptions.map((a) => a.plan as JourneyPlan)
  if (plans.length === 0) return []
  const adoptedAtByPlan = new Map(adoptions.map((a) => [(a.plan as JourneyPlan).id, a.created_at]))
  const tierOverrideByPlan = new Map(adoptions.map((a) => [(a.plan as JourneyPlan).id, a.tier_override]))

  // Resolve season anchors for official plans: quest → season number → starts_at.
  const seasonByQuest = new Map<string, number>()
  const seasonStartByNumber = new Map<number, string>()
  const questIds = [...new Set(plans.map((p) => p.quest_id).filter((q): q is string => !!q))]
  if (questIds.length > 0) {
    const { data: questRows } = await client.from('quests').select('id, season').in('id', questIds)
    for (const q of (questRows ?? []) as { id: string; season: number | null }[]) {
      if (q.season != null) seasonByQuest.set(q.id, q.season)
    }
    const seasonNos = [...new Set([...seasonByQuest.values()])]
    if (seasonNos.length > 0) {
      const { data: seasonRows } = await client
        .from('seasons')
        .select('season_number, starts_at')
        .in('season_number', seasonNos)
      for (const s of (seasonRows ?? []) as { season_number: number; starts_at: string | null }[]) {
        if (s.starts_at) seasonStartByNumber.set(s.season_number, s.starts_at)
      }
    }
  }
  const anchorByPlan = new Map<string, SeasonAnchor>()
  for (const p of plans) {
    anchorByPlan.set(
      p.id,
      resolveAnchor(p, adoptedAtByPlan.get(p.id) ?? null, seasonStartByNumber, seasonByQuest),
    )
  }

  // The viewer's circle default tier. With an explicit circle context, use that circle; else use
  // the first of the member's active circles that has a Host-set default (the calibration applies
  // on the member's own Journey page, where no circleId is passed).
  let circleDefaultTier: IntensityTier | null = null
  if (opts.circleId) {
    const { data: c } = await client
      .from('circles')
      .select('default_intensity_tier')
      .eq('id', opts.circleId)
      .maybeSingle()
    circleDefaultTier =
      (c as { default_intensity_tier: IntensityTier | null } | null)?.default_intensity_tier ?? null
  } else {
    const { data: cs } = await client
      .from('memberships')
      .select('circle:circles(default_intensity_tier)')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    for (const m of (cs ?? []) as unknown as { circle: { default_intensity_tier: IntensityTier | null } | null }[]) {
      const t = m.circle?.default_intensity_tier
      if (t) {
        circleDefaultTier = t
        break
      }
    }
  }

  // One log read powers both clocks: the widest window we need is the earliest plan anchor,
  // but never less than the last 7 days (the Rhythm clock).
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6) // inclusive 7-day window: today + 6 prior
  const sevenAgo = weekAgo.toISOString().slice(0, 10)
  let minDate = sevenAgo
  for (const a of anchorByPlan.values()) if (a.start && a.start < minDate) minDate = a.start
  const { data: logRows } = await client
    .from('practice_logs')
    .select('practice_id, logged_for')
    .eq('profile_id', profileId)
    .gte('logged_for', minDate)
  const logs = ((logRows ?? []) as { practice_id: string | null; logged_for: string }[]).filter(
    (r): r is { practice_id: string; logged_for: string } => !!r.practice_id,
  )

  const { data: itemRows } = await client
    .from('journey_plan_items')
    .select(ITEM_COLS)
    .in(
      'plan_id',
      plans.map((p) => p.id),
    )
    .order('sort_order', { ascending: true })
  const allItems = (itemRows ?? []) as unknown as JourneyPlanItem[]

  // Path A — "doing it with your circle": members of the viewer's active circles who also
  // hold an active adoption of each plan (distinct profiles, self excluded). Opt-in.
  const companionsByPlan = new Map<string, number>()
  if (opts.withCompanions) {
    const { data: myMemberships } = await client
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    const myCircleIds = [...new Set(((myMemberships ?? []) as { circle_id: string }[]).map((m) => m.circle_id))]
    if (myCircleIds.length > 0) {
      const { data: coMembers } = await client
        .from('memberships')
        .select('profile_id')
        .in('circle_id', myCircleIds)
        .eq('status', 'active')
        .neq('profile_id', profileId)
      const companionIds = [...new Set(((coMembers ?? []) as { profile_id: string }[]).map((m) => m.profile_id))]
      if (companionIds.length > 0) {
        const { data: coAdoptions } = await client
          .from('journey_plan_adoptions')
          .select('plan_id, profile_id')
          .in(
            'plan_id',
            plans.map((p) => p.id),
          )
          .eq('active', true)
          .in('profile_id', companionIds)
        for (const r of (coAdoptions ?? []) as { plan_id: string }[]) {
          companionsByPlan.set(r.plan_id, (companionsByPlan.get(r.plan_id) ?? 0) + 1)
        }
      }
    }
  }

  return plans.map((plan) => {
    const planItems = allItems.filter((it) => it.plan_id === plan.id)
    const planPracticeIds = new Set(planItems.map((it) => it.practice_id))
    const anchor = anchorByPlan.get(plan.id) as SeasonAnchor
    const tierOverride = tierOverrideByPlan.get(plan.id) ?? null

    // Rhythm clock — distinct days per practice in the last 7 days.
    const daysByPractice = new Map<string, number>()
    for (const r of logs) {
      if (planPracticeIds.has(r.practice_id) && r.logged_for >= sevenAgo) {
        daysByPractice.set(r.practice_id, (daysByPractice.get(r.practice_id) ?? 0) + 1)
      }
    }

    const items: JourneyProgressItem[] = planItems.map((it) => {
      const target = weeklyTargetFromCadence(it.cadence ?? it.practice?.cadence ?? null)
      const loggedThisWeek = daysByPractice.get(it.practice_id) ?? 0
      const resolvedTier = resolveTier(tierOverride, circleDefaultTier, it.default_tier)
      const tiers = it.practice?.tiers ?? []
      const tierContent =
        tiers.find((t) => t.tier === resolvedTier) ?? tiers.find((t) => t.tier === 'adept') ?? null
      return { ...it, loggedThisWeek, target, met: loggedThisWeek >= target, resolvedTier, tierContent }
    })

    // Arc clock — qualifying weeks within the plan's 91-day season window. A day qualifies
    // at ≥ min_practices_per_day distinct logs of THIS plan's practices.
    let qualWeeks = 0
    let seasonWeek: number | null = null
    let weeksRemaining = 0
    if (anchor.start) {
      const distinctByDay = new Map<string, Set<string>>()
      for (const r of logs) {
        if (planPracticeIds.has(r.practice_id) && r.logged_for >= anchor.start) {
          const set = distinctByDay.get(r.logged_for) ?? new Set<string>()
          set.add(r.practice_id)
          distinctByDay.set(r.logged_for, set)
        }
      }
      const minPerDay = plan.min_practices_per_day ?? 1
      const qualifyingDays = [...distinctByDay.entries()]
        .filter(([, s]) => s.size >= minPerDay)
        .map(([d]) => d)
      qualWeeks = qualifyingWeeks(qualifyingDays, anchor.start)
      seasonWeek = currentSeasonWeek(today, anchor.start)
      weeksRemaining = seasonWeek != null ? Math.max(0, 13 - seasonWeek) : 0
    }
    const targetWeeks = plan.target_weeks ?? DEFAULT_TARGET_WEEKS

    const done = items.filter((it) => it.met).length
    const total = items.length
    return {
      plan,
      items,
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      nextItem: items.find((it) => !it.met) ?? null,
      circleCompanions: companionsByPlan.get(plan.id) ?? 0,
      anchorStart: anchor.start,
      seasonToken: anchor.token,
      seasonWeek,
      qualifyingWeeks: qualWeeks,
      targetWeeks,
      complete: qualWeeks >= targetWeeks,
      weeksRemaining,
    }
  })
}

interface SeasonAnchor {
  /** YYYY-MM-DD window start, or null if it can't be resolved. */
  start: string | null
  /** Stable token for the reward idempotency keys (season number, or an evergreen token). */
  token: string | number
}

/** Resolve a plan's season window: official plans anchor to their quest's season start;
 *  evergreen/library plans anchor to the member's adoption date (a rolling 13-week window). */
function resolveAnchor(
  plan: JourneyPlan,
  adoptedAt: string | null,
  seasonStartByNumber: Map<number, string>,
  seasonByQuest: Map<string, number>,
): SeasonAnchor {
  if (plan.quest_id) {
    const seasonNo = seasonByQuest.get(plan.quest_id)
    const start = seasonNo != null ? seasonStartByNumber.get(seasonNo) ?? null : null
    if (start) return { start: start.slice(0, 10), token: seasonNo as number }
  }
  const start = adoptedAt ? adoptedAt.slice(0, 10) : null
  return { start, token: start ? `ev:${start}` : `ev:${plan.id}` }
}

/** Everything the Journey page needs for one plan by slug: the plan + items (discovery), plus
 *  the viewer's live progress when they've adopted it (active mode). Null if the plan is gone. */
export interface JourneyView {
  plan: JourneyPlan
  items: JourneyPlanItem[]
  adopted: boolean
  progress: JourneyProgress | null
}

export async function getJourneyView(
  profileId: string | null,
  slug: string,
  opts: { circleId?: string | null } = {},
): Promise<JourneyView | null> {
  const base = await getPlan(slug)
  if (!base) return null
  let adopted = false
  let progress: JourneyProgress | null = null
  if (profileId) {
    adopted = await isPlanAdopted(profileId, base.plan.id)
    if (adopted) {
      const all = await getActiveJourneyProgress(profileId, { withCompanions: true, circleId: opts.circleId })
      progress = all.find((p) => p.plan.id === base.plan.id) ?? null
    }
  }
  return { plan: base.plan, items: base.items, adopted, progress }
}
