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

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export type PlanVisibility = 'private' | 'unlisted' | 'public'

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
  practice: { id: string; title: string; description: string | null; domain_id: string | null; cadence: string | null } | null
}

const PLAN_COLS =
  'id, slug, title, summary, intro, emoji, accent, author_id, visibility, fork_of, ' +
  'forked_count, adopt_count, cover_image, created_at, updated_at, published_at'

const ITEM_COLS =
  'id, plan_id, practice_id, domain_id, sort_order, note, cadence, ' +
  'practice:practices(id, title, description, domain_id, cadence)'

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

/** Update a single item's per-journey controls (note + cadence override). */
export async function updateItem(
  planId: string,
  practiceId: string,
  patch: { note?: string | null; cadence?: string | null },
): Promise<void> {
  const client = db()
  const update: Record<string, unknown> = {}
  if (patch.note !== undefined) update.note = patch.note?.trim() || null
  if (patch.cadence !== undefined) update.cadence = patch.cadence?.trim() || null
  if (Object.keys(update).length === 0) return
  await client.from('journey_plan_items').update(update).eq('plan_id', planId).eq('practice_id', practiceId)
  await client.from('journey_plans').update(touch()).eq('id', planId)
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
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || 'Untitled journey'
  if (patch.summary !== undefined) update.summary = patch.summary?.trim().slice(0, 280) || null
  if (patch.intro !== undefined) update.intro = patch.intro?.trim().slice(0, 8000) || null
  if (patch.emoji !== undefined) update.emoji = patch.emoji?.trim().slice(0, 16) || null
  if (patch.accent !== undefined) update.accent = patch.accent?.trim().slice(0, 24) || null
  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage?.trim().slice(0, 500) || null
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
  /** Logged at least once → the step counts as done (the v1 definition). */
  logged: boolean
}

export interface JourneyProgress {
  plan: JourneyPlan
  items: JourneyProgressItem[]
  total: number
  done: number
  percent: number
  /** First not-yet-logged item, in order — the member's "current step". */
  nextItem: JourneyProgressItem | null
}

/** A member's active (adopted) journeys with progress derived from their practice
 *  log: a step is "done" once they've logged that practice at least once, so the
 *  current step is the first item they haven't logged. No progress schema needed —
 *  this rides the same practice_logs the gamification (zaps / streak) runs on, so
 *  logging a journey's practice advances the journey AND earns the rewards. */
export async function getActiveJourneyProgress(profileId: string): Promise<JourneyProgress[]> {
  const client = db()

  const { data: adoptionRows } = await client
    .from('journey_plan_adoptions')
    .select(`created_at, plan:journey_plans(${PLAN_COLS})`)
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  const plans = ((adoptionRows ?? []) as unknown as { plan: JourneyPlan | null }[])
    .map((a) => a.plan)
    .filter((p): p is JourneyPlan => !!p)
  if (plans.length === 0) return []

  // Which practices has the member ever logged? (the step-done signal)
  const { data: logRows } = await client
    .from('practice_logs')
    .select('practice_id')
    .eq('profile_id', profileId)
  const logged = new Set(
    ((logRows ?? []) as { practice_id: string | null }[])
      .map((r) => r.practice_id)
      .filter((id): id is string => !!id),
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

  return plans.map((plan) => {
    const items: JourneyProgressItem[] = allItems
      .filter((it) => it.plan_id === plan.id)
      .map((it) => ({ ...it, logged: logged.has(it.practice_id) }))
    const done = items.filter((it) => it.logged).length
    const total = items.length
    return {
      plan,
      items,
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      nextItem: items.find((it) => !it.logged) ?? null,
    }
  })
}
