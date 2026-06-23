// SPACE PLANS — the billing axis for a Space (the tenant), the sibling of the personal
// EntitlementTier (lib/core/entitlement.ts). PURE + framework-independent (no Supabase/Next),
// like lib/core/* and lib/spaces/entitlements.ts, so it's trivially unit-testable.
//
// This is the FIRST of the three independent flags (ADR-362) for a Space: what the Space
// PAYS for. It reuses the existing `spaces.plan` text label (ADR-322) — we do NOT add a new
// column. This module just gives the labels a typed home + the default plan -> entitlement-keys
// map (which `spaces.entitlements` jsonb keys a plan unlocks), so `setSpacePlan` (lib/pricing/
// space-plan.ts) can EXPAND the entitlements blob the existing `spaceHasEntitlement` reads.
// We do NOT restructure `spaceHasEntitlement` (lib/spaces/entitlements.ts) — this only writes
// the keys it already reads.

/** The Space billing plans (the spaces.plan label). 'free' = no paid plan. */
export const SPACE_PLANS = [
  'free',
  'practitioner',
  'business',
  // Nonprofit + Partner sit ABOVE business in this list ON PURPOSE. This array is the CAPABILITY
  // ladder meetsGate ranks on (gates.ts PLAN_RANK), NOT a price order. Both are "lower-priced or
  // comped but full-featured" (verified mission orgs / hosted programs), so they must out-rank
  // business to clear the business-level feature gates (email / automation / team / multi-pipeline).
  // Price + upgrade order live in PRICING_DEFAULTS and the admin console, not here.
  'nonprofit',
  'partner',
  'organization',
  'whitelabel',
] as const

export type SpacePlan = (typeof SPACE_PLANS)[number]

/** Operator-facing label for a Space plan (member/operator copy — plain voice, no em dashes). */
export const SPACE_PLAN_LABEL: Record<SpacePlan, string> = {
  free: 'Free',
  practitioner: 'Practitioner',
  business: 'Business',
  nonprofit: 'Nonprofit',
  partner: 'Partner',
  organization: 'Organization',
  whitelabel: 'White-label',
}

/** Narrow an arbitrary string (e.g. the raw `spaces.plan`) to a known SpacePlan, defaulting
 *  to 'free' for null/unknown values (default-deny: an unrecognized plan grants nothing). */
export function asSpacePlan(raw: string | null | undefined): SpacePlan {
  return (SPACE_PLANS as readonly string[]).includes(raw ?? '') ? (raw as SpacePlan) : 'free'
}

// The default plan -> entitlement-keys map. Each plan CUMULATIVELY unlocks the `spaces.entitlements`
// jsonb keys (the same keys `spaceHasEntitlement` reads). Mirrors the §5 spec: practitioner gets the
// CRM; business adds email/automation/team/multi-pipeline; organization is business + everything;
// white-label adds branding removal. The keys here are the EXISTING entitlement keys (e.g. 'crm' is
// the one the Space CRM board already gates on, ADR-361 P3) — adding a capability is one key, never a
// schema change.
const PLAN_ENTITLEMENT_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  practitioner: ['crm'],
  business: ['crm', 'email', 'automation', 'team', 'multi_pipeline'],
  // Nonprofit (verified mission orgs) + Partner (comped, hosting a program) get the full business
  // toolset minus white-label branding. Per-feature tunable in /admin/pricing.
  nonprofit: ['crm', 'email', 'automation', 'team', 'multi_pipeline'],
  partner: ['crm', 'email', 'automation', 'team', 'multi_pipeline'],
  organization: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'reporting'],
  whitelabel: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'reporting', 'whitelabel'],
}

/** The `spaces.entitlements` keys a plan unlocks (default map; code source of truth). PURE —
 *  returns the set of keys to flip `true` for the plan. An unknown plan returns none (default-deny). */
export function planEntitlementKeys(plan: SpacePlan): readonly string[] {
  return PLAN_ENTITLEMENT_KEYS[plan] ?? []
}

/** The default `spaces.entitlements` jsonb a plan grants — a `{ key: true }` map for every key the
 *  plan unlocks. This is exactly the blob shape `spaceEntitlements`/`spaceHasEntitlement` read, so a
 *  Space set to a plan reads its capabilities with NO change to the entitlement readers. PURE. */
export function planEntitlements(plan: SpacePlan): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const key of planEntitlementKeys(plan)) out[key] = true
  return out
}
