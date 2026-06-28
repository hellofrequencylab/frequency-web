# Foundation Hardening & Scale Plan

> **The hardening-first, best-practice-first execution sequence.** This is the active build
> order locked by owner decision **2026-06-28**: make the platform world-class and
> scale-ready **before** adding more features, finish the web foundation fully, then build the
> mobile app (the eventual primary surface). It re-sequences (does not replace) the staged
> build in [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md); the *what/why* of the verticals and the
> two-entity model stay canonical there and in [PLATFORM-VISION.md](PLATFORM-VISION.md).
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc > Notion.
> **Decision record:** [ADR-439](DECISIONS.md).
>
> **Status legend:** ✅ done · ⏳ in progress · ⚠️ at risk / needs attention · 🔴 blocker / not started.
> **Task IDs** (e.g. `H1-3`) are stable handles for issues, PRs, and the master plan.

---

## 1. The owner decisions this plan encodes (2026-06-28)

| Decision | Implication for the build |
|---|---|
| **Legal entities are being formed; plan as if live.** | The money foundation (entities, ledger, Connect, personas) is built as real infrastructure on this plan, not deferred. No work is gated on the EIN inside this document; go-live switches are flagged where the entity must be legally active. |
| **Mobile is the primary surface.** | The web app is built to a **complete, hardened foundation first**; the mobile app (Expo/RN) is the next major surface and consumes the same contract layer. The contract/capability seam is treated as load-bearing, not optional. |
| **Hardening and best practice first, features second.** | Phases H0–H5 (correctness, security, performance, reliability, quality) come **before** the feature/vertical phases (F-series). In-flight features are finished only to the extent they reach launch quality; net-new verticals wait. |

**North Star (unchanged):** Weekly Active Members (members with ≥1 `practice.verified` in a
rolling 7 days). Every phase below ultimately protects the ability to grow that number to
millions without breaking.

---

## 2. Guiding principles for this program

1. **Measure before you change.** No optimization or refactor ships without a baseline (advisor
   output, query plan, load number, or failing test) that proves it was needed and proves it
   worked. Scale work is metric-driven, never speculative.
2. **Correctness > security > performance > reliability > quality > features.** When two pull in
   different directions, the earlier one wins. Features ride on a foundation that is already
   right.
3. **Every change is additive and reversible where possible.** Migrations are backward-compatible;
   destructive drops happen only after a verified deprecation window (the house migration
   philosophy).
4. **One source of truth per concern.** No new competing plan docs; this plan points at the
   canonical specs and tracks execution. Code + migrations remain authoritative.
5. **The contract layer is sacred.** Because mobile consumes it next, anything that would couple
   business rules to Next.js or to a specific UI is treated as a defect.
6. **Honor the canons.** NAMING.md and CONTENT-VOICE.md govern every member-facing string the
   work touches; PAGE-FRAMEWORK.md governs every page; DOCS-PROTOCOL.md routes every doc.

---

## 3. Phase overview & dependency map

```
 H0 Baseline & observability ─▶ H1 Data integrity ─▶ H2 Authz & security ─▶ H3 Performance & scale
                                                                                     │
 H4 Reliability & ops ◀───────────────────────────────────────────────────────────┘
       │
       ▼
 H5 Code quality & maintainability ─▶ F0 Finish web foundation to launch quality
                                            │
                                            ├─▶ F1 Money foundation (infra, plan-as-if-live)
                                            ├─▶ F2 Trust & safety elevation
                                            └─▶ F3 Feature verticals (growth) ─▶ M1 Mobile app
 Continuous tracks (run across all phases): Security · Scale-on-metrics · Docs · Dependency hygiene
```

**Gate rules:**
- H1–H5 are the **hardening spine** and ship in order; each has an explicit "done when."
- **F0** (finish the web foundation) may begin once H1–H4 are green; it overlaps H5.
- **F1/F2/F3** start only after F0; **F2 (trust & safety) gates** the higher-risk verticals
  (roommate finder, stranger-facing marketplace, public events discovery).
- **M1 (mobile)** starts only after the web foundation (F0) is complete and the contract layer
  passes its mobile-readiness audit (H5-7).

---

## 4. Phase H0 — Baseline, measurement & observability

**Why first:** you cannot harden what you cannot see. This phase produces the numbers every later
phase is judged against, and stands up the alerting that makes the system "not cause problems in
the future."

| ID | Task | Detail | State |
|---|---|---|---|
| H0-1 | **Run the full Supabase advisor sweep** | `get_advisors` for security and performance on prod; capture every finding (missing RLS, unindexed FKs, security-definer search_path gaps) as the H1/H2/H3 backlog seed. | 🔴 |
| H0-2 | **Reconcile migration drift** | Confirm repo `supabase/migrations/` == applied prod schema. List any prod-only changes applied via SQL editor; back-fill them as migrations so the repo is the source of truth. 360+ migrations exist; drift risk is real. | 🔴 |
| H0-3 | **Regenerate and pin database types** | `generate_typescript_types` → overwrite `lib/database.types.ts`; this unblocks removing the temporary `as unknown as` casts (H5-1). | 🔴 |
| H0-4 | **Error monitoring** | Stand up Sentry (or equivalent) for the Next.js app: server actions, RSC, and client. Tag by route and by `entity`/`space_id`. Today there is no centralized error capture. | 🔴 |
| H0-5 | **Cron observability** | Instrument all 17 `vercel.json` cron routes with success/failure heartbeats + alerting (e.g. a dead-man's-switch per job). A silently dead `process-queue`, `weekly-digest`, or `season-go-live` is exactly the future problem to prevent. | 🔴 |
| H0-6 | **Performance baseline** | Capture p50/p95 latency + query plans for the hot read paths (feed, circle detail, people directory, practice log write, events catalog). These plans are the "before" for H3. | 🔴 |
| H0-7 | **Cost baseline** | Snapshot current spend by vendor (Supabase, Vercel, Anthropic, Resend, Upstash) and per-1k-members unit economics, so scale decisions in H3 are cost-aware. | 🔴 |
| H0-8 | **Define SLOs** | Write target SLOs (uptime, p95 latency, error rate, queue lag, cron freshness) into this doc so later phases have a bar to hold. | 🔴 |

**Done when:** advisors are clean-listed into backlog, repo == prod schema, error + cron alerting
page a human on failure, and a baseline dashboard exists for latency, cost, and SLOs.

---

## 5. Phase H1 — Data integrity & correctness

**Why:** the schema is broadly strong (idempotent ledgers, exactly-once Stripe keys, enums, FKs),
but a few structural choices will leak data or orphan rows as tables grow. Fix integrity while the
tables are still small.

| ID | Task | Detail | State |
|---|---|---|---|
| H1-1 | **Resolve polymorphic foreign keys** | `posts.scope_id` and `events.scope_id` are bare UUIDs with no FK, pointing at circles/hubs/regions. This is the single riskiest data-model choice: orphaned rows + RLS that can mis-evaluate. Fix via either typed columns + real FKs, a `scopes` union/registry table, or per-type columns. Add validation + a backfill/repair job. **Highest priority in H1.** | 🔴 |
| H1-2 | **Ledger integrity audit** | Verify `zap_transactions`, `gem_transactions`, `engagement_events`, `reward_grants` are append-only and fully idempotent on every write path (including retries, un-log/reverse, season reset). Add a reconciliation job that proves `profiles.current_season_zaps/gems` == ledger sums. | 🔴 |
| H1-3 | **Event lifecycle audit trail** | `events.is_cancelled` is a bare boolean. Add `cancelled_at`, `cancelled_by`, `cancellation_reason` (and the same pattern wherever a state lacks who/when/why). | 🔴 |
| H1-4 | **Tag model reconciliation** | `member_tags` (governed) vs `network_contact_tags` (free-form) coexist with different schemas and no unified search. Decide one model or namespace them clearly; document in DATABASE.md. | 🔴 |
| H1-5 | **Constraint & enum sweep** | Confirm every status/role/kind column is enum-or-check constrained; confirm cascade vs set-null is intentional on every FK (content survives author deletion; ephemera cascades). Document the deletion graph. | 🔴 |
| H1-6 | **Idempotency key coverage** | Audit every member-triggered mutation that awards or charges for an idempotency guard against client retry (practice log already has one; verify check-ins, captures, RSVPs, redemptions, orders). | 🔴 |
| H1-7 | **Orphan & referential repair jobs** | One-time sweep + a scheduled checker for dangling references the polymorphic columns allowed historically. | 🔴 |

**Done when:** no unconstrained polymorphic references remain, ledgers reconcile to profile
balances on a scheduled check, and the deletion/cascade graph is documented and intentional.

---

## 6. Phase H2 — Authorization & security

**Why:** the authz model is disciplined (two-client split, CI guard that fails the build on an
unchecked admin-client server action) but mid-transition. Finish the convergence and close the
compliance gaps before scale multiplies the blast radius.

| ID | Task | Detail | State |
|---|---|---|---|
| H2-1 | **Finish RLS convergence (ADR-042/056)** | Migrate remaining high-traffic read/write paths from admin-client to RLS + `SECURITY DEFINER` RPCs, surface by surface, each with policy tests. Six surfaces done (notifications, friendships, feed, feed-detail, messages, rooms); enumerate and close the rest (CRM, commerce, resonance, spaces reads where appropriate). | ⏳ |
| H2-2 | **authz CI guard coverage** | Audit every `'use server'` file that uses `createAdminClient()` for an explicit authz check or justified `// authz-ok`. Extend `scripts/check-authz-guards.mjs` coverage; treat any gap as a bug. | ⏳ |
| H2-3 | **Security-definer hygiene** | Confirm every SECURITY DEFINER function pins `SET search_path = public` and returns safe-by-default for the unauthenticated (NULL) caller. Advisor-driven (H0-1). | 🔴 |
| H2-4 | **Secrets & webhook verification audit** | Verify signature checks on every inbound webhook (Stripe, Resend) and HMAC on every signed token (unsubscribe, beta, cron, QR signed codes). Confirm no secret is ever client-exposed; rotate-ability documented. | 🔴 |
| H2-5 | **GDPR/CCPA erasure + export workflow** | Today deletion hard-cascades with no formal right-to-erasure/export flow. Build a member-initiated export + a deletion workflow that anonymizes where audit/ledger integrity must be preserved. | 🔴 |
| H2-6 | **Rate-limit coverage** | Upstash sliding-window exists; audit that every public/abuse-prone endpoint (auth, capture/claim, search, AI, contact capture, RSVP) is covered and fails open safely. | ⏳ |
| H2-7 | **Anti-abuse on the economy** | Confirm the reward engine's anti-farm guarantees hold at scale (per-day caps, distinct-validator on validated-creation, timer-completion proof, velocity checks). Tie to H1-2. | ⏳ |
| H2-8 | **Security review pass** | Run `/security-review` on the converged surface; add CodeQL findings to backlog; document the threat model (impersonation, role escalation, money paths, stranger-contact). | 🔴 |
| H2-9 | **Self-escalation guards** | Verify DB triggers still prevent self-promotion of `community_role`, `web_role`, zaps/gems/rank/amplitude on every write path after convergence. | ⏳ |

**Done when:** all high-traffic paths are DB-enforced with passing policy tests, the authz CI guard
has no unjustified gaps, erasure/export works, and a security review is on file with no open highs.

---

## 7. Phase H3 — Performance & scale architecture

**Why:** the goal is Facebook-class headroom. The bones support it; these are the specific
bottlenecks identified between ~1M and ~10M users, fixed behind seams that already exist.

| ID | Task | Detail | Bites at | State |
|---|---|---|---|---|
| H3-1 | **RLS subquery cost** | Permission predicates like `scope_id IN (SELECT id FROM circles WHERE host_id = ...)` run per-row. Cache the caller's circle/hub/tuned-channel IDs in the session/JWT claims (or a fast helper) so policies and RPCs stop re-deriving them. Re-measure against H0-6 plans. | ~1M | 🔴 |
| H3-2 | **Index audit & fill** | From H0-1 advisors: add covering indexes on hot FKs and sort keys (`(profile_id, created_at)` pagination, scope filters); add GIN full-text indexes to `crm_activities.body`, `network_contact_notes.body`, and search-heavy text columns. | ~1M | 🔴 |
| H3-3 | **Geocoding provider upgrade** | Nominatim is ~1 req/s global and serialized in-process; member-created events at volume will choke. Swap to a paid geocoder (Mapbox/Google) behind the existing `lib/events/geocode-provider.ts` seam; keep keyless as dev fallback. | ~1M events | 🔴 |
| H3-4 | **Ledger partitioning + archival** | `zap_transactions`, `gem_transactions`, `engagement_events`, `qr_scans` grow unbounded. Time/season-partition the append-only tables and archive cold partitions to a warehouse; keep read-model balances hot. | ~10M | 🔴 |
| H3-5 | **Feed read-model** | Move from per-request reach computation toward a denormalized feed read-model + hybrid fan-out as load demands (SCALE-ARCHITECTURE). Trigger on measured feed latency, not speculatively. | ~10M | 🔴 |
| H3-6 | **Media + CDN strategy** | Single Supabase bucket + Next image optimizer is fine now. Plan migration to a dedicated CDN (Cloudflare/R2 or S3+CloudFront) with signed URLs for private buckets, before image bandwidth dominates cost. | ~10M | 🔴 |
| H3-7 | **DB connection pooling & read replicas** | Confirm pooler config for serverless connection storms; introduce read replicas for analytics/heavy reads when primary load demands. | ~10M | 🔴 |
| H3-8 | **Realtime scaling review** | Audit Supabase Realtime/presence usage against connection limits; confirm the heartbeat-presence choice (ADR-009) holds; plan Broadcast/sharding if concurrency climbs. | ~10M | 🔴 |
| H3-9 | **Caching layer expansion** | Expand Upstash/Redis use for expensive derived reads (capability sets, density, directory facets) with explicit invalidation; only on measured signal. | metric | 🔴 |
| H3-10 | **AI cost controls at scale** | Move Vera from daily caps toward per-user/per-minute budgets; confirm Haiku-default + gateway swap; meter token cost per feature, not just per ledger. | metric | ⏳ |
| H3-11 | **Vector index maintenance** | Schedule HNSW reindex/maintenance for `profiles`, `events`, `practices`, resonance embeddings; backfill the unpopulated embedding columns flagged in ADR-438. | ~1M | 🔴 |
| H3-12 | **Single-region / residency plan** | Document the path from single-region Postgres to geo-distribution / data residency (latency + compliance) so it is a known, not a surprise. | future | 🔴 |

**Done when:** the H0-6 hot paths beat their SLO at 10× current load in a load test, no unbounded
table lacks a partition/archival plan, and geocoding no longer serializes on a 1 req/s provider.

---

## 8. Phase H4 — Reliability & operational excellence

**Why:** "doesn't cause me problems in the future" is mostly an operations property. This phase
buys the safety net.

| ID | Task | Detail | State |
|---|---|---|---|
| H4-1 | **Cron retry/backoff + DLQ** | Each scheduled job gets idempotent retries and a dead-letter path; failures alert (built on H0-5). | 🔴 |
| H4-2 | **Email queue resilience** | The `process-queue` worker (every 2 min) gets retry + DLQ + lag alerting; a backlog must be visible, not silent. | 🔴 |
| H4-3 | **Stripe webhook retry/DLQ** | `stripe_webhook_events` exists; add explicit retry + dead-letter + alerting so a failed webhook never strands an order in `pending`. | 🔴 |
| H4-4 | **Automated test coverage on critical paths** | Unit tests exist; add **integration/e2e** coverage on the money paths (checkout, payout, refund), the reward paths (award/reverse/season reset), and authz (role escalation, RLS). A refactor must not silently break payments. | 🔴 |
| H4-5 | **Make DB policy tests required CI** | `db-tests.yml` (pgTAP RLS) becomes a required check once drift (H0-2) is reconciled. | ⏳ |
| H4-6 | **Backup & disaster recovery** | Verify Supabase PITR/backup tier; document and rehearse a restore; define RPO/RTO. | 🔴 |
| H4-7 | **Runbooks** | Write incident runbooks: cron failure, queue backlog, webhook failure, DB degradation, AI outage, deploy rollback. Link from LAUNCH.md. | 🔴 |
| H4-8 | **Structured logging + audit completeness** | Confirm `admin_audit_log` covers all privileged actions; add structured request logging keyed by route/entity for triage. | ⏳ |
| H4-9 | **Load & soak testing harness** | A repeatable load test (seeded data, scripted flows) so H3 claims are provable and regressions are caught. | 🔴 |

**Done when:** every async/scheduled/webhook path has retry+DLQ+alerting, e2e tests cover money +
rewards + authz, a restore has been rehearsed, and runbooks exist for the top failure modes.

---

## 9. Phase H5 — Code quality & maintainability

**Why:** lower the cost and risk of every future change, and make the contract layer truly
mobile-ready.

| ID | Task | Detail | State |
|---|---|---|---|
| H5-1 | **Remove temporary type casts** | Drop the `as unknown as` / untyped-handle casts in `lib/events/*`, digest, journey-plans, partners once types are regenerated (H0-3). | ⏳ |
| H5-2 | **Centralize duplicated authz** | Finish consolidating role-hierarchy checks into `lib/core/roles.ts`; one resolver, no scattered copies. | ⏳ |
| H5-3 | **Page-framework adoption** | Every page composes a kit template AND renders its interior via `<PageModules>`; close the long tail in PAGE-FRAMEWORK §8.4. No hand-rolled layouts, no `text-[Npx]`, tokens only. | ⏳ |
| H5-4 | **Docs reconciliation** | Fix the known stale docs (ARCHITECTURE.md still lists shadcn; Notion drift on geography/tables/Stripe). Run `/sync-docs`. Repo code + migrations win. | 🔴 |
| H5-5 | **Dependency hygiene** | Run the `maintenance` skill: outdated deps, advisories, lint/build/test; schedule it. No silent major bumps. | 🔴 |
| H5-6 | **Naming-collision cleanup** | Resolve the flagged "templates" collision (outer page shells `@/components/templates` vs inner layouts `lib/widgets/templates.ts`). | ⏳ |
| H5-7 | **Contract layer mobile-readiness audit** | Audit `lib/contract/` view-models + the capability resolver for any Next/Supabase/UI coupling; confirm every surface mobile needs has a presentation-neutral RPC shape. **This is the gate for M1.** | 🔴 |
| H5-8 | **Dead-code & retired-table drop** | Drop dormant tables after their deprecation window (e.g. `quest_*` once `quest_outcomes()` is retired); remove dead engines. | ⏳ |

**Done when:** the type casts are gone, authz is centralized, the page framework is fully adopted,
docs match code, and the contract layer passes its mobile-readiness audit.

---

## 10. Phase F0 — Finish the web foundation to launch quality

**Why:** the directive is a fully featured, hardened **website** before mobile. This phase closes
the in-flight 🟡 work to launch quality. It overlaps H5 and may begin once H1–H4 are green.

| ID | Task | Detail | State |
|---|---|---|---|
| F0-1 | **Reward economy final values** | Confirm gem/zap amounts, `nodes.zaps_value`, season config, and the ADR-438 auto-valuation are live and balanced via `zap_config`/`gem_config`. | ⏳ |
| F0-2 | **`practice.verified` from every real path** | Logged practice + verified node check-in + event attendance all emit the North-Star event; add optional host/peer verification layers. | ⏳ |
| F0-3 | **Practice library at scale** | Execute the ADR-438 build (faceted server search, keyset pagination, remix lineage, embedding backfill, Dashboard admin workspace, primary/secondary Pillar split). | ⏳ |
| F0-4 | **Beta-experience polish** | Profile richness, @mention notifications, friend suggestions, optional map layer on proximity discovery. | ⏳ |
| F0-5 | **Embedded admin completion** | Finish the inline tuning layer (Layout/template editor, Vera-tone tuner), per-page Stats, the server-composed `@admin` slot; retire deep-linked `/admin/*` where superseded. | ⏳ |
| F0-6 | **Events go-live** | Apply the 8 additive event migrations, regenerate types, drop casts, run the finalize runbook (DEVELOPMENT-MAP "Events go-live"); set the standalone-events moderation policy (gated by F2). | 🔴 |
| F0-7 | **Accessibility pass (WCAG AA)** | Audit color-contrast (DAWN tokens already mind amber-on-white), keyboard nav, focus states, ARIA, screen-reader flows across templates. | 🔴 |
| F0-8 | **SEO/AEO completeness** | Verify JSON-LD coverage, sitemaps, discover hubs, OG images, and AI-answer optimization per CONTENT-VOICE §SEO. | ⏳ |
| F0-9 | **PWA / offline polish** | Service worker, install prompts, offline states; groundwork that also informs mobile. | ⏳ |
| F0-10 | **Loading, empty & error states** | Full suite of skeletons, error boundaries, and in-voice empty states across every template (UX-03→05 backlog). | 🔴 |
| F0-11 | **Performance budget on key pages** | Core Web Vitals budgets enforced in CI for the marketing + top member pages. | 🔴 |

**Done when:** a stranger can sign up → discover → join → attend → earn end-to-end on
`frequencylocal.com`, every page is accessible and resilient, and WAM is live on analytics.

---

## 11. Phase F1 — Money foundation (infrastructure, plan-as-if-live)

**Why:** the owner directive is to plan as if entities are live. Build the money substrate as real
infrastructure now; flip the go-live switch when the entities are legally active. Nothing charges
until `billing_live` is on.

| ID | Task | Detail | State |
|---|---|---|---|
| F1-1 | **Entity partition + financial ledger** | `entities` + entity-tagged `financial_transactions`; money hard-partitioned Foundation vs Labs, never commingled (ADR-029/032). | 🔴 |
| F1-2 | **Persona axis** | `profile_personas` (multi-select hats, per-persona verification state + Stripe Connect binding) so one human can be member + practitioner + affiliate (ADR-030/034). | 🔴 |
| F1-3 | **Stripe Connect module** | `create_checkout` / `process_payout` / `record_commission`; destination charges + application fee; sandbox-verified end to end. | 🔴 |
| F1-4 | **Module registry formalized** | Verticals self-declare data/RPCs/capabilities/nav/engagement hooks/entity (ADR-033); core stops changing per vertical. | ⏳ |
| F1-5 | **Subscription-as-bridge entitlement** | Lab membership rolls up website tiers (ADR-035); the resolver treats it as superseding. | 🔴 |
| F1-6 | **Pricing entitlements live-path** | The pricing layer exists OFF by default (ADR-362/363/364); finish dunning/proration and the deferred gates so flipping `billing_live` is safe. | ⏳ |
| F1-7 | **Inter-entity bridge ledger** | Record audited inter-entity transfers regardless of mechanism (ADR-038); the exact legal mechanism is a counsel decision, the ledger is built either way. | 🔴 |

**Done when:** a sandbox checkout + payout runs end to end with money correctly entity-partitioned,
and the entire layer is dormant-safe behind `billing_live = off`.

---

## 12. Phase F2 — Trust & safety elevation

**Why:** the whole promise is *safe* real-world connection, and the roadmap moves toward
stranger-facing surfaces (roommate finder, public events, marketplace). Current T&S is a floor
(soft-delete, suspension, blocking). This phase makes it load-bearing and **gates** the riskier
verticals in F3.

| ID | Task | Detail | State |
|---|---|---|---|
| F2-1 | **Moderation escalation workflow** | Report queue → triage → action ladder → appeal; moderator roles beyond janitor; audited. | 🟡 |
| F2-2 | **Unified trust score** | Derived reputation read-model across host/marketplace/roommate/practitioner sub-scores (ADR-247). | 🔴 |
| F2-3 | **ID verification groundwork** | Pluggable identity verification for high-trust, stranger-facing flows (roommate, in-person meetups with non-connections). | 🔴 |
| F2-4 | **Standalone-events moderation policy** | The gate (ADR-254) before public non-Circle events open to discovery; unblocks F0-6 discovery. | 🔴 |
| F2-5 | **Safety UX** | Block/report reachable everywhere, safe-meeting guidance, no-stranger-DM defaults preserved, abuse rate-limits (ties to H2-6). | ⏳ |

**Done when:** there is an escalation path with moderator roles, a trust score the riskier
verticals can read, and ID-verification available for stranger-facing flows.

---

## 13. Phase F3 — Feature verticals (growth)

**Why:** with the foundation hardened and the money + safety substrates in place, grow the mission.
Each is a registry module (F1-4), not a core rewrite. Order follows DEVELOPMENT-MAP Stage B→D,
re-gated by trust & safety.

| ID | Vertical | Entity | Gate | State |
|---|---|---|---|---|
| F3-1 | **Programs** (frameworks/trainings to start/run/maintain circles) | Foundation | none | 🟡 |
| F3-2 | **Local Marketplace** (geolocated, no fee, no in-app pay) | Foundation | F2 (stranger contact) | ✅ v1 · 🟡 |
| F3-3 | **Donations & Grants** | Foundation | F1 (Foundation rail) | 📐 |
| F3-4 | **The Collective** (paid meditations/courses; first commerce vertical) | Labs | F1 | 📐 |
| F3-5 | **Affiliate** (referral → commission → payout) | Labs | F1 | 📐 |
| F3-6 | **Lab Spaces** (gym-style SaaS; Lab membership; rollup) | Labs | F1 | 📐 |
| F3-7 | **Organizations / Partners / Practitioners** | shared/partner/Labs | F1 + F2 | ⏳ |
| F3-8 | **Events Listings** (discoverable directory beyond circles) | shared | F2-4 | 📐 |
| F3-9 | **Roommate / House finder** (ID-verified, high-trust) | shared | **F2 (hard gate)** | 📐 |
| F3-10 | **Sponsor-a-membership** | Foundation | F1 | 📐 |

**Done when:** revenue flows on the Labs rail and donations on the Foundation rail, each reconciled
per entity, every high-value reward tied to `practice.verified`, and every stranger-facing vertical
sits behind F2.

---

## 14. Phase M1 — Mobile app (the primary surface)

**Why:** mobile is the eventual primary doorway and the reason the contract layer exists. It starts
only after the web foundation (F0) is complete and the contract passes its mobile-readiness audit
(H5-7).

| ID | Task | Detail | State |
|---|---|---|---|
| M1-1 | **Expo/React Native shell** | Consume the identical RPC contract + capability sets + design tokens; no business-logic rewrite. | 📐 |
| M1-2 | **Native capabilities** | Push (FCM/APNs), native QR/NFC, geofencing, phone-to-phone bumps (NFC mutual confirm). | 📐 |
| M1-3 | **Device attestation** | Play Integrity / App Attest on the physical-world earning paths (server-authoritative verification, never trust device). | 📐 |
| M1-4 | **In-app payments** | Stripe Connect for practitioner/subscription flows within store-policy constraints. | 📐 |
| M1-5 | **Sync engine pilot** | Postgres-backed sync (PowerSync/Electric) on one surface for instant UI; expand on signal. | 📐 |
| M1-6 | **Store submission & release** | App Store / Play Store pipelines, phased rollout, crash reporting tied into H0-4. | 📐 |

**Done when:** mobile reaches relevant parity by *assembling* the contract (not re-implementing it),
with native earning paths verified server-side.

---

## 15. Continuous tracks (run across every phase)

| Track | What it means |
|---|---|
| **Security** | Every PR: authz guard green, no new secret exposure; periodic `/security-review` + CodeQL triage. |
| **Scale-on-metrics** | Pooling → replicas → denormalized read-models → partitioning → Redis/search, added only against measured load (SCALE-ARCHITECTURE). |
| **Docs** | DOCS-PROTOCOL routing on every change: technical → git `docs/`, operator → Notion, member → help center. ADR for every decision. |
| **Dependency hygiene** | Scheduled `maintenance` skill; no silent major bumps; keep Next/React/Supabase current and intentional. |
| **Voice & framework** | NAMING.md + CONTENT-VOICE.md on every string; PAGE-FRAMEWORK.md on every page; PRESENTATION.md on every artifact. |

---

## 16. Definition of done for the whole program

The foundation is "world-class and scale-ready" when:

1. ✅ Advisors clean, repo == prod schema, no unconstrained polymorphic references.
2. ✅ All high-traffic paths DB-enforced (RLS + DEFINER RPCs) with passing policy tests; security
   review on file with no open highs.
3. ✅ Hot paths beat SLO at 10× current load in a load test; every unbounded table has a
   partition/archival plan; geocoding/media/realtime scale paths are decided.
4. ✅ Every async/scheduled/webhook path has retry + DLQ + alerting; e2e tests cover money,
   rewards, and authz; a restore has been rehearsed.
5. ✅ Contract layer passes mobile-readiness; type casts gone; page framework fully adopted; docs
   match code.
6. ✅ Web foundation complete (F0): accessible, resilient, SEO-complete, WAM live.
7. ✅ Money + trust-and-safety substrates built and dormant-safe, ready to switch on when entities
   are legally live.

Only then do the growth verticals (F3) and the mobile app (M1) get the clean, scalable substrate
this plan exists to guarantee.

---

## 17. Open decisions (carried, for counsel / owner — not guessed)

1. **Which entity sells the paid membership tier** (charitable-purpose line). Architecture supports
   either via `entity` + `revenue_type` (ADR-031). Decide before F1 go-live.
2. **Inter-entity value flow mechanism** (for-profit→Foundation donation vs services agreement).
   Ledger is built regardless (F1-7, ADR-038); counsel sets the mechanism.
3. **Membership dues vs donation language + deductibility math** (UBIT on game revenue). Counsel.
4. **Web's long-term role once mobile leads** (full parity vs lighter funnel). Owner, before M1
   scope-lock.
5. **Data residency posture** (single-region vs geo-distributed) and the compliance bar that forces
   it (H3-12).
