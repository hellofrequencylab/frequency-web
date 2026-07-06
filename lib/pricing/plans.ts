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
  // Brand: the connected custom-domain tier (BUSINESS-ACCOUNTS-STRATEGY, pricing ADR). Ranks just
  // ABOVE business so it clears the business-level gates AND the space_custom_domain gate, while
  // staying BELOW the full-featured mission/enterprise tiers. Own domain, still network-connected
  // (spaces.network_connected stays true) — distinct from white-label, which decouples.
  'brand',
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
  // Brand: own domain, still connected to the network. The self-serve upgrade above Business.
  brand: 'Brand',
  // The verified-501c3 plan is the plan FOR a Space of type `organization` (a nonprofit), so its
  // label names both: the operator picks the right plan for an Organization space without guessing,
  // and the plan label + the Space type label read as the same thing.
  nonprofit: 'Nonprofit (Organization)',
  partner: 'Partner',
  // The high-end CUSTOM plan for a large organization (built, not publicly sold) — distinct from the
  // verified-nonprofit plan above. 'Enterprise' so it never reads as the same row as Nonprofit.
  organization: 'Organization (Enterprise)',
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
//
// AI-DEPTH (Resonance Engine Phase 6 · ADR-387). The paid DEPTH of the engine rides the SAME ladder:
//   • crm.playbooks    — Practitioner+ (governed auto-execution of safe playbooks + advanced segments)
//   • crm.resonance    — Business+ (the read-only resonance surface)
//   • crm.resonance_ai — Organization+ (the full Resonance Graph + managed matching, the top rung)
// The FREE WEDGE (Today suggest-only + summaries + read-only scoring) is NEVER a key here: every
// Space gets it whether or not a plan grants anything. So `free` stays empty and a missing depth key
// reads as the wedge (fail-closed in spaceAiDepth). `crm.autonomy` (Phase 3) is a per-Space DIAL, not
// a plan grant, so it is deliberately NOT in this map.
const PLAN_ENTITLEMENT_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  practitioner: ['crm', 'crm.playbooks'],
  business: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'crm.playbooks', 'crm.resonance'],
  // Brand: the full business toolset PLUS the connected custom-domain capability ('custom_domain'),
  // still network-connected (no branding removal — that is white-label's 'whitelabel' key).
  brand: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'crm.playbooks', 'crm.resonance', 'custom_domain'],
  // Nonprofit (verified mission orgs) + Partner (comped, hosting a program) get the full business
  // toolset minus white-label branding. Per-feature tunable in /admin/pricing.
  nonprofit: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'crm.playbooks', 'crm.resonance'],
  partner: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'crm.playbooks', 'crm.resonance'],
  organization: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'reporting', 'crm.playbooks', 'crm.resonance', 'crm.resonance_ai'],
  whitelabel: ['crm', 'email', 'automation', 'team', 'multi_pipeline', 'reporting', 'whitelabel', 'custom_domain', 'crm.playbooks', 'crm.resonance', 'crm.resonance_ai'],
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
