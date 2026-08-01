// FEATURE GATES — the feature -> minimum-entitlement map (ADR-362, docs/PRICING.md §4/§5/§13).
// The CODE map below is the SOURCE OF TRUTH; the `pricing_feature_gates` table is an additive,
// FAIL-SAFE override layer merged OVER it, mirroring exactly how lib/layout/page-chrome.ts merges
// operator chrome overrides over the code defaults (loadChromeOverrides + mergeChrome).
//
// Two axes of entitlement live here, deliberately separate (the three-flag rule, ADR-362):
//   * PERSONAL features rank on the membership tier (free < crew < supporter).
//   * SPACE features rank on the space tier (free < business ~ nonprofit, ADR-552).
// A feature names which ladder it sits on via `axis`. featureAllowed takes the account's tier
// and/or plan and answers a single boolean.
//
// CRITICAL — the gates are OFF until they are switched ON, and that switch is NOT the billing
// switch (ADR-874). featureAllowed SHORT-CIRCUITS to `true` (grant) whenever `opts.gatesLive` is
// false, which covers both "billing has not gone live" and "billing is live but the beta grace
// window is still open" — the founder's shape: sell now, gate on the date the beta runs out. The
// caller resolves that ONE boolean with lib/pricing/settings.ts featureGatesLive(), never with
// billingLive(). The DB merge + ladder math only ever matters once the gates are live. The reader
// is fail-safe to the code map on any DB error.

import { ENTITLEMENT_TIERS, type EntitlementTier } from '@/lib/core/entitlement'
import { SPACE_PLANS, asSpacePlan, isSpacePlanLabel, type SpacePlan } from './plans'

// ── The two entitlement ladders (low → high) ────────────────────────────────────────────
// Personal: free < crew < supporter (ENTITLEMENT_TIERS from lib/core/entitlement.ts).
const TIER_RANK: Record<EntitlementTier, number> = Object.fromEntries(
  ENTITLEMENT_TIERS.map((t, i) => [t, i]),
) as Record<EntitlementTier, number>

// Space: free < business ~ nonprofit (SPACE_PLANS, ADR-552; business/nonprofit are full depth). The
// plan-rank gate is the COARSE paid-floor check; the FINE per-feature gating is the entitlement-key
// UNION (spaceHasEntitlement,
// lib/spaces/entitlements.ts) the tier/add-on resolver writes. The marketing/team/branding depth now
// rides the Business tier and the AI add-on is metered, so a feature that needs a specific capability
// gates on its entitlement KEY, not on this coarse ladder.
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

  // §4b personal LEADERSHIP gates (the Crew tier's real job). A free Member leads at the FIRST-ONE-FREE
  // allowance (1 Circle hosted, 1 Journey published unlisted, 3 Practices, 2 active free events — the
  // meters in feature-meters.ts); Crew leads at scale, in public, and for money. These four are the
  // genuine ON/OFF splits that a quantity cannot express, so they gate rather than meter. A free Member
  // is never gated out of Frequency, only out of scaling what they lead.
  //
  // The community_role ladder is UNTOUCHED (ADR-207: role is earned, never billing). Hosting the first
  // Circle still makes a free Member a Host; these gates sit on the billing axis beside it.
  // 🔴 `event_paid_tickets` and `personal_payouts` USED TO SIT HERE and are deliberately gone
  // (ADR-914, docs/VALUE-LADDER.md Phase 1). Selling is free on every tier; the ladder is the RATE,
  // not the permission. Do not re-add them.
  //
  // Both were also decorative, which is worth recording so the deletion is not mistaken for a
  // capability being removed. `personal_payouts` had ZERO call sites: eligibility to receive money is
  // and always was `canReceivePayouts` (community role or persona), which never reads
  // `membership_tier`. `event_paid_tickets` had zero call sites too — a parallel predicate
  // (`ticketSellerVerdict`) enforced the rule instead, and that predicate is what Phase 1 reversed.
  // So this deletion removes two claims that were never true, rather than opening two doors.
  journey_library_list: { axis: 'tier', minEntitlement: 'crew', enabled: true }, // list a Journey publicly
  entry_points: { axis: 'tier', minEntitlement: 'crew', enabled: true }, // QR codes, short links, flyers

  // §5 space plans (reuse spaces.plan). COLLAPSED to the new ladder (ADR-552): the paid floor is
  // 'business' for every paid space feature, since free-vs-paid is a usage state within Business rather
  // than a tier ladder. The fine-grained "does this space have email / the AI engine / branding" decision
  // is the entitlement-KEY union (spaceHasEntitlement), which the add-on resolver set-to-targets; this
  // plan-rank gate is only the coarse "is this a paid space" floor.
  // §5 space plans (ADR-811 Community Collective ladder: free < business < collective ~ nonprofit ~
  // independent). Business ($29) = run-your-practice depth; Collective ($79) adds automation + team +
  // multi-pipeline + collaboration; Independent (~$249) adds white-label. Non Profit + Independent rank
  // at/above Collective, so a 'collective' floor is cleared by all three.
  // 🔴 `space_crm` and `space_email` USED TO SIT HERE and are deliberately gone (ADR-917,
  // docs/VALUE-LADDER.md Phase 3b). Both were BOTH gated and metered, which is two different promises
  // to the same customer: the gate said a free Space gets no CRM and no email at all, while the meter
  // (and the pricing page) promised it 200 contacts and 300 sends a month. Those disagree the moment
  // the gates go live, and the gate is the one that contradicts what we sold.
  //
  // They are now METERS, and unlike before they are ENFORCED at the write: contacts count through
  // lib/crm/contact-allowance.ts and sends count through the monthly allowance in lib/spaces/email.ts.
  // Deleting the gates first would have replaced an enforced limit with an unenforced one, which is
  // why Phase 3 left them and Phase 3b built the counting seams before removing them.
  //
  // The WALL that used to be smuggled inside `space_email` is `space_campaigns` below: messaging your
  // own people is free inside the send allowance, running an acquisition machine is paid. Do not
  // re-add either key; a plan ladder for these two lives in feature-meters.ts.
  space_automation: { axis: 'plan', minEntitlement: 'collective', enabled: true },
  // 🔴 `space_team` and `space_multi_pipeline` USED TO SIT HERE and are deliberately gone (ADR-917).
  // Both were decorative AND collided with their own meters: zero call sites outside this file, so
  // neither ever refused anyone, while `space_team` simultaneously promised Collective three included
  // seats through its meter and (had it ever fired) would have refused a free Space every seat at all.
  //
  // Seats are now genuinely metered: lib/spaces/seats.ts reads the `space_team` allowance as the
  // plan's BASE seat count, which is what `checkSeatForOperatorInvite` has always enforced against.
  // Pipelines stay display-only for now, honestly: nothing counts pipelines yet, and a gate that
  // cannot fire is a worse answer than a meter that admits it is a preview.
  space_whitelabel: { axis: 'plan', minEntitlement: 'independent', enabled: true }, // Branding, Independent tier only
  // COLLABORATOR HOSTING (ADR-799 §B / ADR-810 / ADR-835). Hosting other businesses inside your space,
  // or hosting an EVENT with Collaborator Spaces, is a Collective capability of the HOST side only:
  // the venue / the event's home Space needs the plan, while BEING a collaborator (the guest, incl. an
  // event Collaborator) is free for any active Business / Non Profit Space (they pay for their own).
  // Enforced where hosting is granted — collaborations-actions.ts (venue grain) and events/
  // share-actions.ts (event grain: invite, feature-request, and every accept) — so the wall cannot be
  // bypassed. Free spaces get the LOCKED PREVIEW (the surface renders with an upgrade prompt). Non
  // Profit clears it via the shared full-depth set. While the gates are not live this short-circuits
  // to granted (today's free universal behavior), so nothing changes until the grace window ends.
  // COLLABORATION IS NOW A LADDER, NOT A WALL. Hosting collaborators opens at BUSINESS (basic: a small
  // metered number of hosted collaborators + co-hosted events, see feature-meters space_collaborators);
  // the Collective depth is what a collective actually needs, and it rides `space_revenue_splits` below.
  // A free Space still gets the locked preview, and BEING a collaborator stays free for any active
  // Business / Non Profit Space. Moving the floor down converts a locked preview (which converts badly)
  // into a used feature with a ceiling (which converts well), the same usage-meter model as every other
  // dimension (ADR-519).
  space_collaborators: { axis: 'plan', minEntitlement: 'business', enabled: true },
  // Splitting money automatically with your collaborators is the true Collective line: hosting a few
  // partners is Business, sharing revenue with them is the collaboration ENGINE.
  space_revenue_splits: { axis: 'plan', minEntitlement: 'collective', enabled: true },
  // Group SMS to your own members (rides the A2P 10DLC registration, docs/A2P-REGISTRATION.md).
  space_sms: { axis: 'plan', minEntitlement: 'collective', enabled: true },
  // ── THE THREE WALLS (ADR-914, docs/VALUE-LADDER.md §3) ──────────────────────────────────────
  // Everything else on this ladder is a METER with a real free allowance, because a used feature with
  // a ceiling converts and a locked preview does not. These are walls because a quantity cannot
  // express the difference.
  //
  // SELLING A MEMBERSHIP is the most defensible wall in the product. A membership is a recurring
  // promise to another person: they pay you every month expecting the thing to still be there. Helping
  // someone make that promise from an account they might abandon next month is not a feature, and "one
  // free membership" teaches nothing while creating exactly one stranded subscriber. Business floor.
  space_memberships: { axis: 'plan', minEntitlement: 'business', enabled: true },
  // CAMPAIGNS AND FUNNELS. The line is between MESSAGING YOUR PEOPLE, which every Space can do inside
  // its send allowance, and RUNNING AN ACQUISITION MACHINE, which is what someone is paying for. A
  // metered "one free campaign" converts badly for the same reason a locked preview does: it is not
  // enough to learn anything from. Business floor.
  space_campaigns: { axis: 'plan', minEntitlement: 'business', enabled: true },
  // Membership-linked ticket access (ADR-823): restricting an event ticket tier to the hosting Space's
  // own members. LOWERED from collective to business (ADR-914) so it sits with the membership program
  // it sells — gating the membership at Business and then its own tickets a tier higher sold half a
  // feature. Enforced where the gate is WRITTEN (lib/events/ticket-tiers validateSpaceAccess); the
  // checkout enforces the stored gate unconditionally.
  space_membership_tickets: { axis: 'plan', minEntitlement: 'business', enabled: true },
  // Storefront (ADR-39X/Z) — available from the FREE plan (a free Space can sell; the plan
  // only buys the rake down + features). A per-Space toggle decides ON/OFF.
  space_storefront: { axis: 'plan', minEntitlement: 'free', enabled: true },
  // Full website / multi-page profile (owner decision) — a Space gets ONE continuous profile page by
  // default; the multi-page "Pages" manager is a paid UPSELL tied to the full website (not built yet).
  // DISABLED here so this coarse plan-ladder gate never binds; the LOCK is enforced by the pure
  // `space_full_website` ENTITLEMENT key (spaceCanUseFullWebsite, lib/spaces/entitlements.ts), which
  // stays default-deny regardless of the gate switch (featureAllowed would short-circuit to granted
  // while the gates are not live, which would un-gate the upsell — the enforcement does NOT ride it).
  space_full_website: { axis: 'plan', minEntitlement: 'business', enabled: false },

  // §5 space AI-depth (Resonance Engine Phase 6 · ADR-387). The paid DEPTH of the engine. The free
  // wedge (Today suggest-only + summaries + read-only scoring) is NEVER a gate, so it has no entry
  // here. Business grants governed playbooks + advanced segments; the AI Engine add-on grants the
  // resonance surface + the full Resonance Graph. The plan-rank floor is 'business' for all three; the
  // resonance keys additionally gate on their entitlement key (the AI Engine add-on). While the gates
  // are not live, featureAllowed short-circuits to true and these never bind (today's behavior).
  space_crm_playbooks: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_crm_resonance: { axis: 'plan', minEntitlement: 'business', enabled: true },
  space_crm_resonance_ai: { axis: 'plan', minEntitlement: 'business', enabled: true },
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
    // Infer the axis from the label: a plan label (current or legacy, ADR-458) -> 'plan', else 'tier'.
    axis: isSpacePlanLabel(row?.minEntitlement) ? 'plan' : 'tier',
    minEntitlement: 'free',
    enabled: true,
  }
  if (!row) return base
  // VALIDATE the override's min_entitlement against the gate's ladder before applying it. An invalid
  // label (a typo, a retired tier, or a value on the WRONG ladder) must NOT silently widen the gate:
  // meetsGate ranks an unknown label as 0, so `have >= 0` is always true (allow-all) — the exact
  // fail-OPEN this fail-safe layer must never do. Keep the code default when the override is missing
  // or invalid, and normalize a valid plan label to its canonical SpacePlan so meetsGate's direct
  // PLAN_RANK lookup resolves it (a legacy label would otherwise rank 0).
  let minEntitlement = base.minEntitlement
  const raw = row.minEntitlement
  if (raw != null) {
    if (base.axis === 'tier') {
      if (TIER_RANK[raw as EntitlementTier] !== undefined) minEntitlement = raw as EntitlementTier
    } else if (isSpacePlanLabel(raw)) {
      minEntitlement = asSpacePlan(raw)
    }
  }
  return {
    axis: base.axis,
    minEntitlement,
    enabled: typeof row.enabled === 'boolean' ? row.enabled : base.enabled,
  }
}

/** Load the operator feature-gate overrides as a plain map. Service-role read (works regardless of
 *  the caller's RLS), REQUEST-CACHED. FAIL-SAFE: returns `{}` on ANY error (incl. a missing table
 *  pre-migration), so featureAllowed always falls back to the code map. The dynamic import keeps
 *  this server-only dependency out of the module top level (the pure helpers stay client-safe). */
// 🔴 THE MEMO IS MODULE-LEVEL, AND IT HAS TO BE. `cache()` returns a NEW memoized function; calling it
// inside the exported function built a fresh empty memo on every invocation, so the docstring's
// "REQUEST-CACHED" was false and every call re-queried. Harmless today only because featureAllowed
// short-circuits before reaching here while the gates are soft — the moment they go live, a settings
// render resolving N gates would fire N identical selects.
//
// Created lazily on first use so the dynamic `import('react')` stays out of the module top level and the
// pure helpers above remain client-safe, which is why it was written inline in the first place.
let memoizedLoad: (() => Promise<FeatureGateOverrides>) | null = null

export async function loadFeatureGateOverrides(): Promise<FeatureGateOverrides> {
  try {
    if (!memoizedLoad) {
      const { cache } = await import('react')
      memoizedLoad = cache(async () => {
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
    }
    return await memoizedLoad()
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
 *   - SHORT-CIRCUITS to `true` (grant) when the gates are NOT live, so nothing is gated while
 *     billing is off AND nothing is gated during the beta grace window (ADR-874).
 *   - Otherwise applies the merged gate's ladder check.
 *
 *  `gatesLive` is passed in (resolved by the caller via lib/pricing/settings.ts featureGatesLive()),
 *  keeping this resolver free of its own env/flag IO and easy to test. It is deliberately NOT
 *  billingLive(): "may we charge" and "do the gates bite" are different decisions on different
 *  dates, and passing the charging switch in here is exactly the bug ADR-874 fixed. */
export async function featureAllowed(
  feature: FeatureKey,
  account: GateAccount,
  opts: { gatesLive: boolean },
): Promise<boolean> {
  // NOT LIVE = grant everything: pre-launch, and through the beta grace window after billing turns on.
  if (!opts.gatesLive) return true
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
