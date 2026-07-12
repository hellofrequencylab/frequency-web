// PURE review-aggregate math (Reviews redesign). Kept in its own framework-free module so both the
// server reader (lib/spaces/content-data.ts getSpaceReviews) and the unit tests can use it without
// pulling in the admin client or any server-only import. No IO, no Supabase, no Next.
//
// It turns a flat list of 1..5 ratings into the three numbers the redesigned Reviews page needs:
//   - average       one decimal, or null when there are no ratings (never a fake 0.0);
//   - count         how many ratings there are;
//   - distribution  a per-star tally { 5, 4, 3, 2, 1 } for the summary bars.
// FAIL-SAFE: a non-1..5 value (a malformed row) is ignored, so a garbage rating never skews the bars
// or the average. No em or en dashes.

/** A per-star tally, keyed by the five valid star values. */
export type RatingDistribution = { 5: number; 4: number; 3: number; 2: number; 1: number }

/** The summary a reviews wall renders above the list: the average (one decimal, or null when empty),
 *  the count, and the per-star distribution. */
export interface ReviewAggregate {
  average: number | null
  count: number
  distribution: RatingDistribution
}

/** A star value we accept: an integer 1..5. Anything else is dropped (fail-safe). */
function toStar(value: number): 1 | 2 | 3 | 4 | 5 | null {
  const n = Math.trunc(value)
  return n >= 1 && n <= 5 ? (n as 1 | 2 | 3 | 4 | 5) : null
}

/** Compute the average (rounded to one decimal), the count, and the per-star distribution from a flat
 *  list of ratings. Ignores any value outside 1..5. Empty (or all-invalid) input yields
 *  { average: null, count: 0, distribution: all zeros }. PURE. */
export function computeReviewAggregate(ratings: readonly number[]): ReviewAggregate {
  const distribution: RatingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  let sum = 0
  let count = 0
  for (const raw of ratings) {
    const star = toStar(raw)
    if (star == null) continue
    distribution[star] += 1
    sum += star
    count += 1
  }
  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : null
  return { average, count, distribution }
}
