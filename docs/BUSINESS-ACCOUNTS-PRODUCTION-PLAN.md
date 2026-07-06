# Business Accounts — Master Phased Production Plan

> **Status:** 🟡 Proposed (strategy locked, build not started). The end-to-end production plan to
> finalize every layer of Frequency's business accounts: strategy, offerings, front end, back end,
> and admin management. Companion to [BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md)
> (the why + pricing) and [BUSINESS-ACCOUNTS-OVERVIEW.md](BUSINESS-ACCOUNTS-OVERVIEW.md) (technical +
> marketing narrative). Reuses [PRICING.md](PRICING.md), [SPACES.md](SPACES.md),
> [CRM-STRATEGY.md](CRM-STRATEGY.md).
>
> **Legend:** ✅ built · 🟡 partial · ⚙️ coded-inactive · 🔴 missing · ⭐ priority

## TL;DR

Three things ship in this plan, in order:

1. **The Operator Console (IA condensation).** Collapse today's 60+ scattered management surfaces
   into **one scope-switched console** with **7 workspaces**. Root platform and tenant Space become
   the same console at different scopes. This is the load-bearing prerequisite — every feature below
   plugs into it instead of adding another orphan settings page.
2. **The connection-based pricing model** (Free +5% → Grow → Build → **Brand** → Independent),
   wired through the existing OFF-preserving gate.
3. **The SEO/AIO growth engine + the missing feature depth** (reviews, space automation, AI credit
   metering, churn intelligence) that make the all-in-one bundle real.

Phasing: **P0 Console → P1 SEO engine → P2 Pricing → P3 Trust → P4 Automation → P5 Intelligence →
P6 Independent/white-label polish.**

---

## PART 1 — The Operator Console (admin/menu condensation)

### 1.1 The problem (current-state, measured)

| Symptom | Evidence |
|---|---|
| **60+ surfaces, 5 trees** | `/admin/*` (47 routes, 9 domains, 80+ links via `app/(main)/admin/sections.ts`), `/spaces/[slug]/settings/*` (13 routes), personal `/settings/*` (6), `/pages/*`, `/lead/*` |
| **Duplicated tooling** | Email (`/spaces/[slug]/settings/email` **and** `/admin/marketing/campaigns`), QR (`/settings/qr` **and** `/admin/qr`), members (`/settings/members` **and** `/admin/members`), CRM (`/settings/crm` **and** `/admin/crm`) |
| **No operator home** | A Space owner has no dashboard; hero stats live on the public profile, KPIs scattered across 4+ surfaces (`/admin/audit`, `/admin/insights`, `/admin/marketing/analytics`, profile stats) |
| **Nav in 7+ files** | `sections.ts`, `lib/admin/nav.ts` (legacy), settings `page.tsx` hardcoded cards, `lib/spaces/blueprints.ts` tabs, `settings/page.tsx`, `lib/nav-areas.ts`, `lib/menu-config.ts` |
| **Heavy menus / deep nesting** | Admin dashboards 10–16 cards each; 3+ level workflows |

### 1.2 The principle: one console, scope-switched

The root platform is already a Space (`type='root'`). Operating the root and operating a tenant
Space are **the same role at different scopes**. So there is **one Operator Console**, and a **Space
switcher** picks the scope. What renders is gated by three axes that already exist:

- **Role** in that space (`space_members.role` / `web_role` for root) — can you see it at all
- **Plan/entitlements** (`spaces.plan` + `spaces.entitlements` via `featureAllowed`) — is it unlocked
- **Space type** (`spaces.type` blueprint) — is it relevant (donations only for `organization`, etc.)

Result: a Free practitioner sees a lean console; a janitor operating root sees the full platform;
**both use the identical IA, nav, and components.** One codebase, one mental model.

### 1.3 The condensed IA: 7 workspaces

Replaces 9 admin domains + 13 settings routes + scattered pages with **7 workspaces**, each with
progressive-disclosure sub-tabs. Everything gated by scope × role × plan × type.

| # | Workspace | Route | Consolidates (today) | Gating |
|---|---|---|---|---|
| 1 | **Home** ⭐ | `/[scope]/home` | *(new)* hero stats + `/admin/insights` + `/admin/audit` snippets + at-risk | all |
| 2 | **Profile & Site** | `/[scope]/site` | `settings/` (brand, visibility), `/admin/appearance` (theme), `/admin/page-layout`, `/pages/*`, custom domain, SEO/schema | all |
| 3 | **People** | `/[scope]/people` | `settings/members` + `/admin/members` + `settings/crm` + `/admin/crm` + `/admin/segments` + `/admin/personas` | plan (CRM) |
| 4 | **Marketing** | `/[scope]/marketing` | `settings/email` + `/admin/marketing/*` + `settings/qr` + `/admin/qr` + automations + funnels + referrals + analytics | plan (email/automation) |
| 5 | **Offerings & Commerce** | `/[scope]/offerings` | `settings/{availability,memberships,donations,enroll,checkin,tickets}` + offerings + `/admin/marketplace` + payments | type + plan |
| 6 | **Community & Content** | `/[scope]/community` | `/admin/community/*` + `/admin/programs/*` + events + gamification + moderation *(root-heavy; tenant sees circles/events/team)* | type + role |
| 7 | **Settings** | `/[scope]/settings` | plan & billing, features & role-access, team roles, AI/Vera config + credits, integrations, onboarding, support, audit, system | role |

**Scope resolution:** `/[scope]` is `/admin` when operating root (back-compat alias) or
`/spaces/[slug]/manage` when operating a tenant. Both mount the same console shell.

**Personal `/settings/*` stays separate** — it is the *human's* account (identity, notifications,
personal billing), not an operator surface. But the profile editor, Spotlight, and personal CRM
(My Contacts) fold into **one `/settings/profile` tree** to end the three-tree self-editing split.

### 1.4 Build: the console shell

| Item | Detail |
|---|---|
| **Single nav registry** | New `lib/operator/console.ts` — one typed registry of 7 workspaces → sub-tabs, each with `{ scope?, minRole, gate?, spaceTypes? }`. Deprecates `sections.ts`, `nav.ts`, the hardcoded settings cards, and the blueprint-tab overlap. One source of truth. |
| **Console shell component** | `components/operator/console-shell.tsx` — reuses the **Dashboard template** (PAGE-FRAMEWORK §3). Left: 7 workspaces. Top: Space switcher + scope badge. Body: workspace sub-tabs + content. |
| **Scope switcher** | `components/operator/space-switcher.tsx` — lists spaces the viewer operates (`space_members` + root if `web_role`); persists last scope. |
| **Gating resolver** | `lib/operator/visible.ts` — `visibleWorkspaces(viewer, space)` folds role × `featureAllowed` × blueprint. Pure + unit-tested; FAIL-SAFE (hide on doubt). |
| **Progressive disclosure** | Each workspace lands on a lean overview with ≤6 primary actions; secondary settings behind "Advanced" disclosure, not inline cards. Kills the 10–16-card walls. |

**Migration approach (non-breaking):** keep existing routes as thin redirects into the new console
tabs during transition; move logic behind the workspace components; delete orphan pages last. No
data migration (pure IA/routing).

---

## PART 2 — Feature build-out by domain

Each domain: **Strategy → Offering → Front end → Back end → Admin (console home) → Wiring → Phase.**
Feature current-state per [BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md) §3.

### 2.1 Profile & Site (SEO/AIO engine)

- **Strategy:** The profile is the day-one growth engine (borrows root authority; compounds as they
  build out). Own the whitespace: a public, claimable, ranking business profile.
- **Offering:** Free networked profile → build-out (subdomain) → Brand (own domain, connected) →
  Independent (decoupled).
- **Front end:** Public profile ✅ ([app/(main)/spaces/[slug]/page.tsx](../app/(main)/spaces/[slug]/page.tsx));
  add 🔴 **programmatic hubs** `/discover/spaces/[type]` + `/discover/spaces/in/[city]`
  (hub-and-spoke, `noindex` below N spaces); add 🔴 **completeness meter** on the operator Home;
  Puck block editor for pages ✅.
- **Back end:** ✅ metadata/OG/sitemap/robots; 🟡 **enrich `spaceSchema()`**
  ([lib/jsonld.ts:330](../lib/jsonld.ts)) with `address`/`geo`/`openingHours`/`priceRange`/`sameAs`/
  `aggregateRating`; ⚙️ **activate custom-domain routing** ([lib/spaces/store.ts:200](../lib/spaces/store.ts));
  🔴 **cross-network SEO linking** for Brand (canonical + directory backlink both ways).
- **Admin (console → Profile & Site):** brand, visibility, theme, pages/layout, domain + verification,
  SEO/schema fields, completeness.
- **Wiring:** schema fields feed JSON-LD + hubs; domain gated by `space_custom_domain`; reviews
  (2.4) feed `aggregateRating`.
- **Schema deltas:** `spaces.address_json`, `geo`, `hours_json`, `price_range`, `social_links`,
  `domain_verified_at`, `domain_status`.
- **Phase:** P1 (schema + hubs + domain activate), P6 (Independent decouple + per-space email domain).

### 2.2 People (CRM + members + segments)

- **Strategy:** CRM is at/above parity; the free My Contacts → Space CRM **graduation** is the
  stickiest funnel. Unify the four scattered people surfaces into one.
- **Offering:** Free My Contacts → CRM (Grow+) → automation/segments/team (Build+) → Resonance AI
  (Org+).
- **Front end:** One **People** workspace — filterable roster (Members / Team / Contacts / Leads via
  scope toggle), pipeline board, contact detail, segments. Ends the `settings/members` +
  `/admin/members` + `settings/crm` + `/admin/crm` split.
- **Back end:** ✅ `contacts`/`crm_deals`/`crm_stages`, graduation
  ([CRM-STRATEGY.md](CRM-STRATEGY.md)); add per-type stage templates; add at-risk signal (2.8).
- **Admin (console → People):** roster, pipeline config, segments, notes, verification, import.
- **Wiring:** graduation instrumented as a conversion event; at-risk flag → pipeline + win-back.
- **Schema deltas:** none core; `space_contact_risk` (2.8).
- **Phase:** P0 (unify surfaces in console), ongoing polish.

### 2.3 Marketing (email + automation + QR + analytics)

- **Strategy:** Close the biggest back-office gap (space-scoped automation) vs GoHighLevel/Dubsado;
  unify the duplicated email/QR tooling.
- **Offering:** manual campaigns (Build+) → scheduled sends → drip/trigger sequences → funnels.
- **Front end:** One **Marketing** workspace — a single campaign composer (scope-aware), sequence
  builder, QR studio, funnels, referrals, analytics. Ends `settings/email` + `/admin/marketing` and
  `settings/qr` + `/admin/qr` duplication.
- **Back end:** 🟡 per-space campaigns compose+send ([lib/spaces/campaigns.ts](../lib/spaces/campaigns.ts));
  🔴 **scheduler** (fire `status='scheduled'` where `scheduled_for<=now()`); 🔴 **space-scoped
  automation** (port root `automation_rules` to `space_id` scope); 🔴 **drip sequences**.
- **Admin (console → Marketing):** composer, sequences, QR, funnels, referrals, analytics.
- **Wiring:** sequences consume send backbone ([lib/spaces/email.ts](../lib/spaces/email.ts)); gated
  `space_email`/`space_automation`.
- **Schema deltas:** `space_automation_rules`, `space_sequences`, `space_sequence_steps`,
  `space_sequence_enrollments`.
- **Phase:** P4.

### 2.4 Offerings & Commerce (+ reviews)

- **Strategy:** Per-type offerings are the value; commerce is where take-rate/plan economics live.
  Reviews are ~20% of local rank **and** a top conversion driver — the missing trust asset.
- **Offering:** bookings (Practitioner), memberships (Business), donations (Org), enroll (Coaching),
  tickets/check-in (Event Space), storefront (all, take-rate on Free).
- **Front end:** One **Offerings & Commerce** workspace consolidating the six type-specific settings
  routes into type-gated tabs; **reviews UI** on the public profile (display + verified-interaction
  submission + owner reply).
- **Back end:** ✅ bookings/memberships/tickets/events; 🔴 **reviews model + moderation**; take-rate
  becomes plan-driven (2.6).
- **Admin (console → Offerings & Commerce):** offering setup per type, memberships/tiers, payments/
  payouts, reviews moderation.
- **Wiring:** reviews → `aggregateRating` in `spaceSchema()` (2.1); commerce → take-rate (2.6) →
  ledger.
- **Schema deltas:** `space_reviews`, `space_review_replies`.
- **Phase:** P3 (reviews), commerce ongoing.

### 2.5 Community & Content

- **Strategy:** The network's shared spine (circles, events, practices, gamification) — mostly
  root-scoped, but tenant spaces run circles/events/team. Fold into the console, gated by type/role.
- **Front end:** **Community & Content** workspace — circles, channels, events, programs library,
  gamification, moderation (root); tenant sees circles/events/team subset.
- **Back end:** ✅ largely built (existing admin domains).
- **Admin (console → Community & Content):** as above, progressive disclosure.
- **Phase:** P0 (fold into console), otherwise reuse existing.

### 2.6 Pricing & Billing (connection model)

- **Strategy/Offering:** the locked ladder (STRATEGY §2). Flat paid, take-rate on Free only, the new
  **Brand** tier.
- **Front end:** plan picker + white-label lead ✅ ([PRICING.md](PRICING.md)); add **Brand** tier
  card + connected-domain value framing; Independent loss-framed.
- **Back end:** add `brand` to `SPACE_PLANS` ([lib/pricing/plans.ts](../lib/pricing/plans.ts)) +
  `space_custom_domain` gate; **zero paid take-rates**, make take-rate plan-driven (5% free → 0%
  paid) across **all** commerce in `spaceTakeRateCents` ([lib/billing/fees.ts](../lib/billing/fees.ts));
  add `brand` Stripe products.
- **Admin (console → Settings → Plan & billing):** unchanged `/admin/pricing` operator config,
  reachable in-console.
- **Wiring:** all OFF-preserving via `featureAllowed`/`billingLive()`; compliance gate before live.
- **Schema deltas:** none structural; `brand` price keys.
- **Phase:** P2.

### 2.7 AI (Vera metering + Resonance)

- **Strategy:** Meter AI as **platform fee + credits** (2025–26 default) to protect margin; don't
  bundle unlimited AI.
- **Offering:** monthly credit grant per plan; overage buys credits; graceful degrade to
  deterministic concierge at zero (pattern exists).
- **Front end:** credit balance in console Home + Settings; Vera config.
- **Back end:** 🟡 daily cap ([lib/ai/vera/usage-gate.ts](../lib/ai/vera/usage-gate.ts)) + global
  ceiling ([lib/ai/budget.ts](../lib/ai/budget.ts)); add **credit ledger**.
- **Admin (console → Settings → AI):** Vera config, credit grants, controls.
- **Schema deltas:** `ai_credit_grants`, `ai_credit_ledger`.
- **Phase:** P5.

### 2.8 Retention intelligence (churn/at-risk)

- **Strategy:** SMB NRR is structurally weak (~97%); at-risk detection is the defense.
- **Front end:** at-risk surfaced on console Home + People pipeline; retention dashboard (cohorts,
  churn, LTV, no-show).
- **Back end:** signal collection (attendance cadence, `last_contacted_at`, payment status,
  engagement decay) → scoring RPC (rules first, ML later).
- **Admin (console → Home / People):** at-risk list + win-back trigger.
- **Wiring:** flag → People pipeline (2.2) + Marketing win-back sequence (2.3).
- **Schema deltas:** `space_contact_risk` (or materialized view).
- **Phase:** P5.

---

## PART 3 — Phased production roadmap

| Phase | Name | Scope | Exit criteria |
|---|---|---|---|
| **P0** ⭐ | **Operator Console** | Console shell + 7 workspaces + scope switcher + single nav registry; fold existing surfaces in behind redirects; unify People + Marketing duplicates | One console renders for root **and** a tenant space; no duplicated email/QR/CRM/members surfaces; nav from one registry; old routes redirect |
| **P1** ⭐ | **SEO/AIO engine** | Enrich `spaceSchema`; programmatic `/discover/spaces/*` hubs; activate custom-domain routing + Brand cross-linking; completeness meter | Space profiles emit full `LocalBusiness` schema; hubs indexed above threshold; a verified custom domain serves a connected Space |
| **P2** | **Connection pricing** | `brand` plan + `space_custom_domain` gate; zero paid take-rate + plan-driven Free take-rate across all commerce; Brand Stripe products; compliance review | Ladder live behind `billing_live` (still OFF-safe); Brand purchasable; Free commerce takes 5%, paid 0%; counsel sign-off logged |
| **P3** | **Trust** | Reviews model + UI + moderation + `aggregateRating`; profile completeness loop | Reviews render on profiles and in schema; verified-interaction gating live |
| **P4** | **Automation depth** | Scheduled sends; space-scoped automation rules; drip sequences | A studio can schedule a campaign and run a win-back drip end-to-end |
| **P5** | **Intelligence + margin** | AI credit ledger + metering; churn/at-risk scoring + dashboard | Vera/Resonance debit credits; at-risk list drives a win-back sequence |
| **P6** | **Independent / white-label** | Full decouple path; per-space email domain (DKIM/SPF/DMARC); branding removal polish | An Independent Space serves fully decoupled with its own sender domain |

**Billing stays OFF** through P0–P6 until the P2 compliance gate is cleared and an operator flips
`billing_live` — every gate is grant-all while OFF ([PRICING.md](PRICING.md) §"How OFF preserves").

---

## PART 4 — Data model / migration summary

| Migration (proposed) | Adds | Phase |
|---|---|---|
| `…_space_profile_seo.sql` | `spaces.address_json`, `geo`, `hours_json`, `price_range`, `social_links` | P1 |
| `…_space_custom_domain.sql` | `spaces.domain_verified_at`, `domain_status` | P1 |
| `…_pricing_brand_tier.sql` | `brand` plan entitlements + `space_custom_domain` gate seed | P2 |
| `…_space_reviews.sql` | `space_reviews`, `space_review_replies` (+ RLS) | P3 |
| `…_space_automation.sql` | `space_automation_rules`, `space_sequences`, `space_sequence_steps`, `space_sequence_enrollments` (+ RLS) | P4 |
| `…_ai_credits.sql` | `ai_credit_grants`, `ai_credit_ledger` (+ RLS) | P5 |
| `…_space_contact_risk.sql` | `space_contact_risk` or matview | P5 |

All space-scoped tables carry `space_id` + per-Space RLS (the existing tenancy contract,
[SPACES.md](SPACES.md)). Regenerate `lib/database.types.ts` after each.

---

## PART 5 — Cross-cutting

- **Gating:** every new surface routes through `featureAllowed` (OFF-preserving) + `space_members`
  role + blueprint type. No feature is a code branch; gates are data ([PRICING.md](PRICING.md)).
- **RLS:** every space-scoped table gets a per-Space policy + a contract test (the existing pattern).
- **Templates:** every console surface composes a kit template (Dashboard/Detail/Index/Focus per
  PAGE-FRAMEWORK); no hand-rolled layouts; no hardcoded hex/`text-[11px]`.
- **Testing:** pure resolvers unit-tested (`visibleWorkspaces`, take-rate, credit math, at-risk
  score); RLS contract tests; no live Stripe/AI calls in `pnpm test`/`build`.
- **Copy:** all customer-facing strings (tier names, profile CTAs, review prompts, Vera output) pass
  [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md). No em dashes in brand copy.
- **Compliance (before `billing_live`):** PCI, dunning, TCPA/CAN-SPAM, charitable solicitation,
  GDPR/CCPA, ESIGN (waivers), custom-domain TLS + email deliverability.

## PART 6 — Decisions to ratify (ADRs)

Connection-based pricing · take-rate only on Free · the `brand` plan · SEO-connected white-label ·
**the Operator Console single-nav consolidation** (new). See
[BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md) §7.

## References

[BUSINESS-ACCOUNTS-STRATEGY.md](BUSINESS-ACCOUNTS-STRATEGY.md) ·
[BUSINESS-ACCOUNTS-OVERVIEW.md](BUSINESS-ACCOUNTS-OVERVIEW.md) · [PRICING.md](PRICING.md) ·
[SPACES.md](SPACES.md) · [CRM-STRATEGY.md](CRM-STRATEGY.md) · [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) ·
current IA sources: `app/(main)/admin/sections.ts`, `lib/spaces/blueprints.ts`,
`app/(main)/spaces/[slug]/settings/page.tsx`, `lib/nav-areas.ts`.
