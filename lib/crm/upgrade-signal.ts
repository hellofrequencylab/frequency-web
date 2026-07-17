// THE UPGRADE SIGNAL — "who might upgrade to a Business Space?" (Resonance CRM · ADR-625, R5).
// A DERIVED, transparent read over signals the platform already computes: it flags MEMBERS who are
// NOT already a business but behave like one in the making, so an operator can reach out before the
// member goes looking elsewhere. It does NOT touch the classifier (lib/crm/classification.ts owns
// status/business/role/activity); it CONSUMES the classifier's verdict plus the nightly engagement
// traits and blends them into one tunable score + a plain-language "why".
//
// SHAPE (mirrors lib/crm/classification.ts): the scoring is a PURE helper (no Supabase/Next imports)
// so every threshold is deterministic + unit-tested; the IO wrapper (`scoreUpgradeCandidates`)
// gathers the engagement traits with ONE set-based read for the whole cohort (no N+1) and is
// FAIL-SAFE (any error degrades to "no signal", never a throw). The caller gates the read.
//
// Naming + voice (docs/NAMING.md, docs/CONTENT-VOICE.md): every `reason` is plain, sentence case,
// operator-facing, no em dashes.

import { createAdminClient } from '@/lib/supabase/admin'

// ── Tunable knobs (kept together + exported so a future tune is one edit + a test change) ─────────

/** The score bands each behavior contributes. A member's upgrade score is the SUM of the bands they
 *  earn, clamped to 0..100. Fixed points (not a magic blend) so the "why" reads exactly like the math.
 *  Sums to 100 when every band fires, so the score is naturally a 0..100 read. */
export const UPGRADE_WEIGHTS = {
  /** Leads a Circle or larger group (community role host / guide / mentor). The strongest tell: they
   *  already do the work a Business Space formalizes. */
  leadership: 30,
  /** High activation propensity (the nightly model's read on "about to lean in"). */
  activation: 25,
  /** Strong recency + frequency (rfm): they show up and act, not just lurk. */
  rfm: 20,
  /** Engaged right now: weekly-active, or healthy Resonance Health. */
  engaged: 15,
  /** Already operates a Space that is NOT yet a business type (a Circle host with their own space):
   *  the shortest hop to a Business Space. */
  ownsSpace: 10,
} as const

/** The thresholds each 0..100 trait must clear to earn its band. Easy to tune in one place. */
export const UPGRADE_THRESHOLDS = {
  /** activation_propensity at or above this counts as "high". */
  highActivation: 60,
  /** rfm_score at or above this counts as "strong". */
  strongRfm: 60,
  /** resonance_health at or above this counts as "engaged" (weekly-active also qualifies). */
  engagedHealth: 60,
  /** The minimum blended score to flag the member as an upgrade candidate. At the current weights this
   *  needs at least two real signals (e.g. leadership + activation, or activation + rfm + engaged). */
  candidateScore: 55,
} as const

/** The community trust rungs that count as "leads a group" (host and up). Member / crew do not. */
const LEADERSHIP_ROLES: readonly string[] = ['host', 'guide', 'mentor']

// ── The verdict ───────────────────────────────────────────────────────────────────────────────

/** The upgrade read for one member: a 0..100 score, the candidate flag, and the transparent "why". */
export interface UpgradeSignal {
  /** 0..100 blended score (sum of the bands earned). */
  score: number
  /** True when this member is not already a business AND clears the candidate score. */
  isCandidate: boolean
  /** Plain-language reasons, in voice, one per band earned (drives the tooltip / callout). */
  reasons: string[]
}

/** The no-signal default (already a business, or nothing to go on). */
export const NO_UPGRADE_SIGNAL: UpgradeSignal = { score: 0, isCandidate: false, reasons: [] }

/** The per-member inputs the pure scorer needs: the classifier's verdict + the nightly traits. */
export interface UpgradeSignalInput {
  /** From the classifier: already operates a business (owns a business Space or holds an admin seat). */
  isBusiness: boolean
  /** From the classifier: the community trust rung (host+ earns the leadership band). */
  communityRole: string | null
  /** From the classifier: how many active Spaces they own (a non-business Space earns the ownsSpace band). */
  spacesOwned: number
  /** member_engagement_scores.activation_propensity (0..100), or null when unscored. */
  activationPropensity: number | null
  /** member_engagement_scores.rfm_score (0..100), or null when unscored. */
  rfmScore: number | null
  /** member_engagement_scores.resonance_health (0..100), or null when unscored. */
  resonanceHealth: number | null
  /** member_engagement_scores.wam_status (weekly-active), or null when unscored. */
  wamStatus: boolean | null
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))
const atLeast = (v: number | null | undefined, floor: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= floor

/**
 * Score ONE member's upgrade potential. PURE + deterministic. An already-business member is never a
 * candidate (they have nowhere to upgrade to), so they short-circuit to NO_UPGRADE_SIGNAL. Otherwise
 * we sum the bands the member earns and flag them a candidate when the blend clears `candidateScore`.
 * Every earned band adds one voice-safe reason so the score is fully explainable.
 */
export function scoreUpgrade(input: UpgradeSignalInput): UpgradeSignal {
  // Already a business: nothing to upgrade to. No score, no reasons.
  if (input.isBusiness) return NO_UPGRADE_SIGNAL

  let score = 0
  const reasons: string[] = []

  if (input.communityRole && LEADERSHIP_ROLES.includes(input.communityRole)) {
    score += UPGRADE_WEIGHTS.leadership
    reasons.push('Leads a Circle or larger group')
  }
  if (atLeast(input.activationPropensity, UPGRADE_THRESHOLDS.highActivation)) {
    score += UPGRADE_WEIGHTS.activation
    reasons.push('High activation propensity')
  }
  if (atLeast(input.rfmScore, UPGRADE_THRESHOLDS.strongRfm)) {
    score += UPGRADE_WEIGHTS.rfm
    reasons.push('Strong recency and frequency')
  }
  if (input.wamStatus === true || atLeast(input.resonanceHealth, UPGRADE_THRESHOLDS.engagedHealth)) {
    score += UPGRADE_WEIGHTS.engaged
    reasons.push('Engaged this week')
  }
  // Owns a Space but it is not a business type yet (spacesOwned > 0 while isBusiness is false): the
  // shortest hop. isBusiness already gates this branch, so any owned Space here is a non-business one.
  if (input.spacesOwned > 0) {
    score += UPGRADE_WEIGHTS.ownsSpace
    reasons.push('Already runs a Space')
  }

  const finalScore = clamp100(score)
  return {
    score: finalScore,
    isCandidate: finalScore >= UPGRADE_THRESHOLDS.candidateScore,
    reasons,
  }
}

// ── Batch IO (one set-based read, no N+1, fail-safe) ────────────────────────────────────────────

/** What the caller already knows about a member (the classifier's verdict) keyed to their profile. */
export interface UpgradeCohortEntry {
  profileId: string
  isBusiness: boolean
  communityRole: string | null
  spacesOwned: number
}

/** The engagement traits the scorer blends on top of the classifier verdict (untyped matview read). */
interface EngagementTraitRow {
  profile_id: string
  activation_propensity: number | null
  rfm_score: number | null
  resonance_health: number | null
  wam_status: boolean | null
}

/**
 * Score a COHORT of members for upgrade potential, keyed by profile id. Reads the nightly engagement
 * traits for the whole set in ONE batched query (no per-member N+1), then blends each with the
 * classifier verdict the caller passed. FAIL-SAFE: a missing matview / any error degrades every member
 * to their traitless read (still scored on the classifier signals), never a throw. The caller (a
 * staff-gated CRM surface) gates the read.
 */
export async function scoreUpgradeCandidates(
  cohort: UpgradeCohortEntry[],
): Promise<Map<string, UpgradeSignal>> {
  const out = new Map<string, UpgradeSignal>()
  const entries = cohort.filter((e) => e.profileId)
  if (entries.length === 0) return out

  const ids = [...new Set(entries.map((e) => e.profileId))]
  const traits = new Map<string, EngagementTraitRow>()
  try {
    const admin = createAdminClient()
    const { data } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: EngagementTraitRow[] | null }>
        }
      }
    })
      .from('member_engagement_scores')
      .select('profile_id, activation_propensity, rfm_score, resonance_health, wam_status')
      .in('profile_id', ids)
    for (const r of data ?? []) traits.set(r.profile_id, r)
  } catch {
    /* fall through: score on the classifier signals alone (fail-safe) */
  }

  for (const e of entries) {
    const t = traits.get(e.profileId)
    out.set(
      e.profileId,
      scoreUpgrade({
        isBusiness: e.isBusiness,
        communityRole: e.communityRole,
        spacesOwned: e.spacesOwned,
        activationPropensity: t?.activation_propensity ?? null,
        rfmScore: t?.rfm_score ?? null,
        resonanceHealth: t?.resonance_health ?? null,
        wamStatus: t?.wam_status ?? null,
      }),
    )
  }
  return out
}
