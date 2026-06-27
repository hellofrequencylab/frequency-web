// The blended resonance rank (Resonance Feed Phase 1, ADR-414 →
// docs/RESONANCE-FEED-ARCHITECTURE.md §3). A pure, deterministic scorer that
// orders the "For you" feed by a weighted blend of FIVE signals, then a light
// diversity rerank so no one author dominates the top.
//
//   proximity  · how near the post's scope is, on the fuzzed-geocell distance
//   graph      · how much the viewer resonates with the author (orbit + edges)
//   interest   · folded into `graph` for now; post-content embeddings land later
//   recency    · time-decay, so the feed stays alive
//   engagement · the post's own reaction/comment heat
//
// FAIL-SAFE BY DESIGN: every signal is optional. A signal that is absent for an
// item (no distance, no engagement) is simply dropped and its weight redistributed
// across the present signals — so a post is never PENALIZED for missing a signal.
// With no resonance map and no geo, this reduces to "recency, with an engagement
// nudge" — i.e. today's behavior. Pure (no IO), so it is unit-tested in isolation;
// the server seam (lib/feed/viewer-resonance.ts) fetches the inputs.

export interface BlendableItem {
  id: string
  /** profiles.id of the author — the key into the viewer's resonance map. */
  authorId: string | null
  engagement_score?: number | null
  created_at: string
  /** Meters to the post's scope, when the feed query computed it (else null/absent). */
  distance_m?: number | null
  post_type?: string | null
}

export interface BlendWeights {
  proximity: number
  graph: number
  engagement: number
  recency: number
}

// The default blend. Graph leads (resonance is the point), recency + proximity
// matter, engagement is the lightest nudge. Tunable per call.
export const DEFAULT_BLEND_WEIGHTS: BlendWeights = {
  proximity: 0.25,
  graph: 0.3,
  engagement: 0.2,
  recency: 0.25,
}

export interface BlendContext {
  /** Stamp the "now" so scoring is deterministic for a given request + testable. */
  nowMs: number
  /** authorId → resonance strength in [0, 1] (orbit co-presence + match edges). */
  resonance: Map<string, number>
  /** The viewer's feed radius in meters — proximity is normalized against it. */
  radiusM: number
  weights?: Partial<BlendWeights>
  /** Recency half-life in hours (default 36h). */
  recencyHalfLifeH?: number
  /** Engagement saturation constant (default 20): es / (es + K) ∈ [0, 1). */
  engagementK?: number
  /** Max items from one author in the primary band before the rest defer (default 2). */
  maxPerAuthor?: number
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/** The "now" stamp for a blend pass. Lives here (a plain module, not a component) so
 *  callers in Server Components read the clock without tripping react-hooks/purity;
 *  the pure scorers still take `nowMs` explicitly so they stay deterministic in tests. */
export function feedNowMs(): number {
  return Date.now()
}

/** One signal's contribution, or null when the signal is absent for this item. */
interface Signal {
  weight: number
  value: number | null
}

/**
 * The blended score for one item in [0, 1] (plus a small additive soft boost for
 * announcements). Present signals are weighted and renormalized over their own
 * weights, so a missing signal never drags the score down.
 */
export function blendScore(item: BlendableItem, ctx: BlendContext): number {
  const w = { ...DEFAULT_BLEND_WEIGHTS, ...(ctx.weights ?? {}) }
  const halfLife = ctx.recencyHalfLifeH ?? 36
  const engK = ctx.engagementK ?? 20
  const radius = Math.max(ctx.radiusM, 1)

  // Proximity — present only when the feed computed a distance (scope has geo).
  const proximity: Signal = {
    weight: w.proximity,
    value: item.distance_m == null ? null : clamp01(1 - item.distance_m / radius),
  }

  // Graph — the viewer's resonance with the author. Always "present" (0 = no known
  // affinity is a real signal), but only when there's an author to key on.
  const graph: Signal = {
    weight: w.graph,
    value: item.authorId ? (ctx.resonance.get(item.authorId) ?? 0) : null,
  }

  // Engagement — saturating so a runaway-popular post can't swamp the blend.
  const engagement: Signal = {
    weight: w.engagement,
    value: item.engagement_score == null ? null : item.engagement_score / (item.engagement_score + engK),
  }

  // Recency — exponential decay from `now`. Always present.
  const ageH = Math.max(0, (ctx.nowMs - new Date(item.created_at).getTime()) / 3_600_000)
  const recency: Signal = { weight: w.recency, value: clamp01(Math.pow(0.5, ageH / halfLife)) }

  let num = 0
  let den = 0
  for (const s of [proximity, graph, engagement, recency]) {
    if (s.value == null) continue
    num += s.weight * s.value
    den += s.weight
  }
  let score = den > 0 ? num / den : 0

  // Soft signal: an announcement is a deliberate "everyone should see this" — a
  // small additive nudge, never enough to bury a strongly-resonant post.
  if (item.post_type === 'announcement') score = clamp01(score + 0.05)

  return score
}

/**
 * Diversity rerank: cap each author to `maxPerAuthor` items in the PRIMARY band,
 * deferring the rest to the tail (in score order). Keeps the top of the feed
 * varied instead of a single prolific author's wall. Stable for ties.
 */
export function diversityRerank<T extends BlendableItem>(sorted: T[], maxPerAuthor = 2): T[] {
  const primary: T[] = []
  const deferred: T[] = []
  const counts = new Map<string, number>()
  for (const it of sorted) {
    const key = it.authorId ?? it.id
    const c = counts.get(key) ?? 0
    if (c >= maxPerAuthor) {
      deferred.push(it)
    } else {
      counts.set(key, c + 1)
      primary.push(it)
    }
  }
  return [...primary, ...deferred]
}

/**
 * Rank feed items by the blended resonance score, then diversity-rerank, then cap.
 * Dedupes by id. Deterministic for a given context.
 */
export function blendRank<T extends BlendableItem>(items: T[], ctx: BlendContext, limit = 40): T[] {
  const seen = new Set<string>()
  const scored = items
    .filter((it) => {
      if (seen.has(it.id)) return false
      seen.add(it.id)
      return true
    })
    .map((it) => ({ it, score: blendScore(it, ctx) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Tiebreak on recency so equal-score items still read newest-first.
      return new Date(b.it.created_at).getTime() - new Date(a.it.created_at).getTime()
    })
    .map((s) => s.it)

  return diversityRerank(scored, ctx.maxPerAuthor ?? 2).slice(0, limit)
}
