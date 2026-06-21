// Practices backbone: the North-Star feature (DEVELOPMENT-MAP Stage A). A practice
// is the thing a member actually does. Logging one emits `practice.verified` (the
// WAM North-Star event) + zaps + an attendance streak tick. Two paths to a practice:
// a host assigns one to a circle, or a member adopts one for themselves; both log
// against the same practice. Server-only (admin client + app-code authz in callers).
//
// The practices/* tables are new; until `supabase gen types` is re-run they are not
// in the generated Database types, so this module reads/writes through an untyped
// admin handle. Drop the cast after regen (see docs/START-HERE.md).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { track } from '@/lib/analytics/track'
import { awardZaps, awardZapsForAction, reverseZaps } from '@/lib/zaps'
import { recordStreakActivity, processGamificationEvent } from '@/lib/achievements'
import { recordPracticeStreak, recomputePracticeStreakAfterUnlog } from '@/lib/practice-streak'
import { ROLE_HIERARCHY } from '@/lib/core/roles'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { resolveMemberDay } from '@/lib/member-day'
import type { MovementConfig } from '@/lib/movement'

/** Which timer a practice routes to (WEBSITE-CHANGES-PLAN §4 C.8): 'none' = a one-tap
 *  Log it; 'mindless' = the On Air sit/breathe (useMindless); 'movement' = the Movement
 *  timer (useMovement). Supersedes the binary uses_timer, which is now derived from it. */
export const TIMER_KINDS = ['none', 'mindless', 'movement'] as const
export type TimerKind = (typeof TIMER_KINDS)[number]

/** The flavour a timer_kind = 'mindless' practice wears (the completion-economy redesign):
 *  'meditate' | 'breathe' | 'journal' | 'stillness' | 'ritual' | 'log'. Stored on
 *  practices.mindless_mode (nullable; a null is DERIVED from the Pillar at read time via
 *  pillarTimerDefault). The stored timer_kind stays authoritative for routing. */
export const MINDLESS_MODES = ['meditate', 'breathe', 'journal', 'stillness', 'ritual', 'log'] as const
export type MindlessMode = (typeof MINDLESS_MODES)[number]

function db(): SupabaseClient {
  return createAdminClient()
}

/** The author's instructions + timing for one Focus (Pillar) a practice belongs to. */
export interface FocusDetail {
  instructions: string
  timing: string
}

/** A practice's per-Focus details, keyed by pillar id. The KEYS are the selected
 *  Focuses (presence = selected); `domain_id` mirrors the FIRST key for back-compat. */
export type FocusDetails = Record<string, FocusDetail>

export interface Practice {
  id: string
  title: string
  description: string | null
  created_by: string | null
  is_public: boolean
  /** A system-curated starter practice a member can claim + personalize (ADR-116). */
  is_template: boolean
  created_at: string
  // Rich content + reward fields (migration 20260605000000_practices_rich_content).
  category: string | null
  icon: string | null
  summary: string | null
  header_image: string | null
  body: string | null
  /** How OFTEN the practice is done (e.g. 'Daily', '3x/week', 'Weekly'). */
  cadence: string | null
  /** Typical session length in minutes (the Notion "Duration (min)"). Length, not frequency. */
  duration_min: number | null
  /** true = the practice runs through a timer (its "Practice" button); false = a simple
   *  self-report (its "Log It" button). DERIVED from timer_kind (true when not 'none'); kept
   *  for back-compat (the Journey-step action, the On Air timer-proof). */
  uses_timer: boolean
  /** Which timer the practice routes to: 'none' | 'mindless' (the On Air sit) | 'movement'
   *  (the Movement timer). The authoritative discriminator; uses_timer mirrors it. */
  timer_kind: TimerKind
  /** Movement timer config when timer_kind = 'movement' (mode + tuning); null otherwise. */
  movement_config: MovementConfig | null
  /** The Mindless flavour when timer_kind = 'mindless': meditate | breathe | journal |
   *  stillness | ritual | log. NULL = derive from the Pillar at read time (pillarTimerDefault). */
  mindless_mode: MindlessMode | null
  /** When true, the author has pinned a fixed session length the member cannot adjust;
   *  false (default) = the member may adjust the length. The length itself is duration_min. */
  duration_locked: boolean
  /** The explicit per-log Zap VALUE. When set, it OVERRIDES weight_class (the Quest library
   *  values practices by cadence: Daily 10 / 3x-week 15 / Weekly 25). Null → weight-class default. */
  reward_zaps: number | null
  reward_note: string | null
  /** Fallback per-log payout tier when reward_zaps is null: 'light' (8⚡) | 'standard' (12⚡) | 'heavy' (15⚡). */
  weight_class: string | null
  /** The PRIMARY Pillar (domains.id), or null if uncategorized. Mirrors the first
   *  selected Focus in `focus_details`, kept for back-compat (Pillar filtering + cards). */
  domain_id: string | null
  /** Per-Focus instructions + timing, keyed by pillar id. The keys are the selected
   *  Focuses (a practice can belong to multiple). Defaults to {} on legacy rows. */
  focus_details: FocusDetails
  /** The sub-category within the Pillar (practice_subcategories.id), or null. */
  subcategory_id: string | null
  /** Library review status — null/draft until proposed, then pending → approved/rejected. */
  status: string | null
  /** URL-safe slug derived from the title (unique); the public detail page key. */
  slug: string | null
}

/** A library tag (canonical or member/Vera folksonomy) as shown on a practice. */
export interface PracticeTag {
  slug: string
  label: string
}

/** A practice enriched with its popularity signal + display taxonomy, for the library. */
export interface RankedPractice extends Practice {
  adopters: number
  logs_30d: number
  logs_total: number
  score: number
  subcategory: { slug: string; name: string } | null
  tags: PracticeTag[]
}

export interface Subcategory {
  id: string
  domain_id: string
  slug: string
  name: string
  display_order: number
}

export type PracticeSort = 'trending' | 'top' | 'new' | 'az'

const PRACTICE_COLS =
  'id, title, description, created_by, is_public, is_template, created_at, ' +
  'category, icon, summary, header_image, body, cadence, duration_min, uses_timer, timer_kind, movement_config, mindless_mode, duration_locked, reward_zaps, reward_note, weight_class, domain_id, focus_details, subcategory_id, status, slug'

// The same columns MINUS the table-only ones, for reads against the `practices_ranked`
// VIEW. The view predates `slug` and does not expose it (selecting it errors and returns
// zero rows, which silently emptied the library + 404'd the detail page); it also does NOT
// expose `timer_kind` / `movement_config` / `mindless_mode` / `duration_locked` (the timer
// columns the library never needs — the editor + timer routing read those from the table via
// getPractice). The library + detail navigate by id, so dropping all of them here is safe.
const RANKED_COLS = PRACTICE_COLS
  .replace(/,\s*slug$/, '')
  .replace(/,\s*timer_kind,\s*movement_config,\s*mindless_mode,\s*duration_locked/, '')

/**
 * The authoring DEFAULT timer + Mindless mode for a Pillar (mind | body | spirit |
 * expression). The completion-economy redesign uses this in two places: the data-fix
 * backfill mirrors it in SQL, and a read of a Mindless practice with a null `mindless_mode`
 * derives the flavour from here. The stored `timer_kind` stays AUTHORITATIVE for routing —
 * this is only the author's default + the null-mode fallback, never an override.
 */
export function pillarTimerDefault(
  pillar: string | null,
): { timerKind: TimerKind; mindlessMode: MindlessMode | null } {
  switch (pillar) {
    case 'mind':
      return { timerKind: 'mindless', mindlessMode: 'meditate' }
    case 'spirit':
      return { timerKind: 'mindless', mindlessMode: 'stillness' }
    case 'body':
      return { timerKind: 'movement', mindlessMode: null }
    case 'expression':
      return { timerKind: 'none', mindlessMode: 'log' }
    default:
      return { timerKind: 'mindless', mindlessMode: 'meditate' }
  }
}

/** Coerce a raw practices row into a Practice with the new completion-economy columns
 *  reliably typed: duration_locked defaults to false (a pre-migration row reads null/undefined),
 *  and mindless_mode stays null when absent (the read-time pillarTimerDefault fallback fills it).
 *  Reached through the untyped admin handle (ADR-246) — the cast just types the shape. */
function normalizePractice<T extends Practice>(row: T): T {
  return {
    ...row,
    mindless_mode: (row.mindless_mode ?? null) as MindlessMode | null,
    duration_locked: row.duration_locked === true,
  }
}

// --- Library + reads ------------------------------------------------------

/**
 * The public library, ranked. Reads the server-only `practices_ranked` view (adopters
 * + recent logs → score) so popular practices rise. `sort`: 'trending' (recent usage,
 * default) · 'top' (all-time) · 'new'. Enriches each row with its sub-category label and
 * its tags in one extra round-trip each (small library; cheap).
 */
export async function listPublicPractices(sort: PracticeSort = 'trending'): Promise<RankedPractice[]> {
  const order =
    sort === 'new'
      ? [{ col: 'created_at', asc: false }]
      : sort === 'top'
        ? [{ col: 'logs_total', asc: false }, { col: 'created_at', asc: false }]
        : [{ col: 'score', asc: false }, { col: 'created_at', asc: false }]

  let q = db()
    .from('practices_ranked')
    .select(`${RANKED_COLS}, adopters, logs_30d, logs_total, score`)
    .eq('is_public', true)
  for (const o of order) q = q.order(o.col, { ascending: o.asc })
  const rows = (await q).data as (Practice & {
    adopters: number; logs_30d: number; logs_total: number; score: number
  })[] | null
  const base = rows ?? []
  if (base.length === 0) return []

  const [subById, tagsByPractice] = await Promise.all([
    subcategoryMap(),
    tagsForPractices(base.map((p) => p.id)),
  ])
  return base.map((p) => {
    const sc = p.subcategory_id ? subById.get(p.subcategory_id) : null
    return {
      ...normalizePractice(p),
      subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
      tags: tagsByPractice.get(p.id) ?? [],
    }
  })
}

/** A public practice enriched with its display taxonomy (no ranking signal) — for the public
 *  /discover/practices detail page. */
export interface PublicPractice extends Practice {
  subcategory: { slug: string; name: string } | null
  tags: PracticeTag[]
}

/** A single PUBLIC practice by SLUG (the canonical public key) or uuid (legacy URLs), with
 *  its sub-category + tags. Reads the public-read `practices` table; null when missing or not public. */
export async function getPublicPractice(slugOrId: string): Promise<PublicPractice | null> {
  const column = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId) ? 'id' : 'slug'
  const { data } = await db()
    .from('practices')
    .select(PRACTICE_COLS)
    .eq(column, slugOrId)
    .eq('is_public', true)
    .maybeSingle()
  const p = data as Practice | null
  if (!p) return null
  const [subById, tagsByPractice] = await Promise.all([subcategoryMap(), tagsForPractices([p.id])])
  const sc = p.subcategory_id ? subById.get(p.subcategory_id) : null
  return {
    ...normalizePractice(p),
    subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
    tags: tagsByPractice.get(p.id) ?? [],
  }
}

// --- Scalable library search (server-side filter · sort · paginate) -------
//
// Built for a library of thousands: all filtering, sorting, and paging happen in
// the database against the `practices_ranked` view (count: 'exact' + .range), so
// a page only ever fetches + enriches one screen of rows. URL-driven from the page.

export interface LibrarySearchOpts {
  q?: string | null
  pillarId?: string | null
  subId?: string | null
  tag?: string | null // tag slug
  sort?: PracticeSort
  page?: number // 1-based
  pageSize?: number
  /** Admin: also include non-public (hidden) practices. */
  includeHidden?: boolean
  /** Only system-curated templates. */
  templatesOnly?: boolean
  /** Hide seeded demo practices (honours the global/viewer demo toggle). */
  hideDemo?: boolean
}

export interface LibrarySearchResult {
  rows: RankedPractice[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export async function searchLibraryPractices(opts: LibrarySearchOpts = {}): Promise<LibrarySearchResult> {
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const pageSize = Math.min(60, Math.max(1, Math.floor(opts.pageSize ?? 24)))
  const sort = opts.sort ?? 'trending'
  const empty: LibrarySearchResult = { rows: [], total: 0, page, pageSize, pageCount: 0 }

  // Tag filter → resolve the practice ids carrying that tag (any source).
  let tagIds: string[] | null = null
  if (opts.tag) {
    const { data: def } = await db()
      .from('practice_tag_defs')
      .select('id')
      .eq('slug', opts.tag)
      .maybeSingle()
    const defId = (def as { id: string } | null)?.id
    if (!defId) return empty
    const { data: links } = await db().from('practice_tags').select('practice_id').eq('tag_id', defId)
    tagIds = ((links as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id)
    if (tagIds.length === 0) return empty
  }

  let q = db()
    .from('practices_ranked')
    .select(`${RANKED_COLS}, adopters, logs_30d, logs_total, score`, { count: 'exact' })

  if (!opts.includeHidden) q = q.eq('is_public', true)
  if (opts.hideDemo) q = q.eq('is_demo', false)
  if (opts.templatesOnly) q = q.eq('is_template', true)
  if (opts.pillarId) q = q.eq('domain_id', opts.pillarId)
  if (opts.subId) q = q.eq('subcategory_id', opts.subId)
  if (tagIds) q = q.in('id', tagIds)
  if (opts.q && opts.q.trim()) {
    // Strip characters that would break the PostgREST or() grammar.
    const needle = opts.q.trim().replace(/[%,()]/g, ' ').slice(0, 80)
    if (needle.trim()) {
      q = q.or(`title.ilike.%${needle}%,summary.ilike.%${needle}%,description.ilike.%${needle}%`)
    }
  }

  if (sort === 'new') q = q.order('created_at', { ascending: false })
  else if (sort === 'top') q = q.order('logs_total', { ascending: false }).order('created_at', { ascending: false })
  else if (sort === 'az') q = q.order('title', { ascending: true })
  else q = q.order('score', { ascending: false }).order('created_at', { ascending: false })

  const from = (page - 1) * pageSize
  const res = await q.range(from, from + pageSize - 1)
  const base =
    (res.data as (Practice & {
      adopters: number; logs_30d: number; logs_total: number; score: number
    })[] | null) ?? []
  const total = res.count ?? base.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (base.length === 0) return { ...empty, total, pageCount }

  const [subById, tagsByPractice] = await Promise.all([
    subcategoryMap(),
    tagsForPractices(base.map((p) => p.id)),
  ])
  const rows = base.map((p) => {
    const sc = p.subcategory_id ? subById.get(p.subcategory_id) : null
    return {
      ...normalizePractice(p),
      subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
      tags: tagsByPractice.get(p.id) ?? [],
    }
  })
  return { rows, total, page, pageSize, pageCount }
}

/** A practice creator's display identity, for author attribution on cards + the
 *  detail page. handle is the /people/{handle} key; null = no human author. */
export type PracticeCreator = { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }

/** Batch-resolve the creators (profiles) for a set of `created_by` ids in ONE query.
 *  Returns a Map keyed by profile id; ids that aren't real profiles are simply absent.
 *  Used to attribute library cards without enriching the shared search function. */
export async function getPracticeCreators(ids: (string | null | undefined)[]): Promise<Map<string, PracticeCreator>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, PracticeCreator>()
  if (unique.length === 0) return map
  const { data } = await db().from('profiles').select('id, handle, display_name, avatar_url').in('id', unique)
  for (const p of (data as PracticeCreator[] | null) ?? []) map.set(p.id, p)
  return map
}

/** Resolve a single practice creator (the detail page's author line). */
export async function getPracticeCreator(id: string | null | undefined): Promise<PracticeCreator | null> {
  if (!id) return null
  return (await getPracticeCreators([id])).get(id) ?? null
}

/** Total public practices (for the stat band). Head-count only, no rows. */
export async function countPublicPractices(opts: { hideDemo?: boolean } = {}): Promise<number> {
  let q = db().from('practices_ranked').select('id', { count: 'exact', head: true }).eq('is_public', true)
  if (opts.hideDemo) q = q.eq('is_demo', false)
  const { count } = await q
  return count ?? 0
}

// --- Admin curation (callers enforce admin.access) ------------------------

/** Toggle a practice's curation flags (admin-only; caller enforces capability). */
export async function setPracticeFlags(
  id: string,
  flags: { is_template?: boolean; is_public?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (flags.is_template !== undefined) update.is_template = flags.is_template
  if (flags.is_public !== undefined) update.is_public = flags.is_public
  if (Object.keys(update).length === 0) return
  await db().from('practices').update(update).eq('id', id)

  // Creation token (Rewards Economy v3, ADR-305): a practice going PUBLIC is published.
  // Pay the creator the small Gem token on FIRST publish only — idempotent per asset id
  // (the create_token:practice:{id} rule_key), so a practice created public (already paid
  // in createPractice) or toggled public→private→public never double-pays. Best-effort:
  // never blocks the flag change. The token pays the AUTHOR (created_by), not the toggler.
  if (flags.is_public === true) {
    try {
      const { data } = await db().from('practices').select('created_by').eq('id', id).maybeSingle()
      const createdBy = (data as { created_by: string | null } | null)?.created_by
      if (createdBy) {
        const { awardCreationToken } = await import('@/lib/rewards/creation')
        await awardCreationToken(createdBy, 'practice', id)
      }
    } catch {
      // a reward failure must never block changing visibility
    }
  }
}

/** Set a practice's per-log Zap reward override + the reward note shown on its card
 *  (admin-only; caller enforces capability). A null reward_zaps falls back to the
 *  weight-class default payout. */
export async function setPracticeReward(
  id: string,
  patch: { reward_zaps?: number | null; reward_note?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.reward_zaps !== undefined) update.reward_zaps = patch.reward_zaps
  if (patch.reward_note !== undefined) update.reward_note = patch.reward_note
  if (Object.keys(update).length === 0) return
  await db().from('practices').update(update).eq('id', id)
}

/** Hard-delete a practice (admin-only; caller enforces capability). FK on-delete
 *  handles member_practices (cascade) and logs (set null) per the schema. */
export async function deletePractice(id: string): Promise<void> {
  await db().from('practices').delete().eq('id', id)
}

// --- Taxonomy reads -------------------------------------------------------

/** All sub-categories (Focus, Cardio, …) ordered for filters + the editor. */
export async function listSubcategories(): Promise<Subcategory[]> {
  const { data } = await db()
    .from('practice_subcategories')
    .select('id, domain_id, slug, name, display_order')
    .order('display_order', { ascending: true })
  return (data as Subcategory[] | null) ?? []
}

async function subcategoryMap(): Promise<Map<string, Subcategory>> {
  const all = await listSubcategories()
  return new Map(all.map((s) => [s.id, s]))
}

/** Tags for a set of practices, grouped by practice id. */
async function tagsForPractices(ids: string[]): Promise<Map<string, PracticeTag[]>> {
  const out = new Map<string, PracticeTag[]>()
  if (ids.length === 0) return out
  const { data } = await db()
    .from('practice_tags')
    .select('practice_id, def:practice_tag_defs(slug, label)')
    .in('practice_id', ids)
  const rows = (data as { practice_id: string; def: PracticeTag | null }[] | null) ?? []
  for (const r of rows) {
    if (!r.def) continue
    const list = out.get(r.practice_id) ?? []
    list.push({ slug: r.def.slug, label: r.def.label })
    out.set(r.practice_id, list)
  }
  return out
}

/** The curated canonical tags, for the library filter row. */
export async function listCanonicalTags(): Promise<PracticeTag[]> {
  const { data } = await db()
    .from('practice_tag_defs')
    .select('slug, label')
    .eq('is_canonical', true)
    .order('label', { ascending: true })
  return (data as PracticeTag[] | null) ?? []
}

/** Tag labels currently on a practice (for pre-filling the editor). */
export async function getPracticeTagLabels(practiceId: string): Promise<string[]> {
  const map = await tagsForPractices([practiceId])
  return (map.get(practiceId) ?? []).map((t) => t.label)
}

export async function getCircleActivePractice(circleId: string): Promise<Practice | null> {
  const { data } = await db()
    .from('circle_practices')
    .select(`practice:practices(${PRACTICE_COLS})`)
    .eq('circle_id', circleId)
    .eq('active', true)
    .maybeSingle()
  const row = data as { practice: Practice | null } | null
  return row?.practice ? normalizePractice(row.practice) : null
}

export async function getMemberPractices(profileId: string): Promise<Practice[]> {
  const { data } = await db()
    .from('member_practices')
    .select(`practice:practices(${PRACTICE_COLS})`)
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  const rows = (data as { practice: Practice | null }[] | null) ?? []
  return rows.map((r) => r.practice).filter((p): p is Practice => !!p).map(normalizePractice)
}

/** A single practice with its popularity stats + display taxonomy, for the detail
 *  page. Reads the server-only ranking view (admin client bypasses RLS). */
export async function getRankedPractice(id: string): Promise<RankedPractice | null> {
  const { data } = await db()
    .from('practices_ranked')
    .select(`${RANKED_COLS}, adopters, logs_30d, logs_total, score`)
    .eq('id', id)
    .maybeSingle()
  const p = data as
    | (Practice & { adopters: number; logs_30d: number; logs_total: number; score: number })
    | null
  if (!p) return null
  const [subById, tagsByPractice] = await Promise.all([subcategoryMap(), tagsForPractices([p.id])])
  const sc = p.subcategory_id ? subById.get(p.subcategory_id) : null
  return {
    ...normalizePractice(p),
    subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
    tags: tagsByPractice.get(p.id) ?? [],
  }
}

// --- Backlinks: "Used in" (journeys + circles that reference this practice) ---
//
// The link from a practice to the journeys/circles that use it (the inverse of
// journey_plan_items.practice_id / circle_practices.practice_id). Visibility is
// mirrored from the public surfaces so a backlink never leaks private content:
//   · journeys — only visibility = 'public' (the open-library rule; listPublicPlans)
//   · circles  — only non-archived; demo circles hidden unless demo mode is on AND
//     the viewer hasn't opted out (mirrors app/(main)/circles/page.tsx)

export interface PracticeJourneyLink {
  slug: string
  title: string
  /** Times this journey has been adopted (the library's popularity signal). */
  adoptCount: number
}

export interface PracticeCircleLink {
  slug: string
  name: string
  /** Active members in the circle. */
  memberCount: number
}

export interface PracticeBacklinks {
  journeys: PracticeJourneyLink[]
  circles: PracticeCircleLink[]
}

/**
 * The journeys and circles that USE this practice, filtered to what the viewer
 * may see. `hideDemo` hides demo circles (pass the resolved demo preference from
 * the page). Two small joined reads; safe to call behind a <Suspense>.
 */
export async function getPracticeBacklinks(
  practiceId: string,
  opts: { hideDemo?: boolean } = {},
): Promise<PracticeBacklinks> {
  const client = db()

  // Journeys: journey_plan_items → public plans only. Distinct on slug (a plan
  // can't list a practice twice, but be defensive about duplicate item rows).
  const journeysP = client
    .from('journey_plan_items')
    .select('plan:journey_plans!inner(slug, title, adopt_count, visibility)')
    .eq('practice_id', practiceId)
    .eq('plan.visibility', 'public')

  // Circles: circle_practices (active assignment) → non-archived circles.
  let circlesQ = client
    .from('circle_practices')
    .select('circle:circles!inner(slug, name, member_count, status, is_demo)')
    .eq('practice_id', practiceId)
    .eq('active', true)
    .neq('circle.status', 'archived')
  if (opts.hideDemo) circlesQ = circlesQ.eq('circle.is_demo', false)

  const [journeysRes, circlesRes] = await Promise.all([journeysP, circlesQ])

  const journeyRows =
    (journeysRes.data as { plan: { slug: string; title: string; adopt_count: number } | null }[] | null) ?? []
  const seenJourney = new Set<string>()
  const journeys: PracticeJourneyLink[] = []
  for (const r of journeyRows) {
    if (!r.plan || seenJourney.has(r.plan.slug)) continue
    seenJourney.add(r.plan.slug)
    journeys.push({ slug: r.plan.slug, title: r.plan.title, adoptCount: r.plan.adopt_count ?? 0 })
  }
  journeys.sort((a, b) => b.adoptCount - a.adoptCount || a.title.localeCompare(b.title))

  const circleRows =
    (circlesRes.data as { circle: { slug: string; name: string; member_count: number } | null }[] | null) ?? []
  const seenCircle = new Set<string>()
  const circles: PracticeCircleLink[] = []
  for (const r of circleRows) {
    if (!r.circle || seenCircle.has(r.circle.slug)) continue
    seenCircle.add(r.circle.slug)
    circles.push({ slug: r.circle.slug, name: r.circle.name, memberCount: r.circle.member_count ?? 0 })
  }
  circles.sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name))

  return { journeys, circles }
}

/** Whether a member has adopted a practice + already logged it today (detail CTAs).
 *  "Today" is the member's LOCAL day (profiles.home_timezone), with an optional
 *  client tz fallback, so an already-logged practice stays "logged today" until the
 *  member's own midnight rather than UTC's. */
export async function getPracticeMemberState(
  profileId: string,
  practiceId: string,
  clientTimezone?: string | null,
): Promise<{ adopted: boolean; loggedToday: boolean }> {
  const today = await resolveMemberDay(profileId, clientTimezone)
  const client = db()
  const [adopt, log] = await Promise.all([
    client.from('member_practices').select('id').eq('profile_id', profileId)
      .eq('practice_id', practiceId).eq('active', true).maybeSingle(),
    client.from('practice_logs').select('id').eq('profile_id', profileId)
      .eq('practice_id', practiceId).eq('logged_for', today).maybeSingle(),
  ])
  return { adopted: !!adopt.data, loggedToday: !!log.data }
}

// --- Mutations (callers enforce authz: host for circle, self for personal) -

export async function createPractice(input: {
  title: string
  description?: string | null
  createdBy: string
  /** The owning Space (tenancy axis, Phase 0). Defaults to the root space when omitted, so
   *  existing single-tenant callers keep stamping practices to root and behave as today. */
  spaceId?: string | null
  isPublic?: boolean
  /** Library review status at birth (community_library lifecycle). Omit to let the
   *  column default ('approved') stand — host+ authored content is live at birth; a
   *  Crew proposal passes 'pending' so it stays out of the public pool until a Host+
   *  approves it. The column predates this code (migration 20260605120000), but the
   *  write is guarded so a stale schema (no `status` column) never blocks creation. */
  status?: 'pending' | 'approved'
}): Promise<Practice | null> {
  const isPublic = input.isPublic ?? true
  const insert: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    created_by: input.createdBy,
    is_public: isPublic,
    slug: await uniquePracticeSlug(input.title),
  }
  // Stamp the owning Space (tenancy axis, Phase 0). Defaults to the root space via
  // loadRootSpaceId, so this single-tenant create keeps behaving exactly as today. space_id is
  // newer than the generated DB types — set it on the untyped insert payload (ADR-246). Omit
  // when the root row is missing (the backfill sweeps the NULL to root).
  const spaceId = input.spaceId ?? (await loadRootSpaceId())
  if (spaceId) insert.space_id = spaceId
  // Only set status when the caller asks for a non-default ('pending'): a defensive
  // insert that tolerates a not-yet-applied column would otherwise be harder to reason
  // about. 'approved' is the column default, so omitting it is equivalent + safe.
  if (input.status === 'pending') insert.status = 'pending'
  let { data } = await db().from('practices').insert(insert).select(PRACTICE_COLS).maybeSingle()
  // Defensive fallback: if the `status` column isn't applied yet, the insert above
  // errors and returns no row. Retry once without it so creation never hard-depends on
  // the migration being live (the practice simply lands at the column-less default).
  if (!data && insert.status !== undefined) {
    delete insert.status
    ;({ data } = await db().from('practices').insert(insert).select(PRACTICE_COLS).maybeSingle())
  }
  const practice = (data as Practice | null) ?? null

  // Creation token (Rewards Economy v3, ADR-305): the small Gem token on FIRST publish.
  // A practice created PUBLIC is published at birth; a private draft pays its token later
  // when it first goes public (setPracticeFlags). Idempotent per asset id + best-effort:
  // never double-pays, never blocks the create.
  if (practice && isPublic && input.createdBy) {
    try {
      const { awardCreationToken } = await import('@/lib/rewards/creation')
      await awardCreationToken(input.createdBy, 'practice', practice.id)
    } catch {
      // a reward failure must never block creating a practice
    }
  }

  return practice
}

/**
 * Practices that BELONG TO a space (tenancy axis, Phase 0 / ENTITY-SPACES §4.3), newest first.
 * Defaults to the root space (so a caller that passes no spaceId reads the root's practices, the
 * canary). Filtered by space_id so a practice in space A can never resolve for space B — the
 * by-space read the Phase 1 profile's `entity-practices` module uses. FAIL-SAFE: [] on any
 * error / missing tenant. space_id is reached with an untyped handle (ADR-246).
 */
export async function listPracticesForSpace(spaceId?: string | null, limit = 50): Promise<Practice[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  try {
    const q = db().from('practices') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await q
      .select(PRACTICE_COLS)
      .eq('space_id', sid)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data as Practice[] | null) ?? []
  } catch {
    return []
  }
}

/**
 * Best-effort: tell the curators a member-proposed practice is waiting for review.
 * Mirrors the curation gate (a Host on the trust ladder OR any Guide+ approves —
 * docs/community-library / ADR-109) by notifying every active host+ steward AND every
 * platform staff account (web_role admin/janitor), so whoever curates the review queue
 * sees it in their bell tray. Reuses the shared `notifications` table the same way the
 * creator-tip + friend flows do (recipient_id + type + reference). NEVER throws — a
 * notification failure must never block creating the practice (the caller ignores the
 * result). De-duped per recipient; the actor is the proposing member.
 */
export async function notifyStaffOfPendingPractice(input: {
  practiceId: string
  title: string
  proposedBy: string
}): Promise<void> {
  try {
    const client = db()
    // host+ on the trust ladder = host, guide, mentor (and the deprecated admin/janitor
    // community rungs, kept for enum-order parity — harmless to include). Staff = web_role
    // admin/janitor, independent of the ladder. Either standing curates the review queue.
    const hostPlus = ROLE_HIERARCHY.slice(ROLE_HIERARCHY.indexOf('host')) as readonly string[]
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .eq('is_system', false)
      .or(`community_role.in.(${hostPlus.join(',')}),web_role.in.(admin,janitor)`)
      .limit(200)
    const recipients = [
      ...new Set(
        ((data as { id: string }[] | null) ?? [])
          .map((r) => r.id)
          .filter((id) => id && id !== input.proposedBy),
      ),
    ]
    if (recipients.length === 0) return
    const body = `New practice "${input.title.slice(0, 80)}" is waiting for review.`
    await client.from('notifications').insert(
      recipients.map((recipient_id) => ({
        recipient_id,
        actor_id: input.proposedBy,
        type: 'practice_review',
        reference_type: 'practice',
        reference_id: input.practiceId,
        body,
      })),
    )
  } catch {
    // a notification failure must never block proposing a practice
  }
}

/** A single practice by id (for the editor + ownership checks). */
export async function getPractice(id: string): Promise<Practice | null> {
  const { data } = await db().from('practices').select(PRACTICE_COLS).eq('id', id).maybeSingle()
  const p = (data as Practice | null) ?? null
  return p ? normalizePractice(p) : null
}

/** The member-editable content fields of a practice. Rewards (reward_zaps /
 *  reward_note) are intentionally NOT here — the economy stays admin-governed,
 *  which is the "partial flexibility" line (members shape content + cadence). */
export interface PracticeEdit {
  title?: string
  summary?: string | null
  description?: string | null
  body?: string | null
  cadence?: string | null
  /** Typical session length in minutes (null clears it). */
  duration_min?: number | null
  /** Which timer the practice routes to: 'none' (Log it) | 'mindless' (On Air sit) |
   *  'movement' (Movement timer). The authoritative discriminator (uses_timer is derived). */
  timer_kind?: TimerKind
  /** Movement timer config when timer_kind = 'movement' (mode + tuning); null otherwise. */
  movement_config?: MovementConfig | null
  category?: string | null
  icon?: string | null
  header_image?: string | null
  domain_id?: string | null
  /** The practice's Focuses (Pillars) with per-Focus instructions + timing, keyed by
   *  pillar id. Presence of a key = that Focus is selected (a practice can have many).
   *  When written, `domain_id` is set to the first key for back-compat (Pillar filtering). */
  focus_details?: Record<string, { instructions: string; timing: string }> | null
  subcategory_id?: string | null
  /** Payout weight for a log (Rewards Economy v2): 'light' (8⚡) | 'standard' (12⚡) |
   *  'heavy' (15⚡). Unlike the reward_zaps amount, this IS author-editable — it's the
   *  effort tier of the practice, which the author knows best (drives practiceLogAction). */
  weight_class?: WeightClass
}

/** Normalize a focus_details patch into a clean, bounded map (and pick its primary
 *  pillar for domain_id). Trims/caps the free-text so a bad client can't write junk. */
function cleanFocusDetails(
  raw: Record<string, { instructions: string; timing: string }>,
): { focus_details: FocusDetails; primary: string | null } {
  const out: FocusDetails = {}
  // Pillar ids are UUIDs. Only accept UUID-shaped keys, which rejects '__proto__' /
  // 'constructor' / 'prototype' (remote property-injection / prototype-pollution guard).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  for (const [pillarId, detail] of Object.entries(raw)) {
    if (!UUID.test(pillarId)) continue
    out[pillarId] = {
      instructions: (detail?.instructions ?? '').slice(0, 2000),
      timing: (detail?.timing ?? '').slice(0, 80),
    }
  }
  const keys = Object.keys(out)
  return { focus_details: out, primary: keys[0] ?? null }
}

/** The three payout tiers a practice log can carry. 'standard' is the default. */
export const WEIGHT_CLASSES = ['light', 'standard', 'heavy'] as const
export type WeightClass = (typeof WEIGHT_CLASSES)[number]

const STR = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? '').trim()
  return t ? t.slice(0, max) : null
}

/** Update a practice's content. Caller enforces ownership (created_by === caller).
 *  Only the fields present in `patch` are written. */
export async function updatePractice(id: string, patch: PracticeEdit): Promise<Practice | null> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = STR(patch.title, 80) ?? 'Untitled practice'
  if (patch.summary !== undefined) update.summary = STR(patch.summary, 140)
  if (patch.description !== undefined) update.description = STR(patch.description, 280)
  if (patch.body !== undefined) update.body = STR(patch.body, 8000)
  if (patch.cadence !== undefined) update.cadence = STR(patch.cadence, 40)
  if (patch.duration_min !== undefined)
    update.duration_min =
      patch.duration_min == null ? null : Math.max(0, Math.min(1440, Math.floor(patch.duration_min)))
  // timer_kind is the authoritative discriminator (uses_timer is a generated mirror and
  // cannot be written). A 'movement' kind carries its config; switching away clears it so a
  // stale Movement config never lingers on a Mindless/none practice.
  if (patch.timer_kind !== undefined) {
    const kind: TimerKind = TIMER_KINDS.includes(patch.timer_kind) ? patch.timer_kind : 'mindless'
    update.timer_kind = kind
    if (kind !== 'movement') update.movement_config = null
  }
  if (patch.movement_config !== undefined)
    update.movement_config = patch.movement_config ?? null
  if (patch.category !== undefined) update.category = STR(patch.category, 40)
  if (patch.icon !== undefined) update.icon = STR(patch.icon, 40)
  if (patch.header_image !== undefined) update.header_image = STR(patch.header_image, 500)
  if (patch.domain_id !== undefined) update.domain_id = patch.domain_id || null
  // Multi-Focus: write the per-Focus map and keep domain_id as the FIRST selected
  // Focus (back-compat for Pillar filtering + cards). A focus_details patch wins on
  // domain_id, since both describe the same Focus set.
  if (patch.focus_details !== undefined) {
    const { focus_details, primary } = cleanFocusDetails(patch.focus_details ?? {})
    update.focus_details = focus_details
    update.domain_id = primary
  }
  if (patch.subcategory_id !== undefined) update.subcategory_id = patch.subcategory_id || null
  // Weight class drives the per-log Zap payout (light 8 / standard 12 / heavy 15).
  // Guard against an unexpected value so a bad client can't write a junk tier.
  if (patch.weight_class !== undefined)
    update.weight_class = WEIGHT_CLASSES.includes(patch.weight_class) ? patch.weight_class : 'standard'
  if (Object.keys(update).length === 0) return getPractice(id)

  const { data } = await db().from('practices').update(update).eq('id', id).select(PRACTICE_COLS).maybeSingle()
  return (data as Practice | null) ?? null
}

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

/** A unique practice slug from a title: the slugified base, or base-2/-3… if taken.
 *  (slug chars are a-z0-9- only, so the ilike prefix is injection-safe.) */
async function uniquePracticeSlug(title: string): Promise<string> {
  const root = slugify(title) || 'practice'
  const { data } = await db().from('practices').select('slug').ilike('slug', `${root}%`)
  const taken = new Set(
    ((data ?? []) as { slug: string | null }[]).map((r) => r.slug).filter((s): s is string => !!s),
  )
  if (!taken.has(root)) return root
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

/**
 * Replace a practice's tags for a given `source` with `labels` (hybrid model: any new
 * label becomes a non-canonical folksonomy tag; existing slugs are reused). Tags from
 * other sources (e.g. Vera, other members) are left untouched. Caller enforces authz
 * (owner for 'author'). Capped at 12 tags.
 */
export async function setPracticeTags(
  practiceId: string,
  labels: string[],
  opts: { source?: 'author' | 'member' | 'vera'; assignedBy?: string | null } = {},
): Promise<void> {
  const source = opts.source ?? 'author'
  const client = db()

  // Normalize to unique (slug, label) pairs and ensure a def row exists for each.
  const seen = new Map<string, string>() // slug -> label
  for (const raw of labels) {
    const label = (raw ?? '').trim().slice(0, 40)
    const slug = slugify(label)
    if (slug && !seen.has(slug)) seen.set(slug, label)
  }
  const pairs = Array.from(seen.entries()).slice(0, 12)

  if (pairs.length > 0) {
    await client
      .from('practice_tag_defs')
      .upsert(
        pairs.map(([slug, label]) => ({ slug, label, is_canonical: false })),
        { onConflict: 'slug', ignoreDuplicates: true },
      )
  }

  const slugs = pairs.map(([slug]) => slug)
  const { data: defs } = slugs.length
    ? await client.from('practice_tag_defs').select('id, slug').in('slug', slugs)
    : { data: [] as { id: string; slug: string }[] }
  const idBySlug = new Map(((defs as { id: string; slug: string }[] | null) ?? []).map((d) => [d.slug, d.id]))

  // Swap this source's tags for the new set.
  await client.from('practice_tags').delete().eq('practice_id', practiceId).eq('source', source)
  const rows = slugs
    .map((s) => idBySlug.get(s))
    .filter((id): id is string => !!id)
    .map((tag_id) => ({ practice_id: practiceId, tag_id, source, assigned_by: opts.assignedBy ?? null }))
  if (rows.length > 0) {
    await client.from('practice_tags').upsert(rows, { onConflict: 'practice_id,tag_id', ignoreDuplicates: true })
  }
}

/** Fork a practice into a PRIVATE copy owned by the caller (is_public=false), so a
 *  member can customize a library practice for their own program without altering
 *  the shared one. Copies the content fields (not the rewards). */
export async function forkPractice(profileId: string, practiceId: string): Promise<Practice | null> {
  const src = await getPractice(practiceId)
  if (!src) return null
  const { data } = await db()
    .from('practices')
    .insert({
      title: src.title,
      description: src.description,
      summary: src.summary,
      body: src.body,
      cadence: src.cadence,
      duration_min: src.duration_min,
      // timer_kind is authoritative (uses_timer is generated, never inserted); carry the
      // Movement config so a forked Movement practice keeps its mode + tuning.
      timer_kind: src.timer_kind,
      movement_config: src.movement_config ?? null,
      category: src.category,
      icon: src.icon,
      header_image: src.header_image,
      domain_id: src.domain_id,
      focus_details: src.focus_details ?? {},
      subcategory_id: src.subcategory_id,
      created_by: profileId,
      is_public: false,
    })
    .select(PRACTICE_COLS)
    .maybeSingle()
  return (data as Practice | null) ?? null
}

/** Claim a template: fork a private, owned copy, personalize it with the member's
 *  (Vera-assisted) title / cadence / summary / body, and adopt it. Returns the new
 *  practice. The claim reward is awarded by the action layer (lib/zaps). The copy is
 *  never a template (forkPractice leaves is_template at its default false). */
export async function claimPractice(
  profileId: string,
  templateId: string,
  fields: { title?: string; summary?: string | null; body?: string | null; cadence?: string | null },
): Promise<Practice | null> {
  const copy = await forkPractice(profileId, templateId)
  if (!copy) return null
  const patch: PracticeEdit = {}
  if (fields.title !== undefined) patch.title = fields.title
  if (fields.summary !== undefined) patch.summary = fields.summary
  if (fields.body !== undefined) patch.body = fields.body
  if (fields.cadence !== undefined) patch.cadence = fields.cadence
  const updated = Object.keys(patch).length ? await updatePractice(copy.id, patch) : copy
  await adoptPractice(profileId, (updated ?? copy).id)
  return updated ?? copy
}

/** Set the circle's current practice (one active per circle). Caller must be host+. */
export async function setCirclePractice(
  circleId: string,
  practiceId: string,
  setBy: string,
): Promise<void> {
  const client = db()
  await client
    .from('circle_practices')
    .update({ active: false })
    .eq('circle_id', circleId)
    .eq('active', true)
  await client
    .from('circle_practices')
    .insert({ circle_id: circleId, practice_id: practiceId, set_by: setBy, active: true })

  // Lifecycle reward: activating a circle (its first practice). Idempotency keyed
  // per circle, so it fires once even if the practice changes later. Routes
  // through the ledger; will land in the Vault for free hosts once ADR-037 ships.
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `circle_activated:${circleId}`,
      source: 'web',
      eventType: 'circle.activated',
      actorProfileId: setBy,
      context: { circleId },
    })
    if (recorded) await awardZapsForAction(setBy, 'circle_activate')
  } catch {
    // a reward failure must never block setting the practice
  }
}

/** A member adopts a practice for themselves (re-activates if previously dropped). */
export async function adoptPractice(profileId: string, practiceId: string): Promise<void> {
  await db()
    .from('member_practices')
    .upsert(
      { profile_id: profileId, practice_id: practiceId, active: true },
      { onConflict: 'profile_id,practice_id' },
    )
  // Activation-funnel step 4 (ADR-075). Best-effort; never blocks the adopt.
  await track('practice.adopted', { practiceId }, profileId)
}

export async function dropMemberPractice(profileId: string, practiceId: string): Promise<void> {
  await db()
    .from('member_practices')
    .update({ active: false })
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
}

// --- Activity history -----------------------------------------------------

export interface PracticeLogEntry {
  logged_for: string
  title: string | null
}

/** A member's recent practice logs (newest first), with the practice title. */
export async function getRecentPracticeLogs(
  profileId: string,
  limit = 60,
): Promise<PracticeLogEntry[]> {
  const { data } = await db()
    .from('practice_logs')
    .select('logged_for, practice:practices(title)')
    .eq('profile_id', profileId)
    .order('logged_for', { ascending: false })
    .limit(limit)
  const rows = (data as { logged_for: string; practice: { title: string } | null }[] | null) ?? []
  return rows.map((r) => ({ logged_for: r.logged_for, title: r.practice?.title ?? null }))
}

/** A member's adopted practices that they have NOT yet logged today. Powers the
 *  "log today's practice" prompt on the feed. Empty if none adopted or all logged.
 *  "Today" is the member's LOCAL day (profiles.home_timezone, then an optional client
 *  tz, then UTC), so a practice stays collapsed until the member's own midnight. */
export async function getPracticesToLogToday(
  profileId: string,
  clientTimezone?: string | null,
): Promise<Practice[]> {
  const mine = await getMemberPractices(profileId)
  if (mine.length === 0) return []
  const today = await resolveMemberDay(profileId, clientTimezone)
  const { data } = await db()
    .from('practice_logs')
    .select('practice_id')
    .eq('profile_id', profileId)
    .eq('logged_for', today)
  const logged = new Set(((data as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id))
  return mine.filter((p) => !logged.has(p.id))
}

/** A practice the member started today but did NOT finish (a partial timed log,
 *  completed=false), with how far they got. Powers the "Finish Practice" prompt: the UI
 *  shows the remaining time = max(0, secondsTarget - secondsDone). */
export interface PartialPracticeToday {
  practice: Practice
  secondsDone: number
  secondsTarget: number
}

/**
 * A member's practices that today carry a PARTIAL log (completed=false) — they sat at least
 * half the target and cleared the day, but have not finished. Returns each practice plus its
 * { secondsDone, secondsTarget } so the UI can offer "Finish Practice" and compute the time
 * left. "Today" is the member's LOCAL day (home_timezone, then client tz, then UTC), the same
 * day resolveMemberDay keys the log under. Scoped to the caller's own logs (profileId is
 * server-resolved by the caller). Reads the new completion columns through the untyped handle.
 */
export async function getPartialPracticesToday(
  profileId: string,
  clientTimezone?: string | null,
): Promise<PartialPracticeToday[]> {
  const today = await resolveMemberDay(profileId, clientTimezone)
  const { data } = await db()
    .from('practice_logs')
    .select('practice_id, seconds_done, seconds_target, completed')
    .eq('profile_id', profileId)
    .eq('logged_for', today)
    .eq('completed', false)
  const rows =
    (data as
      | { practice_id: string | null; seconds_done: number | null; seconds_target: number | null }[]
      | null) ?? []
  const ids = [...new Set(rows.map((r) => r.practice_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return []

  const { data: pracRows } = await db().from('practices').select(PRACTICE_COLS).in('id', ids)
  const byId = new Map(
    ((pracRows as Practice[] | null) ?? []).map((p) => [p.id, normalizePractice(p)] as const),
  )

  const out: PartialPracticeToday[] = []
  for (const r of rows) {
    const practice = r.practice_id ? byId.get(r.practice_id) : null
    if (!practice) continue
    out.push({
      practice,
      secondsDone: Math.max(0, Math.round(r.seconds_done ?? 0)),
      secondsTarget: Math.max(0, Math.round(r.seconds_target ?? 0)),
    })
  }
  return out
}

// --- The North-Star emitter ----------------------------------------------

/** Generic bonus container plumbed into the practice-log toast. Journey/season rewards
 *  were retired (ADR-253) — daily logs no longer grant journey/co-op rewards — so this now
 *  carries only the surviving daily-loop bonus (Spark, the v3 variable layer). Kept under the
 *  `journey` key for a stable toast/action contract (on-air/actions → reveal.tsx). */
export interface LogBonusResult {
  bonuses: { label: string; kind: 'zaps' | 'gems'; amount: number }[]
  zaps: number
  gems: number
}

/**
 * Anti-cheat: the most distinct practices a member may log in one LOCAL day, across
 * ALL their practices (WEBSITE-CHANGES-PLAN §3 B.2 / D5). A genuine daily program is
 * a handful of practices; this ceiling only ever bites a farming loop, and is well
 * above any real day. Counted against `practice_logs WHERE logged_for = today` before
 * the award (each practice is already once-per-day via the idempotency key, so this
 * caps the BREADTH of distinct practices, not re-logs of the same one).
 */
export const MAX_PRACTICE_LOGS_PER_DAY = 25

export interface LogPracticeResult {
  /** false = already logged this practice today (idempotent), OR the daily cap was hit. */
  logged: boolean
  /** true = refused by the per-day total-logs anti-cheat cap (B.2), distinct from a
   *  plain idempotent no-op. The caller can show a calm "that's plenty for today" line. */
  cappedDaily?: boolean
  zapsAwarded: number
  /** Daily-loop bonus this log unlocked (Spark, the v3 variable layer), for the toast. */
  journey?: LogBonusResult
  /** First log after a 7+ day gap: render the warm re-entry state (one line —
   *  good to see you + one small next step). NEVER broken-streak shame UI. */
  welcomeBack?: boolean
  /** true = this log was a PARTIAL timed log (>= 50% but < 95% of target): the day is
   *  cleared + the streak ticked, but only 1 Zap paid. The UI offers "Finish Practice"
   *  to top up to the full reward. */
  partial?: boolean
  /** true = a partial log was just topped up to complete (the "Finish Practice" path):
   *  the remaining Zaps were paid; streak + bonuses were NOT re-run (they ran on the
   *  first partial log). */
  finished?: boolean
}

/** The FULL per-log Zap value a practice pays (reward_zaps override else weight-class
 *  default), via the one source of truth lib/zaps.practiceZapValue. Used by the finish
 *  top-up to size the remaining delta, and mirrored by the first-log full path below.
 *  Reads the practice's reward fields through the untyped handle; 0 on any error. */
async function practiceFullReward(practiceId: string): Promise<number> {
  try {
    const { data } = await db()
      .from('practices')
      .select('weight_class, reward_zaps')
      .eq('id', practiceId)
      .maybeSingle()
    const row = data as { weight_class: string | null; reward_zaps: number | null } | null
    const { practiceZapValue } = await import('@/lib/zaps')
    return practiceZapValue({ reward_zaps: row?.reward_zaps ?? null, weight_class: row?.weight_class ?? null })
  } catch {
    return 0
  }
}

/**
 * Log that a member did a practice. Exactly-once per (member, practice, day):
 * emits `practice.verified` (WAM), writes a durable log row, and awards zaps +
 * an attendance streak tick. `circleId` records the circle context when the
 * practice came from a circle assignment.
 *
 * Completion economy: a ONE-TAP / full timed log is `completed=true` and pays the full
 * reward + ticks the streak (the unchanged default path). A PARTIAL timed log (>= 50% but
 * < 95% of target) is `completed=false`, STILL clears the day + ticks the streak, but pays
 * exactly 1 Zap; the "Finish Practice" top-up later flips it complete + pays the rest (handled
 * up top, before the idempotency gate). `secondsDone`/`secondsTarget` carry the timed state.
 */
export async function logPractice(input: {
  profileId: string
  practiceId: string
  circleId?: string | null
  /** The member's IANA timezone from the client (Intl…resolvedOptions().timeZone),
   *  used ONLY when the profile has no home_timezone on file. The durable, un-spoofable
   *  home_timezone always wins, so the idempotency-key day is server-resolved. */
  clientTimezone?: string | null
  /** Timed-log completion (the partial/finish economy). The actual elapsed seconds the
   *  member sat. Paired with secondsTarget; both null/0 = the unchanged one-tap full log. */
  secondsDone?: number | null
  /** The length the timed log is measured against (duration_min*60, or the open-sit
   *  minutes*60). null/0 = a one-tap log (no target) → the full reward, exactly as today. */
  secondsTarget?: number | null
}): Promise<LogPracticeResult> {
  const {
    profileId,
    practiceId,
    circleId = null,
    clientTimezone = null,
    secondsDone = null,
    secondsTarget = null,
  } = input
  // The log "day" is the member's LOCAL calendar day, resolved from their durable
  // home_timezone (then the client tz, then UTC). Server-resolved so the day that
  // keys the idempotency row + the practice_logs unique constraint can't be spoofed
  // to backdate; a member can only shift their OWN local day. yyyy-mm-dd.
  const day = await resolveMemberDay(profileId, clientTimezone)

  // Completion economy. A TIMED log carries a positive target; the ratio of done/target
  // decides full vs partial. A one-tap log (no target) is always FULL — the unchanged
  // default path. Thresholds: >= 95% counts as a full sit (absorbs the 5s pre-roll +
  // rounding); 50%..95% is a partial (clears the day, 1 Zap, "Finish Practice" tops up).
  // A ratio < 50% never reaches here (completeSession's timer-proof gate blocks it).
  const tgt = Math.max(0, Math.round(secondsTarget ?? 0))
  const done = Math.max(0, Math.round(secondsDone ?? 0))
  const isTimed = tgt > 0
  const ratio = isTimed ? done / tgt : 1
  const isFullSit = !isTimed || ratio >= 0.95
  const PARTIAL_ZAPS = 1

  // The "finish a partial" top-up (and the "already logged today" no-op) must be decided
  // BEFORE the engagement-event idempotency gate: that key is recorded on the FIRST log of
  // the day, so a finish would otherwise be swallowed as a duplicate no-op. Read today's
  // existing row for this practice (completion + the Zaps already paid) up front.
  const { data: existingRow } = await db()
    .from('practice_logs')
    .select('id, completed, zaps_awarded, seconds_done, seconds_target')
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
    .eq('logged_for', day)
    .maybeSingle()
  const existing = existingRow as {
    id: string
    completed: boolean | null
    zaps_awarded: number | null
    seconds_done: number | null
    seconds_target: number | null
  } | null

  // Existing FULL log → no-op, exactly as today (logged=false).
  if (existing && existing.completed !== false) {
    return { logged: false, zapsAwarded: 0 }
  }

  // Existing PARTIAL log → the "Finish Practice" top-up. Handled entirely here: no new
  // engagement event, no streak re-tick, no re-paid bonuses (all ran on the first partial).
  if (existing && existing.completed === false) {
    const fullReward = await practiceFullReward(practiceId)
    const newDone = Math.max(existing.seconds_done ?? 0, done)
    const newTarget = Math.max(existing.seconds_target ?? 0, tgt)
    if (isFullSit) {
      // Top up to complete: flip completed=true, raise seconds_done, and pay the REST of
      // the reward (the delta the partial held back), so partial + finish totals the full.
      const alreadyPaid = Math.max(0, existing.zaps_awarded ?? 0)
      const delta = Math.max(0, fullReward - alreadyPaid)
      let paid = 0
      if (delta > 0) {
        try {
          paid = (await awardZaps(profileId, delta, { actionType: 'practice_logged' })).amount
        } catch {
          // never let a reward write break the finish; the row still flips to complete
        }
      }
      try {
        await db()
          .from('practice_logs')
          .update({ completed: true, seconds_done: newDone, seconds_target: newTarget, zaps_awarded: alreadyPaid + paid })
          .eq('id', existing.id)
      } catch {
        // bookkeeping only; the award already landed
      }
      return { logged: true, zapsAwarded: paid, finished: true }
    }
    // Still partial: only nudge seconds_done upward, pay nothing more.
    if (newDone > (existing.seconds_done ?? 0) || newTarget > (existing.seconds_target ?? 0)) {
      try {
        await db()
          .from('practice_logs')
          .update({ seconds_done: newDone, seconds_target: newTarget })
          .eq('id', existing.id)
      } catch {
        // best-effort progress bump
      }
    }
    return { logged: true, zapsAwarded: 0, partial: true }
  }

  // Anti-cheat (B.2 / D5): a per-day TOTAL-logs cap across all practices. Counted
  // BEFORE the idempotency row is written, so refusing here never strands an
  // engagement_events row that would silently block a later real log. A practice the
  // member has ALREADY logged today is exempt (re-running its idempotent log must
  // still no-op cleanly, not trip the cap), so the count only blocks NEW distinct
  // practices once the ceiling is reached. Fail-open on a read error — the cap must
  // never break a legitimate log.
  try {
    const { data: todays } = await db()
      .from('practice_logs')
      .select('practice_id')
      .eq('profile_id', profileId)
      .eq('logged_for', day)
    const loggedIds = ((todays as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id)
    if (
      loggedIds.length >= MAX_PRACTICE_LOGS_PER_DAY &&
      !loggedIds.includes(practiceId)
    ) {
      return { logged: false, cappedDaily: true, zapsAwarded: 0 }
    }
  } catch {
    // the cap read is best-effort; a genuine log is never blocked by it
  }

  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `practice_log:${profileId}:${practiceId}:${day}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: profileId,
    context: { practiceId, circleId, kind: 'practice_log' },
    verifiedAt: new Date(),
  })
  if (!recorded) return { logged: false, zapsAwarded: 0 }

  // Welcome Back (Rewards Economy v2): detect the gap BEFORE writing today's row.
  // First log after a 7+ day gap pays +10⚡ once per gap (the return day keys the
  // grant) and flags the response so the client renders the warm re-entry state.
  let welcomeBack = false
  try {
    const { data: lastLog } = await db()
      .from('practice_logs')
      .select('logged_for')
      .eq('profile_id', profileId)
      .lt('logged_for', day)
      .order('logged_for', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastDay = (lastLog as { logged_for: string } | null)?.logged_for
    if (lastDay) {
      const gapDays = Math.round((Date.parse(day) - Date.parse(lastDay)) / 86_400_000)
      if (gapDays >= 7) {
        const { error } = await db().from('reward_grants').insert({
          rule_key: `welcome.back:${day}`,
          profile_id: profileId,
          reward_kind: 'zaps',
          amount: 0, // ledger row below carries the live amount
          detail: 'Welcome Back',
        })
        if (!error) {
          await awardZapsForAction(profileId, 'welcome_back')
          welcomeBack = true
        }
      }
    }
  } catch {
    // a missed welcome-back must never block the log
  }

  // Durable log row (unique on profile+practice+day mirrors the idempotency key). The
  // completion columns ride along: a full sit is completed=true; a partial is completed=false
  // (it still cleared the day above + ticks the streak below). seconds_done/seconds_target are
  // null on a one-tap log (no timer), so that path writes exactly as before. Reached through
  // the untyped handle (the columns are newer than the generated types; ADR-246).
  await db()
    .from('practice_logs')
    .upsert(
      {
        profile_id: profileId,
        practice_id: practiceId,
        circle_id: circleId,
        logged_for: day,
        completed: isFullSit,
        seconds_done: isTimed ? done : null,
        seconds_target: isTimed ? tgt : null,
      },
      { onConflict: 'profile_id,practice_id,logged_for', ignoreDuplicates: true },
    )

  // Verified practice earns zaps + an attendance streak tick (same as a check-in). The
  // payout is the practice's per-log Zap VALUE: `reward_zaps` when set is the explicit
  // override (the Quest library values practices by CADENCE — Daily 10 / 3x-week 15 /
  // Weekly 25 — so effort does not change value), otherwise the WEIGHT CLASS default
  // (light 8 / standard 12 / heavy 15, live-tunable in zap_config). One source of truth:
  // lib/zaps.practiceZapValue mirrors this for every display.
  let weightClass: string | null = null
  let rewardZaps: number | null = null
  let createdBy: string | null = null
  try {
    const { data } = await db()
      .from('practices')
      .select('weight_class, reward_zaps, created_by')
      .eq('id', practiceId)
      .maybeSingle()
    const row = data as { weight_class: string | null; reward_zaps: number | null; created_by: string | null } | null
    weightClass = row?.weight_class ?? null
    rewardZaps = row?.reward_zaps ?? null
    createdBy = row?.created_by ?? null
  } catch {
    // fall back to the standard class
  }

  // Validated creation (Rewards Economy v3, ADR-305): logging a practice is the "use" that
  // validates it. The practice's CREATOR (created_by, the beneficiary) is paid off the
  // logger's (the actor's) use when the logger is an established member. This block only
  // runs on a genuinely fresh log (recordEngagementEvent above returned recorded=true), and
  // the payout is idempotent per asset, so it pays the creator exactly once across all
  // members who ever log it. Best-effort + dynamic import — never breaks the log.
  if (createdBy) {
    try {
      const { awardValidatedCreation } = await import('@/lib/rewards/creation')
      await awardValidatedCreation(createdBy, 'practice', practiceId, profileId)
    } catch {
      // a reward failure must never break the log
    }
  }

  // The member's Zap payout. A PARTIAL first-log pays exactly 1 Zap (the rest is held back
  // until "Finish Practice" tops it up to the full reward); a FULL sit / one-tap log pays the
  // full value, scaled by reward_zaps override else weight class, exactly as today.
  let zapsAwarded = 0
  try {
    if (!isFullSit) {
      zapsAwarded = (await awardZaps(profileId, PARTIAL_ZAPS, { actionType: 'practice_logged' })).amount
    } else if (typeof rewardZaps === 'number' && rewardZaps > 0) {
      // Explicit per-practice value (cadence-based): pay it exactly, ledgered as a practice log.
      zapsAwarded = (await awardZaps(profileId, rewardZaps, { actionType: 'practice_logged' })).amount
    } else {
      const { practiceLogAction } = await import('@/lib/zaps')
      zapsAwarded = (await awardZapsForAction(profileId, practiceLogAction(weightClass))).amount
    }
  } catch {
    // never let a reward read break the log
  }

  // Record the awarded amount on the log row so the today-only un-log (B.1) can debit
  // it EXACTLY — the live zap_config / weight_class / reward_zaps can all drift between
  // log and un-log, so the row carries the true grant. Best-effort + reached through the
  // untyped handle (the `zaps_awarded` column is newer than the generated types; ADR-246):
  // a failed write just leaves NULL, which the un-log treats as 0 (never over-debits).
  try {
    await db()
      .from('practice_logs')
      .update({ zaps_awarded: zapsAwarded })
      .eq('profile_id', profileId)
      .eq('practice_id', practiceId)
      .eq('logged_for', day)
  } catch {
    // never let the un-log bookkeeping write break the log
  }

  await recordStreakActivity(profileId, 'attendance').catch(() => {})
  // The daily practice streak (the headline streak members feel) — advances the
  // consecutive-day count, spends a freeze to bridge a slip, and pays milestone
  // rewards. Owns profiles.current_streak / longest_streak (lib/practice-streak.ts).
  await recordPracticeStreak(profileId).catch(() => {})
  // Daily-streak achievement badges (practice_streak criteria) evaluate AFTER the
  // streak advances so today's log counts. Best-effort — a badge check must never
  // break the log (processGamificationEvent already swallows internally too).
  await processGamificationEvent({ type: 'practice_log', profileId }).catch(() => {})

  // Daily-loop bonus container for the toast. Journey/season + co-op rewards were retired
  // (ADR-253): a daily practice log no longer grants journey rewards (journey rewards now come
  // solely from completing lessons/phases in a Run; practices still pay their own Zaps per
  // ADR-139). The block below populates this with the surviving daily-loop bonus only — Spark
  // (the v3 variable layer; the v2 Surprises subsystem it replaced has been retired, ADR-305).
  let journey: LogBonusResult | undefined

  // Spark (Rewards Economy v3, ADR-305): the capped, low-frequency surprise bonus ON TOP
  // of the base Zaps already awarded above — never replacing them. Capped to once per
  // member per UTC day (reward_grants `spark:{profileId}:{day}`), gems-only so a lucky
  // roll never touches season rank. Best-effort + dynamic import; merged into the toast
  // bonus container so the UI could surface it.
  try {
    const { maybeSpark } = await import('@/lib/rewards/spark')
    const spark = await maybeSpark(profileId, { source: 'practice_log', day })
    if (spark.sparked && spark.amount > 0) {
      const base = journey ?? { bonuses: [], zaps: 0, gems: 0 }
      journey = {
        bonuses: [...base.bonuses, { label: `A Spark. Plus ${spark.amount} gems.`, kind: 'gems', amount: spark.amount }],
        zaps: base.zaps,
        gems: base.gems + spark.amount,
      }
    }
  } catch {
    // never let a Spark break the log
  }

  // The Quest (ADR-Quest completion model): completion counts "any practice in the
  // Journey's PILLARS" (the member builds their own daily practice and swaps freely
  // within a tag). So this log may have advanced any RANKED-ELIGIBLE Journey that covers
  // this practice's Pillar — an official season Journey OR a Vera-approved library one.
  // tryCompleteJourney is idempotent and resolves each Journey's own window/Expression
  // rule (an un-enrolled / out-of-window Journey simply can't complete), so it's safe to
  // run on every log. Best-effort + dynamic import — a completion check must NEVER break a log.
  try {
    const { tryCompleteJourney } = await import('@/lib/quest/complete')
    const { data: prac } = await db()
      .from('practices')
      .select('domain_id')
      .eq('id', practiceId)
      .maybeSingle()
    const pillarId = (prac as { domain_id: string | null } | null)?.domain_id
    if (pillarId) {
      const { data: items } = await db()
        .from('journey_plan_items')
        .select('plan_id, plan:journey_plans!inner(ranked_eligible)')
        .eq('domain_id', pillarId)
        .eq('plan.ranked_eligible', true)
      type Row = { plan_id: string }
      const planIds = [...new Set(((items ?? []) as Row[]).map((r) => r.plan_id))]
      for (const planId of planIds) {
        await tryCompleteJourney(profileId, planId)
      }
    }
  } catch {
    // a Quest completion check must never break the log
  }

  return { logged: true, zapsAwarded, journey, welcomeBack, partial: !isFullSit }
}

// --- Un-log (today-only; WEBSITE-CHANGES-PLAN §3 B.1 / D4) -----------------

export interface UnlogPracticeResult {
  /** A log existed for today and was reversed. false = nothing to un-log. */
  unlogged: boolean
  /** The Zaps debited (a positive number for display), 0 when none were awarded. */
  zapsReversed: number
}

/**
 * Reverse TODAY's log of a practice (the "I logged that by mistake" undo, D4 =
 * today-only). Scoped to the caller's OWN log for the current LOCAL day (resolved
 * from the member's home_timezone, then an optional client tz, then UTC — the same
 * day the log was written under, so the right row is found); the action layer
 * resolves `profileId` from the session, so this lib fn never trusts a
 * client-supplied member id. A past day's log is intentionally NOT reversible here
 * (full historical reversal is out of scope — it would have to un-bridge freezes and
 * un-pay milestones).
 *
 * The exact reversal, in order:
 *   1. Delete the durable `practice_logs` row for (profile, practice, today).
 *   2. Delete the `engagement_events` idempotency row keyed
 *      `practice_log:{profile}:{practice}:{day}` — CRITICAL: leaving it silently
 *      blocks re-logging the same practice today (recordEngagementEvent would treat
 *      the next log as a duplicate no-op).
 *   3. Debit the EXACT Zaps the log granted: the amount stored on the row at log time
 *      (`zaps_awarded`) drives a single compensating zap_transactions row via
 *      `reverseZaps` (the trigger subtracts it from totals; awardZaps can't debit).
 *   4. Re-derive the streak with the dedicated recompute (NEVER the monotonic forward
 *      writer): rebuilds current/longest from the remaining logs, leaving freezes +
 *      paid milestones intact (today-only never has to un-bridge / un-pay).
 *   5. Best-effort: reverse the welcome.back / spark reward_grants THIS log created
 *      (so a re-log can re-roll them). The weekly attendance `streaks` tick and the
 *      creator validation payout are left alone by design.
 *
 * Idempotent: if there is no log for today, it returns `{ unlogged: false }` and
 * touches nothing (so a double-tap of the undo control can't double-debit).
 */
export async function unlogPractice(input: {
  profileId: string
  practiceId: string
  /** The member's IANA timezone from the client, used only when the profile has no
   *  home_timezone — must resolve to the SAME local day logPractice wrote under. */
  clientTimezone?: string | null
}): Promise<UnlogPracticeResult> {
  const { profileId, practiceId, clientTimezone = null } = input
  // The member's LOCAL day (home_timezone, then client tz, then UTC) — matches the
  // day logPractice keyed the row + idempotency under, so today's row is found.
  const day = await resolveMemberDay(profileId, clientTimezone)

  // Resolve the log row (and its stored grant) first. No row → nothing to un-log;
  // returning early here is what makes the whole path idempotent.
  const { data: logRow } = await db()
    .from('practice_logs')
    .select('id, zaps_awarded')
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
    .eq('logged_for', day)
    .maybeSingle()
  const row = logRow as { id: string; zaps_awarded: number | null } | null
  if (!row) return { unlogged: false, zapsReversed: 0 }

  // 1. Delete the durable log row (scoped to the caller + today).
  await db()
    .from('practice_logs')
    .delete()
    .eq('profile_id', profileId)
    .eq('practice_id', practiceId)
    .eq('logged_for', day)

  // 2. Delete the idempotency row — without this, re-logging today is silently a
  //    no-op (recordEngagementEvent sees the key and returns recorded=false).
  await db()
    .from('engagement_events')
    .delete()
    .eq('idempotency_key', `practice_log:${profileId}:${practiceId}:${day}`)

  // 3. Reverse the Zap grant EXACTLY. The row's stored amount is the true grant; a
  //    null (pre-feature row) reverses nothing rather than guessing. reverseZaps is a
  //    no-op for <= 0, so a zero-Zap practice debits nothing.
  let zapsReversed = 0
  try {
    const awarded = row.zaps_awarded ?? 0
    const r = await reverseZaps(profileId, awarded, {
      actionType: 'practice_log_reversed',
      metadata: { practiceId, day },
    })
    if (r.reversed) zapsReversed = -r.amount // r.amount is negative; show the magnitude
  } catch {
    // a reversal-write failure must never leave the log un-deletable; the row is
    // already gone, so re-logging works — the debit just didn't land
  }

  // 4. Re-derive the streak from the remaining logs (dedicated recompute, never the
  //    monotonic forward writer). Today-only scope keeps freezes + milestones intact.
  await recomputePracticeStreakAfterUnlog(profileId).catch(() => {})

  // 5. Best-effort: undo the one-shot bonus grants THIS log unlocked, so a re-log can
  //    re-roll them. Welcome Back is keyed by the return DAY; Spark by member+day. We
  //    only ever reverse the matching Zap grants (Spark Gems are rank-safe + tiny, and
  //    awardGems has no debit primitive, so we leave the Gem ledger untouched — the
  //    reward_grants claim row is removed so the day re-opens for a fresh roll/grant).
  try {
    const admin = db()
    // The Welcome Back grant is keyed by the RETURN DAY, not the practice: it is the member's
    // "you're back today" bonus, and ANY of today's logs legitimately keeps it earned. So only
    // reverse it when THIS un-log left the member with NO logs at all for `day` (re-count after
    // the delete above). If another practice still logs today, the grant stays + is NOT debited,
    // even though this practice's row created it; otherwise un-logging B after logging A would
    // wrongly debit the 10 Zaps that A keeps "back". Bounded (head count) + idempotent (the claim
    // row is what gates a re-grant; we only touch it when today is truly empty).
    const { count: remainingToday } = await admin
      .from('practice_logs')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('logged_for', day)
    const todayIsNowEmpty = (remainingToday ?? 0) === 0

    // Reverse the Welcome Back Zaps if this log paid them today AND no log for today remains.
    const { data: wb } = todayIsNowEmpty
      ? await admin
          .from('reward_grants')
          .select('reward_kind')
          .eq('profile_id', profileId)
          .eq('rule_key', `welcome.back:${day}`)
          .maybeSingle()
      : { data: null }
    if (wb) {
      const { ZAP_AMOUNTS } = await import('@/lib/zaps')
      await reverseZaps(profileId, ZAP_AMOUNTS.welcome_back, {
        actionType: 'welcome_back_reversed',
        metadata: { day },
      })
      await admin
        .from('reward_grants')
        .delete()
        .eq('profile_id', profileId)
        .eq('rule_key', `welcome.back:${day}`)
    }
    // Re-open today's Spark by removing the claim row (so a re-log can roll again). The
    // tiny Gem payout is rank-safe and left in the ledger; only the cap claim is cleared.
    await admin
      .from('reward_grants')
      .delete()
      .eq('profile_id', profileId)
      .eq('rule_key', `spark:${profileId}:${day}`)
  } catch {
    // a best-effort bonus reversal must never break the un-log
  }

  return { unlogged: true, zapsReversed }
}
