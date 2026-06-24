// Resonance edges: persistence + read (Resonance Engine Phase 4 · ADR-385 · docs/NEXT-GEN-CRM.md
// "The Resonance Graph" -> "Data model additions"). The nightly step computes each opted-in person's
// top matches (lib/resonance/candidates.ts) and persists them to resonance_edges, with an expiry so
// stale edges age out (no junk drawer). The surfaces (the Person view Resonance tab + the Space
// cockpit) READ from this table, so a page never recomputes the graph on a request.
//
// SENSITIVE-class data. resonance_edges is classed sensitive PII in the trait registry and governed
// by the same consent + retention machinery; the row carries only profile ids + a score + the plain
// shared-belonging reasons, never a stalking-adjacent signal. RLS is the fail-closed service-role
// pattern (RLS on, no client policy); every path here is the admin client behind a gated caller.
//
// Server-only. resonance_edges is reached untyped until the generated types regenerate (ADR-246).
//
// authz-delegated: the WRITE side is the platform-wide nightly refresh (no per-caller scope by
// design, like lib/traits/refresh.ts); it writes one edge per (anchor, target) pair the consenting
// graph produced. The READ side trusts its caller to have authorized the scope (the staff Person
// view / the Space CRM gate) and self-scopes every read to the person it was handed. FAIL-SAFE reads.

import { createAdminClient } from '@/lib/supabase/admin'
import { generateMatches } from './candidates'
import type { ResonanceReason, ResonanceAffinity } from './score'
import { resonanceMatchCount } from '@/lib/traits/compute'

/** How long a computed edge stays fresh before it ages out. The nightly refresh rewrites surviving
 *  edges, so a tie that no longer resonates simply expires (no junk drawer, the plan's rule). */
export const EDGE_TTL_DAYS = 14

/** The cap on how many top edges we persist per opted-in anchor each night. Keeps the table bounded
 *  and the surfaces focused on the strongest few. */
const EDGES_PER_ANCHOR = 8

/** One stored edge as a surface reads it (camelCase). */
export interface ResonanceEdge {
  /** The other person on this edge (relative to the anchor the read was scoped to). */
  otherProfileId: string
  /** The reciprocal Resonance Score, 0..1. */
  score: number
  /** The plain-language shared-belonging reasons (the card's WHY). */
  reasons: ResonanceReason[]
  /** When this edge ages out. */
  expiresAt: string | null
}

interface EdgeRow {
  a_pid: string
  b_pid: string
  score: number | null
  reasons: unknown
  expires_at: string | null
}

/** Canonical pair order so an edge (A,B) is stored once: the lexicographically smaller id is a_pid.
 *  PURE. The read then maps relative to whichever side the caller asked about. */
export function orderPair(x: string, y: string): { a: string; b: string } {
  return x <= y ? { a: x, b: y } : { a: y, b: x }
}

/** Coerce a stored reasons jsonb back to the typed array, fail-safe to []. */
function asReasons(raw: unknown): ResonanceReason[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r) => {
    if (r && typeof r === 'object' && 'kind' in r && 'label' in r) {
      const kind = String((r as { kind: unknown }).kind)
      const label = String((r as { label: unknown }).label)
      if (label) return [{ kind: kind as ResonanceReason['kind'], label }]
    }
    return []
  })
}

/**
 * The persisted resonance edges for ONE person, strongest first, NOT expired. FAIL-SAFE: an empty
 * list when the table is absent (pre-migration), when there are no edges, or on any error. The
 * caller MUST have authorized the scope (the staff Person view, or the Space CRM gate); this binds
 * the read to the person's id on either side of the canonical pair.
 */
export async function listEdgesForPerson(profileId: string, limit = 8): Promise<ResonanceEdge[]> {
  if (!profileId) return []
  const capped = Math.max(1, Math.min(50, limit))
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          or: (f: string) => {
            gt: (col: string, val: string) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: EdgeRow[] | null; error: unknown }>
              }
            }
          }
        }
      }
    }
    const nowIso = new Date().toISOString()
    const { data, error } = await admin
      .from('resonance_edges')
      .select('a_pid, b_pid, score, reasons, expires_at')
      .or(`a_pid.eq.${profileId},b_pid.eq.${profileId}`)
      .gt('expires_at', nowIso)
      .order('score', { ascending: false })
      .limit(capped)
    if (error || !data) return []
    return data.map((r) => ({
      otherProfileId: r.a_pid === profileId ? r.b_pid : r.a_pid,
      score: typeof r.score === 'number' ? r.score : 0,
      reasons: asReasons(r.reasons),
      expiresAt: r.expires_at,
    }))
  } catch {
    return []
  }
}

/** The row shape written to resonance_edges. */
interface EdgeInsert {
  a_pid: string
  b_pid: string
  score: number
  reasons: { kind: string; label: string }[]
  affinity: ResonanceAffinity
  expires_at: string
}

/**
 * Recompute + persist the resonance edges for a batch of opted-in anchors. The nightly step
 * (app/api/cron/refresh-traits) calls this AFTER the trait refresh, so the re-ranker reads tonight's
 * activation_propensity + churn_risk. Best-effort + FAIL-SAFE: a missing table / extension or any
 * error is swallowed (the engine degrades; the surfaces simply show whatever edges already exist or
 * an empty state). Idempotent on the canonical (a_pid, b_pid) pair. Returns how many edges were upserted.
 *
 * authz-delegated: platform-wide nightly write, no per-caller scope by design (like the trait refresh).
 */
export async function refreshResonanceEdges(opts: { limitAnchors?: number } = {}): Promise<{ anchors: number; edges: number }> {
  let anchors = 0
  let edges = 0
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: boolean) => { limit: (n: number) => Promise<{ data: { profile_id: string }[] | null; error: unknown }> }
        }
        upsert: (rows: Record<string, unknown>[], opts: { onConflict: string }) => Promise<{ error: unknown }>
      }
    }

    // The opted-in pool: only people who said yes to matching are anchors (and only they can be
    // targets, enforced again inside generateMatches). A missing table here means the migration has
    // not applied; we swallow and no-op.
    const limitAnchors = Math.max(1, Math.min(5000, opts.limitAnchors ?? 2000))
    const { data: optedIn, error: consentErr } = await admin
      .from('resonance_consent')
      .select('profile_id')
      .eq('opted_in', true)
      .limit(limitAnchors)
    if (consentErr || !optedIn || optedIn.length === 0) return { anchors: 0, edges: 0 }

    const expiresAt = new Date(Date.now() + EDGE_TTL_DAYS * 86_400_000).toISOString()
    const batch: EdgeInsert[] = []
    // The resonance_match_count trait per anchor (the nightly density cue), keyed by profile id.
    const matchCountByAnchor = new Map<string, number>()

    for (const { profile_id: anchorId } of optedIn) {
      anchors += 1
      const matches = await generateMatches(anchorId, EDGES_PER_ANCHOR)
      matchCountByAnchor.set(anchorId, matches.length)
      for (const m of matches) {
        const { a, b } = orderPair(anchorId, m.profileId)
        batch.push({
          a_pid: a,
          b_pid: b,
          score: m.score,
          reasons: m.reasons.map((r) => ({ kind: r.kind, label: r.label })),
          affinity: m.affinity,
          expires_at: expiresAt,
        })
      }
    }

    // Write the resonance_match_count trait for each anchor (fail-safe, best-effort). The count is the
    // number of strong reciprocal matches the anchor has tonight; a 0 row keeps the trait current.
    await writeMatchCounts(admin, matchCountByAnchor)

    // De-dupe the canonical pairs (an edge can be produced from both anchors); keep the higher score.
    const byPair = new Map<string, EdgeInsert>()
    for (const e of batch) {
      const key = `${e.a_pid}:${e.b_pid}`
      const existing = byPair.get(key)
      if (!existing || e.score > existing.score) byPair.set(key, e)
    }
    const rows = [...byPair.values()]
    if (rows.length > 0) {
      const { error } = await admin.from('resonance_edges').upsert(rows as unknown as Record<string, unknown>[], { onConflict: 'a_pid,b_pid' })
      if (!error) edges = rows.length
    }
    return { anchors, edges }
  } catch {
    return { anchors, edges }
  }
}

/** Upsert the resonance_match_count trait for a set of anchors into member_traits (the same store +
 *  conflict key the trait refresh uses). FAIL-SAFE: a missing table or any error is swallowed (the
 *  count is a non-critical density cue, never blocks the edge refresh). */
async function writeMatchCounts(
  admin: { from: (t: string) => { upsert: (rows: Record<string, unknown>[], opts: { onConflict: string }) => Promise<{ error: unknown }> } },
  counts: Map<string, number>,
): Promise<void> {
  if (counts.size === 0) return
  try {
    const computedAt = new Date().toISOString()
    const rows = [...counts.entries()].map(([profileId, n]) => {
      const trait = resonanceMatchCount(n)
      return {
        profile_id: profileId,
        trait_key: 'resonance_match_count',
        value_num: trait,
        value_text: null,
        value_ts: null,
        value_bool: null,
        value_json: null,
        computed_at: computedAt,
      }
    })
    await admin.from('member_traits').upsert(rows, { onConflict: 'profile_id,trait_key' })
  } catch {
    /* best-effort: the density cue simply lags a night */
  }
}
