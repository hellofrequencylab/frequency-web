// Practice library — Phase 2 "Clean" server layer (ADR-438; spec PRACTICE-LIBRARY §6).
//
// The reads + choreography behind the Clean phase, kept beside the pure scoring rule
// (quality.ts) and apart from the large practices.ts surface:
//   2.1 listReviewQueue()    — the triage queue, ordered near-dup → submitter trust → recency.
//   2.2 mergePractices()     — calls the merge_practices RPC (re-points FKs, archives the
//                              source, records a slug redirect); resolvePracticeSlugRedirect()
//                              powers the 301 fallback on a missed public slug.
//   2.3 needsAttention()     — the operator "fix these" view (orphaned / imageless / never
//                              logged / stale), each row scored by computeQualityScore.
//   2.4 promoteTagToCanonical / mergeTags / listAllTags — tag governance.
//
// Server-only. The practices/* tables + the Phase-2 RPC are ahead of the generated Database
// types, so this module reads/writes through the untyped admin handle (ADR-246), the same
// convention as lib/practices.ts. Mutations are caller-trusted: the curator gate lives at the
// action layer (app/(main)/admin/content/actions.ts) — see the // authz-delegated note below.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getGlobalTrustScores } from '@/lib/trust/store'
import { computeQualityScore, isStale, type QualityScore } from './quality'

function db(): SupabaseClient {
  return createAdminClient()
}

// --- 2.1 Triage queue --------------------------------------------------------
//
// The review queue is the pending practices, ordered so the operator's eye lands on the
// rows that need a human first: a possible duplicate (don't approve a second copy), then a
// lower-trust submitter (more likely to need scrutiny), then most-recently-touched (so a
// resubmission floats up). The near-dup flag is computed per pending row via the existing
// vector RPC (match_practices) — see the COST note on listReviewQueue.

/** One row in the triage queue: the pending practice + its review signals. */
export interface ReviewQueueItem {
  id: string
  title: string
  summary: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
  /** The submitter's display identity (for the row). */
  creator: { display_name: string | null; handle: string | null } | null
  /** The submitter's GLOBAL trust score. Zero for everyone today (the trust ledger is not yet
   *  wired to emit on these flows — Phase 3); the ordering reads it so it works the day it does. */
  submitterTrust: number
  /** A near-identical existing practice, when the vector check found one at/above the threshold. */
  possibleDuplicateOf: { id: string; title: string; similarity: number } | null
}

/** The vector-similarity threshold a pending practice must hit to be flagged a possible
 *  duplicate in the queue. Mirrors findPracticeDuplicates' near-identical default. */
const QUEUE_DUP_THRESHOLD = 0.9

/**
 * The review queue: pending practices ordered (1) possible-duplicate first, (2) lower
 * submitter trust first, (3) most recently touched first. Enriched with the submitter's
 * profile + trust score and a near-duplicate candidate so the UI can show "possible
 * duplicate of X" inline.
 *
 * COST NOTE (deliberate): the near-dup flag runs ONE match_practices vector lookup per
 * pending row (an HNSW nearest-neighbour query, the same one the per-practice dup finder
 * uses). The pending set is small by nature (it is the human review backlog, not the whole
 * library), and the lookups run concurrently, so this is N cheap indexed queries where N is
 * the queue depth — acceptable for an operator screen. We cap the queue at `limit` (default
 * 50) so the fan-out is bounded even if the backlog spikes; a row past the cap simply isn't
 * scored until it is on a page. This is NOT an always-on column on the whole library (that
 * pairwise cost is why duplicate detection stays an explicit per-practice lookup, §5).
 *
 * authz-delegated: read-only; the curator gate lives at the calling action.
 */
export async function listReviewQueue(opts: { limit?: number } = {}): Promise<ReviewQueueItem[]> {
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 50)))
  const client = db()

  // The pending set (newest first as a stable base; the real ordering is applied below once
  // the dup + trust signals are in hand). Read straight from the table so we get updated_at.
  const { data: pendingRows } = await client
    .from('practices')
    .select('id, title, summary, created_by, created_at, updated_at')
    .eq('status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(limit)
  const pending =
    ((pendingRows as
      | { id: string; title: string; summary: string | null; created_by: string | null; created_at: string; updated_at: string | null }[]
      | null) ?? [])
  if (pending.length === 0) return []

  // Submitter profiles + trust scores (the trust read is inert/zero today — Phase 3 wires the
  // emit path; the join works the day it does). One round-trip each.
  const creatorIds = [...new Set(pending.map((p) => p.created_by).filter((c): c is string => !!c))]
  const [{ data: creatorRows }, trustByProfile] = await Promise.all([
    creatorIds.length
      ? client.from('profiles').select('id, display_name, handle').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; handle: string | null }[] }),
    creatorIds.length ? getGlobalTrustScores(creatorIds) : Promise.resolve(new Map<string, number>()),
  ])
  const creators = new Map(
    ((creatorRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      { display_name: r.display_name, handle: r.handle },
    ]),
  )

  // Near-dup flag per pending row (concurrent; bounded by `limit`). See the COST NOTE.
  const dupCandidates = await Promise.all(pending.map((p) => nearestDuplicate(client, p.id)))

  const items: ReviewQueueItem[] = pending.map((p, i) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    created_by: p.created_by,
    created_at: p.created_at,
    updated_at: p.updated_at,
    creator: p.created_by ? creators.get(p.created_by) ?? null : null,
    submitterTrust: p.created_by ? trustByProfile.get(p.created_by) ?? 0 : 0,
    possibleDuplicateOf: dupCandidates[i],
  }))

  // Order: possible-duplicate first, then lower submitter trust, then most recent.
  items.sort((a, b) => {
    const aDup = a.possibleDuplicateOf ? 1 : 0
    const bDup = b.possibleDuplicateOf ? 1 : 0
    if (aDup !== bDup) return bDup - aDup
    if (a.submitterTrust !== b.submitterTrust) return a.submitterTrust - b.submitterTrust
    const at = a.updated_at ?? a.created_at
    const bt = b.updated_at ?? b.created_at
    return at < bt ? 1 : at > bt ? -1 : 0
  })

  return items
}

/** The single nearest existing practice to a seed via the vector RPC, when it clears the
 *  near-identical threshold; null when the seed has no embedding or nothing is close enough. */
async function nearestDuplicate(
  client: SupabaseClient,
  practiceId: string,
): Promise<{ id: string; title: string; similarity: number } | null> {
  const { data: seedRow } = await client.from('practices').select('embedding').eq('id', practiceId).maybeSingle()
  const embedding = (seedRow as { embedding: string | number[] | null } | null)?.embedding
  if (!embedding) return null
  const { data, error } = await client.rpc('match_practices', {
    query_embedding: embedding,
    match_count: 1,
    exclude_id: practiceId,
  })
  if (error || !data) return null
  const top = (data as { id: string; title: string; similarity: number }[])[0]
  if (!top || top.similarity < QUEUE_DUP_THRESHOLD) return null
  return { id: top.id, title: top.title, similarity: top.similarity }
}

// --- 2.2 Merge + slug redirect ----------------------------------------------

/** The result of a merge: the source + canonical ids and the old slug that now redirects. */
export interface MergeResult {
  from: string
  to: string
  old_slug: string | null
}

/**
 * Merge a duplicate practice INTO a canonical one via the merge_practices RPC (Postgres
 * does the work in one transaction): re-points every practice_id FK (adoptions, logs, tags,
 * circle assignments, journey items, sessions) + lineage self-refs onto the canonical,
 * dropping the duplicates that would violate the unique constraints; records the source's
 * old slug as a redirect; and archives + unpublishes + stamps merged_into on the source.
 * Re-point, never delete — history lives on the canonical.
 *
 * The RPC is service_role-only and reached through the untyped admin handle (ADR-246). It
 * throws on a bad merge (self-merge, missing id, already-merged), which surfaces as the
 * error message the action returns.
 *
 * authz-delegated: the curator gate lives at the calling action (mergePracticesAction).
 */
export async function mergePractices(fromId: string, toId: string): Promise<MergeResult> {
  const { data, error } = await db().rpc('merge_practices', { from_id: fromId, to_id: toId })
  if (error) throw new Error(error.message)
  const r = (data as { from: string; to: string; old_slug: string | null } | null) ?? null
  return { from: r?.from ?? fromId, to: r?.to ?? toId, old_slug: r?.old_slug ?? null }
}

/**
 * Resolve a practice slug that did NOT match a live practice to the canonical it was merged
 * into, via practice_slug_redirects. Returns the canonical's slug (preferred for a clean 301
 * target) or its id when the canonical has no slug. Null when there is no redirect — the
 * caller then 404s as before. Service-role read (the redirect table is RLS-on, no policies).
 *
 * authz-delegated: read-only public-route helper; no caller authority is involved.
 */
export async function resolvePracticeSlugRedirect(oldSlug: string): Promise<string | null> {
  const client = db()
  const { data: redirect } = await client
    .from('practice_slug_redirects')
    .select('practice_id')
    .eq('old_slug', oldSlug)
    .maybeSingle()
  const practiceId = (redirect as { practice_id: string } | null)?.practice_id
  if (!practiceId) return null
  const { data: canonical } = await client
    .from('practices')
    .select('slug, id, is_public')
    .eq('id', practiceId)
    .maybeSingle()
  const row = canonical as { slug: string | null; id: string; is_public: boolean } | null
  // Only redirect to a practice that is actually live — never bounce a member to a hidden row.
  if (!row || !row.is_public) return null
  return row.slug ?? row.id
}

// --- 2.3 Needs attention -----------------------------------------------------

/** The reasons a practice landed in the needs-attention view (a row may carry several). */
export type AttentionReason = 'orphaned' | 'imageless' | 'never_logged' | 'stale'

/** One needs-attention row: the practice + why it surfaced + its quality score. */
export interface NeedsAttentionItem {
  id: string
  title: string
  status: string | null
  is_public: boolean
  reasons: AttentionReason[]
  quality: QualityScore
}

/**
 * The "Needs attention" operator view (item 2.3): public practices with a gap worth fixing,
 * each scored by computeQualityScore and tagged with WHY it surfaced:
 *   • orphaned     — no Pillar (domain_id null)
 *   • imageless    — no header image
 *   • never_logged — zero logs all time
 *   • stale        — past the freshness floor AND no logs in 30 days (old + idle)
 * Reuses the practices_ranked view's usage signal + the table's content/freshness columns.
 * Ordered worst-quality first (the score blends all three axes), so the most-broken rows lead.
 *
 * authz-delegated: read-only; the curator gate lives at the calling page/action.
 */
export async function needsAttention(opts: { limit?: number } = {}): Promise<NeedsAttentionItem[]> {
  const limit = Math.min(500, Math.max(1, Math.floor(opts.limit ?? 100)))
  const client = db()
  const now = Date.now()

  // The usage signal comes from the ranking view; the content + freshness columns from the
  // table. Read the public library (the surface members see) so the gaps are the ones that
  // actually matter; merged/archived rows are is_public=false and never appear.
  const { data: rankedRows } = await client
    .from('practices_ranked')
    .select('id, title, status, is_public, domain_id, subcategory_id, header_image, body, summary, duration_min, adopters, logs_30d, logs_total')
    .eq('is_public', true)
    .limit(limit)
  const ranked =
    ((rankedRows as
      | {
          id: string; title: string | null; status: string | null; is_public: boolean
          domain_id: string | null; subcategory_id: string | null; header_image: string | null
          body: string | null; summary: string | null; duration_min: number | null
          adopters: number; logs_30d: number; logs_total: number
        }[]
      | null) ?? [])
  if (ranked.length === 0) return []

  // updated_at lives only on the table (the view's columns are frozen): one batched read.
  const ids = ranked.map((r) => r.id)
  const { data: touchRows } = await client.from('practices').select('id, updated_at').in('id', ids)
  const updatedById = new Map(
    ((touchRows as { id: string; updated_at: string | null }[] | null) ?? []).map((r) => [r.id, r.updated_at]),
  )

  const out: NeedsAttentionItem[] = []
  for (const r of ranked) {
    const updated_at = updatedById.get(r.id) ?? null
    const reasons: AttentionReason[] = []
    if (r.domain_id == null) reasons.push('orphaned')
    if (r.header_image == null) reasons.push('imageless')
    if ((r.logs_total || 0) === 0) reasons.push('never_logged')
    if (isStale({ updated_at, logs_30d: r.logs_30d, now })) reasons.push('stale')
    if (reasons.length === 0) continue
    const quality = computeQualityScore({
      title: r.title,
      summary: r.summary,
      body: r.body,
      header_image: r.header_image,
      domain_id: r.domain_id,
      subcategory_id: r.subcategory_id,
      duration_min: r.duration_min,
      adopters: r.adopters,
      logs_30d: r.logs_30d,
      logs_total: r.logs_total,
      updated_at,
      now,
    })
    out.push({ id: r.id, title: r.title ?? '', status: r.status, is_public: r.is_public, reasons, quality })
  }

  // Worst quality first (the most-broken practices lead the fix list).
  out.sort((a, b) => a.quality.score - b.quality.score)
  return out
}

// --- 2.4 Tag governance ------------------------------------------------------

/** One tag in the governance list: its def + how many practices carry it + where it came from. */
export interface TagGovernanceRow {
  id: string
  slug: string
  label: string
  is_canonical: boolean
  /** Distinct practices carrying this tag. */
  usageCount: number
  /** Where the tag's links come from: 'author' | 'member' | 'vera' | 'mixed' | null (unused). */
  source: string | null
}

/**
 * Every tag (canonical + member/Vera-proposed) with its usage count + dominant source, for
 * the tag-governance screen. Canonical first, then by usage desc, then label. One read of the
 * defs + one of the links, joined in memory (the tag vocabulary is small).
 *
 * authz-delegated: read-only; the curator gate lives at the calling page/action.
 */
export async function listAllTags(): Promise<TagGovernanceRow[]> {
  const client = db()
  const [{ data: defRows }, { data: linkRows }] = await Promise.all([
    client.from('practice_tag_defs').select('id, slug, label, is_canonical'),
    client.from('practice_tags').select('tag_id, practice_id, source'),
  ])
  const defs = ((defRows as { id: string; slug: string; label: string; is_canonical: boolean }[] | null) ?? [])
  const links = ((linkRows as { tag_id: string; practice_id: string; source: string | null }[] | null) ?? [])

  // Per-tag: distinct practices + the set of sources seen (→ a single dominant/'mixed' label).
  const practicesByTag = new Map<string, Set<string>>()
  const sourcesByTag = new Map<string, Set<string>>()
  for (const l of links) {
    if (!practicesByTag.has(l.tag_id)) practicesByTag.set(l.tag_id, new Set())
    practicesByTag.get(l.tag_id)!.add(l.practice_id)
    if (l.source) {
      if (!sourcesByTag.has(l.tag_id)) sourcesByTag.set(l.tag_id, new Set())
      sourcesByTag.get(l.tag_id)!.add(l.source)
    }
  }
  const sourceLabel = (s: Set<string> | undefined): string | null => {
    if (!s || s.size === 0) return null
    return s.size === 1 ? [...s][0] : 'mixed'
  }

  const rows: TagGovernanceRow[] = defs.map((d) => ({
    id: d.id,
    slug: d.slug,
    label: d.label,
    is_canonical: d.is_canonical,
    usageCount: practicesByTag.get(d.id)?.size ?? 0,
    source: sourceLabel(sourcesByTag.get(d.id)),
  }))

  rows.sort(
    (a, b) =>
      Number(b.is_canonical) - Number(a.is_canonical) ||
      b.usageCount - a.usageCount ||
      a.label.localeCompare(b.label),
  )
  return rows
}

/**
 * Promote a member/Vera-proposed tag to canonical (it then shows in the library's curated
 * filter row). Idempotent: re-promoting a canonical tag is a no-op patch.
 *
 * authz-delegated: the curator gate lives at the calling action (promoteTagAction).
 */
export async function promoteTagToCanonical(tagId: string): Promise<void> {
  const { error } = await db().from('practice_tag_defs').update({ is_canonical: true }).eq('id', tagId)
  if (error) throw new Error(error.message)
}

/** The outcome of a tag merge: how many links were re-pointed onto the canonical tag and how
 *  many duplicate links were dropped (a practice that already carried both tags). */
export interface MergeTagsResult {
  repointed: number
  dropped: number
}

/**
 * Merge one tag INTO another: re-point every practice_tags link from `fromTagId` to
 * `intoTagId`, dropping the link that would collide (a practice already carrying the target
 * tag — the unique(practice_id, tag_id) constraint), then delete the now-orphaned source def.
 * Mirrors the practice merge's "re-point, drop the unique-conflict duplicate, retire the
 * loser" shape, in TypeScript (there is no dedicated SQL function for tags). Returns the
 * re-pointed + dropped counts.
 *
 * authz-delegated: the curator gate lives at the calling action (mergeTagsAction).
 */
export async function mergeTags(fromTagId: string, intoTagId: string): Promise<MergeTagsResult> {
  if (fromTagId === intoTagId) throw new Error('Cannot merge a tag into itself.')
  const client = db()

  // Every practice that carries each tag (the from-set we re-point, the into-set we dedup against).
  const [{ data: fromLinks }, { data: intoLinks }] = await Promise.all([
    client.from('practice_tags').select('practice_id').eq('tag_id', fromTagId),
    client.from('practice_tags').select('practice_id').eq('tag_id', intoTagId),
  ])
  const fromPractices = ((fromLinks as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id)
  const intoPractices = new Set(((intoLinks as { practice_id: string }[] | null) ?? []).map((r) => r.practice_id))

  // A practice already carrying the target tag would collide on re-point: drop the source link.
  const collisions = fromPractices.filter((pid) => intoPractices.has(pid))
  let dropped = 0
  if (collisions.length > 0) {
    const { error: delErr } = await client
      .from('practice_tags')
      .delete()
      .eq('tag_id', fromTagId)
      .in('practice_id', collisions)
    if (delErr) throw new Error(delErr.message)
    dropped = collisions.length
  }

  // Re-point the rest onto the canonical tag.
  const repointed = fromPractices.length - dropped
  if (repointed > 0) {
    const { error: updErr } = await client
      .from('practice_tags')
      .update({ tag_id: intoTagId })
      .eq('tag_id', fromTagId)
    if (updErr) throw new Error(updErr.message)
  }

  // Retire the now-unused source def (its links are all gone).
  const { error: defErr } = await client.from('practice_tag_defs').delete().eq('id', fromTagId)
  if (defErr) throw new Error(defErr.message)

  return { repointed, dropped }
}
