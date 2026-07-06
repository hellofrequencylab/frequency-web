// PER-SPACE CONTACT AT-RISK / CHURN SCORER (ADR-560, docs/NEXT-GEN-CRM.md "the win-back gap").
//
// A PURE, rules-based scorer that turns the raw signals already on a Space contact row (recency of
// last contact/activity, engagement decay, opt-out, and the member's practice-streak-at-risk signal)
// into a churn/at-risk SCORE in [0, 100], an at-risk FLAG, and the contributing FACTORS. This is the
// source of truth for the contacts.risk_score / at_risk / risk_factors projection columns
// (20261017000000_contact_at_risk.sql): a writer/cron persists what this emits; the cockpit read can
// also derive it live from the raw signals before any writer lands.
//
// RULES FIRST, ML LATER. Every rule is a small, named, weighted function of one signal, so the whole
// score is explainable ("why is this contact at risk?" -> the factors list) and unit-testable with no
// IO. The ML SEAM is deliberate: scoreContactRisk takes a plain ContactRiskSignals struct, so a future
// model can either replace this function wholesale or blend its output with these rules without any
// caller change (the cockpit only consumes { score, atRisk, factors }).
//
// FAIL-SAFE + PURE: no IO, no throws. Missing / malformed signals resolve to the LOWEST-risk reading
// (a contact we know nothing about is not "at risk" — we never manufacture churn from absence), and
// the score is always clamped to [0, 100]. All strings here are factor LABELS shown in the cockpit;
// they follow CONTENT-VOICE (plain, no em/en dashes, never narrate the reader's feelings).

// ── The signals the scorer reads (one plain struct → the ML seam) ────────────────────────────────

/** The raw, per-contact signals the scorer weighs. Every field is optional / nullable: a signal we
 *  do not have contributes nothing (never risk-by-absence). All timestamps are ISO strings or epoch
 *  ms; `now` lets tests pin the clock. */
export interface ContactRiskSignals {
  /** When the Space last saw activity from this contact (contacts.last_seen_at). Null = never seen. */
  lastSeenAt?: string | number | Date | null
  /** When the Space last logged a contact/interaction with this person (max contact_interactions
   *  .occurred_at). Null = no logged touch. The MORE RECENT of this and lastSeenAt is what recency
   *  actually keys off, so a contact you reached out to yesterday is not "cold". */
  lastContactedAt?: string | number | Date | null
  /** The contact's engagement projection (contacts.engagement_score, a [0,100]-ish opens/clicks
   *  signal). Low engagement is a decay signal. Null / absent contributes nothing. */
  engagementScore?: number | null
  /** The consent state (contacts.consent_state): 'unsubscribed' is a strong, explicit churn signal. */
  consentState?: string | null
  /** Whether a payment/renewal is overdue for this contact (dunning). Optional, off by default. */
  paymentOverdue?: boolean | null
  /** Whether this contact no-showed a recent booking/session. Optional, off by default. */
  recentNoShow?: boolean | null
  /** The member's practice-streak-at-risk signal (lib/practice-streak.ts `atRisk`), when the contact
   *  is a linked member. A member whose streak is slipping is an early churn tell. Optional. */
  streakAtRisk?: boolean | null
  /** The evaluation clock (ms epoch). Defaults to Date.now(); pin it in tests. */
  now?: number
}

/** One reason a contact scored the way it did: a stable key, a plain label for the cockpit, and the
 *  points it added to the risk score. `weight` always sums (with the others, clamped) to `score`. */
export interface RiskFactor {
  key:
    | 'recency'
    | 'never_seen'
    | 'engagement_decay'
    | 'unsubscribed'
    | 'payment_overdue'
    | 'no_show'
    | 'streak_at_risk'
  label: string
  weight: number
}

/** The scorer's output: the clamped churn score, the derived at-risk flag, and the factors behind it
 *  (highest-weight first). Consumed by the cockpit and persisted into the projection columns. */
export interface ContactRiskResult {
  /** Churn / at-risk score in [0, 100]: 0 = healthy, 100 = cold. */
  score: number
  /** Derived flag: score >= AT_RISK_THRESHOLD. */
  atRisk: boolean
  factors: RiskFactor[]
}

// ── Tunable rule constants (one place to calibrate; a future ML model supersedes these) ───────────

/** At or above this score, a contact is flagged at-risk. Tuned so a single mild signal (e.g. only
 *  ~30 days quiet) does NOT flag, but sustained silence or an explicit churn signal does. */
export const AT_RISK_THRESHOLD = 50

/** Days of silence past which recency stops adding points (the recency curve saturates here). */
const RECENCY_SATURATION_DAYS = 90
/** Recency contributes nothing until a contact has been quiet at least this long (a healthy grace
 *  window — a contact seen last week is not decaying). */
const RECENCY_GRACE_DAYS = 14
/** Max points the recency rule can add (the dominant churn signal). */
const RECENCY_MAX = 45
/** Below this engagement score, the decay rule starts adding points; at 0 engagement it is maxed. */
const ENGAGEMENT_FLOOR = 40
/** Max points the engagement-decay rule can add. */
const ENGAGEMENT_MAX = 25
/** Points for an explicit unsubscribe (a strong, decided churn signal on its own). */
const UNSUBSCRIBED_WEIGHT = 35
/** Points for an overdue payment / dunning state. */
const PAYMENT_OVERDUE_WEIGHT = 30
/** Points for a recent no-show. */
const NO_SHOW_WEIGHT = 15
/** Points for a linked member whose practice streak is at risk (an early, soft tell). */
const STREAK_AT_RISK_WEIGHT = 10

const DAY_MS = 86_400_000

// ── PURE helpers ─────────────────────────────────────────────────────────────────────────────────

/** Parse a timestamp signal to epoch ms, or null when absent / unparseable. Never throws. */
function toEpoch(v: string | number | Date | null | undefined): number | null {
  if (v == null) return null
  if (v instanceof Date) {
    const t = v.getTime()
    return Number.isFinite(t) ? t : null
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** Clamp a number into [0, 100]; non-finite -> 0. */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  return n > 100 ? 100 : n
}

/** Whole days between two epochs (b - a), floored at 0. */
function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor((b - a) / DAY_MS))
}

/**
 * The recency factor: how many points silence since the LAST touch (the more recent of last-seen and
 * last-contacted) contributes. Ramps LINEARLY from 0 at RECENCY_GRACE_DAYS to RECENCY_MAX at
 * RECENCY_SATURATION_DAYS, then flat. A contact with NO known touch at all is handled separately
 * (never_seen), so this returns null when there is no timestamp to key off (absence is not churn).
 * PURE.
 */
export function recencyFactor(signals: ContactRiskSignals, now: number): RiskFactor | null {
  const lastSeen = toEpoch(signals.lastSeenAt)
  const lastContacted = toEpoch(signals.lastContactedAt)
  const lastTouch =
    lastSeen != null && lastContacted != null
      ? Math.max(lastSeen, lastContacted)
      : (lastSeen ?? lastContacted)
  if (lastTouch == null) return null

  const quietDays = daysBetween(lastTouch, now)
  if (quietDays <= RECENCY_GRACE_DAYS) return null

  const span = RECENCY_SATURATION_DAYS - RECENCY_GRACE_DAYS
  const ramp = Math.min(1, (quietDays - RECENCY_GRACE_DAYS) / span)
  const weight = Math.round(ramp * RECENCY_MAX)
  if (weight <= 0) return null
  return { key: 'recency', label: `Quiet for ${quietDays} days`, weight }
}

/**
 * The engagement-decay factor: below ENGAGEMENT_FLOOR, low engagement adds points, scaling to
 * ENGAGEMENT_MAX at zero engagement. An absent / non-finite engagement signal contributes nothing.
 * A healthy (>= floor) engagement adds nothing. PURE.
 */
export function engagementFactor(signals: ContactRiskSignals): RiskFactor | null {
  const e = signals.engagementScore
  if (e == null || !Number.isFinite(e)) return null
  if (e >= ENGAGEMENT_FLOOR) return null
  const clamped = e < 0 ? 0 : e
  const deficit = (ENGAGEMENT_FLOOR - clamped) / ENGAGEMENT_FLOOR // (0, 1]
  const weight = Math.round(deficit * ENGAGEMENT_MAX)
  if (weight <= 0) return null
  return { key: 'engagement_decay', label: 'Low engagement', weight }
}

// ── The scorer (PURE) ────────────────────────────────────────────────────────────────────────────

/**
 * Score one contact's churn / at-risk from its signals: a [0, 100] score, an at-risk flag, and the
 * ordered factors behind it. PURE + fail-safe: no IO, no throws; missing signals read as lowest-risk
 * (never risk-by-absence); the score is clamped and the flag derived from AT_RISK_THRESHOLD.
 *
 * This is the RULES layer + the ML SEAM: it consumes a plain signals struct and returns a plain
 * result, so a future model can replace or blend without any caller change.
 */
export function scoreContactRisk(signals: ContactRiskSignals): ContactRiskResult {
  const now = Number.isFinite(signals.now as number) ? (signals.now as number) : Date.now()
  const factors: RiskFactor[] = []

  const recency = recencyFactor(signals, now)
  if (recency) {
    factors.push(recency)
  } else if (
    toEpoch(signals.lastSeenAt) == null &&
    toEpoch(signals.lastContactedAt) == null &&
    // Only call out "never seen" when there is at least ONE other churn signal — a brand-new contact
    // with nothing else known is not automatically at risk (never risk-by-absence).
    (signals.consentState === 'unsubscribed' ||
      signals.paymentOverdue === true ||
      signals.recentNoShow === true)
  ) {
    factors.push({ key: 'never_seen', label: 'No activity on record', weight: 10 })
  }

  const engagement = engagementFactor(signals)
  if (engagement) factors.push(engagement)

  if (signals.consentState === 'unsubscribed') {
    factors.push({ key: 'unsubscribed', label: 'Unsubscribed', weight: UNSUBSCRIBED_WEIGHT })
  }
  if (signals.paymentOverdue === true) {
    factors.push({ key: 'payment_overdue', label: 'Payment overdue', weight: PAYMENT_OVERDUE_WEIGHT })
  }
  if (signals.recentNoShow === true) {
    factors.push({ key: 'no_show', label: 'Recent no-show', weight: NO_SHOW_WEIGHT })
  }
  if (signals.streakAtRisk === true) {
    factors.push({ key: 'streak_at_risk', label: 'Practice streak slipping', weight: STREAK_AT_RISK_WEIGHT })
  }

  const raw = factors.reduce((sum, f) => sum + f.weight, 0)
  const score = clampScore(raw)
  factors.sort((a, b) => b.weight - a.weight)

  return { score, atRisk: score >= AT_RISK_THRESHOLD, factors }
}
