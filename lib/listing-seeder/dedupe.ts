// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — soft dedupe (Wave 3 polish). SERVER-ONLY.
//
// Before an operator publishes a seed, we warn (never block) when a SIMILAR seeded
// listing already exists in the same city: an unclaimed seed still held by Frequency,
// or a previously-seeded listing that has since been claimed. The title match is a
// PURE Jaccard over normalized title tokens (titleSimilarity), unit-tested on its own;
// the query is scoped to the target table for the kind, filtered to same-city seeded
// rows via the admin client. Fail-soft to [] everywhere — a dedupe miss must never
// stand between the operator and a publish.
//
// The claim_* columns are typed in database.types now (ADR-246 note is stale for these),
// so this reads through the typed client with an explicit per-kind branch.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeedOwnerProfileId } from './seed-owner'
import type { ListingSeedKind } from './types'

/** Two titles this close (token Jaccard) count as "similar" for the dedupe warning. */
const SIMILAR_THRESHOLD = 0.6

/** Lowercase, strip punctuation, split to the set of distinct word tokens. PURE. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    (title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  )
}

/**
 * Token-overlap similarity of two titles (Jaccard: shared tokens / union tokens), 0..1. PURE, so
 * it is unit-tested without any DB. Two empty titles are treated as dissimilar (0), never a false 1.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared += 1
  const union = ta.size + tb.size - shared
  return union === 0 ? 0 : shared / union
}

/** One dedupe hit: an existing seeded listing whose title looks like the one about to publish. */
export interface SimilarSeededListing {
  id: string
  title: string
  /** True when this existing listing was already claimed (owner transferred away from the seed owner). */
  claimed: boolean
}

export interface FindSimilarInput {
  kind: ListingSeedKind
  title: string
  city: string | null
}

/** A candidate row shape shared across the two verticals. */
interface CandidateRow {
  id: string
  title: string | null
  claimed_at: string | null
}

/**
 * Find seeded listings similar to the one about to publish: same kind, same city, and a
 * title within SIMILAR_THRESHOLD. "Seeded" means the row is either still held by the Frequency
 * seed owner (an unclaimed seed) OR carries a claimed_at stamp (a listing the seeder created and
 * someone has since claimed) — claimed_at is a seeder-only column, so ordinary member listings are
 * excluded. Reads only; fail-soft to [] (no seed owner, empty title, or any error).
 */
export async function findSimilarSeededListings(input: FindSimilarInput): Promise<SimilarSeededListing[]> {
  const title = (input.title ?? '').trim()
  if (!title) return []

  const seedOwnerId = await resolveSeedOwnerProfileId()
  if (!seedOwnerId) return []

  const city = (input.city ?? '').trim()

  try {
    const admin = createAdminClient()
    let rows: CandidateRow[] = []

    if (input.kind === 'classifieds') {
      let q = admin.from('market_listings').select('id, title, claimed_at, author_id')
      if (city) q = q.ilike('city', city)
      const { data } = await q.or(`author_id.eq.${seedOwnerId},claimed_at.not.is.null`).limit(50)
      rows = (data ?? []) as CandidateRow[]
    } else {
      let q = admin.from('listings').select('id, title, claimed_at, owner_profile_id').eq('vertical', 'housing')
      if (city) q = q.ilike('city', city)
      const { data } = await q.or(`owner_profile_id.eq.${seedOwnerId},claimed_at.not.is.null`).limit(50)
      rows = (data ?? []) as CandidateRow[]
    }

    const out: SimilarSeededListing[] = []
    for (const r of rows) {
      const t = (r.title ?? '').trim()
      if (!t) continue
      if (titleSimilarity(title, t) >= SIMILAR_THRESHOLD) {
        out.push({ id: r.id, title: t, claimed: r.claimed_at != null })
      }
    }
    return out
  } catch {
    return []
  }
}
