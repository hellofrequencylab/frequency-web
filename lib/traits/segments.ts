// Member segments (ADR-069 Phase 3). Saved audience definitions = a combinator over
// predicates on tags + computed traits. The evaluator + validator are PURE (unit-
// tested); the DB layer loads every member's snapshot once and evaluates segments
// against it. Definitions are validated against the trait registry so a segment can
// never reference an unknown variable. segments/member_* aren't in database.types yet
// (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTrait, isTagKey } from './registry'

export type Combinator = 'all' | 'any'
export type TraitOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
export type ScalarValue = number | string | boolean

export interface TagPredicate {
  type: 'tag'
  key: string
}
export interface TraitPredicate {
  type: 'trait'
  key: string
  op: TraitOp
  value: ScalarValue
}
export type Predicate = TagPredicate | TraitPredicate

export interface SegmentDefinition {
  combinator: Combinator
  predicates: Predicate[]
}

/** One member's effective tags + computed trait values. */
export interface MemberSnapshot {
  profileId: string
  tags: Set<string>
  traits: Map<string, ScalarValue | null>
}

// ── Pure evaluation ─────────────────────────────────────────────────────────

function compare(actual: ScalarValue | null | undefined, op: TraitOp, expected: ScalarValue): boolean {
  if (actual === null || actual === undefined) return false
  switch (op) {
    case 'eq': return actual === expected
    case 'neq': return actual !== expected
    case 'gt': return actual > expected
    case 'gte': return actual >= expected
    case 'lt': return actual < expected
    case 'lte': return actual <= expected
  }
}

function matchPredicate(p: Predicate, m: MemberSnapshot): boolean {
  if (p.type === 'tag') return m.tags.has(p.key)
  return compare(m.traits.get(p.key), p.op, p.value)
}

/** Does a member match the segment? Empty predicate list matches nobody. */
export function evaluateSegment(def: SegmentDefinition, m: MemberSnapshot): boolean {
  if (!def.predicates.length) return false
  return def.combinator === 'any'
    ? def.predicates.some((p) => matchPredicate(p, m))
    : def.predicates.every((p) => matchPredicate(p, m))
}

// ── Pure validation (against the registry) ──────────────────────────────────

const TRAIT_OPS: readonly TraitOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']

/** Validate a definition against the trait registry. Returns the list of problems
 *  (empty = valid) so a segment can never reference an unknown variable or bad op. */
export function validateSegmentDefinition(def: unknown): string[] {
  const errors: string[] = []
  const d = def as Partial<SegmentDefinition>
  if (d?.combinator !== 'all' && d?.combinator !== 'any') errors.push('combinator must be "all" or "any"')
  if (!Array.isArray(d?.predicates) || d!.predicates.length === 0) {
    errors.push('predicates must be a non-empty array')
    return errors
  }
  d!.predicates.forEach((p, i) => {
    if (p?.type === 'tag') {
      if (!isTagKey(p.key)) errors.push(`predicate ${i}: "${p.key}" is not a registered tag`)
    } else if (p?.type === 'trait') {
      const t = getTrait(p.key)
      if (!t || t.kind !== 'computed') errors.push(`predicate ${i}: "${p.key}" is not a registered computed trait`)
      if (!TRAIT_OPS.includes(p.op)) errors.push(`predicate ${i}: invalid op "${p.op}"`)
      if (!['number', 'string', 'boolean'].includes(typeof p.value)) errors.push(`predicate ${i}: value must be a scalar`)
    } else {
      errors.push(`predicate ${i}: type must be "tag" or "trait"`)
    }
  })
  return errors
}

const OP_SYMBOL: Record<TraitOp, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }

/** Human-readable summary of a definition, using registry labels. */
export function describeSegment(def: SegmentDefinition): string {
  const join = def.combinator === 'any' ? ' OR ' : ' AND '
  return def.predicates
    .map((p) => {
      const label = getTrait(p.key)?.label ?? p.key
      return p.type === 'tag' ? `has “${label}”` : `${label} ${OP_SYMBOL[p.op]} ${String(p.value)}`
    })
    .join(join)
}

// ── DB layer ────────────────────────────────────────────────────────────────

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Pull the registry-typed value out of a member_traits row. */
function traitRowValue(row: { value_num: number | null; value_text: string | null; value_bool: boolean | null }): ScalarValue | null {
  if (row.value_bool !== null) return row.value_bool
  if (row.value_num !== null) return row.value_num
  if (row.value_text !== null) return row.value_text
  return null
}

/** Load every real member's tags + computed traits into snapshots (one pass; reused
 *  across all segments). At current scale this is a handful of rows; the doc notes the
 *  compile-to-SQL path for scale. */
export async function loadMemberSnapshots(): Promise<MemberSnapshot[]> {
  const client = db()
  const nowMs = Date.now()
  const [{ data: tagRows }, { data: traitRows }] = await Promise.all([
    client.from('member_tags').select('profile_id, tag_key, expires_at'),
    client.from('member_traits').select('profile_id, trait_key, value_num, value_text, value_bool'),
  ])

  const snaps = new Map<string, MemberSnapshot>()
  const get = (id: string) => {
    let s = snaps.get(id)
    if (!s) { s = { profileId: id, tags: new Set(), traits: new Map() }; snaps.set(id, s) }
    return s
  }
  for (const r of (tagRows ?? []) as Array<{ profile_id: string; tag_key: string; expires_at: string | null }>) {
    if (!r.expires_at || Date.parse(r.expires_at) > nowMs) get(r.profile_id).tags.add(r.tag_key)
  }
  for (const r of (traitRows ?? []) as Array<{ profile_id: string; trait_key: string; value_num: number | null; value_text: string | null; value_bool: boolean | null }>) {
    get(r.profile_id).traits.set(r.trait_key, traitRowValue(r))
  }
  return [...snaps.values()]
}

export interface SegmentRow {
  id: string
  slug: string
  name: string
  description: string | null
  definition: SegmentDefinition
  is_system: boolean
}

export interface MemberRef {
  displayName: string
  handle: string
}

/** id → display name/handle for every real member (for previews). */
async function loadMemberDirectory(): Promise<Map<string, MemberRef>> {
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle')
    .eq('is_demo', false)
    .eq('is_system', false)
  const dir = new Map<string, MemberRef>()
  for (const r of (data ?? []) as Array<{ id: string; display_name: string; handle: string }>) {
    dir.set(r.id, { displayName: r.display_name, handle: r.handle })
  }
  return dir
}

export interface SegmentSummary extends SegmentRow {
  count: number
  sample: MemberRef[]
}

/** Resolve a saved segment (by slug) to the profile ids of its current members.
 *  The activation entry point (Phase 4): feeds campaign audiences. */
export async function resolveSegmentProfileIds(slug: string): Promise<string[]> {
  const { data: seg } = await db()
    .from('segments')
    .select('definition')
    .eq('slug', slug)
    .maybeSingle()
  if (!seg) return []
  const definition = (seg as { definition: SegmentDefinition }).definition
  const snapshots = await loadMemberSnapshots()
  return snapshots.filter((m) => evaluateSegment(definition, m)).map((m) => m.profileId)
}

/** Saved segments as `{ slug, name }` (for audience pickers). */
export async function listSegmentChoices(): Promise<Array<{ slug: string; name: string }>> {
  const { data } = await db().from('segments').select('slug, name').order('name')
  return ((data ?? []) as Array<{ slug: string; name: string }>).map((s) => ({ slug: s.slug, name: s.name }))
}

/** Every segment with its live member count + a sample of matched members. Loads the
 *  member dataset once and evaluates all segments against it. */
export async function listSegmentsDetailed(sampleLimit = 8): Promise<SegmentSummary[]> {
  const [{ data: segs }, snapshots, directory] = await Promise.all([
    db().from('segments').select('id, slug, name, description, definition, is_system').order('name'),
    loadMemberSnapshots(),
    loadMemberDirectory(),
  ])
  return ((segs ?? []) as SegmentRow[]).map((s) => {
    const matched = snapshots.filter((m) => evaluateSegment(s.definition, m))
    return {
      ...s,
      count: matched.length,
      sample: matched.slice(0, sampleLimit).map((m) => directory.get(m.profileId) ?? { displayName: '—', handle: '' }),
    }
  })
}
