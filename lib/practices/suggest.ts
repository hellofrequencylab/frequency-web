// Practice placement from the embedding (LIVE-643, ADR-1606; child 3 of PROG-PRAC4, ADR-1593).
//
// A practice filed under no Pillar or no Sub Focus used to wait for a curator to read it and
// guess. Its embedding already sits beside neighbours that have both, so this module asks them:
//
//   suggestPlacement(neighbours, current) PURE. A similarity-weighted vote of the nearest
//                                         neighbours' Pillar (domain_id) and Sub Focus
//                                         (subcategory_id). Returns the winner and a confidence,
//                                         and nothing below the thresholds stated below.
//   suggestPlacements(ids) / suggestPracticePlacement(id)
//                                         The read: match_practices on the practice's own
//                                         embedding (the same call shape as findPracticeDuplicates),
//                                         then the vote. Only a practice missing a Pillar or a Sub
//                                         Focus is asked about.
//   unplacedPracticeIds(ids)              Which of these practices is missing either, in one read.
//   applyPlacementSuggestion(id, seen)    The write behind the curator's Accept: re-reads the
//                                         suggestion, refuses one that moved since the curator saw
//                                         it, and fills ONLY what is empty (a guarded update, so a
//                                         Pillar set in the meantime is never overwritten).
//
// No model call and no budget key: this is embedding arithmetic, not a draft. Server-only (admin
// client, typed). authz-delegated: the curator gate lives at the calling action
// (app/(main)/admin/content/actions.ts suggestPracticePlacementAction / acceptPracticePlacementAction).

import { createAdminClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/lib/database.types'

function db() {
  return createAdminClient()
}

// --- The vote (pure) ---------------------------------------------------------------------------

/** A neighbour below this cosine similarity does not vote. The embeddings are gte-small, whose
 *  unrelated practice pairs still score in the 0.7s; the near-duplicate check uses 0.9. 0.8 keeps
 *  the practices that read as the same neighbourhood and drops the rest of the library. */
export const PLACEMENT_MIN_SIMILARITY = 0.8
/** The winner must carry at least this share of the voting weight. */
export const PLACEMENT_MIN_CONFIDENCE = 0.6
/** And at least this many neighbours must agree on it: one close practice is an anecdote. */
export const PLACEMENT_MIN_AGREEING = 2
/** How many nearest neighbours are asked (match_practices caps at 30). */
const PLACEMENT_NEIGHBOURS = 12
/** Two weights closer than this are a tie, and a tie suggests nothing. */
const TIE_EPSILON = 1e-9

/** One nearest neighbour as the vote reads it. */
export interface PlacementNeighbour {
  similarity: number
  domain_id: string | null
  subcategory_id: string | null
}

/** One winning pick: the id, its share of the voting weight, and the head count behind it. */
export interface PlacementPick {
  id: string
  /** Share of the voting weight the winner carries (0-1). */
  confidence: number
  /** Neighbours that voted for the winner. */
  agreeing: number
  /** Neighbours that voted at all. */
  voters: number
}

/** A suggestion: a Pillar, a Sub Focus, or both. Null halves were not asked for or not clear. */
export interface PlacementVote {
  pillar: PlacementPick | null
  subFocus: PlacementPick | null
}

/** A neighbour's weight: how far above the floor it sits, so a 0.95 neighbour counts three times
 *  one at 0.85. Anything at or under the floor (or not a number) weighs nothing and does not vote. */
function weightOf(similarity: number): number {
  return Number.isFinite(similarity) ? similarity - PLACEMENT_MIN_SIMILARITY : 0
}

function vote(ballots: { key: string; weight: number }[]): PlacementPick | null {
  const cast = ballots.filter((b) => b.weight > 0)
  if (cast.length < PLACEMENT_MIN_AGREEING) return null
  const weight = new Map<string, number>()
  const count = new Map<string, number>()
  let total = 0
  for (const b of cast) {
    weight.set(b.key, (weight.get(b.key) ?? 0) + b.weight)
    count.set(b.key, (count.get(b.key) ?? 0) + 1)
    total += b.weight
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1])
  const [winner, top] = ranked[0]
  if (ranked.length > 1 && top - ranked[1][1] < TIE_EPSILON) return null
  const confidence = top / total
  const agreeing = count.get(winner) ?? 0
  if (confidence < PLACEMENT_MIN_CONFIDENCE || agreeing < PLACEMENT_MIN_AGREEING) return null
  return { id: winner, confidence, agreeing, voters: cast.length }
}

/**
 * The placement vote. `current` is what the practice already has: a set Pillar is never
 * re-suggested and scopes the Sub Focus vote (a Sub Focus belongs to one Pillar), and a set Sub
 * Focus is never re-suggested. The Sub Focus vote counts only neighbours filed under the Pillar the
 * practice has or is being offered, so the pair always agrees. Null when neither half is clear.
 */
export function suggestPlacement(
  neighbours: readonly PlacementNeighbour[],
  current: { domain_id: string | null; subcategory_id: string | null } = { domain_id: null, subcategory_id: null },
): PlacementVote | null {
  const pillar = current.domain_id
    ? null
    : vote(
        neighbours
          .filter((n) => n.domain_id)
          .map((n) => ({ key: n.domain_id as string, weight: weightOf(n.similarity) })),
      )
  const pillarId = current.domain_id ?? pillar?.id ?? null
  const subFocus =
    current.subcategory_id || !pillarId
      ? null
      : vote(
          neighbours
            .filter((n) => n.domain_id === pillarId && n.subcategory_id)
            .map((n) => ({ key: n.subcategory_id as string, weight: weightOf(n.similarity) })),
        )
  if (!pillar && !subFocus) return null
  return { pillar, subFocus }
}

// --- The read ----------------------------------------------------------------------------------

/** A suggestion as a surface shows it: the vote plus the names a curator reads. */
export interface PlacementSuggestion {
  practiceId: string
  pillar: (PlacementPick & { name: string }) | null
  subFocus: (PlacementPick & { name: string }) | null
}

type PlacementRow = { id: string; domain_id: string | null; subcategory_id: string | null }

/** The ids among these that are missing a Pillar or a Sub Focus. One read. */
export async function unplacedPracticeIds(ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids)].slice(0, 500)
  if (unique.length === 0) return []
  const { data } = await db().from('practices').select('id, domain_id, subcategory_id').in('id', unique)
  return ((data ?? []) as PlacementRow[]).filter((r) => !r.domain_id || !r.subcategory_id).map((r) => r.id)
}

/**
 * Suggestions for up to 50 practices, keyed by id. Only a practice missing a Pillar or a Sub Focus,
 * with an embedding, is asked about; the rest (and any with no clear vote) are simply absent. Runs
 * ONE match_practices nearest-neighbour lookup per such practice, concurrently, the same indexed
 * query findPracticeDuplicates runs, then one batched read of the neighbours' placement and one
 * each of the Pillar and Sub Focus names.
 */
export async function suggestPlacements(ids: readonly string[]): Promise<Map<string, PlacementSuggestion>> {
  const out = new Map<string, PlacementSuggestion>()
  const unique = [...new Set(ids)].slice(0, 50)
  if (unique.length === 0) return out
  const client = db()

  const { data: seedRows } = await client
    .from('practices')
    .select('id, domain_id, subcategory_id, embedding')
    .in('id', unique)
  const seeds = ((seedRows ?? []) as (PlacementRow & { embedding: string | null })[]).filter(
    (r) => (!r.domain_id || !r.subcategory_id) && !!r.embedding,
  )
  if (seeds.length === 0) return out

  const matches = await Promise.all(
    seeds.map(async (s) => {
      const { data, error } = await client.rpc('match_practices', {
        query_embedding: s.embedding as string,
        match_count: PLACEMENT_NEIGHBOURS,
        exclude_id: s.id,
      })
      if (error || !data) return [] as { id: string; similarity: number }[]
      return (data as { id: string; similarity: number }[]).filter(
        (m) => m.similarity > PLACEMENT_MIN_SIMILARITY,
      )
    }),
  )
  const neighbourIds = [...new Set(matches.flat().map((m) => m.id))]
  if (neighbourIds.length === 0) return out

  const [{ data: placedRows }, { data: pillarRows }, { data: subRows }] = await Promise.all([
    client.from('practices').select('id, domain_id, subcategory_id').in('id', neighbourIds),
    client.from('pillars').select('id, name'),
    client.from('practice_subcategories').select('id, name, domain_id'),
  ])
  const placed = new Map(((placedRows ?? []) as PlacementRow[]).map((r) => [r.id, r]))
  const pillarName = new Map(((pillarRows ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
  const subs = new Map(
    ((subRows ?? []) as { id: string; name: string; domain_id: string }[]).map((s) => [s.id, s]),
  )

  seeds.forEach((seed, i) => {
    const neighbours: PlacementNeighbour[] = matches[i].flatMap((m) => {
      const p = placed.get(m.id)
      return p ? [{ similarity: m.similarity, domain_id: p.domain_id, subcategory_id: p.subcategory_id }] : []
    })
    const picked = suggestPlacement(neighbours, seed)
    if (!picked) return
    // A Sub Focus the practice already carries names its Pillar: offer only that Pillar.
    const heldSubPillar = seed.subcategory_id ? subs.get(seed.subcategory_id)?.domain_id ?? null : null
    const pillar =
      picked.pillar && pillarName.has(picked.pillar.id) && (!heldSubPillar || heldSubPillar === picked.pillar.id)
        ? { ...picked.pillar, name: pillarName.get(picked.pillar.id) as string }
        : null
    const targetPillar = seed.domain_id ?? pillar?.id ?? null
    const sub = picked.subFocus ? subs.get(picked.subFocus.id) : undefined
    const subFocus =
      picked.subFocus && sub && sub.domain_id === targetPillar ? { ...picked.subFocus, name: sub.name } : null
    if (!pillar && !subFocus) return
    out.set(seed.id, { practiceId: seed.id, pillar, subFocus })
  })
  return out
}

/** The suggestion for one practice, or null when it is placed, has no embedding yet, or its
 *  neighbours do not agree. */
export async function suggestPracticePlacement(practiceId: string): Promise<PlacementSuggestion | null> {
  return (await suggestPlacements([practiceId])).get(practiceId) ?? null
}

// --- The write ---------------------------------------------------------------------------------

/** What the curator saw and accepted: the Pillar and Sub Focus ids the suggestion showed. */
export interface AcceptedPlacement {
  pillarId: string | null
  subFocusId: string | null
}

/**
 * Accept a suggestion. Re-reads it (the client never carries the answer), refuses when it no longer
 * matches what the curator was shown, and writes ONLY the empty fields through a guarded update:
 * `domain_id is null` when filling the Pillar, `subcategory_id is null` when filling the Sub Focus,
 * so a Pillar someone set in the meantime is never overwritten. A filled Pillar also seeds
 * `focus_details` when it is empty, the way the practice spark files a Pillar at create, so the
 * editor shows it as the selected Focus. Returns the names written.
 *
 * authz-delegated: the curator gate lives at the calling action (acceptPracticePlacementAction).
 */
export async function applyPlacementSuggestion(
  practiceId: string,
  seen: AcceptedPlacement,
): Promise<{ pillar: string | null; subFocus: string | null }> {
  const fresh = await suggestPracticePlacement(practiceId)
  if (!fresh) throw new Error('There is no clear suggestion for this practice any more.')
  if ((fresh.pillar?.id ?? null) !== seen.pillarId || (fresh.subFocus?.id ?? null) !== seen.subFocusId) {
    throw new Error('The suggestion changed since you looked. Open it again.')
  }

  const client = db()
  const { data: row } = await client
    .from('practices')
    .select('domain_id, focus_details')
    .eq('id', practiceId)
    .maybeSingle()
  if (!row) throw new Error('That practice is gone.')

  // Typed by its table, like every practice-module payload since LIVE-647 (ADR-1610).
  const update: TablesUpdate<'practices'> = {}
  if (fresh.pillar) {
    update.domain_id = fresh.pillar.id
    const fd = row.focus_details
    const empty = !fd || (typeof fd === 'object' && !Array.isArray(fd) && Object.keys(fd).length === 0)
    if (empty) update.focus_details = { [fresh.pillar.id]: { instructions: '', timing: '' } }
  }
  if (fresh.subFocus) update.subcategory_id = fresh.subFocus.id

  let q = client.from('practices').update(update).eq('id', practiceId)
  q = fresh.pillar ? q.is('domain_id', null) : q.eq('domain_id', row.domain_id as string)
  if (fresh.subFocus) q = q.is('subcategory_id', null)
  const { data: written, error } = await q.select('id')
  if (error) throw new Error(error.message)
  if (!written || written.length === 0) throw new Error('Someone filed this practice while you were looking.')
  return { pillar: fresh.pillar?.name ?? null, subFocus: fresh.subFocus?.name ?? null }
}
