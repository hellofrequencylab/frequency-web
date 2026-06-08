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
| **PI** | **Intelligence & Activation Engine** | Wide behavioral capture → feature store → AI site-improvement loop → retroactive rewards | XL | 📋 PI.1 is the *capture-now* piece |
| **PM** | **Money verticals** (gated) | Collective · Affiliate · Donations · Lab Spaces | XL | 🔴 after PMF |

**Outpost is parked** (owner direction) — tracked in ROLES.md/§11.5 but not scheduled.

## Progress log

- **2026-06-08 ⏳ PI.5 (retroactive rewards)** — the final PI layer (ADR-168, migration `20260608110000`): a governed reward-rule registry (pure predicates over the durable history — lifetime rank, feature-store traits, tags, tier) + an idempotent **claim-then-pay** batch evaluator that grants once against the immutable history (the reward lands in the gem/zap ledgers; `reward_grants` unique guard makes re-runs safe). `/admin/rewards` previews pending grants (dry-run) and grants them one-click. v1 ships 5 gem rules (e.g. *ever reached Agent → 200 gems*). 415 tests green. **Completes the engine: capture → feature store → predictions → AI Studio → retroactive rewards.**
- **2026-06-08 ⏳ PI.4 (AI Studio — increment 1)** — the AI Intelligence Studio is live (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) turns the banked signal — feature store + PI.3 predictions + interaction-surface rollups + **support tickets + help-gaps** — into **ranked, evidence-backed recommendations**, with Claude narrating the summary (deterministic fallback). The safety core is a **governed allow-list** of reversible, audited, role-gated site actions (`reindex_help`, `set_flag`) an operator applies one-click — the AI can only ever propose a registered action, never an arbitrary backend mutation. Every change logs to `studio_site_changes` with one-click revert. 407 tests green. Ties support pain → recommendation → applied fix (the "virtual staff" loop); agentic support replies + experiment-spawn are the next increments.
- **2026-06-08 ⏳ PI.3 (predictive traits)** — the prediction layer is live (ADR-166): a new `predicted` trait kind + `churn_risk` / `activation_propensity` / `next_best_action`, computed nightly by heuristic rules over the feature store (lifecycle + RFM + engagement-depth). The trait refresh now merges the ledger + interaction views per member so ledger/behavioral/predicted traits all derive from one consistent picture. Pure compute unit-tested; 398 tests green. Heuristic v1 behind stable keys — a model/Claude-graded path swaps in later. Feeds Vera nudges, campaigns, and PI.4/PI.5.
- **2026-06-08 ⏳ PI.2 (feature store)** — the firehose now feeds the durable feature store (ADR-166, migration `20260608090000`). 8 registry-declared behavioral traits (interaction volume/active-days/surfaces/dwell-minutes/sessions/scroll-depth/last-interaction + an `engagement_depth` band) computed from a new `member_interaction_stats` RPC and merged into `member_traits` by the existing nightly trait refresh; a `interaction_surface_stats` RPC gives the per-surface site-level rollup for PI.4. Pure compute is unit-tested; 394 tests green. The clean per-member aggregate the AI + reward engine read (never the raw firehose).
- **2026-06-08 ⏳ PI.1 (wide capture spine)** — the raw behavioral firehose is live (ADR-166, migration `20260608080000`): `interaction_events` (wide + jsonb-extensible, append-only, retention-bounded) + a batched client buffer (`observe()` → sendBeacon flush) + the consent-gated `/api/observe` batch sink + `ObserveProvider` auto-capturing view/dwell/scroll-depth/rage-click/visibility, mounted beside `PageViewTracker`. The semantic `engagement_events` pipe is unchanged; this is its high-volume twin. 90-day raw purge wired into the retention cron. 391 tests green. *The un-retrofittable "capture wide now" piece — banking history before PI.2–PI.5 read it.*
- **2026-06-08 ✅ P2.7 (verification half)** — partner persona claims now run a real, staff-gated ladder (ADR-165, migration `20260608070000`). Self-serve **claim** lands in *pending review* (no longer an instant tool unlock); a `profiles`-domain operator (or janitor) runs **verify → activate** from the new `/admin/personas` queue, with suspend/reinstate, allow-map-validated transitions, and an audit trail (`verified_by/at`). `getActivePersonas` now lights surfaces on verified/active only. The per-persona Stripe Connect binding stays stubbed until Connect is configured. 384 tests green.
- **2026-06-08 ✅ P2.6 (lifetime rank)** — the locked, never-resetting **peak rank** (`profiles.lifetime_rank`, ADR-164, migration `20260608060000` applied + backfilled). The zap trigger ratchets it (`GREATEST(lifetime_rank, current_season_rank)`); `reset_season()` locks it from the final rank before wiping the season (catching manual Luminary) and leaves it untouched after. Surfaced on the member's Vault (Store widget + ledger headline); `lib/season-ranks.ts` mirrors the enum order (`RANK_ORDER`/`higherRank`, tested). *Remaining P2.6:* entitlement sources beyond `membership_tier` (comp/Lab/staff grants — speculative beta infra).
- **2026-06-08 ✅ P2.2–2.5 (Stripe membership + Supporter)** — the env-gated Stripe layer is the membership rail: `/upgrade` + `/settings/billing` are a real checkout/manage flow (inline price + success-redirect confirm + webhook), the ✋ gates already read the tier. **P2.4 Supporter** (this round): pay-more tier wired end-to-end — `STRIPE_SUPPORTER_AMOUNT` (default $25), a "Become a Supporter" CTA on `/upgrade`, tier-aware billing confirmation, and a reusable `SupporterBadge` endorsed on the profile header.
- **2026-06-08 ⏳ P3.1 (Partners foundation)** — `profile_personas` table (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (the matrix's partner columns now activate per active persona; closes PB.1f) + self-serve `/partners/join`. 43 core tests green.
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
| 2.2 | Stripe membership layer | ✅ | Env-gated (`billingEnabled()`); `lib/billing/{stripe,checkout}.ts` + webhook (`checkout.session.completed` / `subscription.updated\|deleted` → `membership_tier`). Inline `price_data` fallback (no price ID needed) + `confirmCheckout` success-redirect fallback (works pre-webhook). Partner payouts/commissions still pending (2.7). |
| 2.3 | Stripe membership checkout | ✅ | Real `/upgrade` checkout + `/settings/billing` (manage/cancel via portal). Beta free toggle stays when keys absent. |
| 2.4 | Supporter badge | ✅ | Pay-more tier live — `STRIPE_SUPPORTER_AMOUNT` (default $25) inline price; "Become a Supporter" CTA on `/upgrade`; reusable `SupporterBadge` endorsed on the profile header. |
| 2.5 | Wire the ✋ gates to the tier | ✅ | Matrix-driven: `accessTo()` + `isPaid(tier)` gate Vault · Studio · Personal CRM · QR Studio (the ✋ cells read the real entitlement column). |
| 2.6 | Freemium Vault + season cash-in | ⏳ | Accrual (zap/gem ledgers) ✅, season `zaps → gems` conversion ✅, persistent Vault + "how you earned" log ✅. **Lifetime rank** ✅ — locked monotonic peak (`profiles.lifetime_rank`, ADR-164/migration `20260608060000`): zap trigger ratchets it, `reset_season()` preserves it, surfaced on the Vault. *Remaining:* entitlement **sources** beyond `membership_tier` — host comp-grant / Lab rollup / staff grant (ADR-037 §6c/d; speculative beta infra). |
| 2.7 | Persona verification + Connect binding | ⏳ | **Verification half** ✅ (ADR-165, migration `20260608070000`): the `profile_personas` ladder is real — claim → *pending review* → staff **verify** → activate (suspend/reinstate), validated by `canStaffTransition`; surfaces light on verified/active only; audit trail (`verified_by/at`, `updated_at`); admin queue at `/admin/personas` (janitor / `profiles`-staff). *Remaining:* per-persona **Stripe Connect binding** (the money gate at `active`) — stubbed until Connect is configured. |
| 2.8 | Module registry + inter-entity Lab bridge | 📋 | Verticals self-declare (ADR-033); audited for-profit↔Foundation transfers (ADR-038). |

## P3 — Partners (personas + Hook federation)

> Self-serve account personas, multi-select hats. Spec: §11.4 / §8 + [ROLES.md](ROLES.md) System 2.

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `profile_personas` + per-persona dashboards | ⏳ | ✅ **foundation:** `profile_personas` migration (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (matrix partner columns now activate per active persona) + self-serve `/partners/join` claim. ✅ **3.2:** `/crm` + `/growth` open to Business/Org personas. ✅ **3.3:** Business/Org self-serve **directory listing** (`/partners/listing` → the `/partners` directory). ✅ **3.4:** Collaborator featured directory (`/partners/collaborators`). **Remaining (mostly need Stripe/infra):** website builder · Hook sub-community · Collaborator affiliate kickbacks · Practitioner paywalled Programs. |
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

## PI — Intelligence & Activation Engine (track everything → AI-guided improvement)

> **Vision (owner):** *"Track everything a member does; have the AI studio recommend site changes
> for better member engagement, and build future rewards based on past behaviors."* The full spec
> is the **6th layer** of [MEMBER-DATA-PLATFORM.md](MEMBER-DATA-PLATFORM.md) (ADR-166). **We already
> own the spine** — `engagement_events` (append-only, idempotent), `member_traits`/`member_tags`,
> `segments`, the nightly rollup crons, `lib/experiments` (variant assignment + holdouts), the
> consent ledger, and the Vera/Claude kernel (router, budget, kill switch). This track adds the
> two things you **cannot retrofit** (raw width + immutable history), then *composes* the rest on
> what exists.

**The one rule that prevents re-developing later: capture wide and immutable NOW.** Every future
metric, reward, or model must be a *read* over data we already banked — never a backfill we can't
do. So PI.1 ships first, even before the AI can use it.

| # | Item | Status | Notes |
|---|---|---|---|
| PI.1 | **Wide interaction capture (the fire-hose)** | ⏳ | **Spine shipped** (migration `20260608080000`, ADR-166): `interaction_events` (wide, jsonb-extensible, append-only, host-read RLS) + batched client buffer `lib/analytics/observe.ts` (`observe()`, sendBeacon flush on interval/full/page-hide) + batch sink `/api/observe` (consent-gated, member-tied, service-role bulk insert) + `ObserveProvider` auto-capturing view · dwell · scroll-depth · rage-click · visibility. Retention-bounded (90d purge in the nightly cron). *Remaining:* explicit per-feature `observe()` calls (search/zero-result/form-abandon at the call sites), anon-session capture, per-kind sampling tuning. |
| PI.2 | **Member feature store (durable behavioral profile)** | ⏳ | **Built** (migration `20260608090000`): the firehose now rolls into the feature store. 8 registry-declared **behavioral traits** (`interaction_count_30` · `interaction_days_30` · `surfaces_touched_30` · `dwell_minutes_30` · `sessions_30` · `scroll_depth_avg` · `last_interaction_at` · `engagement_depth` band) computed by `computeBehavioralTraits` from the `member_interaction_stats` RPC and upserted into `member_traits` by the nightly refresh. Plus `interaction_surface_stats` — the per-surface site-level rollup (views/dwell/scroll/rage/reach) PI.4 reads. *Remaining:* near-real-time path for live signals; affinity vectors. |
| PI.3 | **Predictive traits** | ⏳ | **Built** — new `predicted` trait kind + 3 registry-declared predictions computed nightly from the feature store: **`churn_risk`** (low/med/high), **`activation_propensity`** (0–100), **`next_best_action`** (reengage/activate/join_circle/deepen/invite/none). Heuristic v1 (pure, unit-tested) over lifecycle + RFM + engagement-depth; the refresh now merges the ledger + interaction views per member so all three trait families compute from one picture. A model/Claude-graded path slots in behind the same keys. *Remaining:* LTV band (needs billing signals), model upgrade. |
| PI.4 | **AI Intelligence Studio (predict → recommend → apply → audit)** | ⏳ | **Built — increment 1** (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) reads the feature store + predictions + `interaction_surface_stats` + **the Support DB** (tickets + help-gaps) and emits **ranked, evidence-backed recommendations** (`synthesizeRecommendations`, pure/tested; Claude narrates the summary with deterministic fallback). The safety core: a **governed allow-list** of reversible, role-gated, param-validated site actions (`lib/studio/site-actions.ts` — `reindex_help`, `set_flag`) the operator applies one-click; every apply/revert is audited (`studio_site_changes`). The AI can never emit an arbitrary mutation. *Remaining:* experiment-spawn + lift measurement; more registered actions (publish help draft, promote segment, tune Vera); agentic support replies. |
| PI.5 | **Retroactive reward engine (future rewards from past behavior)** | ⏳ | **Built** (ADR-168, migration `20260608110000`): a governed **rule registry** (`lib/rewards/rules.ts` — pure predicates over the durable snapshot: lifetime rank, feature-store traits, tags, tier; e.g. `seasoned_agent` = ever reached Agent → 200 gems) + an **idempotent batch evaluator** that **claims-then-pays** against the immutable history (`reward_grants` unique `(rule, member)` backstop; reward lands in the gem/zap ledgers). `/admin/rewards` (Admin/Janitor): dry-run **preview** of pending grants + one-click grant. Re-running never double-grants. *Remaining:* zap-kind rules, tag/badge rewards, cron auto-run when trusted. |

**Sequencing:** PI.1 now (urgent, un-retrofittable) → PI.2 → PI.3/PI.5 in parallel (both read the feature store) → PI.4 last (it consumes all of the above). Most of PI.4–PI.5 is *composition* of existing primitives (experiments, segments, ledgers, AI kernel, idempotency); only PI.1–PI.2 need new data infra.

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
| PB.1f | Thread `profile_personas` through `getViewerHats` | `lib/core/viewer-hats.ts` | ✅ done (P3.1) |
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
