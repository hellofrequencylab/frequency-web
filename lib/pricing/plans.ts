// SPACE PLANS, the billing axis for a Space (the tenant), the sibling of the personal
// EntitlementTier (lib/core/entitlement.ts). PURE + framework-independent (no Supabase/Next),
// like lib/core/* and lib/spaces/entitlements.ts, so it's trivially unit-testable.
//
// PRICING LADDER PHASE A (ADR-458, docs/PRICING-LADDER-PLAN.md §1/§3). The 7 legacy plans collapse
// to FOUR: free / pro / nonprofit / organization. `spaces.type` stays as identity/skin, decoupled
// from the plan. Pro is a strong CORE plus four toggle ADD-ONS (Marketing, AI Engine, Team,
// Branding); Nonprofit + Organization are all-inclusive (core plus every add-on). The legacy plans
// fold in: practitioner/business -> pro, partner -> pro (comped), whitelabel -> pro + the Branding
// add-on key. White-label is no longer a plan, it is the Branding add-on.
//
// This module gives the labels a typed home + the plan/add-on -> entitlement-keys maps (which
// `spaces.entitlements.billing` keys a plan + active add-ons unlock), so the resolver (setSpacePlan /
// setSpaceAddons, lib/pricing/space-plan.ts) can SET-TO-TARGET the billing namespace the
// `spaceHasEntitlement` UNION reader consumes (lib/spaces/entitlements.ts). We do NOT restructure
// the readers here; this only computes the keys they read.

/** The Space billing plans (the spaces.plan label). 'free' = no paid plan. Four plans (ADR-458):
 *  free < pro < nonprofit < organization, ordered by CAPABILITY (gates.ts PLAN_RANK ranks on this),
 *  not price. Nonprofit + Organization are all-inclusive, so they out-rank Pro to clear every gate. */
export const SPACE_PLANS = ['free', 'pro', 'nonprofit', 'organization'] as const

export type SpacePlan = (typeof SPACE_PLANS)[number]

/** Operator-facing label for a Space plan (member/operator copy, plain voice, no em dashes). */
export const SPACE_PLAN_LABEL: Record<SpacePlan, string> = {
  free: 'Free',
  pro: 'Pro',
  nonprofit: 'Nonprofit',
  organization: 'Organization',
}

// LEGACY -> NEW plan remap (ADR-458). The collapse migration (pricing_plan_collapse) rewrites
// spaces.plan, but this code ships BEFORE that migration applies to prod, so a Space may still carry
// an old label. asSpacePlan NARROWS old labels to their new equivalent at READ time, so capabilities
// resolve correctly during the transition window:
//   practitioner | business | partner | whitelabel -> pro
// Partner is a comped Pro (spaces.is_comped); whitelabel folds to Pro and the migration adds the
// Branding add-on key separately. Any unknown label -> free (default-deny).
// TODO(ADR-458): remove this transition shim once supabase/migrations/<ts>_pricing_plan_collapse.sql
// has applied to prod and every spaces.plan is one of the four new labels.
const LEGACY_PLAN_REMAP: Record<string, SpacePlan> = {
  practitioner: 'pro',
  business: 'pro',
  partner: 'pro',
  whitelabel: 'pro',
}

/** Narrow an arbitrary string (e.g. the raw `spaces.plan`) to a known SpacePlan, defaulting to 'free'
 *  for null/unknown values (default-deny: an unrecognized plan grants nothing). TOLERANT of the OLD
 *  labels during the transition window: practitioner/business/partner/whitelabel narrow to 'pro' so a
 *  Space still carrying a legacy label resolves to Pro-equivalent capabilities until the collapse
 *  migration runs. See LEGACY_PLAN_REMAP. */
export function asSpacePlan(raw: string | null | undefined): SpacePlan {
  const v = raw ?? ''
  if ((SPACE_PLANS as readonly string[]).includes(v)) return v as SpacePlan
  return LEGACY_PLAN_REMAP[v] ?? 'free'
}

/** Is this label a Space PLAN label (a current one OR a legacy one in the transition window)? Used to
 *  distinguish the plan ladder from the personal tier ladder when inferring a gate's axis. PURE. */
export function isSpacePlanLabel(raw: string | null | undefined): boolean {
  const v = raw ?? ''
  return (SPACE_PLANS as readonly string[]).includes(v) || v in LEGACY_PLAN_REMAP
}

// ── Add-on key sets + Pro core (ADR-458, PRICING-LADDER-PLAN.md §1) ───────────────────────────────
// Pro = CORE plus four toggle ADD-ONS, each on/off independently. The keys here are the EXISTING
// `spaces.entitlements` capability keys the readers already gate on (e.g. 'crm', 'email',
// 'crm.resonance'); a plan/add-on grant is one key, never a schema change.
//
// THE PRO-CORE vs ADD-ON BOUNDARY (non-regressive choice). Today's `practitioner` plan grants
// ['crm', 'crm.playbooks']. The new Pro plan REPLACES practitioner, so Pro core MUST keep BOTH or a
// practitioner would lose the governed-playbooks depth on the collapse (a regression). So Pro core =
// ['crm', 'crm.playbooks']: the CRM (pipeline/contacts/notes) plus the Practitioner+ governed
// auto-execution + advanced segments lever. The resonance DEPTH (crm.resonance / crm.resonance_ai)
// moves into the AI Engine add-on (it was Business+/Org-only before, never a practitioner default, so
// gating it behind an add-on is not a regression for the entry plan).

/** Pro CORE entitlement keys, granted by the Pro base plan, before any add-on. Includes
 *  `crm.playbooks` so a former practitioner does not regress on the collapse (see boundary note). */
export const PRO_CORE_ENTITLEMENT_KEYS: readonly string[] = ['crm', 'crm.playbooks']

/** The four Pro ADD-ONS -> the entitlement keys each turns on (ADR-458 §1). Marketing bundles
 *  multi-pipeline + reporting (owner-locked); AI Engine is the resonance depth; Team is operator
 *  seats; Branding is white-label / branding removal (the old whitelabel plan, now an add-on). */
export const ADDON_ENTITLEMENT_KEYS = {
  marketing: ['email', 'automation', 'multi_pipeline', 'reporting'],
  ai: ['crm.resonance', 'crm.resonance_ai'],
  team: ['team'],
  branding: ['whitelabel'],
} as const

/** The Pro add-on item keys (the toggles a Space can turn on). */
export type AddonKey = keyof typeof ADDON_ENTITLEMENT_KEYS

/** The add-on item keys, for iteration / validation. */
export const ADDON_KEYS = Object.keys(ADDON_ENTITLEMENT_KEYS) as readonly AddonKey[]

/** Narrow an arbitrary value to a known add-on key, or null (default-deny). PURE. */
export function asAddonKey(raw: string | null | undefined): AddonKey | null {
  return (ADDON_KEYS as readonly string[]).includes(raw ?? '') ? (raw as AddonKey) : null
}

/** Compute the full entitlement key set for a base plan unioned with a set of active add-ons. PURE.
 *  The dedup keeps the result a clean set (the resolver writes each as `true`). Used to seed the
 *  all-inclusive plans and by setSpaceAddons. A base plan other than 'pro' uses its own base keys;
 *  add-ons only meaningfully layer onto Pro, but the union is well-defined for any base. */
export function planKeysWithAddons(plan: SpacePlan, addons: readonly AddonKey[]): readonly string[] {
  const base = plan === 'pro' ? PRO_CORE_ENTITLEMENT_KEYS : (BASE_PLAN_KEYS[plan] ?? [])
  const set = new Set<string>(base)
  for (const addon of addons) {
    const key = asAddonKey(addon)
    if (!key) continue
    for (const k of ADDON_ENTITLEMENT_KEYS[key]) set.add(k)
  }
  return [...set]
}

// The base-plan key sets (no add-ons), the seed for the plan map below. free = nothing; pro = CORE;
// nonprofit/organization fold here too but get their add-ons unioned in PLAN_ENTITLEMENT_KEYS.
const BASE_PLAN_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  pro: PRO_CORE_ENTITLEMENT_KEYS,
  nonprofit: PRO_CORE_ENTITLEMENT_KEYS,
  organization: PRO_CORE_ENTITLEMENT_KEYS,
}

// The plan -> entitlement-keys map (ADR-458). Each plan grants the keys it unlocks; the resolver
// writes them into `entitlements.billing` (set-to-target). free = nothing. pro = CORE only (add-ons
// layer ON via setSpaceAddons). nonprofit + organization = CORE plus EVERY add-on (all-inclusive).
//
// AI-DEPTH note: crm.playbooks rides Pro core (non-regressive, see boundary note); crm.resonance +
// crm.resonance_ai ride the AI Engine add-on. The free wedge (Today suggest-only + summaries +
// read-only scoring) is NEVER a key here, every Space gets it (fail-closed in spaceAiDepth).
// crm.autonomy (Phase 3) is a per-Space DIAL, deliberately NOT in any map.
const PLAN_ENTITLEMENT_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  pro: PRO_CORE_ENTITLEMENT_KEYS,
  // Nonprofit + Organization are all-inclusive: Pro core unioned with every add-on's keys.
  nonprofit: planKeysWithAddons('pro', ADDON_KEYS),
  organization: planKeysWithAddons('pro', ADDON_KEYS),
}

/** The `spaces.entitlements.billing` keys a plan unlocks (base plan only, no add-ons; code source of
 *  truth). PURE, returns the set of keys to flip `true`. An unknown plan returns none (default-deny). */
export function planEntitlementKeys(plan: SpacePlan): readonly string[] {
  return PLAN_ENTITLEMENT_KEYS[plan] ?? []
}

/** The default billing `{ key: true }` map a plan grants (base plan only). The blob shape
 *  `spaceBillingEntitlements` reads. PURE. */
export function planEntitlements(plan: SpacePlan): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const key of planEntitlementKeys(plan)) out[key] = true
  return out
}

/** The CANONICAL set of every billing-managed entitlement key, the UNION of every key any plan or
 *  add-on can grant. The migration + the resolver agree on which keys belong in the billing namespace
 *  via this list. PURE. (crm.autonomy is NOT here: it is a per-Space dial, top-level only.) */
export const BILLING_MANAGED_KEYS: readonly string[] = (() => {
  const set = new Set<string>(PRO_CORE_ENTITLEMENT_KEYS)
  for (const addon of ADDON_KEYS) for (const k of ADDON_ENTITLEMENT_KEYS[addon]) set.add(k)
  return [...set]
})()

/** Which add-ons a Space currently HOLDS, inferred from its effective entitlement set (ADR-463). PURE:
 *  pass a predicate that answers "does the Space have entitlement key X" (e.g. a closure over
 *  spaceHasEntitlement). An add-on counts as held when EVERY one of its entitlement keys is granted, so
 *  a partial hand-grant of a single key does not flip the whole add-on on. Used by the loadout picker to
 *  pre-select the add-ons the Space already runs. */
export function addonsHeldBy(hasEntitlement: (key: string) => boolean): AddonKey[] {
  const out: AddonKey[] = []
  for (const addon of ADDON_KEYS) {
    const keys = ADDON_ENTITLEMENT_KEYS[addon]
    if (keys.length > 0 && keys.every((k) => hasEntitlement(k))) out.push(addon)
  }
  return out
}
