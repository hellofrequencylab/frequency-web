# Master build list — Frequency web

> **The single, prioritized, execute-from list for the whole platform.** Written after a
> full-codebase sweep (2026-06-08, five-domain audit) + the owner's Roles & Permissions
> redesign. Lead with the headline; detail lives in the linked specs.
> Legend: ✅ done · ⏳ partial / in flight · 📋 specced, not built · 🔴 blocked.
> Detail tracks: roles → [ROLES.md](ROLES.md) + [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11;
> onboarding/Vera/growth/nav → [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md); decisions → [DECISIONS.md](DECISIONS.md).

## The headline

The platform is **substantially built**. The 2026-06-08 sweep found member surfaces (feed,
circles, channels, events, marketplace, people, messages, friends, search), the practice
engine + gamification (zaps/gems/streaks/achievements/store/leaderboard), the CRM/marketing
suite, and the onboarding/Vera/AI stack all **largely complete and wired**. The real work is
two things: **(1) the role & permissions system** the owner just designed — *one site for
everyone, function-gated per role* — and **(2) the money layer** (entitlement + billing +
partner suites) that three separate sweeps independently flagged as the biggest stub. Almost
everything else is targeted gap-fill.

## Priority ladder (read this first)

| Rank | Track | What it delivers | Size | Status |
|---|---|---|---|---|
| **P1** | **Permissions & Roles** | One site, function-gated per role (the matrix) | XL | ⏳ foundation exists |
| **P2** | **Entitlement & Billing** | Free → Member → Supporter + Stripe; the ✋ gates go live | L | 🔴 billing is a stub |
| **P3** | **Partners** | Collaborator · Practitioner · Business · Organization suites | XL | 📋 designed |
| **P4** | **Platform completion** | Fill the concrete stubs the sweep found | M | ⏳ |
| **P5** | **Onboarding / Vera / Growth / Nav** | Finish the last-mile items already in flight | M | ⏳ |
| **P6** | **Polish & hardening** | Security re-validation, doc hygiene, AI-live config | S–M | ⏳ |

**Outpost is parked** (owner direction) — not in any track below.

---

## P1 — Permissions & Roles  (the headline)

> Spec: [ROLES.md](ROLES.md) (three systems + entitlement, the **access matrix**, the
> **unified-site principle**) + ADR-163 + [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11.
> Today's foundation already exists and is good: `community_role` ladder (`lib/core/roles.ts`),
> a staff capability matrix (`lib/core/staff-roles.ts`), a 32-area `NAV_AREAS` grid
> (`lib/nav-areas.ts`) and a janitor-editable override table (`area_permissions`, grid at
> `/admin/roles`). **The shift: route-level gating → per-function (capability) gating inside
> shared pages.**

| # | Item | Notes |
|---|---|---|
| **1.1** | **Encode the matrix as one source of truth** | A typed `capability(surface, hats) → none/limited/full` map in `lib/core` that *is* the owner's sheet; extends `NAV_AREAS`. Pure lib + tests, additive, breaks nothing. **← recommended first PR.** |
| **1.2** | **Unified-site refactor** | Pages read the level from the resolver and **reveal functions** (not separate routes). Collapse the `/admin/*` world into in-page controls per [ROLES.md](ROLES.md) principle + IA-RESTRUCTURE §10. |
| **1.3** | **Scoped stewardship** | `stewardships` table; derive `community_level`; backfill (§11.1). |
| **1.4** | **Admin axis** | Move `admin`/`janitor` into the `team_members` matrix (§11.3); add the **missing staff-domain unlocks** the sweep found (Support → `/admin/support`, Members roster, Vera) ; migrate the manual `/admin/support` guard to `requireAdmin`. |
| **1.5** | **🔴 Security: re-validate scope on mutation** | Sweep gap — admin server actions (`/admin/circles`, `/admin/events`) don't re-auth scope on write; a Guide could mutate a circle outside their hub by ID. **Do this early — it's a live hole.** |
| **1.6** | **Per-function permission grid** | Extend `/admin/roles` from per-route to per-capability editing (the matrix, owner-editable). |

## P2 — Entitlement & Billing

> The matrix's **✋ cells are the paid gate** (Vault · Studio Overview · Personal CRM · QR
> Studio). Billing was flagged a stub by **three** sweeps. Spec: §11.2.

| # | Item | Notes |
|---|---|---|
| 2.1 | **Tier flag** `free / member / supporter` | Re-point `isCrew`, game cash-in eligibility, `/upgrade` to the tier; **Crew → pure stewardship**. |
| 2.2 | **Stripe membership** | Real checkout; replace the `/settings/billing` stub + `/upgrade` ($10 hardcoded → "Free" today) with a payment flow. |
| 2.3 | **Supporter badge** | Pay-more tier → flair/badge (reuse the badge system). |
| 2.4 | **Wire the ✋ gates** | Vault · Studio Overview · Personal CRM · QR Studio read the tier. |
| 2.5 | **Season `zaps → gems` conversion** | Sweep gap — no season-end conversion job in the repo. |

## P3 — Partners

> Self-serve account personas, multi-select hats. Spec: §11.4 + [ROLES.md](ROLES.md) System 2.

| # | Item | Notes |
|---|---|---|
| 3.1 | **`profile_personas` + per-persona dashboards** | Verification states; Stripe Connect where money moves. |
| 3.2 | **Business suite** (Biz/Org) | CRM Pipeline ✅ (built) + **Website builder** (stub — Studio › Website) + Growth Studio. |
| 3.3 | **Practitioner programs** | Paywalled Programs + client gamification + private Channel/Circles + Stripe Connect. |
| 3.4 | **Collaborator** | Featured Practices/Journeys directory + influencer/affiliate kickbacks + the Earnings view. |
| 3.5 | **Organization → Hook tenant** | Federated white-label sub-community + **isolated** admin matrix (ADR-158; §8 / §11.4). XL. |

## P4 — Platform completion (concrete stubs from the sweep)

| # | Item | Where | Sev |
|---|---|---|---|
| 4.1 | **Programs library** — "coming soon" | `app/(main)/programs/page.tsx` | STUB |
| 4.2 | **Help-center articles** — index/empty only | `app/(help)/help`, `content/help/*` | PARTIAL |
| 4.3 | **Outreach member-send** — disabled | `app/(main)/outreach/page.tsx` | PARTIAL |
| 4.4 | **Engagement physical sources** (QR/NFC/geo/p2p) | `lib/engagement/events.ts` | PARTIAL |
| 4.5 | **Push notifications** (P1.4) — default-off, unshipped | `lib/notification-preferences.ts` | PARTIAL |
| 4.6 | **`/hubs` + `/nexuses` index pages** — only `[slug]` exists | `app/(main)/hubs`, `/nexuses` | PARTIAL |
| 4.7 | **Founder task-assignment model** — `openTaskCount` always 0 | `lib/core/load-capabilities.ts:87` | PARTIAL |
| 4.8 | **Library submission flow** — review queue exists, no member submit | `app/(main)/library/review` | PARTIAL |
| 4.9 | **Automations** — email-only actions; **Analytics** needs Resend webhook; **donor/partnership** flow plumbing-only | `marketing/*`, `lib/attribution/channels.ts` | PARTIAL |

## P5 — Onboarding / Vera / Growth / Nav

> Already in flight — full detail + status in [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md).
> Open items: §0 pre-test enablement (config), §1.5 live-loop chips, §2.1 welcome post,
> §2.2 `draft_intro`, §2.3 memory cron, §2.4 demo warm-up, §5.1 Network hub merge,
> §6 Capture later phases, §9.2–9.7 growth editors, §10.2–10.5 operator dashboards.

## P6 — Polish & hardening

- AI goes live once `ANTHROPIC_API_KEY` + `ai_enabled` are set — then the Marketing **Agent** /
  **Market-read** deterministic fallbacks (`lib/studio/agent.ts`, `lib/marketing/market-read.ts`)
  swap to the live Claude operator. Config, not code (§0).
- Doc hygiene; scope-re-validation audit beyond P1.5; lint/test gates stay green.

---

*Living master list — re-rank as tracks land. The sweep that seeded it: 2026-06-08, five
read-only audits across member · practice+quest+billing · operator/CRM · admin+roles ·
onboarding/AI/infra.*
