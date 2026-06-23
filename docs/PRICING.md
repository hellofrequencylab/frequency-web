# Pricing & entitlements

> **Status:** ✅ P1 shipped (the entitlements + admin-config foundation). ⏳ P2 = Stripe wiring;
> ⏳ P3 = wire the gates into live surfaces. **EVERYTHING SHIPS OFF in P1: nothing charges, no
> live Stripe call is made.** The master `billing_live` switch is OFF by default, so members and
> spaces keep their current access exactly as today.
>
> **Decision:** [ADR-362](DECISIONS.md). **Authoritative model:** the owner's "Frequency — Pricing
> Model & Feature Gating Spec." **Source of truth (code):** `lib/pricing/*`, the
> `/admin/pricing` console, and `supabase/migrations/20260723010000_pricing_foundation.sql`.

## TL;DR

Frequency monetizes on **three independent flags**. The whole pricing system is built so that
each one moves on its own axis and is operator-editable from `/admin/pricing` — and so that turning
billing OFF leaves the product behaving exactly as it does today.

| Flag | What it means | Where it lives | Set by |
|---|---|---|---|
| **billing_tier** | What someone PAYS for | personal: `profiles.membership_tier` (`free`/`crew`/`supporter`) · space: `spaces.plan` (`free`/`practitioner`/`business`/`organization`/`whitelabel`) | billing (P2) / operator |
| **community_role** | EARNED standing | `community_role` ladder | earned, **never** billing (ADR-207) |
| **gamification_access** | Full game vs earn only | derived from `billing_tier`, overridable via `profiles.gamification_access_override` | derive **or** operator |

We **reuse** the existing entitlement seams — `lib/core/entitlement.ts` (`isPaid`, `canCashIn`,
`deriveTier`) for the personal tier, and `spaces.plan` + `spaces.entitlements` +
`spaceHasEntitlement` (default-deny) for the space plan. P1 adds **no new tier column**; it adds the
founder/override bits, the operator-config tables, and the admin console.

## The three-flag model

### 1. billing_tier (what you pay for)

- **Personal:** `profiles.membership_tier` IS the personal billing tier (free → crew → supporter).
  Unchanged. `lib/core/entitlement.ts` stays the single seam.
- **Space:** `spaces.plan` IS the space billing plan. `lib/pricing/plans.ts` gives the labels a typed
  home (`SPACE_PLANS`) and the default **plan → entitlement-keys** map (`planEntitlements`). The P2
  webhook will call `setSpacePlan(spaceId, plan)` (`lib/pricing/space-plan.ts`) to write the plan and
  **expand** `spaces.entitlements` to the keys the plan unlocks — the same `{ key: true }` blob
  `spaceHasEntitlement` already reads, **additively** (manual grants survive). `setSpacePlan` is gated
  on `billingLive()`, so it is a no-op while billing is OFF.

### 2. community_role (earned, never billing)

The trust ladder (`community_role`, ADR-207) is untouched and decoupled from billing. A free-tier
Host gets their tools from the role via the access matrix, not from membership.

### 3. gamification_access (derived, but overridable)

The **third flag**, the one most often confused with billing. By default it is derived from the
billing tier (member = `earn_only`, crew+ = `full`, the same line `canCashIn` draws). But it is an
**independent, overridable switch**: `profiles.gamification_access_override` (nullable; `null` =
derive) PINS it regardless of billing — so an operator can comp a free member the full game, or hold
a paying member to earn-only. Resolved by `resolveGamificationAccess(profile)` =
`override ?? derive(membership_tier)` (`lib/pricing/gamification.ts`, pure + unit-tested).

## Seeded launch values (all editable, all OFF)

Seeded by the migration and mirrored in code (`PRICING_DEFAULTS` in `lib/pricing/settings.ts`). Every
value is editable at `/admin/pricing`; nothing charges while `billing_live` is OFF.

| Plan | Monthly | Annual (≈ 2 months free) | Notes |
|---|---|---|---|
| Crew (member) | $9 | $90 | personal tier |
| Supporter (member) | $24 | $240 | personal tier |
| Practitioner (space) | $39 | $390 | take-rate 8% |
| Business (space) | $99 | $990 | take-rate 5% |
| Organization (space) | $199 | monthly only | take-rate 3% |
| White-label (space) | $299 + $2,000 setup | monthly only | branding removal |

Other knobs: **Vera free cap** 10 messages/day · **annual discount** ≈ 2 months free · **trial** 0
days (editable). Take-rates are stored in basis points (800 = 8%).

## Feature gates (data, not code branches)

The feature → minimum-entitlement map is **data**. The code map in `lib/pricing/gates.ts`
(`FEATURE_GATES`) is the source of truth; the `pricing_feature_gates` table is an additive,
FAIL-SAFE **override layer** merged OVER it, exactly the way `lib/layout/page-chrome.ts` merges
operator chrome overrides over code defaults (`mergeGate` mirrors `mergeChrome`).

`featureAllowed(feature, account, { billingLive })` is the single resolver. Seeded features:

| Feature | Axis | Needs |
|---|---|---|
| `vault_cash_in` | tier | crew |
| `gamification_full` | tier | crew |
| `vera_unlimited` | tier | crew |
| `space_crm` | plan | practitioner |
| `space_email` / `space_automation` / `space_team` / `space_multi_pipeline` | plan | business |
| `space_whitelabel` | plan | whitelabel |

## How OFF preserves current behavior 🔴 important

`billing_live` defaults OFF, and the live gate is `billingLive()` = `billingEnabled()` (the Stripe
env keys) **AND** the `billing_live` flag — so billing is OFF even with env keys present until an
operator flips the master switch. While OFF:

- `featureAllowed(...)` **short-circuits to `true`** (grant everything). No surface that consults it
  changes behavior.
- `setSpacePlan(...)` is a **no-op** (returns `billing_off`), so no Space's entitlements change.
- Per-tier/plan `*_enabled` switches are all OFF; the gamification toggles mirror the existing
  derive-from-tier default (crew/supporter full, member earn-only).

Every reader is additionally FAIL-SAFE: a DB error or the pre-migration state falls back to the
seeded code defaults, never to a charge or a lockout.

## The /admin/pricing console

A janitor-gated operator surface (`app/(main)/admin/pricing/`, registered in
`app/(main)/admin/sections.ts` and `lib/admin/nav.ts` under Operations → Platform). Composes the
admin page kit (`AdminTemplate` + `FormSection` + `Toggle`). Routes:

| Route | What |
|---|---|
| `/admin/pricing` | the whole console |

Sections: **Switches** (master `billing_live`, prominent + OFF; per-tier/plan enable; per-role
gamification) · **Plans and prices** (every value, in dollars) · **Feature gates** (the editable
feature → entitlement matrix with a per-feature enable toggle) · **Founding members** (the founder
lock + locked-price reference, honored in P2) · **Stripe status** (read-only; "not configured /
billing OFF" until P2). All writes are admin-gated server actions (`actions.ts`) that audit flag
flips via `setPlatformFlag` → `platform_flag_events`.

## Files

| Concern | File |
|---|---|
| Migration | `supabase/migrations/20260723010000_pricing_foundation.sql` |
| Space plans + plan→entitlements | `lib/pricing/plans.ts` |
| Gamification resolver (flag 3) | `lib/pricing/gamification.ts` |
| Feature gates (code map + DB merge + `featureAllowed`) | `lib/pricing/gates.ts` |
| Settings, flags, `billingLive()` | `lib/pricing/settings.ts` |
| `setSpacePlan` (the P2 webhook entry) | `lib/pricing/space-plan.ts` |
| Admin console | `app/(main)/admin/pricing/` |
| Tests | `lib/pricing/pricing.test.ts` |

## Roadmap

| Phase | Scope |
|---|---|
| ✅ **P1** | entitlements layer + operator config + `/admin/pricing` console; everything OFF |
| ⏳ **P2** | Stripe wiring: checkout for tiers/plans, the webhook calls `setSpacePlan`, founder lock honored at checkout |
| ⏳ **P3** | wire `featureAllowed` / `resolveGamificationAccess` into live gated surfaces once billing is on |

## References

- Decision: [ADR-362](DECISIONS.md) · Authoritative spec: the owner's pricing & feature-gating spec
- Reused seams: `lib/core/entitlement.ts` · `lib/spaces/entitlements.ts` ·
  [ROLES.md](ROLES.md) (the role/entitlement axes) · [SPACES.md](SPACES.md) (tenancy)
- Billing env gate: `lib/billing/stripe.ts` (`billingEnabled`) · operator flags: `lib/platform-flags.ts`
