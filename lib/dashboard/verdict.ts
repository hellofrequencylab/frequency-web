// The cockpit's computed VERDICT line + the shared tier presentation (Resonance Engine
// Phase 2 · ADR-383 · docs/NEXT-GEN-CRM.md "The brilliant admin dashboard"). One computed
// sentence that passes the 5-second test: an owner who looks for five seconds knows the one
// thing to do next. PURE + unit-tested + in voice (no em or en dashes): the verdict is
// DERIVED from the at-risk worklist length + the mean health, never hand-curated.

import type { ResonanceTier } from '@/lib/traits/compute'

/** The tone for a tier, mapped to the semantic green/amber/red legend. */
export type TierTone = 'success' | 'warning' | 'danger'

/** How the platform / Space reads overall, from the mean Resonance Health. */
export type HealthVerdict = 'healthy' | 'mixed' | 'strained'

/** Band the mean health into a one-word standing for the verdict line. PURE. Matches the
 *  resonanceTier thresholds so the sentence agrees with the colored stat. */
export function healthVerdict(meanHealth: number): HealthVerdict {
  if (!Number.isFinite(meanHealth) || meanHealth < 34) return 'strained'
  if (meanHealth < 67) return 'mixed'
  return 'healthy'
}

const STANDING: Record<HealthVerdict, string> = {
  healthy: 'Resonance is healthy.',
  mixed: 'Resonance is steady but mixed.',
  strained: 'Resonance is strained.',
}

/**
 * The computed verdict sentence for an altitude. PURE + in voice. The standing comes from the
 * mean health; the call to action comes from how many members are sliding NOW (the worklist
 * length), so it is always honest, never hand-curated. When nobody needs you, it says so plainly
 * (inbox-zero is a real state, not a void).
 *
 * Examples:
 *   "Resonance is healthy. 12 members need you today."
 *   "Resonance is strained. 1 member needs you today."
 *   "Resonance is healthy. Nobody needs you right now."
 */
export function verdictLine(meanHealth: number, needAttention: number): string {
  const standing = STANDING[healthVerdict(meanHealth)]
  const n = Math.max(0, Math.floor(Number.isFinite(needAttention) ? needAttention : 0))
  if (n === 0) return `${standing} Nobody needs you right now.`
  const noun = n === 1 ? 'member needs' : 'members need'
  return `${standing} ${n} ${noun} you today.`
}

/** A Space-scoped verdict that names the Space's standing the same way, scoped to its members. */
export function spaceVerdictLine(meanHealth: number, needAttention: number, members: number): string {
  // Before a Space has any scored members, there is nothing to read into; say so plainly.
  if (members === 0) {
    return 'No scored members in this Space yet. Bring contacts in and Vera will start reading the room.'
  }
  return verdictLine(meanHealth, needAttention)
}

// ── Tier presentation (shared by every altitude) ─────────────────────────────

const TIER_LABEL: Record<ResonanceTier, string> = {
  resonant: 'Resonant',
  cooling: 'Cooling',
  at_risk: 'At risk',
}

const TIER_TONE: Record<ResonanceTier, TierTone> = {
  resonant: 'success',
  cooling: 'warning',
  at_risk: 'danger',
}

/** The operator-facing label for a tier ("Resonant" / "Cooling" / "At risk"). */
export function tierLabel(tier: ResonanceTier): string {
  return TIER_LABEL[tier] ?? 'At risk'
}

/** The semantic tone for a tier (drives the StatCard / chip color). */
export function tierTone(tier: ResonanceTier): TierTone {
  return TIER_TONE[tier] ?? 'danger'
}

/** Band a raw 0..100 health number straight to its tone (for coloring a mean-health stat). */
export function healthTone(health: number): TierTone {
  if (!Number.isFinite(health) || health < 34) return 'danger'
  if (health < 67) return 'warning'
  return 'success'
}

// ── Delta formatting (period-over-period, in voice) ──────────────────────────

/** A formatted period delta for a StatCard: the label + the trend direction. PURE. `trend`
 *  carries MEANING (up = good), so a metric where "down is good" (at-risk count) can pass
 *  trend: 'up' for a fall. A zero/absent baseline yields a flat "no change yet" hint. */
export function formatDelta(
  current: number,
  baseline: number | null | undefined,
  opts: { unit?: string; lowerIsBetter?: boolean } = {},
): { label: string; trend: 'up' | 'down' | 'flat' } {
  if (baseline == null || !Number.isFinite(baseline)) {
    return { label: 'first reading', trend: 'flat' }
  }
  const diff = Math.round((current - baseline) * 10) / 10
  const unit = opts.unit ? ` ${opts.unit}` : ''
  if (diff === 0) return { label: `no change${unit ? unit : ''} vs last week`, trend: 'flat' }
  const sign = diff > 0 ? '+' : ''
  const rose = diff > 0
  // "good" = rose unless lowerIsBetter, in which case a fall is good.
  const good = opts.lowerIsBetter ? !rose : rose
  return {
    label: `${sign}${diff}${unit} vs last week`,
    trend: good ? 'up' : 'down',
  }
}
