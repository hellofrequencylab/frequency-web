// Vera AUTONOMY config — the operator-owned state that governs whether Vera may SEND email
// autonomously, and how hard the circuit breaker is set (ADR — Vera autonomous-send graduation).
//
// SAFETY-CRITICAL, DISABLED-BY-DEFAULT. Two audited platform_flags carry the safety latches:
//   • `vera_autonomy_enabled` (default FALSE) — the master graduation switch / global kill. OFF stops
//     every autonomous send. This is the invariant that keeps behaviour unchanged on merge.
//   • `vera_breaker_armed`    (default TRUE)  — the circuit-breaker armed latch. An anomaly trip
//     disarms it; sending resumes only after a human manually re-arms.
// Both write through setPlatformFlag, so every flip lands in platform_flag_events (who/when/old→new).
//
// The numeric caps, per-category enables, and anomaly thresholds are TUNING (not the master gate), so
// they live in one JSON row in platform_settings under `vera_autonomy`. Reads fail-safe to the
// conservative defaults below (categories OFF), so a broken read can only ever make the breaker
// STRICTER, never looser. Server-only (reaches the service-role admin client).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  setPlatformFlag,
  getPlatformSetting,
  setPlatformSetting,
  veraAutonomyEnabledFlag,
  veraBreakerArmedFlag,
} from '@/lib/platform-flags'

/** The two send-capable Vera tools that graduate from propose-only. Each has its own kill toggle. */
export const AUTONOMY_CATEGORIES = ['playbook_email', 'intro_email'] as const
export type AutonomyCategory = (typeof AUTONOMY_CATEGORIES)[number]

export const AUTONOMY_CATEGORY_LABEL: Record<AutonomyCategory, string> = {
  playbook_email: 'Playbook emails',
  intro_email: 'Intro emails',
}

/** Hard rate caps. A window count at-or-over its cap blocks the send (fail-closed at the boundary). */
export interface AutonomyCaps {
  /** Max autonomous sends to ONE recipient per rolling 24h. */
  recipientPerDay: number
  /** Max autonomous sends PLATFORM-WIDE per rolling hour. */
  platformPerHour: number
  /** Max autonomous sends PLATFORM-WIDE per rolling 24h. */
  platformPerDay: number
}

/** The anomaly trip: when the recent bounce+complaint rate crosses the threshold (with enough
 *  sample), the breaker trips OFF and requires a manual re-arm. */
export interface AutonomyAnomaly {
  /** Bounce+complaint rate (0..1) over recent delivery events that trips the breaker. */
  bounceComplaintRate: number
  /** Minimum recent (delivered+bounced+complained) sample before the rate is trusted. */
  sampleSize: number
}

export interface AutonomyTuning {
  /** Per-category enable. BOTH default OFF: even with the master on, an owner opts each category in. */
  categories: Record<AutonomyCategory, boolean>
  caps: AutonomyCaps
  anomaly: AutonomyAnomaly
}

/** Conservative, fail-closed defaults. Categories OFF; tight caps; a low bounce/complaint tolerance. */
export const DEFAULT_AUTONOMY_TUNING: AutonomyTuning = {
  categories: { playbook_email: false, intro_email: false },
  caps: { recipientPerDay: 1, platformPerHour: 20, platformPerDay: 100 },
  anomaly: { bounceComplaintRate: 0.1, sampleSize: 25 },
}

const TUNING_KEY = 'vera_autonomy'

/** Coerce a stored (possibly partial / malformed) tuning blob onto the defaults. Never throws. */
function coerceTuning(raw: unknown): AutonomyTuning {
  const o = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Partial<AutonomyTuning>
  const cats = (o.categories ?? {}) as Partial<Record<AutonomyCategory, unknown>>
  const caps = (o.caps ?? {}) as Partial<AutonomyCaps>
  const anomaly = (o.anomaly ?? {}) as Partial<AutonomyAnomaly>
  const num = (v: unknown, fallback: number, min = 0): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback
  return {
    categories: {
      playbook_email: cats.playbook_email === true,
      intro_email: cats.intro_email === true,
    },
    caps: {
      recipientPerDay: Math.floor(num(caps.recipientPerDay, DEFAULT_AUTONOMY_TUNING.caps.recipientPerDay, 0)),
      platformPerHour: Math.floor(num(caps.platformPerHour, DEFAULT_AUTONOMY_TUNING.caps.platformPerHour, 0)),
      platformPerDay: Math.floor(num(caps.platformPerDay, DEFAULT_AUTONOMY_TUNING.caps.platformPerDay, 0)),
    },
    anomaly: {
      bounceComplaintRate: Math.min(1, Math.max(0, num(anomaly.bounceComplaintRate, DEFAULT_AUTONOMY_TUNING.anomaly.bounceComplaintRate, 0))),
      sampleSize: Math.floor(num(anomaly.sampleSize, DEFAULT_AUTONOMY_TUNING.anomaly.sampleSize, 1)),
    },
  }
}

/** Read the tuning, merged over defaults. Fail-safe: any error returns the conservative defaults
 *  (categories OFF), so a broken read can only make the breaker stricter. */
export async function getAutonomyTuning(): Promise<AutonomyTuning> {
  try {
    const raw = await getPlatformSetting(TUNING_KEY, '')
    if (!raw) return DEFAULT_AUTONOMY_TUNING
    return coerceTuning(JSON.parse(raw))
  } catch {
    return DEFAULT_AUTONOMY_TUNING
  }
}

/** A partial tuning patch: any subset of categories / caps / anomaly. */
export interface AutonomyTuningPatch {
  categories?: Partial<Record<AutonomyCategory, boolean>>
  caps?: Partial<AutonomyCaps>
  anomaly?: Partial<AutonomyAnomaly>
}

/** Persist a (partial) tuning patch, merged + coerced over the current value. Operator-gated callers only. */
export async function saveAutonomyTuning(patch: AutonomyTuningPatch, changedBy?: string | null): Promise<void> {
  const current = await getAutonomyTuning()
  const next: AutonomyTuning = coerceTuning({
    categories: { ...current.categories, ...(patch.categories ?? {}) },
    caps: { ...current.caps, ...(patch.caps ?? {}) },
    anomaly: { ...current.anomaly, ...(patch.anomaly ?? {}) },
  })
  await setPlatformSetting(TUNING_KEY, JSON.stringify(next), changedBy ?? null)
}

// ── The audited safety latches (thin wrappers over the platform flags) ─────────────

/** Master autonomy switch / global kill. Default FALSE. */
export async function isAutonomyEnabled(): Promise<boolean> {
  return veraAutonomyEnabledFlag()
}

/** Flip the master switch. Audited (platform_flag_events). */
export async function setAutonomyEnabled(enabled: boolean, changedBy?: string | null): Promise<void> {
  await setPlatformFlag('vera_autonomy_enabled', enabled, { changedBy: changedBy ?? null, source: 'admin' })
}

/** Circuit-breaker armed latch. Default TRUE (armed). */
export async function isBreakerArmed(): Promise<boolean> {
  return veraBreakerArmedFlag()
}

/** Manually RE-ARM the breaker after a trip. Operator-gated; audited. */
export async function armBreaker(changedBy?: string | null): Promise<void> {
  await setPlatformFlag('vera_breaker_armed', true, { changedBy: changedBy ?? null, source: 'admin' })
}

/** DISARM (trip) the breaker. Called by the anomaly trip (source 'system') or an operator kill
 *  (source 'admin'). Audited either way. */
export async function disarmBreaker(opts: { changedBy?: string | null; source?: 'admin' | 'system' } = {}): Promise<void> {
  await setPlatformFlag('vera_breaker_armed', false, { changedBy: opts.changedBy ?? null, source: opts.source ?? 'system' })
}

// ── Audit log reader (for the owner-control surface) ───────────────────────────────

export interface AutonomyDecisionRow {
  id: string
  category: string
  recipientEmail: string | null
  outcome: string
  breakerReason: string | null
  gateReason: string | null
  rationale: string | null
  createdAt: string | null
}

/** Recent autonomous-send decisions, newest first, for the owner audit view. Reads the dedicated
 *  `vera_autonomy_decisions` table when present, else the agent_actions fallback. Fail-safe to []. */
export async function listAutonomyDecisions(limit = 25): Promise<AutonomyDecisionRow[]> {
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        order: (col: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
      }
    }
  }
  try {
    const { data, error } = await admin
      .from('vera_autonomy_decisions')
      .select('id, category, recipient_email, outcome, breaker_reason, gate_reason, rationale, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      category: String(r.category ?? ''),
      recipientEmail: (r.recipient_email as string) ?? null,
      outcome: String(r.outcome ?? ''),
      breakerReason: (r.breaker_reason as string) ?? null,
      gateReason: (r.gate_reason as string) ?? null,
      rationale: (r.rationale as string) ?? null,
      createdAt: (r.created_at as string) ?? null,
    }))
  } catch {
    return []
  }
}
