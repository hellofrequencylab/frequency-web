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
import { awardZapsForAction } from '@/lib/zaps'
import { recordStreakActivity } from '@/lib/achievements'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

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
  cadence: string | null
  reward_zaps: number | null
  reward_note: string | null
  /** The Pillar this practice belongs to (domains.id), or null if uncategorized. */
  domain_id: string | null
  /** The sub-category within the Pillar (practice_subcategories.id), or null. */
  subcategory_id: string | null
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

export type PracticeSort = 'trending' | 'top' | 'new'

const PRACTICE_COLS =
  'id, title, description, created_by, is_public, is_template, created_at, ' +
  'category, icon, summary, header_image, body, cadence, reward_zaps, reward_note, domain_id, subcategory_id'

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
    .select(`${PRACTICE_COLS}, adopters, logs_30d, logs_total, score`)
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
      ...p,
      subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
      tags: tagsByPractice.get(p.id) ?? [],
    }
  })
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
  return row?.practice ?? null
}

export async function getMemberPractices(profileId: string): Promise<Practice[]> {
  const { data } = await db()
    .from('member_practices')
    .select(`practice:practices(${PRACTICE_COLS})`)
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false })
  const rows = (data as { practice: Practice | null }[] | null) ?? []
  return rows.map((r) => r.practice).filter((p): p is Practice => !!p)
}

/** A single practice with its popularity stats + display taxonomy, for the detail
 *  page. Reads the server-only ranking view (admin client bypasses RLS). */
export async function getRankedPractice(id: string): Promise<RankedPractice | null> {
  const { data } = await db()
    .from('practices_ranked')
    .select(`${PRACTICE_COLS}, adopters, logs_30d, logs_total, score`)
    .eq('id', id)
    .maybeSingle()
  const p = data as
    | (Practice & { adopters: number; logs_30d: number; logs_total: number; score: number })
    | null
  if (!p) return null
  const [subById, tagsByPractice] = await Promise.all([subcategoryMap(), tagsForPractices([p.id])])
  const sc = p.subcategory_id ? subById.get(p.subcategory_id) : null
  return {
    ...p,
    subcategory: sc ? { slug: sc.slug, name: sc.name } : null,
    tags: tagsByPractice.get(p.id) ?? [],
  }
}

/** Whether a member has adopted a practice + already logged it today (detail CTAs). */
export async function getPracticeMemberState(
  profileId: string,
  practiceId: string,
): Promise<{ adopted: boolean; loggedToday: boolean }> {
  const today = new Date().toISOString().slice(0, 10)
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
  isPublic?: boolean
}): Promise<Practice | null> {
  const { data } = await db()
    .from('practices')
    .insert({
      title: input.title,
      description: input.description ?? null,
      created_by: input.createdBy,
      is_public: input.isPublic ?? true,
    })
    .select(PRACTICE_COLS)
    .maybeSingle()
  return (data as Practice | null) ?? null
}

/** A single practice by id (for the editor + ownership checks). */
export async function getPractice(id: string): Promise<Practice | null> {
  const { data } = await db().from('practices').select(PRACTICE_COLS).eq('id', id).maybeSingle()
  return (data as Practice | null) ?? null
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
  category?: string | null
  icon?: string | null
  header_image?: string | null
  domain_id?: string | null
  subcategory_id?: string | null
}

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
  if (patch.category !== undefined) update.category = STR(patch.category, 40)
  if (patch.icon !== undefined) update.icon = STR(patch.icon, 40)
  if (patch.header_image !== undefined) update.header_image = STR(patch.header_image, 500)
  if (patch.domain_id !== undefined) update.domain_id = patch.domain_id || null
  if (patch.subcategory_id !== undefined) update.subcategory_id = patch.subcategory_id || null
  if (Object.keys(update).length === 0) return getPractice(id)

  const { data } = await db().from('practices').update(update).eq('id', id).select(PRACTICE_COLS).maybeSingle()
  return (data as Practice | null) ?? null
}

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

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
      category: src.category,
      icon: src.icon,
      header_image: src.header_image,
      domain_id: src.domain_id,
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
 *  "log today's practice" prompt on the feed. Empty if none adopted or all logged. */
export async function getPracticesToLogToday(profileId: string): Promise<Practice[]> {
  const mine = await getMemberPractices(profileId)
  if (mine.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db()
    .from('practice_logs')
    .select('practice_id')
    .eq('profile_id', profileId)
    .eq('logged_for', today)
  const logged = new Set(((data as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id))
  return mine.filter((p) => !logged.has(p.id))
}

// --- The North-Star emitter ----------------------------------------------

export interface LogPracticeResult {
  /** false = already logged this practice today (idempotent). */
  logged: boolean
  zapsAwarded: number
}

/**
 * Log that a member did a practice. Exactly-once per (member, practice, day):
 * emits `practice.verified` (WAM), writes a durable log row, and awards zaps +
 * an attendance streak tick. `circleId` records the circle context when the
 * practice came from a circle assignment.
 */
export async function logPractice(input: {
  profileId: string
  practiceId: string
  circleId?: string | null
}): Promise<LogPracticeResult> {
  const { profileId, practiceId, circleId = null } = input
  const day = new Date().toISOString().slice(0, 10) // yyyy-mm-dd

  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `practice_log:${profileId}:${practiceId}:${day}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: profileId,
    context: { practiceId, circleId, kind: 'practice_log' },
    verifiedAt: new Date(),
  })
  if (!recorded) return { logged: false, zapsAwarded: 0 }

  // Durable log row (unique on profile+practice+day mirrors the idempotency key).
  await db()
    .from('practice_logs')
    .upsert(
      { profile_id: profileId, practice_id: practiceId, circle_id: circleId, logged_for: day },
      { onConflict: 'profile_id,practice_id,logged_for', ignoreDuplicates: true },
    )

  // Verified practice earns zaps + an attendance streak tick (same as a check-in).
  // A practice may override the default reward via its `reward_zaps` column
  // (rewards the doing — a cold plunge is worth more than a journal entry).
  let overrideZaps: number | undefined
  try {
    const { data } = await db()
      .from('practices')
      .select('reward_zaps')
      .eq('id', practiceId)
      .maybeSingle()
    const rz = (data as { reward_zaps: number | null } | null)?.reward_zaps
    if (typeof rz === 'number') overrideZaps = rz
  } catch {
    // fall back to the default reward
  }

  let zapsAwarded = 0
  try {
    zapsAwarded = (await awardZapsForAction(profileId, 'practice_logged', overrideZaps)).amount
  } catch {
    // never let a reward read break the log
  }
  await recordStreakActivity(profileId, 'attendance').catch(() => {})

  return { logged: true, zapsAwarded }
}
