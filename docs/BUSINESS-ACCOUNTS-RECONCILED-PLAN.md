# Business Accounts — Reconciled Plan (current source of truth)

> **Status:** ✅ Reconciled to `origin/main` on 2026-07-06. This supersedes the historical planning
> docs ([BUSINESS-ACCOUNTS-STRATEGY](BUSINESS-ACCOUNTS-STRATEGY.md),
> [PRODUCTION-PLAN](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md), [OVERVIEW](BUSINESS-ACCOUNTS-OVERVIEW.md),
> [OPERATOR-CONSOLE](OPERATOR-CONSOLE.md)), which describe an earlier vision that was **already
> overtaken by shipped work**. Read this doc for what is true today and what remains.

## What happened (so it never happens again)

An earlier thread surveyed and planned the business-account build against a **stale local checkout**
(local `main` ~#1289; `origin/main` was already ~#1573). In the meantime — **in other Claude Code
sessions, July 5–6** — the same repo had already shipped a big simplification:

- **ADR-542** page-editor rebuild · **ADR-543→553** modular console + locked `MENU-CONTRACT`
- **ADR-552** business-model collapse: space **plans and types** collapsed to `free / business /
  nonprofit`; white-label became a capability (`whitelabel` entitlement), not a plan; **AI Engine
  usage-caps** replace any credit/seat idea.

So the planned P0 Operator Console and P2 connection-pricing/`brand` tier **duplicated work that was
already merged, in a simpler form**. They were parked (not force-merged over the shipped model). The
only net-new thing that shipped from that thread was the **P1 SEO enrichment** (#1578).

**Lesson (now enforced):** `git fetch origin main` and reconcile before any survey/plan/build.

## Reconciliation: master-plan area vs. `main` today

Legend: ✅ complete · 🟡 partial · ⚫ dropped by the collapse · 🅿️ parked (ours, superseded)

| Area (old plan) | On `main` today | Who shipped it | Our parked work |
|---|---|---|---|
| **Operator Console** (P0) | ✅ Unified modular console + locked contract (ADR-543→553): `spaces/[slug]/manage/console.tsx`, `lib/admin/modules/*`, `MENU-CONTRACT.md` | prior sessions | 🅿️ `lib/operator/*` (superseded) |
| **Pricing** (P2) | ✅ Collapsed `free/business/nonprofit`; usage-caps paywall (ADR-552): `lib/pricing/*`, `lib/spaces/ai-usage.ts` | prior sessions | 🅿️ `brand` tier + connection take-rate (superseded) |
| **CRM** (D) | ✅ Pipeline/deals/stages, cockpit lifecycle funnel, contacts + consent (ADR-381): `lib/crm/*`, `lib/spaces/crm-funnel.ts` | prior sessions | — |
| **Reviews** (F) | ✅ `space_reviews` + moderation + `aggregateRating`-ready + profile blocks | prior sessions | — |
| **AI depth** (G) | ✅ Vera + Resonance engine + outcome usage metering (no credit ledger) | prior sessions | 🅿️ AI-credits idea (dropped; usage-caps won) |
| **Custom domain** (C) | ✅ `getSpaceByDomain`/`resolveSpaceForHost` live; white-label = entitlement | prior sessions | — |
| **SEO/AIO** (A) | 🟡 schema (`@id` + LocalBusiness fields) + `/discover/spaces/[type]` hubs + sitemap | **this thread (#1578)** | — |
| **Automation** (E) | 🟡 per-space campaigns sendable + `scheduled_for` + `nurture_sequences` table + `crm.space.automation` gate — **but no rule-builder UI, no drip editor, no send job** | prior sessions | — |
| **Churn/at-risk** (H) | 🟡 practice-streak `atRisk` + winback playbooks — **but no per-space *contact* at-risk score/flag** | prior sessions | — |
| **White-label** (P6) | ⚫ Dropped (no tier; branding is an entitlement) | — | 🅿️ (moot) |

## Where we actually are: **~85% complete**

Eight of nine capability areas are complete on `main`. What remains is one thin **finish slice**:

### The remaining ~15% (the completion list)

| # | Item | What exists | What's missing (the work) | Risk |
|---|---|---|---|---|
| **R1** | **SEO: wire the rating** | `space_reviews` + `aggregateRating` field in `spaceSchema` | Confirm/complete the profile page (`app/(main)/spaces/[slug]/(profile)/layout.tsx`) passing the space's average rating + count into `spaceSchema` | 🟢 tiny, additive |
| **R2** | **SEO: space city hubs** | event/place city hubs exist | `/discover/spaces/in/[city]` (only if Spaces carry a city; else skip) + sitemap | 🟢 additive |
| **R3** | **SEO: completeness meter** | profile fields exist | Operator-facing "what's missing for search" meter on the manage console | 🟢 additive UI |
| **R4** | **Automation: send job** | `campaigns.scheduled_for` | The scheduler that fires due scheduled campaigns (cron/route) + idempotency | 🟡 needs cron infra |
| **R5** | **Automation: rule + drip UI** | `crm.space.automation` gate + `nurture_sequences` table | Operator rule-builder + drip-sequence editor, mounted as a console module | 🟡 UI + integration with the module contract |
| **R6** | **Churn: contact at-risk** | streak `atRisk`, winback playbooks | Per-space contact at-risk **score + flag** (migration + scoring RPC/matview) surfaced in the CRM cockpit + a win-back trigger | 🟠 net-new + migration |

**Sequence:** R1→R3 (SEO finish, safe/additive) → R4 (send job) → R5 (automation UI) → R6 (churn,
migration-bearing, most care). Everything mounts into the **existing** console module contract and
CRM cockpit — we extend, never rebuild.

## Rules of engagement going forward
- Reconcile to `origin/main` before any build.
- Extend the shipped systems (module manifest, CRM cockpit, usage-caps) — do not reintroduce the
  parked `brand`/connection model or the `lib/operator` console.
- Every change: full `tsc` + `lint` + `test` + `check:authz` green before merge; migrations get RLS +
  a contract test.

## References
- Historical vision (superseded, kept for context): [STRATEGY](BUSINESS-ACCOUNTS-STRATEGY.md) ·
  [PRODUCTION-PLAN](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md) · [OVERVIEW](BUSINESS-ACCOUNTS-OVERVIEW.md) ·
  [OPERATOR-CONSOLE](OPERATOR-CONSOLE.md)
- Live systems: `MENU-CONTRACT.md`, `PRICING.md`, `lib/spaces/ai-usage.ts`, `lib/crm/*`
