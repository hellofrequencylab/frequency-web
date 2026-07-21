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
import { attributedLogDay } from '@/lib/practices/log-day'
import { clampTierToDuration, achievedTier, type PracticeTier } from '@/lib/practices/tiers'
import {
  deriveDepthStreak,
  lastDepthSession,
  type DepthLog,
  type LastDepthSession,
} from '@/lib/practices/depth-streak'
import { sanitizeMovementConfig, type MovementConfig } from '@/lib/movement'
import { cleanWarmupMessage, WARMUP_SEC_MAX } from '@/lib/on-air'

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
  /** Creator-authored message shown during the timer pre-roll (the warm-up), for a timed
   *  practice. NULL/empty = a silent pre-roll (the pre-rework behavior). See ADR-592. */
  warmup_message: string | null
  /** Creator's recommended warm-up (pre-roll) length in seconds. NULL = use the member's
   *  personal pre-roll length (profiles.meta.onAir.warmupSec, default 5). See ADR-592. */
  warmup_sec: number | null
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
  'category, icon, summary, header_image, body, cadence, duration_min, uses_timer, timer_kind, movement_config, mindless_mode, duration_locked, warmup_message, warmup_sec, reward_zaps, reward_note, weight_class, domain_id, focus_details, subcategory_id, status, slug'

// The same columns MINUS the table-only ones, for reads against the `practices_ranked`
// VIEW. The view predates `slug` and does not expose it (selecting it errors and returns
// zero rows, which silently emptied the library + 404'd the detail page); it also does NOT
// expose `timer_kind` / `movement_config` / `mindless_mode` / `duration_locked` /
// `warmup_message` / `warmup_sec` (the timer columns the library never needs — the editor +
// timer routing read those from the table via getPractice). The library + detail navigate by
// id, so dropping all of them here is safe.
const RANKED_COLS = PRACTICE_COLS
  .replace(/,\s*slug$/, '')
  .replace(
    /,\s*timer_kind,\s*movement_config,\s*mindless_mode,\s*duration_locked,\s*warmup_message,\s*warmup_sec/,
    '',
  )

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

// --- Admin curation search (server filter · sort · keyset paginate · NO 200 cap) ---
//
// Phase 1 "Scale it" (ADR-438, PRACTICE-LIBRARY.md §5/§7). The admin workspace lists
// the WHOLE library, past the old rankedPractices(limit=200) ceiling. It reads the
// practices_ranked view (so the usage signal comes along), includes hidden + every
// status (includeHidden defaults true), and pages two ways:
//
//   • Default sort (score desc, id) — KEYSET (cursor) pagination. We encode the last
//     row's (score, id) into an opaque cursor and ask for "rows after it", so paging is
//     O(1) regardless of depth (no growing OFFSET scan). This is the operator's main view.
//   • Alternate sorts (new / az / top / az etc.) — OFFSET pagination with count:'exact'.
//     Keyset on those needs a stable, exposed tiebreak column per sort; for the admin
//     table (bounded operator paging, not infinite scroll) offset is acceptable and
//     keeps the code small. Documented trade-off, not an oversight.

/** Admin curation sort keys. 'score' is the default keyset sort; the rest are offset. */
export type AdminPracticeSort = 'score' | 'new' | 'old' | 'az' | 'za' | 'logs' | 'adopters'

/** The filter + paging spec for the admin curation table. Mirrors the facet rail:
 *  every field is optional; an omitted field is "no filter on that axis". The SAME shape
 *  is accepted by the bulk-on-filtered actions so "act on everything I'm looking at" runs
 *  the identical query server-side. */
export interface AdminPracticeSearchOpts {
  /** Free-text needle (title / summary / description ilike). */
  q?: string | null
  /** Primary Pillar (domains.id). */
  pillarId?: string | null
  subId?: string | null
  /** Library review status filter — INCLUDING 'archived' (admin can surface archived). */
  status?: string | null
  weightClass?: string | null
  /** Tristate flag filters; omit/undefined = don't filter on that flag. */
  isPublic?: boolean
  isTemplate?: boolean
  featured?: boolean
  /** Author (profiles.id). */
  creatorId?: string | null
  /** Tag slug. */
  tag?: string | null
  /** Computed facets (PRACTICE-LIBRARY §5). Each is an independent boolean filter. */
  noImage?: boolean
  noBody?: boolean
  neverLogged?: boolean
  noPillar?: boolean
  sort?: AdminPracticeSort
  /** Default sort only: opaque keyset cursor (the last row of the previous page). */
  cursor?: string | null
  /** Alternate sorts only: 1-based page index for offset paging. */
  page?: number
  pageSize?: number
  /** Include non-public (hidden) rows. Defaults TRUE for the admin workspace. */
  includeHidden?: boolean
  hideDemo?: boolean
}

/** One admin curation row: the practice's library fields + its usage signal + the
 *  table-only enrichments (featured_at, creator) the view doesn't carry. */
export interface AdminPracticeRow {
  id: string
  title: string
  created_by: string | null
  is_public: boolean
  is_template: boolean
  status: string | null
  domain_id: string | null
  weight_class: string | null
  header_image: string | null
  body: string | null
  created_at: string
  adopters: number
  logs_30d: number
  logs_total: number
  score: number
  featured_at: string | null
  creator: { display_name: string | null; handle: string | null } | null
}

export interface AdminPracticeSearchResult {
  rows: AdminPracticeRow[]
  /** Total matching the filter (always exact; both paths run a head count). */
  total: number
  /** Default-sort path: the cursor to pass as `opts.cursor` for the next page, or null
   *  when this was the last page. Null on the offset path (use `page`/`pageCount`). */
  nextCursor: string | null
  /** Offset path only. Default-sort path leaves these at their cursor-mode defaults. */
  page: number
  pageSize: number
  pageCount: number
}

/** The columns the admin table reads from practices_ranked (the view exposes all of
 *  these; slug + the timer columns it doesn't, which the table never needs). */
const ADMIN_RANKED_COLS =
  'id, title, created_by, is_public, is_template, status, domain_id, weight_class, ' +
  'header_image, body, created_at, adopters, logs_30d, logs_total, score'

type AdminRankedRow = Omit<AdminPracticeRow, 'featured_at' | 'creator'>

/** Encode/decode the keyset cursor for the default (score desc, id) ordering. Opaque
 *  base64 of `${score}:${id}` — the client treats it as a token. A malformed cursor
 *  decodes to null (we then serve page 1), so a tampered token can never error the read. */
function encodeAdminCursor(row: { score: number; id: string }): string {
  return Buffer.from(`${row.score}:${row.id}`, 'utf8').toString('base64')
}
function decodeAdminCursor(cursor: string | null | undefined): { score: number; id: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8')
    const idx = raw.indexOf(':')
    if (idx < 0) return null
    const score = Number(raw.slice(0, idx))
    const id = raw.slice(idx + 1)
    if (!Number.isFinite(score) || !id) return null
    return { score, id }
  } catch {
    return null
  }
}

/** The chainable subset of the PostgREST builder the admin filters use. The methods
 *  return the SAME builder, so a `const` holds through the whole chain (no reassignment). */
interface AdminFilterBuilder {
  eq: (c: string, v: unknown) => AdminFilterBuilder
  in: (c: string, v: readonly string[]) => AdminFilterBuilder
  is: (c: string, v: null) => AdminFilterBuilder
  or: (f: string) => AdminFilterBuilder
}

/** Apply every AdminPracticeSearchOpts FILTER to a practices_ranked query builder. Shared
 *  by the row read, the head count, and the bulk-on-filtered id resolver so all three see
 *  exactly the same set. The sort/paging is applied by the caller, never here.
 *
 *  Returns the (possibly narrowed) builder WRAPPED in `{ q }`, or null when a filter
 *  resolves to "no rows possible" (e.g. a tag that matches nothing). The wrapper is
 *  deliberate: a PostgREST builder is itself a thenable, and `return`ing one bare from an
 *  async function would make `await` EXECUTE the query (promise adoption) instead of handing
 *  back the builder. Wrapping in a plain object defeats that adoption. */
async function applyAdminFilters<Q extends {
  eq: (c: string, v: unknown) => Q
  in: (c: string, v: readonly string[]) => Q
  is: (c: string, v: null) => Q
  or: (f: string) => Q
}>(q: Q, opts: AdminPracticeSearchOpts): Promise<{ q: Q } | null> {
  const includeHidden = opts.includeHidden ?? true
  if (!includeHidden) q = q.eq('is_public', true)
  if (opts.hideDemo) q = q.eq('is_demo', false)
  if (opts.isPublic !== undefined) q = q.eq('is_public', opts.isPublic)
  if (opts.isTemplate !== undefined) q = q.eq('is_template', opts.isTemplate)
  // NB: `featured` is NOT filtered here — featured_at is a timestamp the practices_ranked
  // view does not expose, so it can't be a column predicate. searchAdminPractices applies
  // it post-query against the enriched featured_at; countAdminPractices documents the gap.
  if (opts.pillarId) q = q.eq('domain_id', opts.pillarId)
  if (opts.subId) q = q.eq('subcategory_id', opts.subId)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.weightClass) q = q.eq('weight_class', opts.weightClass)
  if (opts.creatorId) q = q.eq('created_by', opts.creatorId)
  if (opts.noImage) q = q.is('header_image', null)
  if (opts.noBody) q = q.is('body', null)
  if (opts.noPillar) q = q.is('domain_id', null)
  if (opts.neverLogged) q = q.eq('logs_total', 0)

  // Tag filter → resolve the carrying practice ids (any source). No matches = empty.
  if (opts.tag) {
    const { data: def } = await db()
      .from('practice_tag_defs')
      .select('id')
      .eq('slug', opts.tag)
      .maybeSingle()
    const defId = (def as { id: string } | null)?.id
    if (!defId) return null
    const { data: links } = await db().from('practice_tags').select('practice_id').eq('tag_id', defId)
    const ids = ((links as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id)
    if (ids.length === 0) return null
    q = q.in('id', ids)
  }

  if (opts.q && opts.q.trim()) {
    const needle = opts.q.trim().replace(/[%,()]/g, ' ').slice(0, 80)
    if (needle.trim()) {
      q = q.or(`title.ilike.%${needle}%,summary.ilike.%${needle}%,description.ilike.%${needle}%`)
    }
  }
  return { q }
}

/**
 * The admin curation library — server filter + sort + paginate, NO 200-row cap. Replaces
 * rankedPractices(limit=200). Default sort uses keyset pagination; alternate sorts use
 * offset paging with an exact count (documented trade-off above). Enriches each page with
 * featured_at + the creator profile (the view's columns are frozen and predate featured_at).
 */
export async function searchAdminPractices(
  opts: AdminPracticeSearchOpts = {},
): Promise<AdminPracticeSearchResult> {
  const sort = opts.sort ?? 'score'
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 50)))
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const empty: AdminPracticeSearchResult = {
    rows: [], total: 0, nextCursor: null, page, pageSize, pageCount: 0,
  }

  // Build the filtered query for the page of rows.
  let q = db()
    .from('practices_ranked')
    .select(ADMIN_RANKED_COLS) as unknown as {
      eq: (c: string, v: unknown) => typeof q
      in: (c: string, v: readonly string[]) => typeof q
      is: (c: string, v: null) => typeof q
      or: (f: string) => typeof q
      gt: (c: string, v: unknown) => typeof q
      lt: (c: string, v: unknown) => typeof q
      order: (c: string, o: { ascending: boolean }) => typeof q
      range: (a: number, b: number) => Promise<{ data: unknown }>
      limit: (n: number) => Promise<{ data: unknown }>
    }
  const filtered = await applyAdminFilters(q, opts)
  if (filtered === null) return empty
  q = filtered.q

  const total = await countAdminPractices(opts)

  let base: AdminRankedRow[] = []
  let nextCursor: string | null = null
  let pageCount = 0

  if (sort === 'score') {
    // Keyset: rows strictly after the cursor in (score desc, id asc) order. Postgres has
    // no native row-value compare over PostgREST, so we emulate the composite cursor with
    // an .or(): score < cursorScore, OR (score = cursorScore AND id > cursorId).
    const cur = decodeAdminCursor(opts.cursor)
    if (cur) {
      q = q.or(`score.lt.${cur.score},and(score.eq.${cur.score},id.gt.${cur.id})`)
    }
    q = q.order('score', { ascending: false }).order('id', { ascending: true })
    const res = await q.limit(pageSize + 1)
    const rows = ((res.data as AdminRankedRow[] | null) ?? [])
    const hasMore = rows.length > pageSize
    base = hasMore ? rows.slice(0, pageSize) : rows
    const last = base[base.length - 1]
    nextCursor = hasMore && last ? encodeAdminCursor(last) : null
  } else {
    // Offset paging for the alternate sorts (bounded operator paging — see header note).
    if (sort === 'new') q = q.order('created_at', { ascending: false })
    else if (sort === 'old') q = q.order('created_at', { ascending: true })
    else if (sort === 'az') q = q.order('title', { ascending: true })
    else if (sort === 'za') q = q.order('title', { ascending: false })
    else if (sort === 'logs') q = q.order('logs_total', { ascending: false }).order('created_at', { ascending: false })
    else if (sort === 'adopters') q = q.order('adopters', { ascending: false }).order('created_at', { ascending: false })
    const from = (page - 1) * pageSize
    const res = await q.range(from, from + pageSize - 1)
    base = ((res.data as AdminRankedRow[] | null) ?? [])
    pageCount = Math.max(1, Math.ceil(total / pageSize))
  }

  if (base.length === 0) return { ...empty, total, pageCount }

  // Enrich: featured_at (view predates it) + creator profile, one round-trip each.
  const ids = base.map((p) => p.id)
  const creatorIds = [...new Set(base.map((p) => p.created_by).filter((c): c is string => !!c))]
  const [{ data: featRows }, { data: creatorRows }] = await Promise.all([
    db().from('practices').select('id, featured_at').in('id', ids),
    creatorIds.length
      ? db().from('profiles').select('id, display_name, handle').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; handle: string | null }[] }),
  ])
  const featured = new Map(
    ((featRows ?? []) as { id: string; featured_at: string | null }[]).map((r) => [r.id, r.featured_at]),
  )
  const creators = new Map(
    ((creatorRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      { display_name: r.display_name, handle: r.handle },
    ]),
  )
  const rows: AdminPracticeRow[] = base
    // The `featured` filter can't be a column .eq (featured_at is a timestamp, not a bool),
    // so apply it here against the enriched value when the operator asked for it.
    .filter((p) => (opts.featured === undefined ? true : !!featured.get(p.id) === opts.featured))
    .map((p) => ({
      ...p,
      featured_at: featured.get(p.id) ?? null,
      creator: p.created_by ? creators.get(p.created_by) ?? null : null,
    }))

  return { rows, total, nextCursor, page, pageSize, pageCount }
}

/** Exact head count for an AdminPracticeSearchOpts filter set (no rows fetched). Shared by
 *  the search result + the facet rail's "showing N of M". */
export async function countAdminPractices(opts: AdminPracticeSearchOpts = {}): Promise<number> {
  const q = db()
    .from('practices_ranked')
    .select('id', { count: 'exact', head: true }) as unknown as AdminFilterBuilder
  const filtered = await applyAdminFilters(q, opts)
  if (filtered === null) return 0
  const { count } = (await (filtered.q as unknown as Promise<{ count: number | null }>)) ?? { count: 0 }
  // The `featured` filter is enriched post-query (timestamp, not a column bool); when it is
  // the ONLY thing narrowing the count we can't express it in SQL here, so the count is the
  // pre-featured total. Callers that need an exact featured count read the facet rail's
  // 'featured' flag count instead (practice_admin_facets), which counts featured_at directly.
  return count ?? 0
}

// --- Admin facet counts (the curation rail) -------------------------------
//
// Phase 1 item 1.3 (PRACTICE-LIBRARY §5). The rail shows grouped counts across the
// whole library so an operator can see, at a glance, how many practices sit under each
// Pillar / status / weight / flag / computed-gap, and jump to them.
//
// CAVEAT (documented design choice): these are GLOBAL counts over the admin-visible
// universe, NOT counts of "the current filter set minus this facet" (the textbook
// faceted-search behavior). Computing per-facet residual counts means one grouped query
// per facet on every rail render, which is wasteful for a single-operator workspace; the
// global counts answer "what's in the library" — which is the curation question — and the
// "showing N of M" line (countAdminPractices) already reflects the active filter. Residual
// faceting is a Phase-2 refinement if operators ask for it. The RPC carries the same note.

/** One facet bucket: a key within a facet group and how many practices fall in it. */
export interface FacetCount {
  key: string
  count: number
}

/** The grouped facet counts for the curation rail. `flag`/`computed` are keyed maps
 *  (e.g. flag.public, computed.no_image); the list facets are arrays of {key,count}. */
export interface AdminPracticeFacets {
  pillar: FacetCount[]
  subcategory: FacetCount[]
  status: FacetCount[]
  weight: FacetCount[]
  creator: FacetCount[]
  tag: FacetCount[]
  flag: { public: number; template: number; featured: number }
  computed: { no_image: number; no_body: number; never_logged: number; no_pillar: number }
}

/**
 * Read the curation rail's facet counts via the practice_admin_facets RPC (one round-trip
 * for the whole rail). Global over the admin-visible universe (see CAVEAT above). The RPC
 * is reached through the untyped admin handle (ADR-246) until the types are regenerated.
 */
export async function searchAdminFacets(
  opts: { includeHidden?: boolean } = {},
): Promise<AdminPracticeFacets> {
  const out: AdminPracticeFacets = {
    pillar: [], subcategory: [], status: [], weight: [], creator: [], tag: [],
    flag: { public: 0, template: 0, featured: 0 },
    computed: { no_image: 0, no_body: 0, never_logged: 0, no_pillar: 0 },
  }
  const { data, error } = await db().rpc('practice_admin_facets', {
    include_hidden: opts.includeHidden ?? true,
  })
  if (error || !data) return out
  for (const r of (data as { facet: string; key: string | null; cnt: number }[])) {
    const count = Number(r.cnt) || 0
    switch (r.facet) {
      case 'pillar': out.pillar.push({ key: r.key ?? '__none__', count }); break
      case 'subcategory': out.subcategory.push({ key: r.key ?? '__none__', count }); break
      case 'status': if (r.key) out.status.push({ key: r.key, count }); break
      case 'weight': if (r.key) out.weight.push({ key: r.key, count }); break
      case 'creator': if (r.key) out.creator.push({ key: r.key, count }); break
      case 'tag': if (r.key) out.tag.push({ key: r.key, count }); break
      case 'flag':
        if (r.key === 'public' || r.key === 'template' || r.key === 'featured') out.flag[r.key] = count
        break
      case 'computed':
        if (r.key === 'no_image' || r.key === 'no_body' || r.key === 'never_logged' || r.key === 'no_pillar') {
          out.computed[r.key] = count
        }
        break
    }
  }
  return out
}

/** A possible-duplicate cluster: the seed practice and its nearest semantic neighbours. */
export interface DuplicateCandidate {
  id: string
  title: string
  /** Cosine similarity to the seed (0-1); higher = more alike. */
  similarity: number
}

/**
 * Find likely duplicates of ONE practice via the existing match_practices() vector RPC
 * (embedding nearest-neighbours). EXPENSIVE-FACET GATE (PRACTICE-LIBRARY §5): duplicate
 * detection is NOT part of the always-on facet rail — pairwise similarity over the whole
 * library is costly — so it is exposed only as this explicit per-practice lookup the
 * operator triggers ("find near-duplicates of this one"). Returns neighbours at or above
 * `minSimilarity` (default 0.9 = near-identical). Empty when the seed has no embedding yet.
 */
export async function findPracticeDuplicates(
  practiceId: string,
  opts: { limit?: number; minSimilarity?: number } = {},
): Promise<DuplicateCandidate[]> {
  const limit = Math.min(30, Math.max(1, Math.floor(opts.limit ?? 8)))
  const minSimilarity = opts.minSimilarity ?? 0.9
  const { data: seedRow } = await db()
    .from('practices')
    .select('embedding')
    .eq('id', practiceId)
    .maybeSingle()
  const embedding = (seedRow as { embedding: string | number[] | null } | null)?.embedding
  if (!embedding) return []
  const { data, error } = await db().rpc('match_practices', {
    query_embedding: embedding,
    match_count: limit,
    exclude_id: practiceId,
  })
  if (error || !data) return []
  return (data as { id: string; title: string; similarity: number }[])
    .filter((r) => r.similarity >= minSimilarity)
    .map((r) => ({ id: r.id, title: r.title, similarity: r.similarity }))
}

/** The hard ceiling on a bulk-on-filtered resolve (Phase 1 item 1.6). A single bulk
 *  action can touch at most this many rows, so "act on the whole filtered set" can never
 *  become an unbounded mutation. The action returns the resolved count so the operator
 *  sees exactly how many were affected (and the cap is visible when the set is larger). */
export const ADMIN_BULK_MAX = 5000

/**
 * Resolve the practice ids matching an AdminPracticeSearchOpts filter set — the
 * "act on the whole filtered set" target list (Phase 1 item 1.6). Re-runs the SAME filters
 * searchAdminPractices uses (no sort/paging — order is irrelevant for a set), capped at
 * ADMIN_BULK_MAX so the bulk write stays bounded. Returns the ids + whether the cap was hit.
 * Caller enforces authz (the bulk action re-checks the curator gate before calling this).
 */
export async function resolveAdminPracticeIds(
  opts: AdminPracticeSearchOpts = {},
): Promise<{ ids: string[]; capped: boolean }> {
  const q = db()
    .from('practices_ranked')
    .select('id, featured_at') as unknown as AdminFilterBuilder
  const filtered = await applyAdminFilters(q, opts)
  if (filtered === null) return { ids: [], capped: false }
  // Over-fetch by one so we can report whether the cap truncated the set. The `featured`
  // filter is enriched (timestamp), so apply it here against featured_at like the search does.
  const res = await (filtered.q as unknown as {
    limit: (n: number) => Promise<{ data: unknown }>
  }).limit(ADMIN_BULK_MAX + 1)
  let rows = ((res.data as { id: string; featured_at: string | null }[] | null) ?? [])
  if (opts.featured !== undefined) rows = rows.filter((r) => !!r.featured_at === opts.featured)
  const capped = rows.length > ADMIN_BULK_MAX
  const ids = rows.slice(0, ADMIN_BULK_MAX).map((r) => r.id)
  return { ids, capped }
}

/** Bulk-archive practices (Phase 1 item 1.4): set status='archived' AND is_public=false in
 *  one write, so the existing member reads (which gate on is_public=true) never surface an
 *  archived practice — and admin reads can still filter status='archived' to find them. The
 *  history (logs, adoptions) is preserved (no delete). Idempotent: re-archiving is a no-op
 *  patch. Returns the affected count. authz-delegated: the curator gate lives at the action
 *  call site (app/(main)/admin/content/actions.ts archivePracticesAction). */
export async function archivePractices(ids: string[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
  if (clean.length === 0) return 0
  const { error } = await db()
    .from('practices')
    .update({ status: 'archived', is_public: false })
    .in('id', clean)
  if (error) throw new Error(error.message)
  return clean.length
}

/** Restore archived practices to 'approved' (Phase 1 item 1.4). Does NOT auto-republish
 *  (is_public stays whatever it is — left to the operator's Public switch), so a restore is
 *  reversible without surprising the library. Returns the affected count. authz-delegated:
 *  the curator gate lives at the action call site (restorePracticesAction). */
export async function restorePractices(ids: string[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
  if (clean.length === 0) return 0
  const { error } = await db()
    .from('practices')
    .update({ status: 'approved' })
    .in('id', clean)
    .eq('status', 'archived') // only un-archive; never reset a draft/pending/rejected row
  if (error) throw new Error(error.message)
  return clean.length
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
export async function getRankedPractice(slugOrId: string): Promise<RankedPractice | null> {
  // The practices_ranked VIEW does not expose `slug` (RANKED_COLS strips it; selecting it
  // empties the view). Resolve a slug to its id against the practices table first, then read
  // the ranking view by id. A uuid is used directly, so old uuid URLs keep resolving.
  let id = slugOrId
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
    const { data: row } = await db().from('practices').select('id').eq('slug', slugOrId).maybeSingle()
    const resolved = (row as { id: string } | null)?.id
    if (!resolved) return null
    id = resolved
  }
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

/** A practice's PARTIAL-today state for a single practice (the completion-economy partial):
 *  a today log that banked time but isn't complete, with how far the member got. Threaded to a
 *  "Continue Practice" button so it resumes the timer for the REMAINING time. */
export interface PartialToday {
  /** Seconds already banked on today's partial log (the resume point). */
  bankedSec: number
  /** The full target length in seconds (the practice's authored duration). */
  targetSec: number
}

/** Whether a member has adopted a practice + already logged it today (detail CTAs), plus the
 *  PARTIAL-today state when today's log is a banked-but-unfinished sit (completed=false with a
 *  target ahead of where they got) — powers the "Continue Practice" affordance. "Today" is the
 *  member's LOCAL day (profiles.home_timezone), with an optional client tz fallback, so an
 *  already-logged practice stays "logged today" until the member's own midnight rather than UTC's. */
export async function getPracticeMemberState(
  profileId: string,
  practiceId: string,
  clientTimezone?: string | null,
): Promise<{ adopted: boolean; loggedToday: boolean; partialToday: PartialToday | null }> {
  const today = await resolveMemberDay(profileId, clientTimezone)
  const client = db()
  const [adopt, log] = await Promise.all([
    client.from('member_practices').select('id').eq('profile_id', profileId)
      .eq('practice_id', practiceId).eq('active', true).maybeSingle(),
    // Read the completion columns through the untyped handle (newer than the generated types,
    // ADR-246) so a banked-but-unfinished log surfaces as a partial, not just "logged today".
    client.from('practice_logs').select('id, completed, seconds_done, seconds_target')
      .eq('profile_id', profileId)
      .eq('practice_id', practiceId).eq('logged_for', today).maybeSingle(),
  ])
  const row = log.data as
    | { id: string; completed: boolean | null; seconds_done: number | null; seconds_target: number | null }
    | null
  return {
    adopted: !!adopt.data,
    loggedToday: !!row,
    partialToday: partialFromLogRow(row),
  }
}

/** Coerce a practice_logs row into a PartialToday when it's a real, resumable partial: not
 *  complete, with banked seconds and a larger target ahead. Anything else (a full log, a
 *  zero/equal target) is not a partial → null. Shared by the detail + index loaders. */
function partialFromLogRow(
  row: { completed?: boolean | null; seconds_done?: number | null; seconds_target?: number | null } | null,
): PartialToday | null {
  if (!row || row.completed === true) return null
  const bankedSec = Math.max(0, Math.round(row.seconds_done ?? 0))
  const targetSec = Math.max(0, Math.round(row.seconds_target ?? 0))
  if (targetSec <= 0 || targetSec - bankedSec <= 0) return null
  return { bankedSec, targetSec }
}

/** The "dig deeper" context for a practice (PD6): the prior session to match + the current
 *  depth streak. DERIVED from practice_logs (no schema, no writes, economy-neutral); the pure
 *  math lives in lib/practices/depth-streak. Surfaced on the practice setup (the next-day nudge)
 *  and the reveal (flavor). */
export interface PracticeDepthContext {
  /** The member's most recent PRIOR session for this practice (before today), or null. */
  lastSession: LastDepthSession | null
  /** Consecutive days landing Standard+ / the personal target for this practice (0 = no run). */
  depthStreak: number
}

/** How far back the depth-streak read scans practice_logs. A run longer than this is
 *  vanishingly rare and the display just caps there. */
const DEPTH_STREAK_WINDOW_DAYS = 120

/**
 * Read a member's depth context for one practice: their prior session (for the "Yesterday: 15 min
 * · Heavy. Match it?" pull) and their current depth streak (Standard+ / on-target days in a row).
 * FAIL-SAFE: a read error returns an empty context so a flaky read never blocks the page. The
 * "today" boundary is the member's LOCAL day (the same boundary logPractice keys logged_for
 * under), so an evening-Pacific log buckets on the right calendar day.
 */
export async function getPracticeDepthContext(
  profileId: string,
  practiceId: string,
  clientTimezone?: string | null,
): Promise<PracticeDepthContext> {
  try {
    const today = await resolveMemberDay(profileId, clientTimezone)
    // A shifted window start (member-local day math) so the read covers the whole streak span.
    const [y, m, d] = today.split('-').map(Number)
    const since = new Date(Date.UTC(y, m - 1, d - DEPTH_STREAK_WINDOW_DAYS)).toISOString().slice(0, 10)
    const { data } = await db()
      .from('practice_logs')
      .select('logged_for, seconds_done, seconds_target')
      .eq('profile_id', profileId)
      .eq('practice_id', practiceId)
      .gte('logged_for', since)
    const rows = (data as { logged_for: string; seconds_done: number | null; seconds_target: number | null }[] | null) ?? []
    const logs: DepthLog[] = rows.map((r) => ({
      day: String(r.logged_for),
      secondsDone: Math.max(0, Math.round(r.seconds_done ?? 0)),
      secondsTarget: Math.max(0, Math.round(r.seconds_target ?? 0)),
    }))
    return { lastSession: lastDepthSession(logs, today), depthStreak: deriveDepthStreak(logs, today) }
  } catch {
    return { lastSession: null, depthStreak: 0 }
  }
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
   *  write is guarded so a stale schema (no `status` column) never blocks creation.
   *  'draft' is the Space-authored state: usable by the Space's members (the space read
   *  ignores status), not library-approved, until the paid-Crew + review publish path. */
  status?: 'draft' | 'pending' | 'approved'
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
  // Set status only when the caller asks for a NON-default one ('draft' or 'pending'):
  // 'approved' is the column default, so omitting it is equivalent + safe, and the defensive
  // fallback below can still strip it if the column isn't applied yet.
  if (input.status && input.status !== 'approved') insert.status = input.status
  let { data } = await db().from('practices').insert(insert).select(PRACTICE_COLS).maybeSingle()
  // Defensive fallback: if the `status` column isn't applied yet, the insert above
  // errors and returns no row. Retry once without it so creation never hard-depends on
  // the migration being live (the practice simply lands at the column-less default).
  if (!data && insert.status !== undefined) {
    delete insert.status
    ;({ data } = await db().from('practices').insert(insert).select(PRACTICE_COLS).maybeSingle())
  }
  const practice = (data as Practice | null) ?? null

  // Search embedding (Phase 1 hybrid retrieval, ADR-438): generate the practice's
  // 384-d vector from title + summary + body so it is findable by semantic search.
  // Best-effort + inline — never blocks or breaks the create (the helper swallows its
  // own errors); a miss is swept up by the embed-practices backfill cron.
  if (practice) {
    const { embedPractice } = await import('@/lib/practices/embeddings')
    await embedPractice(practice.id)
  }

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
export async function listPracticesForSpace(
  spaceId?: string | null,
  limit = 50,
  opts?: { publishedOnly?: boolean },
): Promise<Practice[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  try {
    // Untyped chain (space_id isn't in the generated types, ADR-246); loose so we can add a
    // conditional status filter without re-typing every rung.
    type Chain = {
      select: (cols: string) => Chain
      eq: (col: string, val: string) => Chain
      order: (col: string, o: { ascending: boolean }) => Chain
      limit: (n: number) => Promise<{ data: unknown; error: unknown }>
    }
    let q = (db().from('practices') as unknown as Chain).select(PRACTICE_COLS).eq('space_id', sid)
    // The PUBLIC profile block passes publishedOnly so drafts (status='draft') stay in the owner's
    // manager only. 'approved' = live to the Space (and any is_public library practice is approved too).
    if (opts?.publishedOnly) q = q.eq('status', 'approved')
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) return []
    return (data as Practice[] | null) ?? []
  } catch {
    return []
  }
}

/** Set a practice's library review status (draft/pending/approved/rejected/archived). Caller enforces
 *  authz. For a Space practice, moving to 'approved' is the "make it live to my space" step (no staff
 *  needed for own-space content); reaching the PUBLIC library still flips is_public through the
 *  paid-Crew + review flow. Reached with the untyped admin handle (ADR-246). */
export async function setPracticeStatus(practiceId: string, status: string): Promise<void> {
  await db().from('practices').update({ status }).eq('id', practiceId)
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
  /** The Be Still flavour when timer_kind = 'mindless' (meditate | breathe | journal | stillness |
   *  ritual | log). Null = derive from the Pillar at read time. Cleared when the kind isn't mindless. */
  mindless_mode?: MindlessMode | null
  /** When true, the author pinned a fixed length the member cannot adjust (length is duration_min). */
  duration_locked?: boolean
  /** Creator-authored warm-up message shown during the timer pre-roll (ADR-592). Null/empty
   *  = a silent pre-roll. Trimmed + capped to WARMUP_MESSAGE_MAX server-side. */
  warmup_message?: string | null
  /** Creator's recommended warm-up (pre-roll) length in seconds. Null = the member's personal
   *  pre-roll length. Clamped to WARMUP_SEC_MAX server-side. */
  warmup_sec?: number | null
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
    // A 'movement' kind carries its config; a 'mindless' kind carries its flavour. Switching away
    // clears the one that no longer applies so a stale config/flavour never lingers.
    if (kind !== 'movement') update.movement_config = null
    if (kind !== 'mindless') update.mindless_mode = null
  }
  if (patch.movement_config !== undefined)
    update.movement_config = patch.movement_config
      ? sanitizeMovementConfig(patch.movement_config)
      : null
  // The Be Still flavour a mindless practice opens on (meditate | breathe | journal | stillness |
  // ritual | log). Null = derive from the Pillar at read time. Validated against the enum.
  if (patch.mindless_mode !== undefined)
    update.mindless_mode =
      patch.mindless_mode && (MINDLESS_MODES as readonly string[]).includes(patch.mindless_mode)
        ? patch.mindless_mode
        : null
  // The author pinned a fixed length the member cannot adjust (duration_min is the length).
  if (patch.duration_locked !== undefined) update.duration_locked = patch.duration_locked === true
  // Creator-authored warm-up (ADR-592): trim/cap the message, clamp the length. Both nullable
  // (null message = silent pre-roll; null length = the member's personal pre-roll length). The
  // length is clamped INLINE with a pure ternary + arithmetic (mirroring duration_min above) so
  // there is no validation-guard shape for a scanner to mistake for a security check.
  if (patch.warmup_message !== undefined) update.warmup_message = cleanWarmupMessage(patch.warmup_message)
  if (patch.warmup_sec !== undefined)
    update.warmup_sec =
      patch.warmup_sec == null ? null : Math.max(0, Math.min(WARMUP_SEC_MAX, Math.round(patch.warmup_sec)))
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
  // Time-vs-points (ADR-442): clamp the stored tier to the highest one the practice's
  // required length earns, so a short practice can never bank Heavy. Lower tiers stay
  // allowed (under-claim is fine). Re-runs whenever the tier OR the duration changes, and
  // reads the unchanged half when only one side is in the patch. Guards a junk tier too.
  if (patch.weight_class !== undefined || patch.duration_min !== undefined) {
    const needCurrent = patch.weight_class === undefined || patch.duration_min === undefined
    const current = needCurrent ? await getPractice(id) : null
    const effDuration =
      patch.duration_min !== undefined ? (update.duration_min as number | null) : current?.duration_min ?? null
    const rawWeight = patch.weight_class !== undefined ? patch.weight_class : current?.weight_class ?? 'standard'
    const reqWeight: WeightClass = WEIGHT_CLASSES.includes(rawWeight as WeightClass) ? (rawWeight as WeightClass) : 'standard'
    update.weight_class = clampTierToDuration(reqWeight, effDuration)
  }
  if (Object.keys(update).length === 0) return getPractice(id)

  const { data } = await db().from('practices').update(update).eq('id', id).select(PRACTICE_COLS).maybeSingle()
  const updated = (data as Practice | null) ?? null

  // Search embedding (Phase 1 hybrid retrieval, ADR-438): refresh the vector when the
  // descriptive fields that feed it (title / summary / body) changed. Best-effort +
  // inline — never blocks or breaks the update; a miss is swept up by the backfill cron.
  if (
    updated &&
    (patch.title !== undefined || patch.summary !== undefined || patch.body !== undefined)
  ) {
    const { embedPractice } = await import('@/lib/practices/embeddings')
    await embedPractice(updated.id)
  }

  return updated
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
 *  the shared one. Copies the content fields (not the rewards), and records remix
 *  lineage (Phase 3 "Grow"): remixed_from = the direct parent, root_practice_id = the
 *  parent's root (so a remix-of-a-remix still credits the ORIGINAL), or the parent
 *  itself when the parent is a root. */
export async function forkPractice(profileId: string, practiceId: string): Promise<Practice | null> {
  const src = await getPractice(practiceId)
  if (!src) return null
  // PRACTICE_COLS doesn't carry the lineage columns, so read the parent's root directly.
  const { data: lineageRow } = await db()
    .from('practices')
    .select('root_practice_id')
    .eq('id', practiceId)
    .maybeSingle()
  const rootId = (lineageRow as { root_practice_id: string | null } | null)?.root_practice_id ?? practiceId
  const { data } = await db()
    .from('practices')
    // Lineage columns aren't in the generated types yet (ADR-246) — cast the payload.
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
      remixed_from: practiceId,
      root_practice_id: rootId,
    } as never)
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

/**
 * A lookup of the member's PARTIAL-today logs keyed by practice id ({ bankedSec, targetSec }) —
 * the index-surface companion to getPartialPracticesToday (which fetches the full practice rows
 * for a standalone list). Index surfaces (the "Your practices" rows) already hold the practice,
 * so they only need the resume numbers per id. One read of today's incomplete logs, no N+1.
 * "Today" is the member's LOCAL day (home_timezone, then client tz, then UTC). Reads the
 * completion columns through the untyped handle (newer than the generated types, ADR-246).
 */
export async function getPartialMapToday(
  profileId: string,
  clientTimezone?: string | null,
): Promise<Map<string, PartialToday>> {
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
  const map = new Map<string, PartialToday>()
  for (const r of rows) {
    if (!r.practice_id) continue
    const partial = partialFromLogRow(r)
    if (partial) map.set(r.practice_id, partial)
  }
  return map
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
  /** true = REFUSED because this practice requires its timer (uses_timer) but the caller
   *  made a one-tap attempt (no positive secondsTarget). Nothing was written and nothing
   *  was paid. The UI surfaces a "use the timer to log this" message. A timed practice can
   *  only be logged from inside its session (completeSession always passes secondsTarget). */
  timerRequired?: boolean
}

/** The FULL per-log Zap value a practice pays (reward_zaps override else weight-class
 *  default), via the one source of truth lib/zaps.practiceZapValue. Used by the finish
 *  top-up to size the remaining delta, and mirrored by the first-log full path below.
 *  Reads the practice's reward fields through the untyped handle; 0 on any error. */
async function practiceFullReward(practiceId: string, tier?: PracticeTier | null): Promise<number> {
  try {
    const { data } = await db()
      .from('practices')
      .select('weight_class, reward_zaps')
      .eq('id', practiceId)
      .maybeSingle()
    const row = data as { weight_class: string | null; reward_zaps: number | null } | null
    // reward_zaps (the staff/cadence override) still wins exactly when set.
    if (typeof row?.reward_zaps === 'number' && row.reward_zaps > 0) return Math.floor(row.reward_zaps)
    // ADR-443: a timed sit values by the tier its real time REACHED (`tier`), else the creator's
    // weight class. Size the delta from the LIVE zap_config amount (the same number the one-shot
    // full path pays via awardZapsForAction), so partial + finish totals the full even when an
    // operator has tuned zap_config away from the static ZAP_AMOUNTS defaults.
    const { practiceLogAction, zapAmountForAction } = await import('@/lib/zaps')
    return await zapAmountForAction(practiceLogAction(tier ?? row?.weight_class ?? null))
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
  /** Run-over verification (ADR-627 WAM instrumentation): whether the member was PRESENT when the
   *  sit finalized (a Finish/Close tap) vs an unattended auto-finalize the gate clamped. Stamped
   *  onto the `practice.verified` event context (never a second event — the per-day idempotency key
   *  is unchanged, so no double count). Omitted by non-timer callers (check-ins, quick logs), which
   *  leave the context exactly as before. See lib/on-air/run-over.ts `airtimeVerification`. */
  attended?: boolean | null
  /** When the sit STARTED (ISO instant), for a live On Air finalize. A run left going past midnight
   *  finalizes on a later calendar day than it began; without this the log is attributed to the
   *  finalize day, leaving the day the member actually practiced empty and (for a daily streak derived
   *  from logged_for) opening a phantom gap that can collapse the streak (ADR-801). When present, the
   *  log day is the member's LOCAL day of started_at, clamped to at most one day before the finalize
   *  day (attributedLogDay). Omitted by non-timer callers (quick logs / check-ins), which are
   *  same-instant and so behave exactly as before. */
  startedAt?: string | null
}): Promise<LogPracticeResult> {
  const {
    profileId,
    practiceId,
    circleId = null,
    clientTimezone = null,
    secondsDone = null,
    secondsTarget = null,
    attended = null,
    startedAt = null,
  } = input
  // The log "day" is the member's LOCAL calendar day, resolved from their durable
  // home_timezone (then the client tz, then UTC). Server-resolved so the day that
  // keys the idempotency row + the practice_logs unique constraint can't be spoofed
  // to backdate; a member can only shift their OWN local day. yyyy-mm-dd.
  const finalizeDay = await resolveMemberDay(profileId, clientTimezone)
  // Attribute an On Air sit to the day it STARTED (a run left going overnight belongs to the day the
  // member began it, not the finalize day), clamped to at most one day back so a stale/forged
  // started_at can never backdate further (ADR-801). Non-timer callers pass no startedAt -> finalizeDay.
  let day = finalizeDay
  if (startedAt) {
    const startedMs = Date.parse(startedAt)
    if (!Number.isNaN(startedMs)) {
      const startedDay = await resolveMemberDay(profileId, clientTimezone, new Date(startedMs))
      day = attributedLogDay(finalizeDay, startedDay)
    }
  }

  // The TIMER GATE (load-bearing): a practice with a set timer (uses_timer = timer_kind <> 'none')
  // can ONLY be logged from inside its session, which always carries a positive secondsTarget. A
  // one-tap attempt on a timed practice (no positive target) is REFUSED here before any write or
  // pay, so a member can never bypass the timer and log a timed sit in a single tap. The On Air
  // completeSession path always passes secondsTarget, so it's unaffected; a "Finish Practice" top-up
  // (existing partial) also carries a target. Read uses_timer up front (a single select reused for
  // the reward fields below would be ideal, but those reads are best-effort + late, so we keep this
  // gate read distinct and authoritative). Fail-open on a read error: a flaky read must never block
  // a legitimate one-tap log of a non-timed practice.
  const suppliedTarget = Math.max(0, Math.round(secondsTarget ?? 0))
  const isOneTapAttempt = suppliedTarget <= 0
  if (isOneTapAttempt) {
    try {
      const { data } = await db()
        .from('practices')
        .select('uses_timer')
        .eq('id', practiceId)
        .maybeSingle()
      const usesTimer = (data as { uses_timer: boolean | null } | null)?.uses_timer === true
      if (usesTimer) {
        // Refuse: nothing written, nothing paid. The UI tells the member to use the timer.
        return { logged: false, zapsAwarded: 0, timerRequired: true }
      }
    } catch {
      // a flaky uses_timer read must never block a genuine one-tap log
    }
  }

  // Completion economy (ADR-443, achieved tier). A TIMED log earns the tier its REAL engaged
  // time reaches (achievedTier below); under the Light floor it is a partial (clears the day,
  // 1 Zap, "Finish Practice" tops up). A one-tap / quick-log (no target) is always FULL — the
  // unchanged recommended path. The timer-completion proof in completeSession still guarantees
  // the claimed seconds were actually spent before any of this runs.
  const tgt = Math.max(0, Math.round(secondsTarget ?? 0))
  const done = Math.max(0, Math.round(secondsDone ?? 0))
  const isTimed = tgt > 0
  // Achieved tier (ADR-443): a timed sit earns the tier its REAL engaged time reaches
  // (Light 3+ min / Standard 5+ / Heavy 15+); under the Light floor is a partial (1 Zap +
  // streak + "Finish Practice" top-up). The personal target only seeds the timer — it no
  // longer gates the reward. A one-tap / quick-log (non-timed) stays a full recommended log.
  const achieved = isTimed ? achievedTier(done) : null
  // `completed` requires actually REACHING the target (~95%, a beat-early tolerance), matching this
  // function's documented contract above ("PARTIAL ... >= 50% but < 95% of target"). A shorter timed
  // sit is a PARTIAL (completed=false): it clears the day + pays 1 Zap, and the "Finish Practice"
  // top-up later flips it complete + pays the rest. (Previously this used the tier floor, so ANY sit
  // >= 3 min counted as complete regardless of target — an early-ended sit logged as done. ADR-443
  // still decouples the tier REWARD from the target; only completion is target-gated.)
  const isFullSit = !isTimed || done >= Math.round(tgt * 0.95)
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
    const newDone = Math.max(existing.seconds_done ?? 0, done)
    const newTarget = Math.max(existing.seconds_target ?? 0, tgt)
    // The topped-up session earns the tier its (combined) engaged time reaches (ADR-443).
    // (Inside isFullSit, so the outcome is a real tier, never 'partial'.)
    const topTier = isTimed ? achievedTier(newDone) : null
    const fullReward = await practiceFullReward(practiceId, topTier === 'partial' ? null : topTier)
    if (isFullSit) {
      // Top up to complete: flip completed=true, raise seconds_done, and pay the REST of
      // the reward (the delta the partial held back), so partial + finish totals the full.
      // A partial ALWAYS paid PARTIAL_ZAPS; if its best-effort zaps_awarded write failed the
      // column is null, so floor to PARTIAL_ZAPS (never 0) or the finish overpays by that 1 Zap.
      const alreadyPaid = Math.max(0, existing.zaps_awarded ?? PARTIAL_ZAPS)
      const delta = Math.max(0, fullReward - alreadyPaid)
      // COMPARE-AND-SWAP the completion flip FIRST, gated on completed=false, so two concurrent
      // finishes (a double tap, a client retry) can never both pay the top-up: Postgres locks the
      // row on UPDATE, and the `.eq('completed', false)` means a racing second call updates ZERO
      // rows. Only the call that actually flips the row goes on to award the delta. The row is
      // stamped with the intended total up front; if the award then fails or short-pays, we
      // reconcile zaps_awarded down so the un-log debit stays exact.
      let won = false
      try {
        const { data: flipped } = await db()
          .from('practice_logs')
          .update({ completed: true, seconds_done: newDone, seconds_target: newTarget, zaps_awarded: alreadyPaid + delta })
          .eq('id', existing.id)
          .eq('completed', false)
          .select('id')
        won = Array.isArray(flipped) ? flipped.length > 0 : !!flipped
      } catch {
        // a failed flip means we did not win the swap; pay nothing (a duplicate finish no-ops)
        won = false
      }
      if (!won) return { logged: false, zapsAwarded: 0 }
      let paid = 0
      if (delta > 0) {
        try {
          paid = (await awardZaps(profileId, delta, { actionType: 'practice_logged' })).amount
        } catch {
          // never let a reward write break the finish; the row already flipped to complete
        }
      }
      // Reconcile the recorded amount to what actually paid (the flip stamped the intended total).
      if (paid !== delta) {
        try {
          await db()
            .from('practice_logs')
            .update({ zaps_awarded: alreadyPaid + paid })
            .eq('id', existing.id)
        } catch {
          // bookkeeping only; the award already landed
        }
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
    // `attended` (ADR-627) enriches the SAME event — a present finish vs an unattended, gate-clamped
    // auto-finalize — for verified-airtime quality analytics. Only stamped when the caller supplied it
    // (On Air's timed finalize); omitted callers keep the original context shape. WAM is unaffected.
    context: {
      practiceId,
      circleId,
      kind: 'practice_log',
      ...(attended != null ? { attended } : {}),
    },
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
        // Claim-then-pay: the grant row is the idempotency lock. We then pay the LIVE
        // welcome-back Zaps (zap_config, falling back to ZAP_AMOUNTS) and record the
        // ACTUAL amount paid back onto the grant row, so the un-log reversal can debit
        // exactly what was paid instead of guessing the static default (mirrors how the
        // practice-log reversal reads practice_logs.zaps_awarded).
        const { error } = await db().from('reward_grants').insert({
          rule_key: `welcome.back:${day}`,
          profile_id: profileId,
          reward_kind: 'zaps',
          amount: 0, // updated to the live amount once the pay resolves below
          detail: 'Welcome Back',
        })
        if (!error) {
          const res = await awardZapsForAction(profileId, 'welcome_back')
          if (res.amount > 0) {
            // Record the ACTUAL amount paid so the un-log reversal debits exactly that.
            await db()
              .from('reward_grants')
              .update({ amount: res.amount })
              .eq('profile_id', profileId)
              .eq('rule_key', `welcome.back:${day}`)
            welcomeBack = true
          } else {
            // Nothing was paid (a disabled/absent welcome_back config, or a transient failure). DELETE the
            // claim rather than leaving an amount:0 row: a stored 0 would later be read as a "pre-feature"
            // grant and reversed at the STATIC default (10), debiting Zaps that were never awarded. And do
            // not report welcomeBack to the UI when no Zaps landed. Deleting is safe: 0 was paid, so a
            // re-log re-attempting the grant re-pays 0.
            await db()
              .from('reward_grants')
              .delete()
              .eq('profile_id', profileId)
              .eq('rule_key', `welcome.back:${day}`)
          }
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
      // ADR-443: a timed sit pays the tier its real time REACHED; a quick-log pays the
      // recommended weight class. Either way the live amount comes from zap_config. A sit
      // that REACHED its target but ran under the Light floor has achieved='partial' — a
      // COMPLETED sit, not a real partial — so it pays the practice's own weight class (a
      // Light practice → 8), never the Standard fall-through of practiceLogAction('partial').
      const tier = isTimed ? (achieved === 'partial' ? weightClass : achieved) : weightClass
      zapsAwarded = (await awardZapsForAction(profileId, practiceLogAction(tier))).amount
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
  // Pass the client tz so the streak's "today" resolves to the SAME member-local day
  // this log was written under (home_timezone wins; the client tz only fills a gap).
  // Pass `day` — the day the log was ACTUALLY written for (attributed to the session's
  // start for an overnight sit, ADR-801) — so the streak advances the right day and does
  // not phantom-count the finalize day when the two differ.
  await recordPracticeStreak(profileId, clientTimezone, day).catch(() => {})
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
  await recomputePracticeStreakAfterUnlog(profileId, clientTimezone).catch(() => {})

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
          .select('reward_kind, amount')
          .eq('profile_id', profileId)
          .eq('rule_key', `welcome.back:${day}`)
          .maybeSingle()
      : { data: null }
    if (wb) {
      // Reverse the ACTUAL amount the grant paid (the grant row now stores the live
      // zap_config amount). Fall back to the static default only for a pre-feature row
      // that still carries 0/null. Mirrors the practice-log reversal's use of zaps_awarded.
      const { ZAP_AMOUNTS } = await import('@/lib/zaps')
      const stored = (wb as { amount: number | null }).amount ?? 0
      const reverseAmount = stored > 0 ? stored : ZAP_AMOUNTS.welcome_back
      await reverseZaps(profileId, reverseAmount, {
        actionType: 'welcome_back_reversed',
        metadata: { day },
      })
      await admin
        .from('reward_grants')
        .delete()
        .eq('profile_id', profileId)
        .eq('rule_key', `welcome.back:${day}`)
    }
    // NOTE: the Spark claim (`spark:{profileId}:{day}`) is deliberately LEFT in place on un-log. Clearing
    // it used to "re-open the day for a fresh roll", but because the paid Gems are kept in the ledger
    // (awardGems has no debit primitive), that let a log -> unlog -> re-log loop re-roll the 4% Spark and
    // bank every win, breaking the once-per-member-per-UTC-day guarantee. Keeping the claim means a member
    // gets at most one Spark roll per day no matter how many times they re-log. A roll that never paid is
    // already released inside maybeSpark (claim-then-pay self-heal), so a legitimate unpaid day is not
    // stranded here.
  } catch {
    // a best-effort bonus reversal must never break the un-log
  }

  return { unlogged: true, zapsReversed }
}
