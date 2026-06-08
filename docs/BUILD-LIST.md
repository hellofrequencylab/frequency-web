# Master build list — Frequency web

> **The single, prioritized, execute-from list for the whole platform.** Consolidates every
> scattered roadmap (BACKLOG · ONBOARDING-BUILD-LIST · DEVELOPMENT-MAP · IA-RESTRUCTURE ·
> EDIT-PATH-AUDIT · STUDIO-REVIEW · LAUNCH · CHECKLIST) into one ranked list, after the
> 2026-06-08 five-domain code sweep + the owner's Roles & Permissions redesign.
> Legend: ✅ done · ⏳ partial / in flight · 📋 specced, not built · 🔴 blocked / gated.
> Spec detail still lives in the per-topic docs; this is the **order of operations**.

## The headline

The platform is **substantially built** — member surfaces, the practice engine + gamification,
the CRM/marketing suite, and the onboarding/Vera/AI stack are largely complete and wired. The
real work is two things: **(1) the role & permissions system** the owner just designed — *one
site for everyone, function-gated per role* — and **(2) the money layer** (entitlement + billing
+ partner suites). Everything else is targeted gap-fill and hardening.

## Priority ladder (the spine — work top to bottom)

| Rank | Track | Delivers | Size | Status |
|---|---|---|---|---|
| **P1** | **Permissions & Roles** | One site, function-gated per role (the matrix) | XL | ⏳ 1.1 done |
| **P2** | **Entitlement & Billing** | Free → Member → Supporter + Stripe; the ✋ gates go live | L | 🔴 billing stub |
| **P3** | **Partners** | Collaborator · Practitioner · Business · Organization + Hook | XL | 📋 |
| **P4** | **Platform completion** | The concrete stubs the sweep found | M | ⏳ |
| **P5** | **Member · Practice · Operator depth** | The feature-depth backlog | L | ⏳ |
| **P6** | **Onboarding / Vera / AI / Capture** | Finish the last-mile activation items | M | ⏳ |
| **P7** | **Navigation & IA** | Collapse sprawl into dashboards; data-driven nav | L | ⏳ |
| **P8** | **Infra · Data · Security · Hardening** | Migrations, RLS Phase 2, CI gates, scale ladder | L | ⏳ |
| **PM** | **Money verticals** (gated) | Collective · Affiliate · Donations · Lab Spaces | XL | 🔴 after PMF |

**Outpost is parked** (owner direction) — tracked in ROLES.md/§11.5 but not scheduled.

## Progress log

- **2026-06-08 ✅ P1.3 (rollout)** — centralized the scattered `['crew',…]` paid-proxy into `isPaidViewer()` across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes`. One matrix-backed source. PR #410.
- **2026-06-08 ✅ P1.3 (pilot)** — `lib/core/viewer-hats.ts` seam + Vault/Store wired to `surfaceAccess('vault')`. The unified-site pattern is established. PR #410.
- **2026-06-08 ✅ P1.2** — Scope re-validation on structure/event mutations + `assignRole` escalation closed (`app/(main)/admin/actions.ts`). PR #410.
- **2026-06-08 ✅ P1.1** — Access matrix encoded (`lib/core/access-matrix.ts`, 18 tests, tsc+eslint clean). PR #410.
- **2026-06-08 ✅ docs** — Master list, ROLES.md access matrix + unified-site principle, ADR-163.

---

## P1 — Permissions & Roles  (the headline)

> Spec: [ROLES.md](ROLES.md) (three systems + entitlement, the **access matrix**, the
> **unified-site principle**) + ADR-163 + [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11.
> Foundation already exists: `community_role` ladder, the staff capability matrix
> (`lib/core/staff-roles.ts`), the 32-area `NAV_AREAS` grid + janitor-editable `area_permissions`.
> The shift: **route-level gating → per-capability gating inside shared pages.**

| # | Item | Status | Notes |
|---|---|---|---|
| **1.1** | Encode the matrix as one source of truth | ✅ | `lib/core/access-matrix.ts` — `accessTo(surface, hats) → none/limited/full`. Done. |
| **1.2** | 🔴 **Security: re-validate scope on mutation** | ✅ | Structure/event mutations now re-resolve per-scope leadership (`requireScopedManage`); `assignRole` privilege-escalation closed (janitor/owner/staff-roles only). Done. |
| **1.3** | Unified-site refactor | ⏳ | ✅ Vault/Store + the scattered `['crew',…]` paid-proxy across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes` now route through the matrix (`isPaidViewer` / `surfaceAccess`). **Remaining:** open the member-facing ✋ surfaces per the sheet (Studio Overview, Personal CRM, QR Studio — a deliberate access change) + collapse `/admin/*` into in-page controls (IA-RESTRUCTURE §10). |
| **1.4** | Scoped stewardship (`stewardships` table) | 📋 | §11.1 — scoped (circle/hub/nexus) edges; derive + cache `community_level`; backfill from `community_role` + `circles.host_id`. |
| **1.5** | Admin axis formalization | 📋 | §11.3 — move `admin`/`janitor` into `team_members`; add the **missing staff-domain unlocks** (Support→`/admin/support`, Members roster, Vera); migrate the manual `/admin/support` guard to `requireAdmin`. |
| **1.6** | Unified capability resolver | 📋 | §11.6 — one resolver = union of Community edges ⊕ Entitlement ⊕ Partner personas ⊕ Admin matrix, with org-tenant isolation. Wraps `access-matrix` + `capabilities.ts`. |
| **1.7** | Per-function permission grid | 📋 | Extend `/admin/roles` from per-route to per-capability editing (owner-editable matrix). |
| **1.8** | Role-advancement training Journeys | ⏳ | §7 — assignment-on-promotion ✅; still need curriculum (7.3–7.5), help-article `role`/`featureKeys` tagging, authoring UI. |

## P2 — Entitlement & Billing

> The matrix's **✋ cells are the paid gate** (Vault · Studio Overview · Personal CRM · QR Studio).
> Billing was flagged a stub by **three** sweeps. Spec: §11.2 + DEVELOPMENT-MAP Stage C2/D2.

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Tier flag `free / member / supporter` | 📋 | Re-point `isCrew`, game cash-in eligibility, `/upgrade` to the tier; **Crew → pure stewardship**. |
| 2.2 | Stripe Connect / payments module | 📋 | `create_checkout` · `process_payout` · `record_commission` — shared rail for billing + all partner money (DEVELOPMENT-MAP C2). |
| 2.3 | Stripe membership checkout | 📋 | Replace the `/settings/billing` stub + `/upgrade` ($10 hardcoded → "Free") with a real flow. |
| 2.4 | Supporter badge | 📋 | Pay-more tier → flair/badge (reuse the badge system). |
| 2.5 | Wire the ✋ gates to the tier | 📋 | Vault · Studio Overview · Personal CRM · QR Studio read `accessTo()` + the tier. |
| 2.6 | Freemium Vault + season cash-in | 📋 | Game accrues to persistent Vault; unlock = gems + lifetime rank; season `zaps → gems` conversion (sweep gap); entitlement sources (own/comp/Lab rollup/staff grant), ADR-037. |
| 2.7 | Persona verification + Connect binding | 📋 | §11.4 — `profile_personas` state machine (claimed→verified→active→suspended) + per-persona Stripe account binding. |
| 2.8 | Module registry + inter-entity Lab bridge | 📋 | Verticals self-declare (ADR-033); audited for-profit↔Foundation transfers (ADR-038). |

## P3 — Partners (personas + Hook federation)

> Self-serve account personas, multi-select hats. Spec: §11.4 / §8 + [ROLES.md](ROLES.md) System 2.

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `profile_personas` + per-persona dashboards | 📋 | The persona axis; nav/capabilities light up per active persona. |
| 3.2 | Collaborator | 📋 | Featured Practices/Journeys directory + influencer/affiliate kickbacks + Earnings view. |
| 3.3 | Practitioner | 📋 | Paywalled Programs + client gamification + private Channel/Circles (Frequency-branded) + Connect. |
| 3.4 | Business | 📋 | Listing + network integration + loyalty + CRM + **website builder** (Studio › Website stub). |
| 3.5 | Organization + Hook federation | 🔴 | XL — white-label sub-communities; identity link + Hook membership rollover (§8.1); points rollup, idempotent+capped (§8.2); community federation / lead-funnel bubble (§8.3); isolated tenant admin (ADR-158). |

## P4 — Platform completion (concrete stubs from the sweep)

| # | Item | Where | Status |
|---|---|---|---|
| 4.1 | Programs library — "coming soon" | `app/(main)/programs` | 📋 STUB |
| 4.2 | Help-center articles — index/empty only | `app/(help)/help`, `content/help/*` | ⏳ |
| 4.3 | Outreach member-send — disabled | `app/(main)/outreach` | 📋 |
| 4.4 | Engagement physical sources (QR/NFC/geo/p2p) | `lib/engagement/events.ts` | 📋 |
| 4.5 | Push notifications (P1.4) — default-off, unshipped | `lib/notification-preferences.ts` | ⏳ |
| 4.6 | `/hubs` + `/nexuses` index pages | `app/(main)/hubs`, `/nexuses` | 📋 |
| 4.7 | Founder task-assignment model — `openTaskCount` always 0 | `lib/core/load-capabilities.ts:87` | 📋 |
| 4.8 | Library submission flow — review queue exists, no member submit | `app/(main)/library/review` | 📋 |
| 4.9 | Nurture composer + Automations rule editor (stubs) | `marketing/*` | 📋 |
| 4.10 | Analytics email metrics need Resend webhook; donor/partnership flow plumbing-only | `marketing/*`, `lib/attribution/channels.ts` | ⏳ |

## P5 — Member · Practice · Operator depth (the feature backlog)

**Member & Community** (BACKLOG §G/§H, STUDIO-REVIEW): Network hub unification (`/people`+`/connections`+`/marketing/contacts`) · directory filters (topic/location/role) · friend suggestions · circle-discovery map layer · circle lineage + "nearly full → seed a new circle" flywheel · multi-topic circles · hub/nexus-scoped events · two-way message inbox · richer profile header + privacy-safe public profile schema · (later) Postgres sync-engine pilot.

**Practice / Quest / Gamification** (BACKLOG §F): daily-streak achievement badges · stage-driven disclosure (apply `stageIndex` to dashboard/profile/rails) · `practice.verified` host/peer verification + device attestation/P2P mutual-confirm · realtime reward feedback via Broadcast · Programs content depth (>4 frameworks) + program-as-template "Add to Circle" · community-library moderation + promote-to-tracked Journey · seasonal-Journey authoring surface + content (link to season + Pillar).

**Operator: Growth Studio / CRM / Marketing** (ONBOARDING-BUILD-LIST §9, BACKLOG §I): visual entry-point/flyer designer (9.2) · live QR style preview (9.3) · unified link generator (9.4) · lead-flow customization UI (9.6) · A/B builder + scheduled publish (9.7) · segment builder + Kanban pipelines + React-Email templates · per-campaign/automation performance drill-down · live Claude Studio operator (gated on consent harness) · funnel/acquisition/cohort analytics.

## P6 — Onboarding / Vera / AI / Capture

> Detail + status in [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md).

- **§0 Pre-test enablement (config, not code):** `ANTHROPIC_API_KEY`, flip `ai_enabled`, build help index, run pending migrations, prod env, verify funnel.
- **§1.5 live-loop suggestion chips** ⏳ · **§2.1 welcome post** ✅(tweaks) · **§2.2 finish `draft_intro`** ⏳ · **§2.3 memory summarization cron** 📋 · **§2.4 warm demo content** 📋 · Vera matriarch/coach tweaks ⏳.
- **§6 Capture Phases 2–4** 📋 (richer kinds; Quest pipeline + sponsor rewards) · journal framing (3.1).
- **§3 Proactive Vera** 🔴 gated on the consent harness (ADR-028) · **AI core** governance kernel (router, RAG, caps, kill switch) 📋.

## P7 — Navigation & IA

> [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) §10. The unified-site refactor (P1.3) and this converge.

- 10.1 Quest tabbed dashboard ✅ · 10.6 widget-free rail ✅ · 10.2 Marketing→Growth ✅ — **remaining:** 10.2 operator dashboards (`/admin` suites → Community Studio/Insights/Platform) · 10.3 Network hub · 10.4 Practices+Library merge · 10.5 Settings hub · 10.7 `NAV_AREAS` rewrite → later **data-driven Site Navigation admin suite** (BACKLOG §J).
- Polish: soften newcomer breadcrumb · milestone wake-up gating map · reconcile "Interests" vs "Topics" · "tune in" verb decision.

## P8 — Infra · Data · Security · Hardening (BACKLOG §A/§B/§C/§D/§I/§O)

- **Migrations/data:** apply 2 pending migrations (`lock_economy_columns` critical + `perf_indexes`) · drop dormant `quest_*` tables · economy double-award + online-actions-pay-zaps bug fixes (apply migration + verify) · collapse the 4 zap-award paths into one atomic helper · resolve gem-farm / store-redeem TOCTOU / zap auto-promotion decisions.
- **Security:** RLS convergence Phase 2 (Tier 2+ aggregates + SECURITY DEFINER RPCs + policy tests, blocked on test harness) · strict CSP w/ nonces · rate-limit `check-handle`/`search-handles`/beta + webhook replay protection · admin audit log.
- **CI / quality:** gate `tsc`+`eslint` in CI · build the vitest consent harness (gates all agent autonomy) · Dependabot + CodeQL + secret scanning · resolve lint debt (~118 issues) · doc fixes (em-dash sweep, ADR range).
- **Comms infra:** notification router/registry + migrate email/push onto the outbox queue · deliverability hardening (SPF/DKIM/DMARC subdomain) · verify `frequencylocal.com` in Resend + OAuth redirect URLs · submit sitemap/robots.
- **Scale (Phase 4, when measured):** paginate People/Circles · `force-dynamic`→ISR on CMS pages · profile zap-sum via SQL · `<img>`→`next/image` · Supavisor/read-replicas/denormalized feed read-model/partitioning/Broadcast realtime.
- **Design system:** unify pill/button radius (shared `Button`/`Badge` primitive) site-wide.

## PM — Money verticals (gated on PMF + legal entity)

Designed, sequenced after Stage C2: **D1 The Collective** (contributor verification → paid offerings → payout) · **D3 Affiliate** (referral → commission → payout ledger) · **D4 Donations & Grants** (Foundation rail) · **D5 Lab Spaces** (gym SaaS + Lab membership + rollup) · **Money foundation** (entity partition + `financial_transactions` ledger, ADR-029/032).

---

## Source map — legacy lists folded in here

| Doc | Role now |
|---|---|
| [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) | **Detail track** for P1 (§11) + P6 + P7; still the spec for onboarding/Vera. |
| [BACKLOG.md](BACKLOG.md) | Source for P5/P8 items; keep for per-item depth (§A–§S). |
| [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) | Stage view of P2/P3/PM (entity/money/verticals). |
| [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) | Detail for P7. |
| EDIT-PATH-AUDIT · STUDIO-REVIEW | Folded into P4/P5 (Nurture/Automations, Studio KPIs). |
| BUILD-PHASES · CHECKLIST · LAUNCH · REDESIGN-STATUS | History / runbook / done — no open items (see harvest). |

*Living master list — re-rank as tracks land; update the Progress log on every ship.*
