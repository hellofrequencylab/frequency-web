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
  return createAdminClient()
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
  /** Quest play-window open (ISO date, inclusive). Null = always open. The Quest
   *  sequences a season's Journeys by these windows (weeks 1-4 / 5-8 / 9-12). */
  window_starts_at: string | null
  /** Quest play-window close (ISO date, inclusive). Null = no close. */
  window_ends_at: string | null
  /** Review state (default 'approved' grandfathers existing plans; ADR-197). */
  status: PlanStatus
  /** Per-Journey page layout (ordered widgets). Null = the hardcoded default. */
  page_config: PageWidgetConfig[] | null
  /** Gems granted on completion (default 30). */
  completion_gems: number
  /** Days between phase unlocks in a Run (default weekly). ADR-252. */
  drip_interval_days: number
  /** Show a printable certificate on Journey completion. ADR-252. */
  certificate_enabled: boolean
  /** Meeting / format details: how a Circle gathers around the Journey. Defaults to {} (jsonb). */
  meeting: JourneyMeeting
}

/** Meeting / format details for a Journey (ADR-302): how a Circle gathers around it. All optional. */
export interface JourneyMeeting {
  format: 'virtual' | 'in_person' | 'hybrid' | null
  /** When it meets, free text (e.g. "Sundays 7pm"). */
  schedule: string | null
  /** Timezone label for the schedule (e.g. "ET"). */
  timezone: string | null
  /** Where it meets (a place, for in-person/hybrid). */
  location: string | null
  /** A join link (for virtual/hybrid). */
  link: string | null
  /** Anything else relevant. */
  notes: string | null
  /** A linked Event (events.id) this Journey gathers around — set from the "Create Event" flow. */
  eventId: string | null
}

/** Coerce a raw `meeting` jsonb value into a clean, bounded JourneyMeeting (defaults all-null). One
 *  source of truth for both the settings editor (initial value) and the learn page (display). */
export function normalizeJourneyMeeting(raw: unknown): JourneyMeeting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max: number): string | null => {
    const t = typeof v === 'string' ? v.trim() : ''
    return t ? t.slice(0, max) : null
  }
  const fmt = typeof r.format === 'string' ? r.format : ''
  return {
    format: fmt === 'virtual' || fmt === 'in_person' || fmt === 'hybrid' ? fmt : null,
    schedule: str(r.schedule, 120),
    timezone: str(r.timezone, 40),
    location: str(r.location, 200),
    link: str(r.link, 500),
    notes: str(r.notes, 500),
    eventId: str(r.eventId, 64),
  }
}

/** Block kinds an item can be (ADR-244). Existing rows are 'practice'. */
export type BlockType = 'practice' | 'lesson' | 'resource' | 'check' | 'section'

export interface JourneyPlanItem {
  id: string
  /** The practice for a 'practice' block. Empty/unused for non-practice blocks — read
   *  `block_type` first; never deref this for a lesson/section block. */
  practice_id: string
  plan_id: string
  domain_id: string | null
  sort_order: number
  note: string | null
  /** Per-journey cadence override (ADR-096). Null = the practice's own cadence. */
  cadence: string | null
  // ── Block model (ADR-244). Optional + defaulted so pre-block code is unaffected. ──
  /** Defaults to 'practice' for legacy rows that predate the column. */
  block_type?: BlockType
  /** Section nesting (a block under a 'section' block). */
  parent_id?: string | null
  /** Lesson title (non-practice blocks). */
  title?: string | null
  /** Lesson markdown body (non-practice blocks). */
  body?: string | null
  /** Lesson media: { video, images[], files[] }. */
  media?: Record<string, unknown> | null
  /** Type-specific extras (quiz options, gating, …). */
  settings?: Record<string, unknown> | null
  /** Does this block count toward course completion? Defaults true. */
  required?: boolean
  est_minutes?: number | null
  practice:
    | {
        id: string
        title: string
        description: string | null
        domain_id: string | null
        cadence: string | null
      }
    | null
}

const PLAN_COLS =
  'id, slug, title, summary, intro, emoji, accent, author_id, visibility, fork_of, ' +
  'forked_count, adopt_count, cover_image, created_at, updated_at, published_at, ' +
  'quest_id, official, window_starts_at, window_ends_at, status, page_config, completion_gems, ' +
  'drip_interval_days, certificate_enabled, difficulty, category, tags, daily_minutes, enroll_cap, meeting'

const ITEM_COLS =
  'id, plan_id, practice_id, domain_id, sort_order, note, cadence, ' +
  // Block model (ADR-244). Existing rows are block_type='practice' with these null/default.
  'block_type, parent_id, title, body, media, settings, required, est_minutes, ' +
  // NOTE: est_minutes lives on journey_plan_items (the item, above), NOT on practices — embedding
  // practices(est_minutes) errored ("column practices_1.est_minutes does not exist") on every
  // journey-view load. The item's own est_minutes is the source of truth for a step's time.
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

/** A plan plus lightweight structure counts, for the "Your Journeys" management space. */
export interface MyPlanSummary extends JourneyPlan {
  /** Top-level weekly Phases. */
  phaseCount: number
  /** Fillable steps (practices + lessons + checks…), i.e. every block that isn't a phase/module. */
  stepCount: number
}

/** A member's own plans + their phase/step counts, newest-touched first — for the management
 *  dashboard. One extra grouped read over getMyPlans (counts the block tree in JS; the set is
 *  a single member's journeys, so it stays small). */
export async function getMyPlanSummaries(authorId: string): Promise<MyPlanSummary[]> {
  const plans = await getMyPlans(authorId)
  if (plans.length === 0) return []
  const { data } = await db()
    .from('journey_plan_items')
    .select('plan_id, block_type')
    .in('plan_id', plans.map((p) => p.id))
  const rows = (data as { plan_id: string; block_type: string | null }[] | null) ?? []
  const phaseBy = new Map<string, number>()
  const stepBy = new Map<string, number>()
  for (const r of rows) {
    const bt = r.block_type ?? 'practice'
    if (bt === 'phase') phaseBy.set(r.plan_id, (phaseBy.get(r.plan_id) ?? 0) + 1)
    else if (bt !== 'module') stepBy.set(r.plan_id, (stepBy.get(r.plan_id) ?? 0) + 1)
  }
  return plans.map((p) => ({ ...p, phaseCount: phaseBy.get(p.id) ?? 0, stepCount: stepBy.get(p.id) ?? 0 }))
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

export interface PlanAuthor {
  handle: string
  displayName: string
  avatarUrl: string | null
}

/** The author's public profile (handle · name · avatar) for the journey→author
 *  cross-link on the discovery/active page. Null when the plan has no author, or the
 *  author is inactive / has no handle to link to. Read-only. */
export async function getPlanAuthor(authorId: string | null): Promise<PlanAuthor | null> {
  if (!authorId) return null
  const { data } = await db()
    .from('profiles')
    .select('handle, display_name, avatar_url')
    .eq('id', authorId)
    .eq('is_active', true)
    .maybeSingle()
  const p = data as { handle: string | null; display_name: string | null; avatar_url: string | null } | null
  if (!p?.handle) return null
  return { handle: p.handle, displayName: p.display_name ?? p.handle, avatarUrl: p.avatar_url }
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

/** Update a single item's per-journey controls (note, cadence override). */
export async function updateItem(
  planId: string,
  practiceId: string,
  patch: { note?: string | null; cadence?: string | null },
): Promise<void> {
  const client = db()
  const update: Record<string, unknown> = {}
  if ('note' in patch && patch.note !== undefined) update.note = patch.note?.trim() || null
  if ('cadence' in patch && patch.cadence !== undefined) update.cadence = patch.cadence?.trim() || null
  if (Object.keys(update).length === 0) return
  await client.from('journey_plan_items').update(update).eq('plan_id', planId).eq('practice_id', practiceId)
  await client.from('journey_plans').update(touch()).eq('id', planId)
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

/** ISO-date guard for the Quest play-window. Accepts a yyyy-mm-dd (the date input's
 *  value) or any Date.parse-able string; returns a normalized yyyy-mm-dd, or null for
 *  empty/unparseable input (so clearing a field stores null = always open). */
function normalizeWindowDate(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  if (!t) return null
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10)
}

/**
 * Set a Journey's Quest play-window (the ~4-week span that sequences a season's
 * Journeys). Either bound may be null (always-open / no-close). Normalizes to a
 * yyyy-mm-dd date; if both are present and end < start, the end is dropped rather
 * than stored inverted. Guide/Mentor only — caller enforces authz (same gate as
 * setPlanOfficial, since the window is a Quest-Journey concern).
 */
export async function setPlanWindow(
  planId: string,
  opts: { startsAt?: string | null; endsAt?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {}
  let start: string | null = null
  let hasStart = false
  if (opts.startsAt !== undefined) {
    start = normalizeWindowDate(opts.startsAt)
    update.window_starts_at = start
    hasStart = true
  }
  if (opts.endsAt !== undefined) {
    let end = normalizeWindowDate(opts.endsAt)
    // Never persist an inverted span. Compare against the start we're writing (or, if
    // start isn't in this patch, the value already on the row is the author's intent).
    if (end && hasStart && start && end < start) end = null
    update.window_ends_at = end
  }
  if (Object.keys(update).length === 0) return
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
    completionGems?: number
    pageConfig?: PageWidgetConfig[] | null
    dripIntervalDays?: number
    certificateEnabled?: boolean
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || 'Untitled journey'
  if (patch.summary !== undefined) update.summary = patch.summary?.trim().slice(0, 280) || null
  if (patch.intro !== undefined) update.intro = patch.intro?.trim().slice(0, 8000) || null
  if (patch.emoji !== undefined) update.emoji = patch.emoji?.trim().slice(0, 16) || null
  if (patch.accent !== undefined) update.accent = patch.accent?.trim().slice(0, 24) || null
  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage?.trim().slice(0, 500) || null
  // Page layout + review status (ADR-197). Clamped to their schema bounds.
  if (patch.status !== undefined) update.status = patch.status
  if (patch.completionGems !== undefined)
    update.completion_gems = Math.min(100, Math.max(0, Math.round(patch.completionGems)))
  if (patch.pageConfig !== undefined) update.page_config = patch.pageConfig
  // Delivery (ADR-252): weekly-ish phase drip + completion certificate.
  if (patch.dripIntervalDays !== undefined)
    update.drip_interval_days = Math.min(30, Math.max(1, Math.round(patch.dripIntervalDays)))
  if (patch.certificateEnabled !== undefined) update.certificate_enabled = patch.certificateEnabled
  if (Object.keys(update).length === 0) return
  await db().from('journey_plans').update({ ...update, ...touch() }).eq('id', planId)
}

export async function removeItem(planId: string, practiceId: string): Promise<void> {
  const client = db()
  await client.from('journey_plan_items').delete().eq('plan_id', planId).eq('practice_id', practiceId)
  await client.from('journey_plans').update(touch()).eq('id', planId)
}

// --- Lesson/section blocks (ADR-244) — keyed by item id, not practice ---------
// Non-practice blocks (a lesson, a reading, a section header) carry no practice, so
// they're addressed by their row id. v1 appends them at the end (sort_order = max+1);
// reordering/interleaving with practices is a follow-up.

/** Append a non-practice block (lesson/section/resource/check). Returns its id. */
export async function addBlock(
  planId: string,
  input: { blockType: Exclude<BlockType, 'practice'>; title?: string | null; body?: string | null },
): Promise<string | null> {
  const client = db()
  const { data: last } = await client
    .from('journey_plan_items')
    .select('sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1
  const { data } = await client
    .from('journey_plan_items')
    .insert({
      plan_id: planId,
      block_type: input.blockType,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
      sort_order: nextOrder,
    })
    .select('id')
    .single()
  await client.from('journey_plans').update(touch()).eq('id', planId)
  return (data as { id: string } | null)?.id ?? null
}

/** Edit a block's title/body. */
export async function updateBlock(
  itemId: string,
  patch: { title?: string | null; body?: string | null },
): Promise<void> {
  const client = db()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title?.trim() || null
  if (patch.body !== undefined) update.body = patch.body?.trim() || null
  if (Object.keys(update).length === 0) return
  await client.from('journey_plan_items').update(update).eq('id', itemId)
}

/** Delete a block by id. */
export async function removeBlock(itemId: string): Promise<void> {
  await db().from('journey_plan_items').delete().eq('id', itemId)
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

// --- Vera quality gate (the Quest's "Gate + coach", ADR-Quest) -------------
// Publishing is open; ranked eligibility is gated. These writes go through the
// service-role admin client ONLY (a member can never self-approve): the review runs
// server-side and `ranked_eligible` is set from Vera's verdict, never from client input.

/** The shape of a stored Vera review, persisted on journey_plans.vera_review. */
export interface StoredVeraReview {
  status: 'approved' | 'rejected' | 'pending'
  score: number
  feedback: string[]
  reviewedAt: string
}

/** Persist a Vera review on a Journey and set ranked eligibility from its verdict. Only an
 *  `approved` verdict makes a Journey ranked-eligible; anything else (rejected / pending /
 *  the fail-closed states) clears it. Idempotent + admin-only — the caller has already
 *  established authorship; this never reads client-supplied eligibility. */
export async function applyVeraReview(planId: string, review: StoredVeraReview): Promise<void> {
  await db()
    .from('journey_plans')
    .update({
      vera_review: review as unknown as Record<string, unknown>,
      ranked_eligible: review.status === 'approved',
      ...touch(),
    })
    .eq('id', planId)
}

/** Read a Journey's last stored Vera review (for re-rendering the coaching). Null if none. */
export async function getVeraReview(planId: string): Promise<StoredVeraReview | null> {
  const { data } = await db().from('journey_plans').select('vera_review').eq('id', planId).maybeSingle()
  const raw = (data as { vera_review: unknown } | null)?.vera_review
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const status = r.status === 'approved' || r.status === 'rejected' || r.status === 'pending' ? r.status : null
  if (!status) return null
  return {
    status,
    score: typeof r.score === 'number' ? r.score : 0,
    feedback: Array.isArray(r.feedback) ? r.feedback.filter((s): s is string => typeof s === 'string') : [],
    reviewedAt: typeof r.reviewedAt === 'string' ? r.reviewedAt : '',
  }
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

/** Duplicate one of the caller's OWN journeys into a fresh PRIVATE draft, deep-copying the whole
 *  v2 block tree (phases -> modules -> lessons/practices) with parent ids remapped, plus the
 *  authoring settings (difficulty/category/tags/daily minutes/source outline/rewards/delivery).
 *  Unlike forkPlan (public-only, legacy practice-combo copy), this copies any plan you own with
 *  its full structure. Caller enforces ownership. Returns the new private-draft plan. */
export async function duplicatePlan(profileId: string, planId: string): Promise<JourneyPlan | null> {
  const client = db()
  const { data: srcRow } = await client
    .from('journey_plans')
    .select(`${PLAN_COLS}, source_overview`)
    .eq('id', planId)
    .maybeSingle()
  const src = srcRow as
    | (JourneyPlan & {
        difficulty: string | null
        category: string | null
        tags: string[] | null
        daily_minutes: number | null
        enroll_cap: number | null
        source_overview: string | null
      })
    | null
  if (!src) return null

  // The new plan: a private draft owned by the caller, never official/quest-linked. (Untyped
  // admin handle, so the newer columns need no cast — the whole module reads/writes untyped.)
  const { data: dupRow } = await client
    .from('journey_plans')
    .insert({
      slug: slugify(src.title),
      title: `${src.title} (copy)`.slice(0, 120),
      summary: src.summary,
      intro: src.intro,
      emoji: src.emoji,
      accent: src.accent,
      cover_image: src.cover_image,
      author_id: profileId,
      visibility: 'private',
      status: 'draft',
      completion_gems: src.completion_gems,
      drip_interval_days: src.drip_interval_days,
      certificate_enabled: src.certificate_enabled,
      difficulty: src.difficulty,
      category: src.category,
      tags: src.tags,
      daily_minutes: src.daily_minutes,
      enroll_cap: src.enroll_cap,
      source_overview: src.source_overview,
      meeting: src.meeting,
    })
    .select(PLAN_COLS)
    .maybeSingle()
  const dup = dupRow as unknown as JourneyPlan | null
  if (!dup) return null

  const { data: itemRows } = await client
    .from('journey_plan_items')
    .select('id, practice_id, domain_id, sort_order, note, cadence, block_type, parent_id, title, body, media, settings, required, est_minutes')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
  type SrcItem = {
    id: string; practice_id: string | null; domain_id: string | null; sort_order: number | null
    note: string | null; cadence: string | null; block_type: string | null; parent_id: string | null
    title: string | null; body: string | null; media: unknown; settings: unknown; required: boolean | null; est_minutes: number | null
  }
  const items = (itemRows ?? []) as SrcItem[]

  // Iterative two-pass insert: a row goes in once its parent has a new id (or it has no parent),
  // so phases land before their lessons. Bounded passes guard against an orphaned parent_id.
  const idMap = new Map<string, string>()
  let remaining = items
  for (let pass = 0; pass < 8 && remaining.length; pass++) {
    const ready = remaining.filter((it) => !it.parent_id || idMap.has(it.parent_id))
    if (ready.length === 0) break
    for (const it of ready) {
      const { data: ins } = await client
        .from('journey_plan_items')
        .insert({
          plan_id: dup.id,
          practice_id: it.practice_id,
          domain_id: it.domain_id,
          sort_order: it.sort_order ?? 0,
          note: it.note,
          cadence: it.cadence,
          block_type: it.block_type ?? 'practice',
          parent_id: it.parent_id ? idMap.get(it.parent_id) ?? null : null,
          title: it.title,
          body: it.body,
          media: it.media,
          settings: it.settings,
          required: it.required ?? true,
          est_minutes: it.est_minutes,
        })
        .select('id')
        .maybeSingle()
      if (ins) idMap.set(it.id, (ins as { id: string }).id)
    }
    remaining = remaining.filter((it) => !idMap.has(it.id))
  }

  return dup
}

// --- Delete ---------------------------------------------------------------

/** Delete one journey plan (its items + adoptions cascade via FK). The single-plan admin
 *  removal behind deleteJourneyPlanAction; the action layer gates it (curators only). */
export async function deletePlan(planId: string): Promise<void> {
  await db().from('journey_plans').delete().eq('id', planId)
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

// --- Cadence rhythm clock (shared by the nightly streak job + co-op math) -------

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

// --- Lesson completion (ADR-244) ------------------------------------------
// Practices stay DERIVED from practice_logs; lesson/check blocks need real persistence,
// so their check-offs live in journey_lesson_progress (member-owned).

/** The set of lesson/check block ids a member has completed for a plan. */
export async function getCompletedLessonIds(profileId: string, planId: string): Promise<Set<string>> {
  const { data } = await db()
    .from('journey_lesson_progress')
    .select('item_id')
    .eq('profile_id', profileId)
    .eq('plan_id', planId)
  return new Set(((data as { item_id: string }[] | null) ?? []).map((r) => r.item_id))
}

/** Mark a lesson/check block complete for a member (idempotent on profile+item). */
export async function completeLesson(profileId: string, planId: string, itemId: string): Promise<void> {
  await db()
    .from('journey_lesson_progress')
    .upsert({ profile_id: profileId, plan_id: planId, item_id: itemId }, { onConflict: 'profile_id,item_id' })
}

/** Undo a lesson completion (toggle off). */
export async function uncompleteLesson(profileId: string, itemId: string): Promise<void> {
  await db().from('journey_lesson_progress').delete().eq('profile_id', profileId).eq('item_id', itemId)
}

/** Everything the (discovery) Journey page needs for one plan by slug: the plan + items, plus
 *  whether the viewer has adopted it (an adopted learner is redirected to the v2 player). Null
 *  if the plan is gone. The v2 progress surface lives in lib/journeys/progress.ts (ADR-253). */
export interface JourneyView {
  plan: JourneyPlan
  items: JourneyPlanItem[]
  adopted: boolean
}

export async function getJourneyView(
  profileId: string | null,
  slug: string,
): Promise<JourneyView | null> {
  const base = await getPlan(slug)
  if (!base) return null
  const adopted = profileId ? await isPlanAdopted(profileId, base.plan.id) : false
  return { plan: base.plan, items: base.items, adopted }
}
