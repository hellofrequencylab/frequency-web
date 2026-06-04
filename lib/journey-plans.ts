// The open "Journeys" library (backlog §Q1, ADR-087): members curate combos of
// practices — organized by the 4 Pillars — and share/fork them. FREE; it rides the
// existing free practice loop (adopting a plan just adds its practices to your
// daily log; see Q1 P3). Distinct from the Crew-gated gamified engine (quest_*).
//
// Server-only. Writes go through the service-role admin client behind app-code
// authz (callers enforce: author owns the plan). The journey_plan* tables are new;
// until `supabase gen types` is re-run they aren't in the generated Database types,
// so this module reads/writes through an untyped admin handle (repo convention —
// see lib/practices.ts). Drop the cast after regen.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export type PlanVisibility = 'private' | 'unlisted' | 'public'

export interface JourneyPlan {
  id: string
  slug: string
  title: string
  summary: string | null
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
  practice: { id: string; title: string; description: string | null; domain_id: string | null } | null
}

const PLAN_COLS =
  'id, slug, title, summary, author_id, visibility, fork_of, forked_count, adopt_count, ' +
  'cover_image, created_at, updated_at, published_at'

const ITEM_COLS =
  'id, plan_id, practice_id, domain_id, sort_order, note, ' +
  'practice:practices(id, title, description, domain_id)'

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

// --- Mutations (callers enforce: the author owns the plan) -----------------

export async function createPlan(input: {
  authorId: string
  title: string
  summary?: string | null
}): Promise<JourneyPlan | null> {
  const { data } = await db()
    .from('journey_plans')
    .insert({
      slug: slugify(input.title),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
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
      sort_order: nextOrder,
    },
    { onConflict: 'plan_id,practice_id' },
  )
  await client.from('journey_plans').update(touch()).eq('id', input.planId)
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
