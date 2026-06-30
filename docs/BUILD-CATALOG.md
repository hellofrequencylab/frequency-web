# Build Catalog — the reconciled master index of all unfinished work

> **The answer, first.** This is the single anti-loss index of **everything not yet shipped**,
> reconciled from a six-way sweep (2026-06-30) across the backlog reservoirs, the five audits, the
> three track plans, the feature specs, the ADR log, and a code-level seam scan. It exists so **no
> idea is lost**: every orphaned item (mentioned once, no track) is rescued into §A.13 and given a
> home. Buildable work is sequenced into **waves of agents** in **Part C**.
>
> **Authority order:** running code + `supabase/migrations/` > this doc > Notion. This catalog is an
> *index*: it points back to the source doc for each item and never replaces a track doc. The
> sequencing front-door stays [BUILD-SEQUENCE.md](BUILD-SEQUENCE.md); the *what/why* stays
> [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) and [PLATFORM-VISION.md](PLATFORM-VISION.md).
>
> **Status legend:** ✅ done · ⏳ partial / v1 · 📐 designed-only · 📋 planned (buildable now) ·
> 🔒 dormant (build now, behind `billing_live`) · ⚠️ owner / external-gated · 🅿️ parked /
> metric-gated. **Last reconciled:** 2026-06-30.

---

## How this reconciles to the live dashboard

The live build-status dashboard tracks **154 items at the epic level** (67 done · 19 in progress ·
68 not started, as of 2026-06-30). This catalog is **finer-grained** (per-surface modules, audit
findings, code seams), so its row count is higher; it rolls up to the same epics. Use the dashboard
for the executive count and this catalog for the exhaustive line-item index and the orphan rescue.

**Clean start point reached (2026-06-30).** The parallel cleanup session paused at a clean state:
prod is current with `main` (29 staged migrations accounted for); **CRM RLS convergence is live in
prod** (per-Space isolation on `crm_deals`, `crm_activities`, `crm_stages`, `contacts`,
`client_notes`, so practitioner clients and nonprofit donors are protected at the database, not just
app code); the migration ledger is clean (18 timestamp collisions de-duplicated); **`db-tests` is
green** (full fresh apply + pgTAP); **#1290 (clean ledger) and #1291 (booking time-bomb fix) merged;
0 open PRs.** Gotcha recorded for next time: prod records real-timestamp versions while the repo uses
future-dated prefixes, so reconcile by object existence, not version diff. That session owned
migrations, #1290/#1291, and the ancient `admin-*` branch cleanup; those are ✅ and excluded below.

---

# Part A — The catalog (by domain)

## A.0 Overlaps condensed (what was merged so plans do not duplicate)

The sweep surfaced the same work described in more than one plan. Condensed into one home each:

| Overlapping threads | Condensed into |
|---|---|
| Reciprocal QR handshake (REMAINING-WORK 10, GE5-1, CRM #10) | One item: **A.3 GE5** |
| Spaces deep-features split across ENTITY-SPACES-SYSTEM + ENTITY-MANAGEMENT EM2-3 + GROWTH GE10 | **A.1** (per-persona depth); money parts → Part B |
| Persona Stripe binding (BUILD-LIST P2.7, MONEY-3, EM2-5, `lib/personas.ts` seam) | **A.1 EM2-5** + Part B (Connect) |
| Trust score (OPEN-THREADS C2, F2-2, MONEY-2, code seam) | **A.13 #3** (in-repo, not owner-gated) |
| Stripe go-live / billing_live (A3, MONEY-1/4/5, F1, GE7-3, ~10 dormant UI seams) | **Part B** (one gate) + per-domain "🔒 dormant" markers |
| RLS convergence (H2-1, RLS-CONV-2, MEMBER-3/4, A7) | **A.4 H2-1** (CRM done; remainder in Wave 0) |
| Vera memory cron + draft_intro + live-loop chips (ONBOARDING 2.2/2.3, AI-1/2/3, A-PLUS §7) | **A.7** |
| Network rework (REMAINING-WORK 17-20, ADR-154, ONBOARDING 5.1) | **A.2** |
| SEO pillars / OG / llms.txt (B9, GE11, multiple audits) | **A.10 + A.3 GE11** |
| `next/image` sweep + serial-await perf (PERF-SCALE-5, PERF-3/8/9/10, AUDIT-06-27 set) | **A.5** (one perf lane) |

**Path-to-completion guarantee:** every remaining row in this catalog terminates somewhere — it maps
to a **wave lane in Part C** (agent-buildable) or a **gate in Part B** (owner/external) or is
explicitly **🅿️ parked / 🅿️ metric-gated** with the trigger named. There are no dead ends. ✅ done
and pure-duplicate rows were dropped in this condense pass.

## A.1 Spaces & Entity Management — **your stated next priority**

| Item | Status | Buildable now | Source |
|---|---|---|---|
| EM1-2 Entity-scoped owner console (`/{entity}/manage`; registry `surfacesFor` shipped) | ⏳ (6 entities live; space absent) | Yes | ENTITY-MANAGEMENT §6 |
| **EM1-3 Harmonize Spaces onto the console** | ⏳ (bespoke 7-tab still) | **Yes — practitioner + nonprofit first** | ENTITY-MANAGEMENT §6 |
| EM1-4 Wire Hub/Nexus edit mode into PageAdminDock | 📋 | Yes | ENTITY-MANAGEMENT §6 |
| EM1-5 Per-entity member-role ladder (needs migration) | 📋 | Yes | ENTITY-MANAGEMENT §6 |
| EM1-6 Platform oversight spine (lifecycle, ownership transfer, entitlement override) | 📋 | Yes | ENTITY-MANAGEMENT §6 |
| EM1-7 / EM-ROLE-1 `/lead` network-scoped leader console | 📋 | Yes | ENTITY-MANAGEMENT §5/§6 |
| EM2-2 Per-entity member management (roster, invite, roles, bulk, moderation) | 📋 | Yes | ENTITY-MANAGEMENT §7 |
| EM2-3 Space completion non-money (seed content, per-tab editor, Lab/Partner depth, advanced availability, multi-cohort, capacity/waitlist) | ⏳ | Yes | ENTITY-MANAGEMENT §7 |
| EM2-5 / EM-ROLE-2 Persona verification queue + per-persona Connect binding | ⏳ (stub) | Queue yes; Connect ⚠️ | ENTITY-MANAGEMENT §7 |
| EM2-6 Platform admin fill-out (cross-entity views, bulk ops, data-health, role templates, audit) | 📋 | Yes | ENTITY-MANAGEMENT §7 |
| EM3-1..7 Pass 3 cohesion (drill-down console, `@admin` RSC slot, relationship mgmt, consistency sweep, capability transparency, quality/e2e, docs map) | 📋 | Yes | ENTITY-MANAGEMENT §7 |
| EM2-4 Space money (Stripe on memberships/donations/enroll/tickets) | 🔒 | Build dormant | ENTITY-MANAGEMENT §7 |
| Space layout / per-tab module editor | 📐 | Yes | ENTITY-SPACES-BUILD §1.7 |
| Space theme editor (palettes + contrast validation) | ⏳ | Yes | ENTITY-SPACES-BUILD §1.7 |
| Full entity-module set (16: about…standing) | ⏳ | Yes | ENTITY-SPACES-BUILD §1.2 |
| Space discovery directory (visibility-aware search) | ⏳ | Yes | ENTITY-SPACES-BUILD §1.8 |
| Custom-domain + automated TLS issuance/verification | 📐 | ⚠️ (White-Label tier, ops cost decision) | ENTITY-SPACES-SYSTEM §3.5 / PLAN §7 |
| Public Puck micro-site builder | 🔒 | ⚠️ (White-Label) | ENTITY-SPACES-BUILD §0 |
| Per-space pgvector embeddings + Vera RAG (space-scoped) | ⏳/📐 | Yes (AI-depth tier gating later) | ENTITY-SPACES-BUILD §1.9 |
| Practitioner: 1:1 booking buffers/no-show/calendar sync | ⏳ | Yes | ENTITY-SPACES-BUILD §1.8 / ADR-325 |
| Practitioner: multi-session packages | 📐 | 🔒 (monetization) | ENTITY-SPACES-SYSTEM §2.4 |
| Nonprofit/Org: recurring giving + fee-coverage | 📐 | 🔒 | ENTITY-SPACES-PLAN §4.1 |
| Nonprofit/Org: tax-compliant donation receipts (IRS rules) | 🔒 | ⚠️ (compliance) | ENTITY-SPACES-SYSTEM §2.6/§2.9 |
| Nonprofit/Org: volunteer shifts, P2P/team fundraising, grant reporting/fund accounting | ⏳/📐 | Yes (money parts dormant) | ENTITY-SPACES-SYSTEM §2.6 |
| Coaching: cohort + 1:1 curriculum/accountability/progress; installments | ⏳ | Yes (installments dormant) | ENTITY-SPACES-SYSTEM §2.7 |
| Event Space: tiered ticketing, capacity, waitlist, check-in | ⏳ | Yes (money dormant) | ENTITY-SPACES-SYSTEM §2.8 |
| Event Space: retreat engine (deposits/holds, room-map, meal plans) | 📐 | 🔒 | ENTITY-SPACES-SYSTEM §2.8 |
| Event Space: digital waivers + insurance gating | 📐 | ⚠️ (ESIGN/UETA) | ENTITY-SPACES-SYSTEM §2.8 |
| Business: waitlist auto-fill, payroll (ADP/Gusto), POS/retail | ⏳/📐 | Mixed | ENTITY-SPACES-SYSTEM §2.5 |
| Native branded white-label app (done-for-you) | 📋 | ⚠️ (premium tier; held) | ENTITY-SPACES-SYSTEM §3.17 |

## A.2 CRM & Resonance (NEXT-GEN-CRM)

| Item | Status | Buildable now | Source |
|---|---|---|---|
| Space cockpit (space-scoped resonance health + worklist) | ⏳ | Yes | NEXT-GEN-CRM Altitude 2 |
| Platform cockpit (health verdict, at-risk worklist, lifecycle funnel) | 📐 | Yes | NEXT-GEN-CRM Altitude 1 |
| Person Detail view (timeline, About, matches, actions) | ⏳ | Yes | NEXT-GEN-CRM Altitude 3 |
| Resonance Health trait (0-100), churn alerts, RFM/decline-slope traits | 📐 | Yes (formulas underspecified — see orphans) | NEXT-GEN-CRM Cockpit |
| Playbook registry + governed execution | ⏳ | Yes | NEXT-GEN-CRM Engine |
| Playbooks: streak-freeze, winback, celebrate | 📐 | Yes (spend dormant) | NEXT-GEN-CRM Playbooks |
| Circuit breaker (pause on high dismiss/unsub) | 📐 | Yes | NEXT-GEN-CRM Autonomy |
| Autonomy slider (suggest-only → auto-execute) | 📐 | Yes | NEXT-GEN-CRM Autonomy |
| Resonance Graph (reciprocal matchmaking, embeddings, scoring) | 🔒 | Yes (opt-in, human-approved) | NEXT-GEN-CRM Resonance Graph |
| `embedPerson` into nightly cron (precision half) | ⏳ | Yes | OPEN-THREADS A8 |
| Trust score: emitters + read RPC + recompute job (0 rows in prod) | 📋 | **Yes (in-repo, not owner-gated)** | OPEN-THREADS C2 / `lib/finance` |
| Outcome-unit upsell metering | 📐 | 🔒 | NEXT-GEN-CRM Scaling |
| My-Contacts follow-ups: reciprocal QR handshake, dedupe surfaces, per-segment fields, custom objects, reach-out home pulse, copy pass, upgrade-trigger events | 📋 | Yes | REMAINING-WORK 10-16 |
| Network rework: promote `network_contacts`→`contacts`, shared/team visibility, email/calendar import, full member-facing Network IA | 📋 | Yes | REMAINING-WORK 17-20 / ADR-154 |

## A.3 Growth OS (funnels · acquisition · keystone · funding)

| Item | Status | Buildable now | Source |
|---|---|---|---|
| GE1 Funnel landing page type/template, social-proof blocks, founder-video, page A/B, per-landing SEO/OG | ⏳ | Yes | GROWTH-OS Engine 1 |
| GE2 `funnels` schema, analytics rollup RPC, builder UI, per-persona templates, wire existing entry points | ⏳ | Yes | GROWTH-OS Engine 2 |
| GE3 `applications`/`waitlist_entries` schema, apply-to-host → role handoff, operator application flows, review-queue admin, referral-position, cohort gating + bulk invite | 🆕 | Yes | GROWTH-OS Engine 3 |
| GE4 Sequence-builder schema/admin, per-persona operator onboarding, GA progressive tour, activation dashboards | ⏳ | Yes | GROWTH-OS Engine 4 |
| GE5 Reciprocal QR handshake, referral analytics/viral-K, capture→funnel closed-loop | ⏳ | Yes | GROWTH-OS Engine 5 |
| GE6 Email outbox + DLQ, automations rules engine, segment broadcasts, Vera autonomy graduation + circuit breaker, React-Email templates + sending-subdomain split | ⏳ | Yes (subdomain ⚠️ DNS) | GROWTH-OS Engine 6 |
| **GE7 Funding (Founders Circle): schema, campaign page + admin** | 🆕 | **Yes (page buildable; checkout dormant)** | GROWTH-OS Engine 7 |
| GE7 Contribution checkout, pre-sale, donations rail, affiliate engine, flip-on runbook | 🔒 | Build dormant | GROWTH-OS Engine 7 |
| GE8 Keystone (cold-start): density rollup, hosted-Journey scheduling/global cohort, localization/ripple engine, founder-bootstrap prompt, keystone admin, global→local instrumentation | 🆕 | Yes | GROWTH-OS Engine 8 |
| GE9 Proof-capture UI, proof feed + consent, broadcast composer for real rooms, resonance-gated nearby-rooms | ⏳ | Yes | GROWTH-OS Engine 9 |
| GE10 Deep features per persona, operator onboarding, entitlement gates | ⏳/🔒 | Yes (gates dormant) | GROWTH-OS Engine 10 |
| GE11 Comparison/alternative-to pages, city-page generator, pillar copy, Article/HowTo JSON-LD, AI-crawler allowlist + llms.txt refresh | 🆕/⏳ | Yes | GROWTH-OS Engine 11 |
| GE12 Unified growth dashboard, per-funnel conversion, AI-citation share, launch-gate metric surfaces | ⏳ | Yes | GROWTH-OS Engine 12 |

## A.4 Hardening (data integrity · security · scale · reliability · code quality)

| Item | Status | Buildable now | Source |
|---|---|---|---|
| H0-3 Regenerate + pin `database.types.ts` | 📋 | Yes (after migrations settle) | FOUNDATION-HARDENING §4 |
| H1-1..7 Data integrity (polymorphic FKs, ledger audit, tag reconcile, constraint/enum sweep, idempotency keys, orphan repair jobs) | 📋 | Yes | FOUNDATION-HARDENING §5 |
| H2-1 Finish RLS convergence (commerce, events, posts, resonance_consent) | ⏳ | **Yes — CRM done in prod; remainder open** | FOUNDATION-HARDENING §6 |
| H2-2..9 Security (authz CI guard, security-definer hygiene, secrets/webhook audit, GDPR erasure/export, rate-limit coverage, economy anti-abuse, security review, self-escalation guards) | 📋/⏳ | Yes (some ⚠️ owner toggles) | FOUNDATION-HARDENING §6 |
| H3-1..12 Scale (RLS subquery cost, index fill, geocoding, ledger partitioning, feed read-model, CDN, pooling/replicas, realtime, caching, AI cost, vector index, residency) | 🅿️ metric-gated | Defer until scale thresholds | FOUNDATION-HARDENING §7 |
| H4-1..9 Reliability (cron retry/DLQ, email queue, Stripe webhook DLQ, critical-path tests, db-tests required gate, backup/DR, runbooks, structured logging, load/soak harness) | 📋 | Yes (db-tests gate ✅ via cleanup session) | FOUNDATION-HARDENING §8 |
| H5-1..8 Code quality (remove type casts, centralize authz, page-framework adoption, docs reconcile, dependency hygiene, naming-collision cleanup, contract mobile-readiness, dead-code/retired-table drop) | ⏳ | Yes | FOUNDATION-HARDENING §9 |
| F0-1..11 Web foundation polish (reward values, practice.verified paths, library at scale, beta polish, embedded-admin completion, events go-live, WCAG AA, SEO/AEO, PWA/offline, loading/empty/error states, perf budgets) | ⏳ | Yes | FOUNDATION-HARDENING §10 |
| F1-1..7 Money substrate (entity partition + ledger, persona axis, Connect module, module registry, subscription-as-bridge, pricing live-path, inter-entity bridge ledger) | 🔒 | Build dormant | FOUNDATION-HARDENING §11 |
| F2-1..5 Trust & safety (moderation escalation, unified trust score, ID-verify groundwork, standalone-events moderation, safety UX) | 📐/📋 | Yes | FOUNDATION-HARDENING §12 |
| F3-1..10 Money verticals (Programs, Donations/Grants, Collective, Affiliate, Lab Spaces, Orgs/Partners/Practitioners, Events Listings, Roommate finder, Sponsor-a-membership) | 📐 | ⚠️ Held (PMF + legal) | FOUNDATION-HARDENING §13 |
| M1-1..6 Mobile (Expo/RN shell, native capabilities, device attestation, in-app payments, sync engine, store release) | 📐 | ⚠️ Held | FOUNDATION-HARDENING §14 |

## A.5 Open audit backlog (still-open findings)

| Item | Type | Source |
|---|---|---|
| SEC-5 `joinRoom` per-scope membership check (product decision: open-join vs scope-only) | security | SITE-AUDIT-2026-06-29 |
| SEC-9 `event.ics` hide title/venue for hidden/cancelled | security | SITE-AUDIT-2026-06-29 |
| SEC-10 Parameterize `searchMembersToLink` `.or()` → `.ilike()` | security | SITE-AUDIT-2026-06-29 |
| AUTHZ-4 `canReceivePayouts` exported from a `use server` file | security | AUDIT-2026-06 §3 |
| EVENTS-L1 Event visibility RLS (app-only today) | security | EVENTS-AUDIT L1 |
| HARD authz: extend `check:authz` to `lib/` mutation helpers; integration harness | security | AUDIT-2026-06-15 §3 / OPEN-THREADS B8 |
| PERF-3 batch `listCircleTasks`; PERF-8 cap Vera `draftCardLines` concurrency; PERF-9 limit funnel-sequences list; PERF-10 batch recursive menu inserts | perf | SITE-AUDIT-2026-06-29 |
| PERF profile page 8-10 serial awaits; events-index serial chain; feed `getLocalActivity` serial; discover triple-query | perf | AUDIT-2026-06-27 |
| `next/image` migration sweep (42 non-crawlable `<img>`) | perf/seo | AUDIT-2026-06-15 §9 |
| RLS initplan `auth.uid()` refactor (59 rows); consolidate permissive policies (92) | perf | AUDIT-2026-06-15 §9 |
| SEO-6 `organizationSchema.sameAs` social URLs; SEO-9 per-pillar OG cards; EVENTS dynamic OG + Offers block; Spotlight branded OG | seo | multiple audits |
| BUG-6 `draftOfferingBlurbAction` parked (awaits offerings editor) | bug | SITE-AUDIT-2026-06-29 |

## A.6 Practices & Quest

| Item | Status | Source |
|---|---|---|
| PD6 depth streak (consecutive days at Standard+) + daily "dig deeper" nudge | ⏳ | PRACTICE-DEPTH-BUILD §3a |
| PD7 tests/verification for achieved-tier + mode-accuracy flows | ⏳ | PRACTICE-DEPTH-BUILD §7 |
| Vera dispatch AI fallback (validate `movementMode`, pass activity/mode) | 📋 | IDEA-006 |
| Auto-continue for duration Movement (walk/run/stretch) past plan cap | 📋 | IDEA-007 |
| Threshold chime (audio tier-crossing cue) | 📋 | IDEA-008 |
| Effort-tier rollout to remaining game-value setters (challenges, events) | 📋 | IDEA-003 / ADR-442 |
| Practice library: merge UI, quality-score panel, tag governance, Vera pre-screen | ⏳ | BUILD-LIST §2.2-2.5 |
| Practice library: `computePracticeReward` wired + per-Pillar ledger; Vera curation; health dashboard | 📋 | BUILD-LIST §4 |
| Quest IA: consolidate 7-tab QuestTabs; delete orphaned redirect routes; operator Notion sync | 📋 | QUEST-IA-DEBT |
| Gamification: Studio for more entities, cosmetics/titles/journey badges, beta zap supply, level-up art, Forge claim metadata, types regen | 📋 | GAMIFICATION-AUDIT |

## A.7 Onboarding & Vera AI

| Item | Status | Source |
|---|---|---|
| Finish `draft_intro` (Vera warm intro post) | ⏳ | ONBOARDING §2.2 |
| Vera memory-summarization cron | 📋 | ONBOARDING §2.3 |
| Warm demo content + demo box action links | 📋 | ONBOARDING §2.4 |
| Live-loop suggestion chips + floating help launcher | ⏳ | BACKLOG / AUDIT AI-1 |
| Proactive Vera encouragement + Sentinel scheduled sweeps | 🔒 | ONBOARDING §3 (consent harness gate) |
| Event-invite capture loop (QR → RSVP → triple-write) | ⏳ | ONBOARDING §5.3 |
| Training-Journey gating on role advancement (owner decision) | 📋 | ONBOARDING §7 |
| Growth studio (unified Leadpages-style suite) | ⏳ | ONBOARDING §9 |
| Nav restructure (left-menu categorical) | ⏳ | ONBOARDING §10 |
| Vera AI Studio Phase 2 (experiment spawn/measure, more site actions, agentic support replies) | 📋 | BUILD-LIST PI.4 |
| Live Claude operator behind `getMarketRead` + content drafter (deterministic today) | 📋 | `lib/marketing/market-read.ts`, `content.ts` |

## A.8 Journeys

| Item | Status | Source |
|---|---|---|
| Retire `journey_plan_adoptions` → migrate refs to `journey_enrollments` | ⏳ | JOURNEYS §9 |
| `run_phase_events` table (runs → per-phase meetup events) | ⏳ | JOURNEYS §7 |
| Journeys v2 go-live: seed curriculum + launch a Circle cohort (0 rows in prod) | 📋 | OPEN-THREADS C3 |
| ADR-252 gatherings + reflection in Journey builder | 📐 | DECISIONS ADR-252 |

## A.9 Hook Federation

| Item | Status | Source |
|---|---|---|
| Account-link table + identity-federation handshake (Frequency ⇄ Hook) | 📐 | HOOK-FEDERATION §3 |
| Membership rollover webhook (`member.active`) | 📐 | HOOK-FEDERATION §3 |
| Points rollup (Hook → Frequency score via `engagement_events`) | 📐 | HOOK-FEDERATION §4a |
| Channel/circle federation into reach model | 📐 | HOOK-FEDERATION §4b |
| Consent-gated cross-boundary contacts/leads | 📐 | HOOK-FEDERATION §4c |
| Per-tenant subdomains (white-label front door) | 📐 | HOOK-FEDERATION §7 (⚠️ ops) |

## A.10 SEO/AIO & Marketing

| Item | Status | Source |
|---|---|---|
| Seeker-track pillar article cluster (pain-first) | 📋 | A-PLUS §5 / OPEN-THREADS B9 |
| Practice slugs (column + backfill) + dynamic OG on marketing pillars | 📋 | OPEN-THREADS B9 |
| LocalBusiness/Organization schema for The Lab | 📋 | A-PLUS §5 (⚠️ address + social URLs) |
| Comparison "alternative-to" pages | 📋 | IDEA-001 / GE11-1 |

## A.11 Member & Community depth

| Item | Status | Source |
|---|---|---|
| Messages/Channels Phase B (group chat + multi-party DMs) | 📋 | A-PLUS §9 |
| Spotlight: Top Friends, Guestbook, Stickers/decals | 📋 | BUILD-LIST Spotlight |
| Spotlight: deferred embeds (Bandcamp/Apple Music/Twitch) | 🅿️ | BUILD-LIST Spotlight (host-allowlist) |
| Circle-discovery map; multi-topic circles; seed-circle growth loop; inline crew-task volunteering | 📋 | AUDIT-2026-06-15 §9 |
| Member theming switcher UI | 📋 | A-PLUS §9 (see orphan A.13.1) |
| Content Studio unified hub; data-driven Site Navigation admin; page-editor focal-point/crop; page revisions rollback | 📋 | AUDIT-2026-06-15 §9 |

## A.12 Money verticals & external go-live — see Part B (owner-gated)

The Collective, Affiliate, Donations/Grants, Lab Spaces, in-app payments, white-label TLS, native
apps. All **designed-only / held** pending PMF + legal entities; tracked in Part B.

## A.13 ⚠️ Orphans rescued — items that had NO track home (the anti-loss section)

These were mentioned once with no wave/track/ADR. Each is now homed (see "Lands in").

| # | Orphaned idea | Why it nearly slipped | Lands in |
|---|---|---|---|
| 1 | **Theme switcher UI** — `serializeThemeCookie()`/`THEME_COOKIE_ATTRS`/`structureFor()` fully built + tested, **zero non-test callers, no UI writes the cookie** | Complete feature left disconnected; not owner-gated | Wave D (member depth) |
| 2 | **Engagement-currency engine** — SOURCE→currency map wired (`lib/engagement/currency.ts`) but the capture/reward orchestration that consumes it is deferred, so physical/outreach events never mint at scale | Plumbing with no engine | Wave D / Hardening F0-1 |
| 3 | **Trust-score wiring** — emitters + read RPC + recompute job (in-repo, **not** owner-gated, unlike other empty-in-prod seams) | Mislabeled as owner-gated | Wave D / F2-2 |
| 4 | **Entry-point flyer/PDF designer** — pipeline turned off; only QR PNG/SVG ship | 🅿️ in BACKLOG, unmentioned since | Wave E (growth studio) |
| 5 | **Outpost stewardship** — `outpost_lead`/`outpost` in CHECK constraints; `transition` is a no-op; nothing writes them | Parked (P1.5), forward-compat only | Park explicitly; revisit with EM1-5 |
| 6 | **Post-event recap album** (`event_posts` unused) | Listed once; likely dead | Verify-or-drop in Wave D |
| 7 | **SMS reminders (Twilio/A2P 10DLC)** | Deferred since 2026-06-10; needs EIN | Part B external-gate |
| 8 | **CAN-SPAM postal address** (`COMPANY_POSTAL_ADDRESS`) for scan-intro email footer | Config item, easy to forget | Part B external-gate |
| 9 | **Marketplace in-app payment / inter-entity bridge** | BACKLOG §K, no design owner | Held (F1-7 ledger built; UX later) |
| 10 | **Data-residency posture (H3-12)** | Decision gate, no ADR, no owner | Part B open-decision |
| 11 | **Gem-farm decision + `awardZaps` auto-promotion** | BACKLOG §C, never surfaced | Wave D (anti-abuse H2-7) |
| 12 | **Payment TOCTOU race (store redeem)** | Decision needed, no wave | Wave D / H2 |
| 13 | **`welcome_member` achievement unobtainability** | Flagged once, unverified | Verify in Wave D |
| 14 | **Teaser-gate extensions** (event/interest/best-practice pages) | Only in BACKLOG §N | Wave E (gated, flip with paid tiers) |
| 15 | **Resonance Graph cold-start** (seed from onboarding Pillars) — no onboarding screen specified | Dangling impl detail | Fold into A.2 Resonance Graph |
| 16 | **Underspecified CRM trait formulas** — Resonance Health, RFM, decline-slope, notification-budget have no formula | Designed without spec | Spec in A.2 before build |
| 17 | **Legal/compliance reviews** — CAN-SPAM initiator counsel, GDPR joint-controller (Vera), lodging tax per jurisdiction, donation-receipt IRS rules | Flagged, no counsel ticket | Part B external-gate (counsel) |
| 18 | **Native app procurement/RFP** | "Done-for-you" with no vendor eval | Held (Phase 6) |
| 19 | **Apple Wallet (ADR-082), magic-link ghost-node geo authoring** | Deferred seam | Park; revisit post-launch |
| 20 | **Per-space `entitlements.jsonb` key catalog** — structure defined, per-tier keys not enumerated | Underspecified | Spec alongside EM2-4 |

### ⚠️ Stale pointers to verify (doc drift — code may have moved or shipped)

- `savePageDraft` server action: A-PLUS §9 cites `app/edit/actions.ts:36` but the seam appears gone — confirm wired/removed.
- Coming-soon nav: roadmap cites `lib/nav-areas.ts` but no `coming-soon` ref found there now.
- ADR-015 "blocked by marketplace": marketplace shipped (ADR-392) — re-evaluate.
- ADR-349 broad `<PageModules>` coverage vs hardcoded focus-mode in `app-shell.tsx` (~9 pages) — verify drift.
- Line-number drift: `lib/personas.ts:103-106`, `entry-points-client.tsx:322` (seams real, lines moved).

---

# Part B — Owner / external gates (not buildable by agents)

Nothing here is code an agent can finish. Build everything *as if these are in place* (dormant), and
flip when the owner clears the gate.

| Gate | Unblocks | What the owner does |
|---|---|---|
| **EIN / legal entity** | Stripe payouts, SMS A2P, inter-entity bridge, donation deductibility | File EIN; counsel on entity structure (ADR-029) |
| **`billing_live` flip** | All pricing/checkout/webhooks (built dormant via `featureAllowed`) | Flip in `/admin/pricing` when ready to charge (ADR-362/370) |
| **Stripe live** | Money ledger recording (0 rows today) | Keys + `STRIPE_WEBHOOK_SECRET`, Connect onboarding, `host_payouts_enabled` |
| **`ANTHROPIC_API_KEY` + `ai_enabled`** | Live Vera, marketing drafters | Set key, flip `platform_flags.ai_enabled` |
| **Resend DNS** | Per-space + transactional email deliverability | SPF/DKIM/DMARC for `send.frequencylocal.com`, `EMAIL_FROM` |
| **Google OAuth URLs** | Social login | Supabase Site/Redirect URLs + Google Cloud client |
| **VAPID push keys** | Web push | Generate + set keys |
| **Sentry DSN / GA id** | Error monitoring / analytics (inert without) | Set `SENTRY_DSN`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| **`NEXT_PUBLIC_SITE_URL`** | Canonical URLs | Set to prod domain, verify DNS |
| **Sitemap submission** | Search indexing | Submit to Google Search Console + Bing |
| **SMS A2P 10DLC** | Group SMS (`sendSms`) | Register brand + campaign with Twilio (needs EIN) |
| **CAN-SPAM postal address** | Scan-intro friend invites | Set `COMPANY_POSTAL_ADDRESS` |
| **`is_public` practices** | Public practice library (renders empty today) | Flip toggle on `/admin/content` |
| **Auth leaked-password + secret-scanning** | Security posture | Enable in Supabase + GitHub settings |
| **Counsel reviews** | CAN-SPAM, GDPR joint-controller (Vera), lodging tax, IRS receipts | Legal sign-off |

**Held phases** (deep-plan when their wave opens): Money verticals (Collective/Affiliate/Donations/
Labs), White-label TLS + Puck micro-site, Native apps + premium AI infra. Source: MASTER-PLAN §11.

---

# Part C — The wave-of-agents execution plan

Each wave is a set of **agent lanes**. Lanes in the same wave run in **parallel only if their files
are disjoint** (the MASTER-PLAN parallel-safety rule). A wave ends at a **gate**; the next wave does
not open until the gate is true. Owner-gated and held items (Part B) are excluded — they are not
agent work. One deliberate PR per lane.

### Wave 0 — Foundation close-out  *(cleanup session done; remainder open)*
| Lane | Work | Status |
|---|---|---|
| 0a | #1290 clean ledger + #1291 booking time-bomb fix; `db-tests` green | ✅ done (cleanup session) |
| 0b | H2-1 RLS convergence remainder (commerce, events, posts, `resonance_consent`) | 📋 open — serial-ish (RLS) |
| 0c | H0-3 regen `database.types.ts` + drop stale casts (H5-1) | 📋 after 0b |
| 0d | Quick win: make `db-tests` a **required** check (now green; prevents future drift) | 📋 owner one-time setup |
| 0e | Quick win: lock down RLS on the `mission_control` tables | 📋 buildable |
**Gate:** advisors clean · `db-tests` green + required · types pinned · RLS converged.

### Wave 1 — Spaces management *(your stated priority: practitioner + nonprofit)*
| Lane | Work | Depends on |
|---|---|---|
| 1a | Declare `space` surfaces in the entity registry (groundwork for all types) | — |
| 1b | `/spaces/[slug]/manage` console shell (Dashboard template, rail `none`) | 1a |
| 1c | **Practitioner spine** (Basics·Availability·People·Engage·Reach·Comms·Insights·Danger) | 1b |
| 1d | **Nonprofit/Org spine** (Basics·People·Engage[donations/enroll dormant]·Reach·Comms·Insights·Billing·Danger) | 1b |
| 1e | Retire/redirect the bespoke 7-tab into the console | 1c+1d |
1c and 1d are parallel (different surface components). 
**Gate:** a practitioner and a nonprofit owner manage everything through one console; no feature loss.

### Wave 2 — Platform admin oversight of these two types
| Lane | Work | Parallel? |
|---|---|---|
| 2a | Persona verification queue (claimed→verified→active→suspended), Practitioner + Org scope | ✅ disjoint |
| 2b | Lifecycle + ownership transfer for spaces (suspend/archive/transfer + audit) | ✅ disjoint |
| 2c | Per-entity member management roster (People/Safety modules) | ✅ disjoint |
**Gate:** admin can verify, suspend/transfer, and manage members for practitioners + nonprofits.

### Wave 3 — Orphan rescue + audit backlog burn-down  *(the "scattered PRs", now batched)*
Highly parallel; each lane is disjoint, one PR each. This is where the A.13 orphans and A.5 audit
items get closed deliberately instead of opportunistically.
| Lane group | Work |
|---|---|
| 3-sec | SEC-5, SEC-9, SEC-10, AUTHZ-4, EVENTS-L1, extend `check:authz` |
| 3-perf | PERF-3/8/9/10, profile/events/feed/discover serial-await fixes, `next/image` sweep |
| 3-orphan | Theme switcher UI (#1), engagement-currency engine (#2), trust-score wiring (#3), verify-or-drop #6/#13, gem-farm/TOCTOU (#11/#12) |
| 3-seo | SEO-6, SEO-9, event OG + Offers, practice slugs |
| 3-quest | Quest IA consolidation, delete orphaned routes |
**Gate:** open audit findings closed or consciously deferred; orphans homed.

### Wave 4 — Growth OS spine + funding (dormant)
| Lane | Work | Parallel? |
|---|---|---|
| 4a | GE2 funnel schema + builder + analytics rollup | ✅ |
| 4b | GE3 applications/waitlist + apply-to-host + review queue | ✅ |
| 4c | GE8 keystone (cold-start: density rollup, founder-bootstrap, hosted-cohort) | ✅ |
| 4d | **GE7 Founders Circle campaign page + admin** (checkout dormant behind `billing_live`) | ✅ |
| 4e | GE6 email outbox/DLQ + automations engine + segment broadcasts | ✅ |
This reconciles the **"Founders Round funding sprint"** (dashboard #1 goal): build it now, dormant;
it lights up at the `billing_live` gate (Part B).
**Gate:** funnels built from admin; nobody lands in an empty room; funding page ready to flip on.

### Wave 5 — Deep features per persona + groundwork for the other types
| Lane | Work | Parallel? |
|---|---|---|
| 5a | Register business / event_space / lab / partner surfaces in the registry (groundwork only) | ✅ |
| 5b | Practitioner booking depth (buffers/no-show/calendar sync), packages (money dormant) | ✅ |
| 5c | Nonprofit deep (volunteer shifts, P2P/team fundraising, grant reporting; money dormant) | ✅ |
| 5d | CRM cockpit + playbooks + autonomy slider + circuit breaker | ✅ |
**Gate:** every persona has its full free toolset; money paths built and dormant.

### Wave 6 — Cohesion (EM Pass 3) + reliability + a11y
| Lane | Work |
|---|---|
| 6a | EM3 drill-down console, `@admin` RSC slot, relationship mgmt, consistency sweep, capability transparency |
| 6b | H4 reliability (cron retry/DLQ, backup/DR, runbooks, load/soak), critical-path tests |
| 6c | F0-7 WCAG AA pass, loading/empty/error states, perf budgets |
**Gate:** one coherent, tested, accessible framework.

### Held (no agents until owner clears Part B)
Money verticals (F3 / Collective·Affiliate·Donations·Labs), white-label TLS + Puck, native/mobile
(M1), all external gates. Each gets its deep plan when its gate opens.

### Scale work (H3) — metric-gated, not wave-gated
Do **not** build ahead: RLS subquery cost, partitioning, read replicas, CDN, caching, vector-index
maintenance. Triggered by the ~1M / ~10M thresholds in FOUNDATION-HARDENING §7, not by a wave.

---

*Owner: Daniel (Vision Steward). Reconciled 2026-06-30 from a six-way extraction sweep. This is an
index; the track docs and DECISIONS.md remain authoritative for detail. Update statuses here as
waves land, and add new orphans to §A.13 so nothing is lost.*
