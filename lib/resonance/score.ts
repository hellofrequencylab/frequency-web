// The Resonance Graph re-ranker (Resonance Engine Phase 4 · ADR-385 · docs/NEXT-GEN-CRM.md
// "The Resonance Graph"). The defensible part: a RECIPROCAL, consent-first resonance score between
// two people. PURE — no IO, no Supabase/Next imports, no clock — so it is trivially unit-testable
// and can be imported from the candidate generator, the cron, a Server Component, or a test alike.
//
// The whole law in one line:
//   resonanceScore(A, B) = harmonicMean( want(A -> B), want(B -> A) )
//
// The harmonic mean PUNISHES one-sided matches. If A wants the intro but B would not engage back,
// the score collapses toward zero, so Vera never pesters a quiet member to meet a power host who
// would not reciprocate. This is the literal expression of "resonate, do not extract": a match only
// scores high when BOTH sides would gain.
//
// `want(A -> B)` fuses how much overlap (affinity) A shares with B, weighted by B's receptiveness
// AS A TARGET:
//   • affinity        — shared edges (a Circle, a Journey, a practice, a Pillar) + optional cosine
//                       similarity from the best-effort resonance embedding. The raw "they overlap".
//   • activation_propensity (of the TARGET) — UP-weights. A receptive, on-the-rise member makes a
//                       better intro target.
//   • churn_risk (of the TARGET) — DOWN-weights. We never route an at-risk member as someone else's
//                       intro target (they have their own retention need first; do not extract from them).
// Receptiveness reuses the existing PI traits (lib/traits/compute.ts) verbatim, so the Resonance
// Graph never invents a new model: it re-ranks cheap candidates with signals we already compute.

import type { ChurnRisk } from '@/lib/traits/compute'

/** One person's side of a potential match, as the re-ranker reads it. Every field is a trait or a
 *  cheap derivation we already have, so the score never needs a new data source. */
export interface ResonanceParty {
  /** The unified person id (a profile id for v1). Used only for stable tie-breaks, never scored. */
  pid: string
  /** Activation propensity (0..100). The TARGET's receptiveness up-weight. 100 = fully receptive. */
  activationPropensity: number
  /** Churn risk band. The TARGET's down-weight: an at-risk member is a poor intro target. */
  churnRisk: ChurnRisk
}

/** The overlap between two people, the raw "they share something" before receptiveness weighting.
 *  Both the structural edges (graph traversal) and the optional embedding similarity feed it. */
export interface ResonanceAffinity {
  /** Shared Circle co-memberships. */
  sharedCircles: number
  /** Shared Journeys (enrolled in or completed the same one). */
  sharedJourneys: number
  /** Shared practices (both adopted the same practice). */
  sharedPractices: number
  /** Shared Pillars (Mind / Body / Spirit / Expression), derived from their practices. */
  sharedPillars: number
  /** Cosine similarity of the two resonance embeddings (0..1), or null when embeddings are absent
   *  (the fail-safe default until the pgvector migration applies). Null contributes nothing. */
  embeddingSimilarity?: number | null
}

/** One plain-language reason an intro is suggested. The card shows these as the WHY (privacy moat:
 *  never a stalking-adjacent signal, only a shared belonging). No em or en dashes. */
export interface ResonanceReason {
  /** A stable kind for testing + analytics. */
  kind: 'circle' | 'journey' | 'practice' | 'pillar' | 'affinity'
  /** The plain, in-voice phrase naming the shared thing. */
  label: string
}

// ── Affinity (the raw overlap, 0..1) ────────────────────────────────────────────
// Each shared-edge kind contributes a diminishing amount (the first shared Circle matters most;
// the fifth adds little), so two people who share one strong tie are not buried under two people
// who happen to co-occur in many low-signal groups. Embedding similarity, when present, is folded
// in as a content signal. The result is clamped to [0, 1].

const W_CIRCLE = 0.34
const W_JOURNEY = 0.26
const W_PRACTICE = 0.2
const W_PILLAR = 0.2
// The embedding (content) signal's share once it exists. Best-effort: null contributes nothing, so
// the graph-traversal baseline stands on its own (the reliable layer).
const W_EMBEDDING = 0.4

/** Diminishing returns on a count: 1 -> ~0.63, 2 -> ~0.86, 3 -> ~0.95. Saturates near 1, so more
 *  shared ties always help but never explode. PURE. */
function saturate(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return 1 - Math.exp(-count)
}

/**
 * The raw affinity between two people, 0..1. PURE + symmetric (affinity(A,B) === affinity(B,A)):
 * shared edges are mutual, so this side of the score does not depend on direction. Structural edges
 * carry the baseline; the optional embedding similarity adds the content signal when present. Always
 * lands in [0, 1] (every term is clamped), so a malformed input can never push a score out of range.
 */
export function affinity(a: ResonanceAffinity): number {
  const structural =
    W_CIRCLE * saturate(a.sharedCircles) +
    W_JOURNEY * saturate(a.sharedJourneys) +
    W_PRACTICE * saturate(a.sharedPractices) +
    W_PILLAR * saturate(a.sharedPillars)
  // structural is in [0, 0.34+0.26+0.2+0.2 = 1.0] by construction.
  const sim =
    typeof a.embeddingSimilarity === 'number' && Number.isFinite(a.embeddingSimilarity)
      ? Math.max(0, Math.min(1, a.embeddingSimilarity))
      : null
  // Blend: when an embedding exists, it carries W_EMBEDDING of the affinity; otherwise the structural
  // baseline stands alone (the fail-safe path). Either way the result is clamped to [0, 1].
  const blended = sim === null ? structural : (1 - W_EMBEDDING) * structural + W_EMBEDDING * sim
  return Math.max(0, Math.min(1, blended))
}

// ── Receptiveness (how good a TARGET this person is, 0..1) ───────────────────────
// activation_propensity UP-weights (a receptive, rising member is a better target); churn_risk
// DOWN-weights (we never route an at-risk member as someone else's intro target). The two combine
// multiplicatively so a high-churn target is heavily discounted even when propensity is high.

const CHURN_RECEPTIVENESS: Record<ChurnRisk, number> = { low: 1, medium: 0.6, high: 0.25 }

/** How receptive a person is AS A TARGET, 0..1. PURE. The propensity (0..100) normalized with a small
 *  floor (so a zero-propensity member is not a hard zero), times the churn down-weight. */
export function receptiveness(target: ResonanceParty): number {
  const prop = Math.max(0, Math.min(100, target.activationPropensity)) / 100
  const propTerm = 0.3 + 0.7 * prop // floor 0.3 so propensity lifts rather than zeroes
  const churnTerm = CHURN_RECEPTIVENESS[target.churnRisk] ?? CHURN_RECEPTIVENESS.high
  return Math.max(0, Math.min(1, propTerm * churnTerm))
}

/**
 * How much `from` would gain from an intro to `to`, 0..1. PURE. The shared affinity weighted by the
 * TARGET's receptiveness: A wanting B depends on B being a good target (receptive, not at risk). This
 * is the directional term the harmonic mean then makes reciprocal.
 */
export function want(affinityScore: number, to: ResonanceParty): number {
  const aff = Math.max(0, Math.min(1, affinityScore))
  return aff * receptiveness(to)
}

/**
 * The harmonic mean of two non-negative numbers, 0 when either is 0. PURE. The reciprocity engine:
 * unlike the arithmetic mean, the harmonic mean is dragged toward the SMALLER value, so a one-sided
 * match (one side near zero) collapses. `harmonicMean(0.9, 0.1) ~= 0.18`, far below `0.5`.
 */
export function harmonicMean(x: number, y: number): number {
  const a = Math.max(0, x)
  const b = Math.max(0, y)
  if (a === 0 || b === 0) return 0
  return (2 * a * b) / (a + b)
}

/**
 * The reciprocal Resonance Score between A and B, 0..1. PURE + symmetric
 * (resonanceScore(A,B,aff) === resonanceScore(B,A,aff)). The harmonic mean of want(A->B) and
 * want(B->A): high ONLY when both sides would gain. A great-but-one-sided pairing scores low by
 * design (resonate, do not extract). The shared affinity is computed once and passed to both sides.
 */
export function resonanceScore(a: ResonanceParty, b: ResonanceParty, aff: ResonanceAffinity): number {
  const affinityScore = affinity(aff)
  const wantAtoB = want(affinityScore, b)
  const wantBtoA = want(affinityScore, a)
  return harmonicMean(wantAtoB, wantBtoA)
}

/**
 * The plain-language reasons behind a match, most-decisive first, capped (the card's WHY). PURE.
 * Privacy moat: only shared BELONGING (a Circle, a Journey, a practice, a Pillar), never a
 * stalking-adjacent signal. No em or en dashes. Returns an empty array when there is no concrete
 * shared edge (an embedding-only match shows the generic affinity line).
 */
export function resonanceReasons(aff: ResonanceAffinity, cap = 2): ResonanceReason[] {
  const reasons: ResonanceReason[] = []
  if (aff.sharedCircles > 0) {
    reasons.push({
      kind: 'circle',
      label: aff.sharedCircles === 1 ? 'you are in the same Circle' : `you share ${aff.sharedCircles} Circles`,
    })
  }
  if (aff.sharedPillars > 0) {
    reasons.push({
      kind: 'pillar',
      label: aff.sharedPillars === 1 ? 'you share a Pillar' : `you share ${aff.sharedPillars} Pillars`,
    })
  }
  if (aff.sharedJourneys > 0) {
    reasons.push({
      kind: 'journey',
      label: aff.sharedJourneys === 1 ? 'you are on the same Journey' : `you share ${aff.sharedJourneys} Journeys`,
    })
  }
  if (aff.sharedPractices > 0) {
    reasons.push({
      kind: 'practice',
      label: aff.sharedPractices === 1 ? 'you do the same Practice' : `you share ${aff.sharedPractices} Practices`,
    })
  }
  if (reasons.length === 0) {
    const sim = aff.embeddingSimilarity
    if (typeof sim === 'number' && sim > 0) reasons.push({ kind: 'affinity', label: 'you have a lot in common' })
  }
  return reasons.slice(0, cap)
}
