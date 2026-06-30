// Practice library, Phase 2 "Clean" merge suggestions (ADR-438, PRACTICE-LIBRARY §6 item 2.2).
//
// PURE shaping, no I/O, fully unit-tested. The merge module reuses the near-duplicate signal the
// review queue already computes (listReviewQueue's possibleDuplicateOf, one HNSW lookup per pending
// row) and turns it into a ranked list of suggested merge PAIRS the curator can act on directly,
// rather than re-running the per-practice duplicate finder. The DB read lives in lib/practices/
// clean.ts (listReviewQueue); this is the shaping rule the UI ranks on, kept separate so the
// boundaries are testable without a database.
//
// A pair's default direction is "fold the pending submission INTO the existing canonical": the
// existing public practice keeps its slug + history, the new near-identical copy is the one that
// re-points away. The panel lets the curator flip that before confirming.

/** The minimal review-queue shape this module reads: a pending row + its near-dup match. */
export interface MergeCandidateInput {
  id: string
  title: string
  /** The existing near-identical practice the vector check flagged, when one cleared the threshold. */
  possibleDuplicateOf: { id: string; title: string; similarity: number } | null
}

/** One suggested merge: fold the duplicate INTO the canonical. Direction is the default
 *  (pending → existing); the curator can flip it in the panel before confirming. */
export interface MergePair {
  /** The practice that folds away (re-points its FKs onto the canonical, then archives). */
  duplicate: { id: string; title: string }
  /** The practice that is kept (kept slug + history). */
  canonical: { id: string; title: string }
  /** Cosine similarity of the match (0-1); higher = more alike. Drives the ranking. */
  similarity: number
}

/**
 * Build the ranked list of suggested merge pairs from the review queue's near-dup signal.
 * Drops rows with no match and any accidental self-pair (a row flagged against itself), de-dupes
 * the unordered {a,b} pair (so a back-reference doesn't list the same merge twice), and orders
 * most-alike first (the safest, most obvious merges lead). Pure + total: an empty or match-less
 * queue yields an empty list.
 *
 * The DEFAULT direction folds the PENDING submission (the queue row) into the EXISTING match
 * (the canonical it resembles): the public practice keeps its slug + adoption history, the new
 * copy is the throwaway. The panel surfaces a flip for the rare case the curator wants the
 * newer one to win.
 */
export function buildMergePairs(rows: readonly MergeCandidateInput[]): MergePair[] {
  const pairs: MergePair[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const match = row.possibleDuplicateOf
    if (!match) continue
    if (match.id === row.id) continue // never pair a row with itself

    // De-dupe the unordered pair so {a→b} and a later {b→a} surface once.
    const key = [row.id, match.id].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    pairs.push({
      duplicate: { id: row.id, title: row.title },
      canonical: { id: match.id, title: match.title },
      similarity: clampSimilarity(match.similarity),
    })
  }

  // Most-alike first: the highest-confidence merges lead the list.
  pairs.sort((a, b) => b.similarity - a.similarity)
  return pairs
}

/** A similarity rendered as a whole-number percent (the panel's "94% alike" chip). Clamped 0-100. */
export function similarityPercent(similarity: number): number {
  return Math.round(clampSimilarity(similarity) * 100)
}

function clampSimilarity(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
