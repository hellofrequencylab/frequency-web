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

- **2026-06-08 ✅ Admin in the framework + view-as for Host+** — `AdminPage` promoted to a first-class `AdminTemplate` (composes the shared `PageHeading`); all 20 admin pages adopt it unchanged. The "view as a role under you" selector, previously janitor-only, now works for **every steward Host and above** (downgrade-only, scoped to roles beneath them) — `lib/view-as.ts` `canViewAs` + the control/action. (Owner directive: no separate "admin mode" — admin functions inline + role view.)
- **2026-06-08 ✅ PB (framework dialed)** — PB.1 access control unified (one `isPaid(tier)` predicate; beta-grant regression fixed). PB.2 page framework: genuine primitive-cobbling fixed (`StatInline` dedup; `/support`+`/growth` recomposed; `/crew`+`/broadcast` headers → `PageHeading`); the rest already compose the kit or are sanctioned-rich detail headers (PB.2d). Tails tracked: PB.1i (`isEndorsed`→tier via feed RPCs), PB.1f/g/h, remaining `Stat` variants.
- **2026-06-08 ✅ model correction + audits** — Crew = the paid membership tier (migration `20260608050000`, values `free|crew|supporter`); ROLES.md vision rewritten. Two best-practice audits (access-control · page-framework) folded into track **PB** — no security holes, no `text-[Npx]`; main work = unify "is paid" to the tier + re-compose ~26 hand-rolled pages.
- **2026-06-08 ✅ P2 (decouple, §11.2)** — paid is now the **tier only** (removed the role≥crew proxy from `columnsForHats`); stewards (host+) get full on steward surfaces via their role, not payment; `/upgrade` sets `membership_tier` (Crew = pure stewardship). Backfill means no current user loses access. *Follow-up policy: auto-comp leaders' membership on promotion?* PR #411.
- **2026-06-08 ✅ P2.1 (live)** — `membership_tier` migration **applied** to the DB (backfilled: 10 paid / 1 free); read path flipped from the crew proxy to the real column (`lib/auth.ts` → `getViewerHats` → `deriveTier`). The entitlement is now real.
- **2026-06-08 ⏳ P2.1 (foundation)** — `deriveTier` + `lib/core/entitlement.ts`; `getViewerHats` sets `tier`; migration `20260608040000_membership_tier.sql` authored (⚠️ apply pending). Behavior-preserving. PR #410.
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
| 2.1 | Tier flag `free / member / supporter` | ✅ | Migration applied (backfilled); `profiles.membership_tier` threaded `getCallerProfile → getViewerHats → deriveTier` — the ✋→✅ gate is now driven by the **real entitlement column**. Remaining for P2: re-point `/upgrade` to set the tier; Crew → pure stewardship; cash-in eligibility. |
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

## P4 — Platform completion (verified 2026-06-08)

> **Verification pass corrected the sweep:** several "stubs" were false positives — the
> sweep pattern-matched an `EmptyState`/`coming soon` *fallback branch* in code, but the
> feature is actually built/populated. Real, code-completable gaps are few.

| # | Item | Status |
|---|---|---|
| 4.1 | **Programs library** — ✅ **already built**: 4 frameworks live in `content/programs/`, page renders them (the "coming soon" is the empty-state fallback). Sweep false positive. | ✅ done |
| 4.3 | **Outreach member-send** — ✅ **completed**: `sendOutreach` fans a steward's direct note to the members of the scope(s) they lead, via the email+push spine. | ✅ done |
| 4.2 | Help-center articles — content exists for the major categories; expand coverage (content authoring). | ⏳ content |
| 4.9 | Nurture/Automations — per the operator audit these are **wired** (Nurture complete; Automations email-only). Add SMS/push actions + segment builder. | ⏳ |
| 4.8 | Library submission flow — review queue exists; add a member "propose to library" path. | 📋 |
| 4.7 | Founder task-assignment model — `openTaskCount` always 0 pending the `crew_tasks` assignment model. | 📋 needs model |
| 4.6 | `/hubs` + `/nexuses` index pages — **won't build**: the approved IA keeps Hubs/Nexuses **contextual** (reached via circle drill-down). Not a gap. | ✅ by design |
| 4.4 | Engagement physical sources (QR/NFC/geo/p2p) | 🔴 needs device/verification infra |
| 4.5 | Push notifications — needs **VAPID keys** + delivery config | 🔴 owner keys |
| 4.10 | Email metrics need the **Resend webhook** configured; donor flow needs design | 🔴 owner config |

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

## PB — Best-practice cleanup & hardening (2026-06-08 audits)

> Two read-only audits (access-control architecture · page-framework consistency). Verdict:
> **the architecture is well-layered and there are no security holes** — the gaps are *semantic
> drift* (gating computed two ways) and *incomplete framework adoption* (cobbled pages).

### PB.1 — Unify access control (one capability layer)

The permission stack (matrix → per-scope resolver → staff matrix → nav grid) is sound; the issue
is **"is paid / is steward" computed in divergent ways**. Now that Crew = the paid tier (decoupled
from role), the role-based proxies are wrong and must move to the tier.

| # | Item | Where | Status |
|---|---|---|---|
| PB.1a | Drop the role≥crew fallback in `deriveTier` | `lib/core/entitlement.ts` | ✅ done |
| PB.1b | **Unify "is paid" → the tier** — `isPaid(tier)` is now the single predicate; gamification gates moved off `atLeastRole(role,'crew')` (capabilities task · zaps rate · entry-points · codes). Also fixed a regression: beta-grant now comps the Crew **tier**. | `capabilities.ts`, `zaps.ts`, `entry-points`/`codes` actions, `beta/actions.ts` | ✅ done |
| PB.1c | Thread the tier into the per-scope resolver (`Viewer.tier`, fed by `load-capabilities`) | `load-capabilities.ts`, `capabilities.ts` | ✅ done |
| PB.1d | `requireCrew()` — name is now correct (Crew = the paid tier); body checks `isPaid(tier)` | entry-points/codes | ✅ done |
| PB.1e | Page-level `requireAdmin('janitor')` on `/admin/roles` (defense in depth for `assignRole`) | `/admin/roles` | ✅ already in place |
| PB.1i | **`isEndorsed` display → tier** + retire the `community_role='crew'` value (migrate rows; drop the beta role-write) — needs `membership_tier` threaded through the feed author RPCs + profile/circle selects (`layout` training gate already moved to host+) | `season-ranks.ts` + feed/profile types | 📋 **remaining** |
| PB.1f | Thread `profile_personas` through `getViewerHats` (unblocks P3 matrix columns) | `lib/core/viewer-hats.ts:37` | 📋 (with P3) |
| PB.1g | Capability **reason** metadata ("upgrade to unlock" vs "host a circle to unlock") | resolver | 📋 nice-to-have |
| PB.1h | Bring janitor-only admin surfaces (Vera/AI) under the matrix | `access-matrix.ts` | 📋 |

### PB.2 — Page-framework re-composition (same framework on every page)

**54% template adoption** (62/115 pages) — the rest hand-roll headers/layouts. Target 75%+.

| # | Item | Status |
|---|---|---|
| PB.2a | Dedup the `Stat` components. ✅ The identical *de-boxed* stat in `/circles` + `/channels` → shared `StatInline`. Remaining: `practices/[id]` (bordered+icon), `admin/qr/analytics` (has `delta`/`detail`/`link`), `admin/qr/stats` are distinct visuals — fold into `StatCard`/`StatInline` variants. | ⏳ |
| PB.2b | Quick wins → kit. ✅ `/support` + `/growth` recomposed (IndexTemplate + EmptyState). `/crew/quests` + `/crew/store/ledger` were **already** composing PageHeading + StatCard + EmptyState. | ✅ |
| PB.2c | Crew section + broadcast headers → shared `PageHeading`. ✅ `/crew` + `/broadcast` (the two raw-`<h1>` offenders). achievements · challenges · journey · streaks **already** compose PageHeading/IndexTemplate — verified. | ✅ |
| PB.2d | `/crew/store`, `/people/[handle]`, `/journeys/[slug]` — assessed: these have **intentionally rich detail headers** (Vault aside-card · avatar/rank identity · accent emoji-tile + pillar chips) that PAGE-FRAMEWORK explicitly sanctions ("Detail pages keep their richer context band"). They use the kit's type scale + primitives in their bodies. Forcing the generic templates would regress the visuals — **left as sanctioned custom, not recomposed.** | ✅ assessed |

> **Audit recalibration:** the "46% hand-rolled" overcounted — many pages compose `PageHeading`/`StatCard`/`EmptyState` directly without the template *wrapper*, which is correct (e.g. where a back-link/eyebrow is needed). The real cobbling is pages that hand-roll the *primitives* (raw `<h1>`, bespoke empties/stats): `/support`, `/growth`, `/circles`+`/channels` (StatInline), `/crew`, `/broadcast` — now fixed — leaving PB.2d.

### PB.2e — Full template-wrapping (2026-06-08 definitive audit)

> Owner standard: **every interior page wraps one of the 5 templates** (slots = easy to assign/reorganize). Verified: the **framework is complete** (no missing slot). **64/152 pages** wrap a template today. The rest: sanctioned framework-exceptions (Admin `AdminPage` ·20 · marketing-ui ·12 · Puck editors · real-time DM/room threads · join/onboarding flows) **plus ~33 interior pages that still hand-roll a header** — the migration list:

- **Wrap (trivial, PageHeading-only):** `/broadcast`→Stream · `/crew`→Dashboard · `/crew/quests`→Stream · `/crew/store`→Dashboard · `/crew/store/ledger`→Dashboard
- **Member/crew:** `/crew/{achievements,challenges,leaderboard,streaks,journeys,journey,arcs}` → Dashboard/Index · `/people/[handle]`→Detail · `/connections`(+`[id]`,`shared/[id]`)→Index/Detail · `/support/[id]`→Detail
- **Help:** `/help`, `/help/[category]`, `/help/[category]/[slug]`, `/help/changelog` → Index/Stream/Detail
- **Discover:** `/discover`(+`/circles`,`/events`,`/topics` & their `[id]`/`[slug]`) → Index/Detail
- **Focus/system:** `/sign-in`(+confirm) · `/privacy` · `/unsubscribe` · `/code-unavailable` · `/n/[nodeId]` · `/g/[slug]` → Focus
- **Sanctioned exceptions (do NOT migrate):** `(marketing)/*` · `/edit/[slug]`, `/journeys/[slug]`, `/practices/[id]/edit`, `/pages/sequences/[slug]/{build,edit}` (editors) · `/messages/[id]`, `/messages/r/[roomId]` (real-time) · `/join/[token]`, `/onboarding/*` (flows) · redirects/print.
- ✅ **`/admin/*` (20 pages) now on the template system** — `AdminPage` promoted to a first-class **`AdminTemplate`** in `@/components/templates` that composes the shared `PageHeading` (was a parallel hand-rolled header). All 20 admin pages adopt it via a back-compat alias — zero per-page changes. The sixth template; the admin-nav sibling of Dashboard.

*(Specialist surfaces — message threads, editors, QR/CRM tools, scan landings — stay custom by
design; ~27 pages.) Token hygiene is good: **zero** `text-[Npx]`, only 3 acceptable hardcoded-hex
specialist tools.*

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
