// FEATURE GATES — the feature -> minimum-entitlement map (ADR-362, docs/PRICING.md §4/§5/§13).
// The CODE map below is the SOURCE OF TRUTH; the `pricing_feature_gates` table is an additive,
// FAIL-SAFE override layer merged OVER it, mirroring exactly how lib/layout/page-chrome.ts merges
// operator chrome overrides over the code defaults (loadChromeOverrides + mergeChrome).
//
// Two axes of entitlement live here, deliberately separate (the three-flag rule, ADR-362):
//   * PERSONAL features rank on the membership tier (free < crew < supporter).
//   * SPACE features rank on the space plan (free < practitioner < business < organization <
//     whitelabel).
// A feature names which ladder it sits on via `axis`. featureAllowed takes the account's tier
// and/or plan and answers a single boolean.
//
// CRITICAL — OFF preserves current behavior: while `billing_live` is OFF, billing has not gone
// live and gating must behave EXACTLY as today, so featureAllowed SHORT-CIRCUITS to `true` (grant)
// when billing is not live. The DB merge + ladder math only ever matters once an operator turns
// billing on (P2/P3). The reader is fail-safe to the code map on any DB error.

import { ENTITLEMENT_TIERS, type EntitlementTier } from '@/lib/core/entitlement'
import { SPACE_PLANS, asSpacePlan, type SpacePlan } from './plans'

// ── The two entitlement ladders (low → high) ────────────────────────────────────────────
// Personal: free < crew < supporter (ENTITLEMENT_TIERS from lib/core/entitlement.ts).
const TIER_RANK: Record<EntitlementTier, number> = Object.fromEntries(
  ENTITLEMENT_TIERS.map((t, i) => [t, i]),
) as Record<EntitlementTier, number>

// Space: free < practitioner < business < organization < whitelabel (SPACE_PLANS).
const PLAN_RANK: Record<SpacePlan, number> = Object.fromEntries(
  SPACE_PLANS.map((p, i) => [p, i]),
) as Record<SpacePlan, number>

export type GateAxis = 'tier' | 'plan'

/** A single feature gate: which ladder it ranks on + the minimum entitlement it requires. */
export interface FeatureGate {
  axis: GateAxis
  /** The minimum entitlement label on the gate's ladder (a tier or a plan). */
  minEntitlement: EntitlementTier | SpacePlan
  /** Whether the gate is active. A disabled gate never blocks (the feature is ungated). */
  enabled: boolean
}

// THE CODE MAP — the source of truth, seeded identically into pricing_feature_gates. Keep this in
// sync with the migration's seed (the table only OVERRIDES these defaults). §4 personal, §5 space.
export const FEATURE_GATES: Record<string, FeatureGate> = {
  // §4 personal (membership tier; reuse profiles.membership_tier)
  vault_cash_in: { axis: 'tier', minEntitlement: 'crew', enabled: true }, // spend Gems / claim (canCashIn)
  gamification_full: { axis: 'tier', minEntitlement: 'crew', enabled: true }, // full loop; free = earn-only
  vera_unlimited: { axis: 'tier', minEntitlement: 'crew', enabled: true }, // Vera beyond the free daily cap

  // §5 space plans (reuse spaces.plan)
  space_crm: { axis: 'plan', minEntitlement: 'practitioner', enabled: true }, // the per-Space CRM
  space_email: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_automation: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_team: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_whitelabel: { axis: 'plan', minEntitlement: 'whitelabel', enabled: true },
  space_multi_pipeline: { axis: 'plan', minEntitlement: 'business', enabled: true },
  // The connected custom-domain capability (BUSINESS-ACCOUNTS-STRATEGY): a Space serves on its own
  // domain while STAYING in the network (network_connected=true). Self-serve requires the Brand plan;
  // the full-featured mission/enterprise tiers (rank >= brand) clear it too. White-label decouples on
  // top of this via the separate space_whitelabel gate.
  space_custom_domain: { axis: 'plan', minEntitlement: 'brand', enabled: true },
  // Storefront (ADR-39X/Z) — available from the FREE plan (a free Space can sell; the plan
  // only buys the rake down + features). A per-Space toggle decides ON/OFF.
  space_storefront: { axis: 'plan', minEntitlement: 'free', enabled: true },

  // §5 space AI-depth (Resonance Engine Phase 6 · ADR-387). The paid DEPTH of the engine, on the
  // same plan ladder. The free wedge (Today suggest-only + summaries + read-only scoring) is NEVER a
  // gate, so it has no entry here. Practitioner+ unlocks governed playbooks + advanced segments; the
  // top rung (organization+) unlocks the full Resonance Graph + managed matching. While billing is
  // OFF, featureAllowed short-circuits to true and these never bind (today's behavior).
  space_crm_playbooks: { axis: 'plan', minEntitlement: 'practitioner', enabled: true },
  space_crm_resonance: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_crm_resonance_ai: { axis: 'plan', minEntitlement: 'organization', enabled: true },
}

export type FeatureKey = keyof typeof FEATURE_GATES | (string & {})

/** Does an entitlement label meet a gate's minimum on its ladder? Unknown labels rank lowest
 *  (default-deny). PURE. */
export function meetsGate(gate: FeatureGate, account: { tier?: EntitlementTier | null; plan?: SpacePlan | null }): boolean {
  if (!gate.enabled) return true // a disabled gate never blocks
  if (gate.axis === 'tier') {
    const have = TIER_RANK[(account.tier ?? 'free') as EntitlementTier] ?? 0
    const need = TIER_RANK[gate.minEntitlement as EntitlementTier] ?? 0
    return have >= need
  }
  const have = PLAN_RANK[asSpacePlan(account.plan)] ?? 0
  const need = PLAN_RANK[gate.minEntitlement as SpacePlan] ?? 0
  return have >= need
}

// ── DB override layer (additive, FAIL-SAFE — mirrors page-chrome.ts) ─────────────────────

/** A normalized override row from pricing_feature_gates: feature -> partial gate. */
export type FeatureGateOverrides = Record<string, { minEntitlement?: string; enabled?: boolean }>

/** Merge a DB override over the code default for one feature. A row's `minEntitlement` / `enabled`
 *  win when present and valid; otherwise the code gate stands. PURE — trivially testable, like
 *  mergeChrome. A feature with no code default AND a DB row is built from the row (axis inferred
 *  from the label: a known plan label → 'plan', else 'tier'). */
export function mergeGate(
  feature: string,
  overrides: FeatureGateOverrides,
): FeatureGate | null {
  const code = FEATURE_GATES[feature]
  const row = overrides[feature]
  if (!code && !row) return null
  const base: FeatureGate = code ?? {
    axis: (SPACE_PLANS as readonly string[]).includes(row?.minEntitlement ?? '') ? 'plan' : 'tier',
    minEntitlement: 'free',
    enabled: true,
  }
  if (!row) return base
  return {
    axis: base.axis,
    minEntitlement: (row.minEntitlement as EntitlementTier | SpacePlan) ?? base.minEntitlement,
    enabled: typeof row.enabled === 'boolean' ? row.enabled : base.enabled,
  }
}

/** Load the operator feature-gate overrides as a plain map. Service-role read (works regardless of
 *  the caller's RLS), REQUEST-CACHED. FAIL-SAFE: returns `{}` on ANY error (incl. a missing table
 *  pre-migration), so featureAllowed always falls back to the code map. The dynamic import keeps
 *  this server-only dependency out of the module top level (the pure helpers stay client-safe). */
export async function loadFeatureGateOverrides(): Promise<FeatureGateOverrides> {
  try {
    const { cache } = await import('react')
    const load = cache(async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      // The table isn't in the generated types yet (ADR-246) — reach it untyped.
      const { data, error } = await (db as unknown as {
        from: (t: string) => {
          select: (c: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
        }
      })
        .from('pricing_feature_gates')
        .select('feature, min_entitlement, enabled')
      if (error || !data) return {}
      const out: FeatureGateOverrides = {}
      for (const r of data) {
        const feature = typeof r.feature === 'string' ? r.feature : null
        if (!feature) continue
        out[feature] = {
          minEntitlement: typeof r.min_entitlement === 'string' ? r.min_entitlement : undefined,
          enabled: typeof r.enabled === 'boolean' ? r.enabled : undefined,
        }
      }
      return out
    })
    return await load()
  } catch {
    return {}
  }
}

// ── Write (service-role; call ONLY from admin-gated server actions) ──────────────────────
// authz-delegated: setFeatureGateOverride is a caller-trusted operator-config write (ADR-274). It
// has no per-caller scope by design (the gate map is platform-wide config, like page_chrome_overrides);
// the authorization lives at its only call site, the janitor-gated saveFeatureGate action
// (app/(main)/admin/pricing/actions.ts → requireAdmin('janitor')).

/** Upsert a pricing_feature_gates override row (the feature's min_entitlement + enabled). Service-
 *  role; the admin pricing actions gate the caller. Throws on a DB error so the action surfaces it. */
export async function setFeatureGateOverride(
  feature: string,
  patch: { minEntitlement?: string | null; enabled?: boolean },
  changedBy?: string | null,
): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  const row: Record<string, unknown> = { feature, updated_at: new Date().toISOString(), updated_by: changedBy ?? null }
  if (patch.minEntitlement !== undefined) row.min_entitlement = patch.minEntitlement
  if (patch.enabled !== undefined) row.enabled = patch.enabled
  const { error } = await (db as unknown as {
    from: (t: string) => {
      upsert: (v: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>
    }
  })
    .from('pricing_feature_gates')
    .upsert(row)
  if (error) throw new Error(error.message ?? 'Could not save feature gate.')
}

/** The account a feature is checked against: the personal billing tier and/or the Space plan. */
export interface GateAccount {
  tier?: EntitlementTier | null
  plan?: SpacePlan | null
}

/** Is `feature` ALLOWED for this account? The single entitlements resolver. It reads the DB
 *  override merged over the code default, FAIL-SAFE (DB error → code default), and:
 *
 *   - SHORT-CIRCUITS to `true` (grant) when billing is NOT live, so turning billing OFF preserves
 *     today's behavior exactly (no surface that consults this changes while OFF).
 *   - Otherwise applies the merged gate's ladder check.
 *
 *  The `billingLive` flag is passed in (resolved by the caller via lib/pricing/settings.ts
 *  billingLive()), keeping this resolver free of its own env/flag IO and easy to test. */
export async function featureAllowed(
  feature: FeatureKey,
  account: GateAccount,
  opts: { billingLive: boolean },
): Promise<boolean> {
  // OFF = current behavior preserved: nothing is gated until billing actually goes live.
  if (!opts.billingLive) return true
  let overrides: FeatureGateOverrides = {}
  try {
    overrides = await loadFeatureGateOverrides()
  } catch {
    overrides = {}
  }
  const gate = mergeGate(String(feature), overrides)
  if (!gate) return true // an unknown feature is ungated (default-allow for an undeclared key)
  return meetsGate(gate, account)
}
