// The Vera autonomous-send CIRCUIT BREAKER (ADR — Vera autonomous-send graduation).
//
// A single gate every autonomous send must pass BEFORE the send-gate. It composes four guards:
//   (a) KILL SWITCH   — the master autonomy switch (global) + a per-category enable.
//   (b) RATE CAPS     — hard per-recipient and platform-wide caps per rolling window.
//   (c) ANOMALY TRIP  — if the recent bounce/complaint rate crosses a threshold, TRIP the breaker
//                       OFF (disarm) and require a manual re-arm.
//   (d) AUDIT         — every decision (allow OR block, and why) is recorded.
//
// FAIL-CLOSED by construction: the pure core only returns `allowed` when EVERY guard is clear, and
// the async resolver denies (reason 'config_error') on any read failure — uncertainty never sends.
//
// The DECISION is a pure function (`evaluateCircuitBreaker`) over explicit state, exhaustively unit
// tested. All IO (reading config, counting the window, measuring the anomaly rate, tripping the latch,
// writing audit) is kept in the async resolver so the policy stays a deterministic truth table.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  type AutonomyCategory,
  getAutonomyTuning,
  isAutonomyEnabled,
  isBreakerArmed,
  disarmBreaker,
} from './autonomy-config'

/** The Resend tag stamped on every autonomous send, so the rate-cap counter can find prior sends. */
export const AUTONOMOUS_SEND_TAG = 'vera_autonomous'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** How far back the anomaly rate looks at delivery outcomes. */
const ANOMALY_WINDOW_MS = 6 * HOUR_MS

/** Why an autonomous send was allowed or blocked by the breaker. One reason per decision. */
export type BreakerReason =
  | 'ok'
  | 'autonomy_off' // master switch off — the global kill (the default posture)
  | 'breaker_tripped' // the breaker is disarmed (a prior anomaly trip) awaiting manual re-arm
  | 'category_off' // this category's toggle is off
  | 'anomaly_trip' // bounce/complaint rate crossed the threshold — trips the breaker OFF now
  | 'platform_cap' // platform-wide window cap reached
  | 'recipient_cap' // per-recipient window cap reached
  | 'config_error' // a read failed — fail-closed (never a "yes")

/** Fully-resolved state the pure gate decides over. Every field is explicit so the truth table is a test. */
export interface BreakerState {
  autonomyEnabled: boolean
  breakerArmed: boolean
  categoryEnabled: boolean
  recipientSentInDay: number
  recipientCapPerDay: number
  platformSentInHour: number
  platformCapPerHour: number
  platformSentInDay: number
  platformCapPerDay: number
  /** Recent bounce+complaint rate (0..1). */
  bounceComplaintRate: number
  anomalyThreshold: number
  /** How many recent delivery outcomes the rate is measured over. */
  anomalySample: number
  anomalySampleSize: number
}

export interface BreakerDecision {
  allowed: boolean
  reason: BreakerReason
  /** When true, this decision must LATCH the breaker OFF (disarm) — an anomaly was detected. */
  trips: boolean
}

/**
 * The whole breaker policy as one PURE function. Precedence (most fundamental first):
 *   master switch → armed latch → category → anomaly trip → platform cap → recipient cap.
 * The only path to `allowed` is every guard clear. Deterministic; the exhaustive table lives in the test.
 */
export function evaluateCircuitBreaker(s: BreakerState): BreakerDecision {
  // (a) Master switch = the global kill. Default posture; not a trip.
  if (!s.autonomyEnabled) return { allowed: false, reason: 'autonomy_off', trips: false }
  // The breaker is disarmed (a prior trip) and awaits a manual re-arm.
  if (!s.breakerArmed) return { allowed: false, reason: 'breaker_tripped', trips: false }
  // (a) Per-category kill.
  if (!s.categoryEnabled) return { allowed: false, reason: 'category_off', trips: false }
  // (c) Anomaly: enough sample AND the rate at/over threshold → TRIP the breaker off now.
  if (s.anomalySample >= s.anomalySampleSize && s.bounceComplaintRate >= s.anomalyThreshold) {
    return { allowed: false, reason: 'anomaly_trip', trips: true }
  }
  // (b) Hard rate caps — platform-wide first (protects everyone), then this recipient.
  if (s.platformSentInHour >= s.platformCapPerHour) return { allowed: false, reason: 'platform_cap', trips: false }
  if (s.platformSentInDay >= s.platformCapPerDay) return { allowed: false, reason: 'platform_cap', trips: false }
  if (s.recipientSentInDay >= s.recipientCapPerDay) return { allowed: false, reason: 'recipient_cap', trips: false }
  return { allowed: true, reason: 'ok', trips: false }
}

// ── The async resolver: gather live state, run the pure gate, latch on trip, audit ──

export interface CheckBreakerInput {
  category: AutonomyCategory
  /** The recipient's address, for the per-recipient window count. Null → recipient count is 0. */
  recipientEmail: string | null
  now?: Date
}

/**
 * Gather the live breaker state and run the pure gate. FAIL-CLOSED: any read error returns
 * `{ allowed:false, reason:'config_error' }`. When the decision `trips`, the breaker latch is
 * disarmed here (source 'system') so every subsequent send is blocked until a manual re-arm.
 */
export async function checkCircuitBreaker(input: CheckBreakerInput): Promise<BreakerDecision> {
  const now = input.now ?? new Date()
  try {
    const [autonomyEnabled, breakerArmed, tuning] = await Promise.all([
      isAutonomyEnabled(),
      isBreakerArmed(),
      getAutonomyTuning(),
    ])

    // Short-circuit the expensive counts when the cheap latches already block: if autonomy is off,
    // the breaker is disarmed, or the category is off, no count/anomaly read is needed.
    const categoryEnabled = tuning.categories[input.category] === true
    if (!autonomyEnabled || !breakerArmed || !categoryEnabled) {
      return evaluateCircuitBreaker(buildState({ autonomyEnabled, breakerArmed, categoryEnabled, tuning }))
    }

    // Live counts + anomaly. These THROW on a read failure (caught below → config_error), so a broken
    // count fails closed rather than reading as "under cap".
    const [recipientSentInDay, platformSentInHour, platformSentInDay, anomaly] = await Promise.all([
      input.recipientEmail ? countAutonomousSends({ email: input.recipientEmail, sinceMs: DAY_MS, now }) : Promise.resolve(0),
      countAutonomousSends({ email: null, sinceMs: HOUR_MS, now }),
      countAutonomousSends({ email: null, sinceMs: DAY_MS, now }),
      measureBounceComplaintRate(now),
    ])

    const state = buildState({
      autonomyEnabled,
      breakerArmed,
      categoryEnabled,
      tuning,
      recipientSentInDay,
      platformSentInHour,
      platformSentInDay,
      bounceComplaintRate: anomaly.rate,
      anomalySample: anomaly.sample,
    })
    const decision = evaluateCircuitBreaker(state)

    // Latch the breaker OFF on an anomaly trip so it stays blocked until a human re-arms.
    if (decision.trips) {
      try {
        await disarmBreaker({ source: 'system' })
      } catch {
        /* best-effort: the decision already blocks this send regardless of whether the latch persisted */
      }
    }
    return decision
  } catch {
    // Fail-closed: any uncertainty denies the send.
    return { allowed: false, reason: 'config_error', trips: false }
  }
}

/** Assemble a BreakerState from the resolved config + (optional) live counts, filling caps from tuning. */
function buildState(p: {
  autonomyEnabled: boolean
  breakerArmed: boolean
  categoryEnabled: boolean
  tuning: Awaited<ReturnType<typeof getAutonomyTuning>>
  recipientSentInDay?: number
  platformSentInHour?: number
  platformSentInDay?: number
  bounceComplaintRate?: number
  anomalySample?: number
}): BreakerState {
  return {
    autonomyEnabled: p.autonomyEnabled,
    breakerArmed: p.breakerArmed,
    categoryEnabled: p.categoryEnabled,
    recipientSentInDay: p.recipientSentInDay ?? 0,
    recipientCapPerDay: p.tuning.caps.recipientPerDay,
    platformSentInHour: p.platformSentInHour ?? 0,
    platformCapPerHour: p.tuning.caps.platformPerHour,
    platformSentInDay: p.platformSentInDay ?? 0,
    platformCapPerDay: p.tuning.caps.platformPerDay,
    bounceComplaintRate: p.bounceComplaintRate ?? 0,
    anomalyThreshold: p.tuning.anomaly.bounceComplaintRate,
    anomalySample: p.anomalySample ?? 0,
    anomalySampleSize: p.tuning.anomaly.sampleSize,
  }
}

/**
 * Count autonomous sends inside a rolling window by reading the durable outbox rows tagged
 * AUTONOMOUS_SEND_TAG (mirrors owner-brief's countRecentBriefs). Pass `email` to scope to one
 * recipient, or null for the platform-wide count. THROWS on a read error so the breaker fails closed.
 */
export async function countAutonomousSends(opts: { email: string | null; sinceMs: number; now: Date }): Promise<number> {
  const admin = createAdminClient()
  const since = new Date(opts.now.getTime() - opts.sinceMs).toISOString()
  const { data, error } = await admin
    .from('notification_queue')
    .select('payload')
    .eq('kind', 'email')
    .gte('created_at', since)
    .limit(5000)
  if (error) throw new Error(error.message)
  let n = 0
  for (const r of (data ?? []) as { payload: unknown }[]) {
    const p = r.payload as { to?: string; tags?: { name?: string }[] } | null
    if (!p) continue
    if (opts.email != null && p.to !== opts.email) continue
    if (Array.isArray(p.tags) && p.tags.some((t) => t?.name === AUTONOMOUS_SEND_TAG)) n += 1
  }
  return n
}

/**
 * The recent platform bounce+complaint rate over delivery outcomes (email_events). An elevated rate is
 * the anomaly signal that trips the breaker. THROWS on a read error so the breaker fails closed.
 * Returns rate 0 with sample 0 when there are no recent outcomes (so a quiet window never trips).
 */
export async function measureBounceComplaintRate(now: Date): Promise<{ rate: number; sample: number }> {
  const admin = createAdminClient()
  const since = new Date(now.getTime() - ANOMALY_WINDOW_MS).toISOString()
  const { data, error } = await admin
    .from('email_events')
    .select('event_type')
    .gte('created_at', since)
    .in('event_type', ['delivered', 'bounced', 'complained'])
    .limit(5000)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { event_type: string }[]
  const sample = rows.length
  if (sample === 0) return { rate: 0, sample: 0 }
  const bad = rows.filter((r) => r.event_type === 'bounced' || r.event_type === 'complained').length
  return { rate: bad / sample, sample }
}

// ── Audit (per-decision record) ────────────────────────────────────────────────────

export interface AutonomyAuditEntry {
  category: AutonomyCategory
  recipientProfileId: string | null
  recipientEmail: string | null
  /** The final outcome of the graduation path: what actually happened. */
  outcome: 'sent' | 'proposed' | 'blocked'
  breakerReason: BreakerReason | null
  gateReason: string | null
  rationale: string | null
  metadata?: Record<string, unknown>
}

/**
 * Record one autonomous-send decision. Best-effort + fail-safe (never throws, never blocks the
 * decision): writes to the dedicated `vera_autonomy_decisions` table, falling back to `agent_actions`
 * when that table is absent (e.g. before its migration is applied), so an audit row always lands.
 */
export async function recordAutonomyDecision(entry: AutonomyAuditEntry): Promise<void> {
  const admin = createAdminClient() as unknown as {
    from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }
  }
  try {
    const { error } = await admin.from('vera_autonomy_decisions').insert({
      category: entry.category,
      recipient_profile_id: entry.recipientProfileId,
      recipient_email: entry.recipientEmail,
      outcome: entry.outcome,
      breaker_reason: entry.breakerReason,
      gate_reason: entry.gateReason,
      rationale: entry.rationale,
      metadata: entry.metadata ?? {},
    })
    if (!error) return
  } catch {
    /* fall through to the agent_actions fallback */
  }
  // Fallback so an audit row exists even before the dedicated table migration is applied.
  try {
    await admin.from('agent_actions').insert({
      kind: 'vera_autonomy_audit',
      status: entry.outcome,
      rationale: entry.rationale,
      payload: {
        category: entry.category,
        recipientProfileId: entry.recipientProfileId,
        recipientEmail: entry.recipientEmail,
        outcome: entry.outcome,
        breakerReason: entry.breakerReason,
        gateReason: entry.gateReason,
        metadata: entry.metadata ?? {},
      },
    })
  } catch {
    console.warn('[vera-autonomy] failed to record decision audit', entry.category, entry.outcome)
  }
}
