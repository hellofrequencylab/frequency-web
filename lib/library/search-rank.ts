// The Loom — search RANKING (PROG-D1's search half). PURE: rows in, ordered rows out, no IO.
//
// WHY RANKING HAPPENS HERE AND NOT IN POSTGRES. The schema already carries both indexes this needs
// — a generated `search_tsv` with a GIN index and a `gin_trgm_ops` index on `title`
// (20260919000000_library_assets.sql). What PostgREST cannot do is `order by ts_rank(...)`: it can
// FILTER on a tsvector (`textSearch`) but it cannot sort by a computed rank, because the rank is not
// a column. The two ways out are (a) a `search_library_assets` RPC mirroring the existing
// `match_library_assets`, which is a migration and therefore ADR-1111 ordering risk on every other
// open branch, or (b) rank the matched page in process. This is (b), and it is deliberately first:
// it ships the ranked behaviour with zero schema surface, and if the corpus ever outgrows the
// candidate cap the RPC is a drop-in replacement for `rankLibraryMatches` alone.
//
// THE TWO RETRIEVAL ARMS AND WHY BOTH EXIST. Full-text search is stemmed and word-oriented: it
// matches "running" to "run" and ranks whole words, and it CANNOT match a fragment or a typo.
// Trigram (`ilike '%q%'`, which the trgm index serves) matches fragments and survives a misspelling,
// and ranks nothing. Neither is a superset of the other, so both run and their results are merged
// here. A row found by both should outrank a row found by one, and this file is where that is said.

/** The subset of a library row ranking reads. Kept structural so both the Studio's gallery item and
 *  the picker's pick asset satisfy it without a conversion. */
export type RankableAsset = {
  id: string
  title: string
  category?: string | null
  description?: string | null
  tags?: string[] | null
  createdAt?: string | null
}

/** How many rows each retrieval arm may pull before ranking. Sized so the ranked page is honest for
 *  every real Loom (the largest space holds low thousands of assets) while keeping the in-process
 *  sort trivially cheap. `rankLibraryMatches` is where an RPC would take over if this stopped
 *  holding — see the header. */
export const SEARCH_CANDIDATE_CAP = 400

/** Split a query into comparable lowercase terms. */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** The trigram set of a string, matching pg_trgm's convention: the value is padded with two leading
 *  and one trailing space per word so short words still produce trigrams. */
export function trigrams(value: string): Set<string> {
  const out = new Set<string>()
  for (const word of value.toLowerCase().split(/[^a-z0-9]+/i)) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}

/**
 * pg_trgm-style similarity: |A ∩ B| / |A ∪ B| over trigram sets, in 0..1. This is what makes the
 * ranking TYPO-TOLERANT rather than merely substring-tolerant — "lavendar" still scores high
 * against "lavender", where an `ilike` alone would only have matched because the trigram INDEX let
 * it through, and would then have had no way to say how good the match was.
 */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return shared / (A.size + B.size - shared)
}

/**
 * The relevance score for one row against one query. Higher is better; 0 means "nothing matched".
 *
 * The weighting says, in order: an exact title is what you meant; a title that STARTS with the query
 * is nearly as good; a title that merely contains it is next; a tag is a curated label and beats an
 * incidental word in a description. `ftsHit` is the signal from Postgres — the row satisfied
 * `search_tsv @@ websearch_to_tsquery(...)`, i.e. it matched on STEMS, which is the one thing this
 * function cannot work out for itself.
 */
export function relevanceScore(asset: RankableAsset, query: string, ftsHit: boolean): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const title = (asset.title ?? '').toLowerCase()
  const category = (asset.category ?? '').toLowerCase()
  const description = (asset.description ?? '').toLowerCase()
  const tags = (asset.tags ?? []).map((t) => t.toLowerCase())
  const terms = searchTerms(q)

  let score = 0
  if (title === q) score += 120
  else if (title.startsWith(q)) score += 70
  else if (title.includes(q)) score += 45

  if (tags.includes(q)) score += 40
  if (category === q) score += 30
  else if (category.includes(q)) score += 12
  if (description.includes(q)) score += 10

  // Per-term credit, so a multi-word query that matches partly still ranks above one that does not.
  for (const term of terms) {
    if (title.includes(term)) score += 8
    if (tags.some((t) => t.includes(term))) score += 5
    if (category.includes(term)) score += 3
    if (description.includes(term)) score += 2
  }

  // Stemmed full-text agreement from Postgres.
  if (ftsHit) score += 25

  // Typo tolerance: worth up to 30, and it is what carries a misspelling that no substring hits.
  score += Math.round(trigramSimilarity(q, title) * 30)

  return score
}

/**
 * Order merged candidates by relevance, most relevant first. Ties break on recency (newest first)
 * and then on id, so the order is TOTAL — a stable sort is not enough when the same query is paged
 * twice against two different candidate orders from Postgres, which is exactly what a paginated
 * ranked search does.
 */
export function rankLibraryMatches<T extends RankableAsset>(
  rows: readonly T[],
  query: string,
  ftsHitIds: ReadonlySet<string>,
): T[] {
  const scored = rows.map((row) => ({ row, score: relevanceScore(row, query, ftsHitIds.has(row.id)) }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const at = a.row.createdAt ?? ''
    const bt = b.row.createdAt ?? ''
    if (at !== bt) return at < bt ? 1 : -1
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0
  })
  return scored.map((s) => s.row)
}

/**
 * Merge the two retrieval arms into one candidate list, first occurrence wins.
 *
 * Order matters for nothing except determinism — `rankLibraryMatches` re-sorts everything — but
 * de-duplication does: a row found by BOTH arms must appear once, and must keep the `ftsHit` flag
 * that its full-text appearance earned it.
 */
export function mergeCandidates<T extends { id: string }>(fts: readonly T[], trigram: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const arm of [fts, trigram]) {
    for (const row of arm) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push(row)
    }
  }
  return out
}
