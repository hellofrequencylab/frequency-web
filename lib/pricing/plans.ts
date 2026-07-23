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

/** The Space billing tiers (the spaces.plan label). 'free' = no paid plan. The Community Collective model
 *  (ADR-811) orders these by CAPABILITY (gates.ts PLAN_RANK ranks on this), NOT price:
 *  `free < business < collective ~ nonprofit ~ independent`. Business ($29) = run-your-practice depth;
 *  Collective ($79) adds automation + team + collaboration; Non Profit ($39) = the Collective toolkit,
 *  verified; Independent (~$249) = Collective depth + white-label, and rides `network_connected=false`
 *  (standalone / standard SaaS). Non Profit + Independent rank AT/ABOVE Collective so they clear every
 *  collective-floor gate. Legacy `business`/`nonprofit` spaces pass through unchanged (grandfathered). */
export const SPACE_PLANS = ['free', 'business', 'collective', 'nonprofit', 'independent'] as const

export type SpacePlan = (typeof SPACE_PLANS)[number]

/** Operator-facing label for a Space tier (member/operator copy, plain voice, no em dashes). "Business" and
 *  "Non Profit" are the two public designators; Collective + Independent are the higher tiers (NAMING.md, ADR-811). */
export const SPACE_PLAN_LABEL: Record<SpacePlan, string> = {
  free: 'Free',
  business: 'Business',
  collective: 'Collective',
  nonprofit: 'Non Profit',
  independent: 'Independent',
}

// LEGACY -> NEW plan remap (ADR-552). The retired tier names narrow forward at READ time so a Space still
// carrying an old `spaces.plan` label resolves to the right first-class tier (this ships BEFORE any
// backfill). `business` and `nonprofit` are first-class, so they pass through asSpacePlan unchanged:
//   pro | practitioner | partner -> business   (the former paid-entry tiers fold into Business)
//   organization                 -> nonprofit  (the org DB value is renamed to nonprofit, ADR-552 §3)
//   whitelabel                   -> business   (white-label is a Business-depth capability, not a tier)
// Any unknown label -> free (default-deny). Safe because no prod row uses these legacy labels.
const LEGACY_PLAN_REMAP: Record<string, SpacePlan> = {
  pro: 'business',
  practitioner: 'business',
  partner: 'business',
  organization: 'nonprofit',
  // white-label is now the Independent tier (ADR-811 un-folds it from Business).
  whitelabel: 'independent',
}

/** Narrow an arbitrary string (e.g. the raw `spaces.plan`) to a known SpacePlan, defaulting to 'free'
 *  for null/unknown values (default-deny: an unrecognized plan grants nothing). TOLERANT of the OLD
 *  labels during the transition window: pro/practitioner/partner/whitelabel narrow to 'business' and
 *  organization narrows to 'nonprofit' so a Space still carrying a legacy label resolves to the right
 *  tier. See LEGACY_PLAN_REMAP. ('business'/'nonprofit' are first-class, so they pass through unchanged.) */
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

// ── Business tier depth + the sole metered add-on (ADR-552, folding ADR-472) ───────────────────────
// Every paid tool folds into the SINGLE paid tier depth (Business); AI Engine stays the SOLE metered
// add-on. The keys here are the EXISTING `spaces.entitlements` capability keys the readers already gate
// on (e.g. 'crm', 'email', 'crm.resonance'); a tier/add-on grant is one key, never a schema change.
//
// THE COLLAPSE (ADR-552, folding the former Pro core into Business). The former `pro`/`practitioner`
// depth (['crm', 'crm.playbooks']) folds INTO Business, so a former practitioner keeps the CRM +
// governed-playbooks depth (no regression). Business carries the FULL depth: CRM, governed playbooks,
// marketing (email/automation/multi-pipeline/reporting), Team seats, and Branding (white-label). Nonprofit
// is the same depth. The resonance DEPTH (crm.resonance / crm.resonance_ai) is the AI Engine METERED
// add-on, in NO tier base.

/** Business tier depth keys = the FULL paid depth (CRM + governed playbooks + marketing + team +
 *  branding + the multi-page website). Business and Nonprofit both grant this exact set; free grants
 *  nothing. The former Pro core (['crm', 'crm.playbooks']) folds in here so a former practitioner does
 *  not regress (ADR-552).
 *
 *  `space_full_website` (the multi-page profile / full website upsell) rides this set so a paid tier
 *  actually GRANTS it (ADR-782). It is enforced by a PURE default-deny read (spaceCanUseFullWebsite),
 *  NOT the billing-latent featureAllowed seam, so it stays locked for free Spaces regardless of
 *  billingLive; being in the plan depth is the ONLY way a Business/Nonprofit Space ever unlocks it.
 *  Kept in lock-step with SPACE_FULL_WEBSITE_KEY (lib/spaces/entitlements.ts). */
export const BUSINESS_DEPTH_ENTITLEMENT_KEYS: readonly string[] = [
  'crm',
  'crm.playbooks',
  'email',
  'reporting',
  'space_full_website',
]

/** Collective ($79) depth = Business depth PLUS the scale + collaboration tools: marketing automation,
 *  multiple pipelines, and team seats. (Collaboration hosting itself is gated by the `space_collaborators`
 *  plan-rank floor in gates.ts at 'collective', not an entitlement key.) Non Profit grants this same set. */
export const COLLECTIVE_DEPTH_ENTITLEMENT_KEYS: readonly string[] = [
  ...BUSINESS_DEPTH_ENTITLEMENT_KEYS,
  'automation',
  'multi_pipeline',
  'team',
]

/** Independent (~$249, white-label, network-disconnected) depth = Collective depth PLUS branding
 *  (`whitelabel`). White-label is UN-FOLDED from Business (ADR-811) into this standalone tier only. */
export const INDEPENDENT_DEPTH_ENTITLEMENT_KEYS: readonly string[] = [
  ...COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  'whitelabel',
]

/** The metered ADD-ON(S) -> the entitlement keys each turns on (ADR-472 §1b). AI Engine is now the
 *  SOLE cross-tier metered add-on: it is usage-priced, available on every paid tier, and its keys are
 *  NEVER in a tier base. Marketing / Team / Branding are GONE as add-ons (folded into Business depth). */
export const ADDON_ENTITLEMENT_KEYS = {
  ai: ['crm.resonance', 'crm.resonance_ai'],
} as const

/** The metered add-on item keys (the toggles a Space can turn on independently of its tier). */
export type AddonKey = keyof typeof ADDON_ENTITLEMENT_KEYS

/** The add-on item keys, for iteration / validation. Just `['ai']` now (ADR-472). */
export const ADDON_KEYS = Object.keys(ADDON_ENTITLEMENT_KEYS) as readonly AddonKey[]

/** Narrow an arbitrary value to a known add-on key, or null (default-deny). PURE. */
export function asAddonKey(raw: string | null | undefined): AddonKey | null {
  return (ADDON_KEYS as readonly string[]).includes(raw ?? '') ? (raw as AddonKey) : null
}

/** Compute the full entitlement key set for a base tier unioned with a set of active add-ons. PURE.
 *  The dedup keeps the result a clean set (the resolver writes each as `true`). Used by setSpaceAddons:
 *  the tier writes its full depth set, the active AI add-on layers its resonance keys on top. */
export function planKeysWithAddons(plan: SpacePlan, addons: readonly AddonKey[]): readonly string[] {
  const set = new Set<string>(BASE_PLAN_KEYS[plan] ?? [])
  for (const addon of addons) {
    const key = asAddonKey(addon)
    if (!key) continue
    for (const k of ADDON_ENTITLEMENT_KEYS[key]) set.add(k)
  }
  return [...set]
}

// The tier depth sets (no add-ons), the seed for the tier map below. free = nothing; business /
// nonprofit = the SAME full depth (Business depth set). ADR-552 collapsed the ladder to two paid tiers
// that are identical at the key level; Nonprofit's difference is price + verification, not entitlements.
const BASE_PLAN_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  business: BUSINESS_DEPTH_ENTITLEMENT_KEYS,
  collective: COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  nonprofit: COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  independent: INDEPENDENT_DEPTH_ENTITLEMENT_KEYS,
}

// The tier -> entitlement-keys map (ADR-552). Each tier grants the keys its BASE depth unlocks; the
// resolver writes them into `entitlements.billing` (set-to-target). free = nothing. business / nonprofit
// = the full Business depth (marketing + team + branding folded in).
//
// AI-DEPTH note: crm.playbooks rides the Business depth; crm.resonance + crm.resonance_ai ride the AI
// Engine METERED add-on and are in NO tier base (nonprofit does NOT bundle AI). The free wedge (Today
// suggest-only + summaries + read-only scoring) is NEVER a key here, every Space gets it (fail-closed in
// spaceAiDepth). crm.autonomy (Phase 3) is a per-Space DIAL, deliberately NOT in any map.
const PLAN_ENTITLEMENT_KEYS: Record<SpacePlan, readonly string[]> = {
  free: [],
  business: BUSINESS_DEPTH_ENTITLEMENT_KEYS,
  collective: COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  nonprofit: COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  independent: INDEPENDENT_DEPTH_ENTITLEMENT_KEYS,
}

/** The `spaces.entitlements.billing` keys a tier unlocks (base tier only, no add-ons; code source of
 *  truth). PURE, returns the set of keys to flip `true`. An unknown tier returns none (default-deny). */
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

/** The CANONICAL set of every billing-managed entitlement key, the UNION of every key any tier OR the
 *  AI add-on can grant. The migration + the resolver agree on which keys belong in the billing namespace
 *  via this list. It MUST stay the full union (every marketing/team/branding/crm key from the tier depth
 *  sets + the AI resonance keys) so the migration/union reader still covers every key, even though
 *  marketing/team/branding are no longer add-ons (they now ride the Business depth set). PURE.
 *  (crm.autonomy is NOT here: it is a per-Space dial, top-level only.) */
export const BILLING_MANAGED_KEYS: readonly string[] = (() => {
  // Independent depth is the SUPERSET of every tier's keys (crm/playbooks + email + reporting +
  // full-website + automation/multi_pipeline/team + whitelabel), so it is the full tier-side union.
  const set = new Set<string>(INDEPENDENT_DEPTH_ENTITLEMENT_KEYS)
  for (const addon of ADDON_KEYS) for (const k of ADDON_ENTITLEMENT_KEYS[addon]) set.add(k) // + the AI resonance keys
  return [...set]
})()

/** Which metered add-ons a Space currently HOLDS, inferred from its effective entitlement set
 *  (ADR-472). PURE: pass a predicate that answers "does the Space have entitlement key X" (e.g. a
 *  closure over spaceHasEntitlement). An add-on counts as held when EVERY one of its entitlement keys is
 *  granted, so a partial hand-grant of a single key does not flip the whole add-on on. Used by the
 *  picker to pre-select the AI add-on a Space already runs. (Only `ai` is an add-on now; the former
 *  marketing/team/branding are tier depth, never reported here.) */
export function addonsHeldBy(hasEntitlement: (key: string) => boolean): AddonKey[] {
  const out: AddonKey[] = []
  for (const addon of ADDON_KEYS) {
    const keys = ADDON_ENTITLEMENT_KEYS[addon]
    if (keys.length > 0 && keys.every((k) => hasEntitlement(k))) out.push(addon)
  }
  return out
}
