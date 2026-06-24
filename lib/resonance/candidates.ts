// Resonance candidate generation + the two-stage funnel (Resonance Engine Phase 4 · ADR-385 ·
// docs/NEXT-GEN-CRM.md "The Resonance Graph"). The reliable BASELINE: cheap graph traversal over
// edges Frequency ALREADY has (co-membership in a Circle, a shared Journey, a shared practice, a
// shared Pillar), then the governed re-ranker (lib/resonance/score.ts) scores each candidate
// reciprocally. The embedding layer (lib/resonance/embeddings.ts) is folded in best-effort when it
// is live, and contributes nothing when it is not (degrade-to-graph, the fail-safe rule of phase 4).
//
// CONSENT-FIRST (the trust moat). Matching ONLY ever includes people who have opted IN to matching
// (resonance_consent.opted_in) AND have not opted OUT of being a target. The anchor must be opted
// in too. A member who has said nothing is NOT in the pool (opt-IN default for a person-to-person
// surface; mirrors email_marketing's opt-in default in lib/consent/scopes.ts). Fail-closed: any
// consent read error drops the person from the pool.
//
// Server-only (admin client). The graph tables (memberships / journey_enrollments / member_practices
// / practices) ARE in the schema; resonance_consent is reached untyped until the types regenerate
// (ADR-246). Mirrors the traversal in lib/people-suggestions.ts (the existing "people you may know").
//
// authz-delegated: the READ side trusts its caller to have authorized the scope (the staff-gated
// Person view, or the Space CRM entitlement + owner/admin). It self-SCOPES every read to the anchor
// person and consent, and is FAIL-SAFE (empty list on any error). The WRITE side (persisting edges)
// is the platform-wide nightly refresh, no per-caller scope by design (like lib/traits/refresh.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  resonanceScore,
  resonanceReasons,
  type ResonanceParty,
  type ResonanceAffinity,
  type ResonanceReason,
} from './score'
import { nearestNeighbors } from './embeddings'
import type { ChurnRisk } from '@/lib/traits/compute'

/** One scored, ready-to-surface match for an anchor person. The intro card reads from this. */
export interface ResonanceMatch {
  /** The candidate's profile id (the other person). */
  profileId: string
  /** The reciprocal Resonance Score, 0..1 (higher = stronger mutual fit). */
  score: number
  /** The plain-language WHY (shared belonging only; no stalking-adjacent signal). */
  reasons: ResonanceReason[]
  /** The raw overlap that produced the score (for the edge row + debugging). */
  affinity: ResonanceAffinity
}

const CHURN_VALUES: readonly ChurnRisk[] = ['low', 'medium', 'high']
function asChurn(v: unknown): ChurnRisk {
  return typeof v === 'string' && (CHURN_VALUES as readonly string[]).includes(v) ? (v as ChurnRisk) : 'medium'
}

/** The minimum reciprocal score worth surfacing. Below this, a "match" is noise (a one-sided or
 *  thin-overlap pairing the harmonic mean has already punished). Keeps edges from becoming junk. */
export const MIN_RESONANCE_SCORE = 0.12

// ── Consent (the trust moat) ─────────────────────────────────────────────────────
// resonance_consent.opted_in must be TRUE to be in the pool; opted_out_as_target excludes a person
// from being someone else's match target. Opt-IN default: a row's absence means NOT opted in.

interface ConsentRow {
  profile_id: string
  opted_in: boolean | null
  opted_out_as_target: boolean | null
}

/** Read the matching consent for a set of profiles, fail-closed. Returns a map; an absent row (or
 *  any error) reads as not-opted-in (the opt-IN default for person-to-person matching). */
async function readConsent(profileIds: string[]): Promise<Map<string, { optedIn: boolean; optOutTarget: boolean }>> {
  const map = new Map<string, { optedIn: boolean; optOutTarget: boolean }>()
  if (profileIds.length === 0) return map
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => { in: (col: string, vals: string[]) => Promise<{ data: ConsentRow[] | null; error: unknown }> }
      }
    }
    const { data, error } = await admin
      .from('resonance_consent')
      .select('profile_id, opted_in, opted_out_as_target')
      .in('profile_id', profileIds)
    if (error || !data) return map // fail-closed: nobody is opted in if the read fails
    for (const r of data) {
      map.set(r.profile_id, { optedIn: r.opted_in === true, optOutTarget: r.opted_out_as_target === true })
    }
    return map
  } catch {
    return map
  }
}

/** True when a person may be the ANCHOR of matching (they must have opted in). */
function canAnchor(consent: Map<string, { optedIn: boolean; optOutTarget: boolean }>, pid: string): boolean {
  return consent.get(pid)?.optedIn === true
}

/** True when a person may be a TARGET (opted in AND not opted out as a target). */
function canTarget(consent: Map<string, { optedIn: boolean; optOutTarget: boolean }>, pid: string): boolean {
  const c = consent.get(pid)
  return c?.optedIn === true && c.optOutTarget !== true
}

// ── Graph traversal (the cheap, reliable baseline) ────────────────────────────────

interface AnchorEdges {
  circleIds: string[]
  planIds: string[]
  practiceIds: string[]
  pillarIds: string[]
}

/** Load the anchor's own edges: active Circle memberships, Journey enrollments, adopted practices,
 *  and the Pillars those practices belong to. FAIL-SAFE: empty arrays on any error. */
async function loadAnchorEdges(profileId: string): Promise<AnchorEdges> {
  try {
    const admin = createAdminClient()
    const [memberships, journeys, practices] = await Promise.all([
      admin.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
      admin.from('journey_enrollments').select('plan_id').eq('profile_id', profileId),
      admin.from('member_practices').select('practice_id').eq('profile_id', profileId).eq('active', true),
    ])
    const circleIds = ((memberships.data ?? []) as { circle_id: string }[]).map((r) => r.circle_id)
    const planIds = ((journeys.data ?? []) as { plan_id: string }[]).map((r) => r.plan_id)
    const practiceIds = ((practices.data ?? []) as { practice_id: string }[]).map((r) => r.practice_id)
    const pillarIds = await pillarsForPractices(admin, practiceIds)
    return { circleIds, planIds, practiceIds, pillarIds }
  } catch {
    return { circleIds: [], planIds: [], practiceIds: [], pillarIds: [] }
  }
}

/** The distinct Pillar ids behind a set of practices (practices.domain_id references pillars(id),
 *  the column kept as domain_id through the naming-canon rename, ADR-208). FAIL-SAFE: []. */
async function pillarsForPractices(
  admin: ReturnType<typeof createAdminClient>,
  practiceIds: string[],
): Promise<string[]> {
  if (practiceIds.length === 0) return []
  try {
    const { data } = await admin.from('practices').select('domain_id').in('id', practiceIds)
    const ids = ((data ?? []) as { domain_id: string | null }[]).map((r) => r.domain_id).filter((x): x is string => !!x)
    return [...new Set(ids)]
  } catch {
    return []
  }
}

/** Increment a per-candidate counter (the shared-edge tallies). */
function bump(map: Map<string, ResonanceAffinity>, pid: string, key: keyof Omit<ResonanceAffinity, 'embeddingSimilarity'>) {
  const a = map.get(pid) ?? { sharedCircles: 0, sharedJourneys: 0, sharedPractices: 0, sharedPillars: 0 }
  a[key] += 1
  map.set(pid, a)
}

/**
 * Gather the raw shared-edge affinity for everyone who co-occurs with the anchor on any edge. PURE
 * IO (no scoring): returns a map from candidate profile id to its shared-edge tallies. Each query is
 * bound to the anchor's own edge ids, so the read is scoped to the anchor's neighbourhood (the
 * lib/people-suggestions.ts pattern). FAIL-SAFE: partial results on a partial error, never a throw.
 */
async function traverseEdges(anchorId: string, edges: AnchorEdges): Promise<Map<string, ResonanceAffinity>> {
  const affinityByCandidate = new Map<string, ResonanceAffinity>()
  try {
    const admin = createAdminClient()

    // Co-members of the anchor's active Circles.
    if (edges.circleIds.length > 0) {
      const { data } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', edges.circleIds)
        .eq('status', 'active')
        .neq('profile_id', anchorId)
      for (const r of (data ?? []) as { profile_id: string }[]) bump(affinityByCandidate, r.profile_id, 'sharedCircles')
    }

    // Co-enrollees on the anchor's Journeys.
    if (edges.planIds.length > 0) {
      const { data } = await admin
        .from('journey_enrollments')
        .select('profile_id')
        .in('plan_id', edges.planIds)
        .neq('profile_id', anchorId)
      for (const r of (data ?? []) as { profile_id: string }[]) bump(affinityByCandidate, r.profile_id, 'sharedJourneys')
    }

    // Co-adopters of the anchor's practices.
    if (edges.practiceIds.length > 0) {
      const { data } = await admin
        .from('member_practices')
        .select('profile_id')
        .in('practice_id', edges.practiceIds)
        .eq('active', true)
        .neq('profile_id', anchorId)
      for (const r of (data ?? []) as { profile_id: string }[]) bump(affinityByCandidate, r.profile_id, 'sharedPractices')
    }

    // Shared Pillars: members whose adopted practices fall under one of the anchor's Pillars. Resolve
    // the practices under those Pillars, then their adopters. Capped naturally by the Pillar count (<=4).
    if (edges.pillarIds.length > 0) {
      const { data: pillarPractices } = await admin.from('practices').select('id').in('domain_id', edges.pillarIds)
      const pillarPracticeIds = ((pillarPractices ?? []) as { id: string }[]).map((r) => r.id)
      if (pillarPracticeIds.length > 0) {
        const { data } = await admin
          .from('member_practices')
          .select('profile_id')
          .in('practice_id', pillarPracticeIds)
          .eq('active', true)
          .neq('profile_id', anchorId)
        // One Pillar overlap per candidate (dedupe: many practices can map to the same Pillar).
        const seen = new Set<string>()
        for (const r of (data ?? []) as { profile_id: string }[]) {
          if (seen.has(r.profile_id)) continue
          seen.add(r.profile_id)
          bump(affinityByCandidate, r.profile_id, 'sharedPillars')
        }
      }
    }
  } catch {
    /* partial traversal is fine; return whatever we gathered */
  }
  return affinityByCandidate
}

// ── Receptiveness traits (the re-ranker's down/up-weights) ────────────────────────

interface PartyTraits {
  activationPropensity: number
  churnRisk: ChurnRisk
}

/** Read activation_propensity + churn_risk for a set of members from member_traits (the same store
 *  the Today orchestrator reads). FAIL-SAFE: a member with no traits gets a neutral default. */
async function readPartyTraits(profileIds: string[]): Promise<Map<string, PartyTraits>> {
  const map = new Map<string, PartyTraits>()
  if (profileIds.length === 0) return map
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('member_traits')
      .select('profile_id, trait_key, value_num, value_text')
      .in('profile_id', profileIds)
      .in('trait_key', ['activation_propensity', 'churn_risk'])
    for (const r of (data ?? []) as { profile_id: string; trait_key: string; value_num: number | null; value_text: string | null }[]) {
      const cur = map.get(r.profile_id) ?? { activationPropensity: 0, churnRisk: 'medium' as ChurnRisk }
      if (r.trait_key === 'activation_propensity') cur.activationPropensity = r.value_num ?? 0
      else if (r.trait_key === 'churn_risk') cur.churnRisk = asChurn(r.value_text)
      map.set(r.profile_id, cur)
    }
    return map
  } catch {
    return map
  }
}

function partyOf(pid: string, traits: Map<string, PartyTraits>): ResonanceParty {
  const t = traits.get(pid) ?? { activationPropensity: 0, churnRisk: 'medium' as ChurnRisk }
  return { pid, activationPropensity: t.activationPropensity, churnRisk: t.churnRisk }
}

// ── The two-stage funnel: generate -> re-rank ─────────────────────────────────────

/**
 * The top reciprocal resonance matches for an anchor person. The TWO-STAGE funnel:
 *   1. graph traversal (the reliable baseline) gathers candidates who share a Circle / Journey /
 *      practice / Pillar;
 *   2. best-effort embedding neighbours are folded in when the layer is live (they add candidates
 *      and an embeddingSimilarity term; they contribute NOTHING when absent);
 *   3. the governed re-ranker (lib/resonance/score.ts) scores each candidate RECIPROCALLY and the
 *      consent filter keeps only opted-in anchors + opted-in, not-opted-out targets.
 * FAIL-SAFE: an empty list on any error, when the anchor is not opted in, or when there is no signal.
 * The caller MUST have authorized the scope (the staff Person view, or the Space CRM gate).
 */
export async function generateMatches(anchorId: string, limit = 10): Promise<ResonanceMatch[]> {
  if (!anchorId) return []
  const capped = Math.max(1, Math.min(50, limit))
  try {
    // CONSENT GATE FIRST: the anchor must be opted in, or there is no pool at all (fail-closed).
    const anchorConsent = await readConsent([anchorId])
    if (!canAnchor(anchorConsent, anchorId)) return []

    // Stage 1: graph traversal (the baseline).
    const edges = await loadAnchorEdges(anchorId)
    const affinityByCandidate = await traverseEdges(anchorId, edges)

    // Stage 2: fold in best-effort embedding neighbours (no-op when the layer is absent).
    const neighbors = await nearestNeighbors(anchorId, 30)
    for (const n of neighbors) {
      if (n.profileId === anchorId) continue
      const a = affinityByCandidate.get(n.profileId) ?? {
        sharedCircles: 0,
        sharedJourneys: 0,
        sharedPractices: 0,
        sharedPillars: 0,
      }
      a.embeddingSimilarity = n.similarity
      affinityByCandidate.set(n.profileId, a)
    }

    const candidateIds = [...affinityByCandidate.keys()]
    if (candidateIds.length === 0) return []

    // CONSENT GATE: keep only candidates who opted in AND did not opt out as a target.
    const consent = await readConsent(candidateIds)
    const allowed = candidateIds.filter((pid) => canTarget(consent, pid))
    if (allowed.length === 0) return []

    // Stage 3: the reciprocal re-ranker over the consenting pool.
    const traits = await readPartyTraits([anchorId, ...allowed])
    const anchorParty = partyOf(anchorId, traits)

    const matches: ResonanceMatch[] = []
    for (const pid of allowed) {
      const aff = affinityByCandidate.get(pid)!
      const score = resonanceScore(anchorParty, partyOf(pid, traits), aff)
      if (score < MIN_RESONANCE_SCORE) continue
      matches.push({ profileId: pid, score, reasons: resonanceReasons(aff), affinity: aff })
    }

    matches.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.profileId < b.profileId ? -1 : 1))
    return matches.slice(0, capped)
  } catch {
    return []
  }
}
