import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Practice library Phase 3 "Grow" — remix lineage reads (ADR-438 / ADR-447).
//
// Lineage is two indexed columns on practices (Phase 1): `remixed_from` (the direct parent)
// and `root_practice_id` (the lineage ROOT, denormalised so a whole tree is ONE indexed scan —
// no recursive CTE needed). forkPractice sets both; merge_practices re-points them. Counts are
// DERIVED here (no forked_count column, like adopters) — at library scale that is cheap; a
// materialised count is a Phase-4 optimisation if a GROUP BY ever gets hot (tracked).
//
// Reaches the lineage columns through the untyped admin handle (ADR-246) until the generated
// types are regenerated — same pattern as the rest of the practice server layer.

function db(): SupabaseClient {
  return createAdminClient()
}

/** One practice in a remix tree (the root or any remix of it). */
export interface LineageNode {
  id: string
  title: string
  created_by: string | null
  created_at: string
  is_public: boolean
}

/** A practice's place in its remix lineage: the original it descends from, its direct parent,
 *  the sibling/descendant remixes off the same root, and how many remixes the root has spawned. */
export interface PracticeLineage {
  rootId: string
  /** True when this practice IS the original (no remixed_from). */
  isOriginal: boolean
  /** The original (root) practice — the one to credit. Null only if the row vanished. */
  original: { id: string; title: string; slug: string | null; created_by: string | null; is_public: boolean } | null
  /** The direct parent this was remixed from (may differ from the root in a remix-of-a-remix). */
  parent: { id: string; title: string } | null
  /** Every remix off the root (excludes the root itself). */
  remixes: LineageNode[]
  /** remixes.length — "remixed N times". */
  remixCount: number
}

/**
 * Resolve the full remix lineage for one practice. Member surfaces pass the default
 * (public-only); the admin levers pass includeHidden. One indexed scan via root_practice_id.
 *
 * authz-delegated: read-only; the curator/visibility gate lives at the calling surface.
 */
export async function getPracticeLineage(
  practiceId: string,
  opts: { includeHidden?: boolean } = {},
): Promise<PracticeLineage | null> {
  const client = db()
  const { data: selfRow } = await client
    .from('practices')
    .select('id, remixed_from, root_practice_id')
    .eq('id', practiceId)
    .maybeSingle()
  const self = selfRow as { id: string; remixed_from: string | null; root_practice_id: string | null } | null
  if (!self) return null

  const rootId = self.root_practice_id ?? self.id
  const isOriginal = self.root_practice_id == null

  // The whole tree: the root + every practice sharing it. One indexed read.
  let tree = client
    .from('practices')
    .select('id, title, created_by, created_at, is_public')
    .or(`root_practice_id.eq.${rootId},id.eq.${rootId}`)
  if (!opts.includeHidden) tree = tree.eq('is_public', true)
  const { data: treeRows } = await tree
  const nodes = ((treeRows as LineageNode[] | null) ?? [])
  const remixes = nodes.filter((n) => n.id !== rootId)

  // The original (root), for the credit link.
  const { data: rootRow } = await client
    .from('practices')
    .select('id, title, slug, created_by, is_public')
    .eq('id', rootId)
    .maybeSingle()
  const original = (rootRow as PracticeLineage['original']) ?? null

  // The direct parent (only when this is itself a remix).
  let parent: { id: string; title: string } | null = null
  if (self.remixed_from) {
    const { data: p } = await client.from('practices').select('id, title').eq('id', self.remixed_from).maybeSingle()
    parent = (p as { id: string; title: string } | null) ?? null
  }

  return { rootId, isOriginal, original, parent, remixes, remixCount: remixes.length }
}

/** One "most remixed" original: the root practice + how many remixes it has spawned. */
export interface MostRemixedRow {
  rootId: string
  title: string
  creator: string | null
  remixCount: number
}

/**
 * The most-remixed originals, ranked by how many remixes descend from each root. Derived by
 * grouping root_practice_id (indexed). includeHidden controls whether non-public remixes count.
 *
 * authz-delegated: read-only operator/insight read.
 */
export async function mostRemixed(opts: { limit?: number; includeHidden?: boolean } = {}): Promise<MostRemixedRow[]> {
  const limit = Math.min(50, Math.max(1, Math.floor(opts.limit ?? 10)))
  const client = db()
  let q = client.from('practices').select('root_practice_id, is_public').not('root_practice_id', 'is', null)
  if (!opts.includeHidden) q = q.eq('is_public', true)
  const { data } = await q
  const counts = new Map<string, number>()
  for (const r of ((data as { root_practice_id: string }[] | null) ?? [])) {
    counts.set(r.root_practice_id, (counts.get(r.root_practice_id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  if (top.length === 0) return []
  const rootIds = top.map(([id]) => id)
  const { data: rootRows } = await client.from('practices').select('id, title, created_by').in('id', rootIds)
  const byId = new Map(
    ((rootRows as { id: string; title: string; created_by: string | null }[] | null) ?? []).map((r) => [r.id, r]),
  )
  return top.map(([rootId, remixCount]) => ({
    rootId,
    title: byId.get(rootId)?.title ?? '',
    creator: byId.get(rootId)?.created_by ?? null,
    remixCount,
  }))
}

/** One contributor's remix impact: how many originals they authored and how many remixes those
 *  originals have spawned across the community. */
export interface ContributorImpact {
  creatorId: string
  originated: number
  remixesReceived: number
}

/**
 * Top contributors by remix impact (Phase 3.4 recognition): for each creator, how many ORIGINALS
 * (root_practice_id null) they authored and how many remixes descend from those originals. Ranked
 * by remixes received, then originals. Derived (no new column). Public practices only.
 *
 * authz-delegated: read-only admin recognition read.
 */
export async function topRemixContributors(opts: { limit?: number } = {}): Promise<ContributorImpact[]> {
  const limit = Math.min(50, Math.max(1, Math.floor(opts.limit ?? 10)))
  const client = db()
  // Originals (the roots) by creator, public only.
  const { data: originalRows } = await client
    .from('practices')
    .select('id, created_by')
    .is('root_practice_id', null)
    .is('remixed_from', null)
    .eq('is_public', true)
  const originals = ((originalRows as { id: string; created_by: string | null }[] | null) ?? []).filter(
    (r) => r.created_by,
  )
  const creatorByRoot = new Map(originals.map((r) => [r.id, r.created_by as string]))
  const originated = new Map<string, number>()
  for (const r of originals) originated.set(r.created_by as string, (originated.get(r.created_by as string) ?? 0) + 1)

  // Remixes grouped by their root, attributed to the root's creator.
  const { data: remixRows } = await client
    .from('practices')
    .select('root_practice_id')
    .not('root_practice_id', 'is', null)
    .eq('is_public', true)
  const remixesReceived = new Map<string, number>()
  for (const r of ((remixRows as { root_practice_id: string }[] | null) ?? [])) {
    const creator = creatorByRoot.get(r.root_practice_id)
    if (creator) remixesReceived.set(creator, (remixesReceived.get(creator) ?? 0) + 1)
  }

  const creators = new Set<string>([...originated.keys(), ...remixesReceived.keys()])
  return [...creators]
    .map((creatorId) => ({
      creatorId,
      originated: originated.get(creatorId) ?? 0,
      remixesReceived: remixesReceived.get(creatorId) ?? 0,
    }))
    .sort((a, b) => b.remixesReceived - a.remixesReceived || b.originated - a.originated)
    .slice(0, limit)
}
