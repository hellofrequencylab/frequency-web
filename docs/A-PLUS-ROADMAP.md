# A+ roadmap — every domain to A+

> The plan to take every element of the platform to **A+**, with **nothing dropped**. Built by
> re-verifying the `docs/AUDIT-2026-06-15.md` grades against the *current* code (several audit
> assumptions were stale — corrected below), folding in `OPEN-THREADS.md`, and a fresh
> undeveloped-trail sweep. Owner legend: **🤖 me** (in-repo) · **🧑 you** (access/data/infra) ·
> **🏗️ infra/large**. Status: ✅ done · ◻️ to do.
>
> **The honest ceiling:** a few A+ targets are *not* reachable by code alone — they need your
> Stripe/ops access, real traction, owner data (e.g. The Lab's address), content, or CI infra.
> Those are tagged 🧑/🏗️ and called out in §10 so they're tracked, not pretended-done.

## 1. Scoreboard (re-verified 2026-06-15, post-session)

| Domain | Audit grade | Now | A+ reachable by code? |
|---|---|---|---|
| Architecture & code health | A− | **A** | ✅ yes (casts + orphans + registry panel-composition) |
| Security | B+ | **A** | ✅ mostly (B8 + owner toggles; CSP already enforced) |
| Testing | B+ | **A−** | 🟡 partly (DB harness needs CI infra + A2) |
| SEO / AIO | A− | **A** | 🟡 partly (Lab LocalBusiness needs owner data) |
| Performance | B+ | **A−** | ✅ yes (images + pagination + streaming) |
| AI fabric | A− | A− | 🟡 partly (Sentinel = infra; live-Claude needs the key) |
| Money / monetization | C+ | C+ | 🔴 **no — owner/traction-gated** (Stripe go-live) |
| Docs / decision hygiene | A | **A+** | ✅ (this roadmap + retire BACKLOG) |

## 2. Architecture & code health → A+

A is current (registry rail composed, types regenerated). For A+:
- 🤖 ◻️ Drop the 8 `as unknown as SupabaseClient` casts + the `lib/events/* untyped()` pattern now the types are regenerated (tsc-gated, per-file). (S)
- 🤖 ◻️ Prune the verified-dead exports (`getConsentScope`, `typeIconKey`, `priorityChipClass`, `HOSTING_AMPLITUDE_*`, `getStreakFreezeEarnedAt`, `canDecodeQr`, `getRealCallerWebRole`, `myListings`, `hasTag`, `buildFirstTouch`, `getMyEntryPoint`, `listEntryPointsByCampaign`, `draftInputFromExtraction`, `canAccessGrowthStudio`). KEEP the in-progress seams (`enrollInRun`, `listRunsForCircle`, `getTrustScore`, `getSpaceBySlug`, `verticalAdminModules`, `savePageDraft`). (S)
- 🤖 ◻️ Finish ADR-278: registry-compose the rail-panel *components* (lift `RailPanelDef` into a lib so a vertical can add a brand-new panel without editing `rail-registry.tsx`). (M)

## 3. Security → A+

**Correction:** the audit said "CSP report-only"; it is **ENFORCED** (ADR-170) — full HSTS, `frame-ancestors`/`base-uri`/`object-src`/`form-action`, a tight `connect-src` exfiltration allowlist, `report-uri` kept. IDORs/injection/SSRF fixed (ADR-274), QR DNS-rebind closed, app-level authz harness shipped (ADR-275). For A+:
- 🤖 ◻️ Extend `check:authz` to scan `lib/` mutation helpers (B8) — catch the confused-deputy class statically. (M)
- 🧑 ◻️ Enable **secret-scanning push-protection** + **leaked-password protection** (GitHub/Supabase settings). (S)
- 🧑/🏗️ ◻️ Run the `db-tests` workflow green and promote it to a **required** gate (needs A2 + a CI run). (M)
- ⏭️ **Not pursuing:** CSP `script-src` nonces — a deliberate tradeoff (nonces force every page dynamic, killing static/ISR; the only soft spot is Next's inline RSC scripts). Documented in `next.config.ts`/ADR-170, not an A+ blocker.

## 4. Testing → A+
- ✅ App-level authz regression harness (ADR-275); 998 unit tests.
- 🧑/🏗️ ◻️ Make `db-tests` (RLS/RPC pgTAP) actually run in CI (Postgres service / Supabase CLI) + go green — gated on A2 (migration-ledger repair) so a fresh apply succeeds. (M)
- 🤖 ◻️ Add unit coverage on the highest-value untested paths: the economy (zaps/gems award math), the billing recorders (ledger), the capability resolver. (M)

## 5. SEO / AIO → A+
- ✅ `llms-full.txt`, per-article help OG, partner LocalBusiness, public `/discover/practices`.
- 🧑 ◻️ **LocalBusiness/Organization for The Lab** — the single most on-brand local-SEO lever — needs The Lab's real **street address + social URLs** (owner data + the city-level-privacy decision, ADR-186). (S once data is provided)
- 🤖 ◻️ Browse-by-Pillar + practice slugs on `/discover/practices`; dynamic per-entity OG images on the discover pages. (M)
- 🤖 ◻️ Seeker-track pillar article cluster (5 pain-first pieces) — content, on the CONTENT-VOICE canon. (M)
- 🧑 ◻️ Set `NEXT_PUBLIC_SITE_URL` in prod; submit the sitemap to Search Console + Bing. (S)

## 6. Performance → A+
- ✅ Home live-proof band now streams (ADR — B1).
- 🤖 ◻️ Migrate the **34 raw `<img>`** (18 in the app) to `next/image` for LCP/bandwidth. (M)
- 🤖 ◻️ Paginate People & Circles (unbounded scans). (M)
- 🤖 ◻️ Profile zap-sum via a SQL aggregate (drop the per-row tally). (S)
- 🧑 ◻️ RLS initplan `auth.uid()`→`(select auth.uid())` ×59 + permissive-policy consolidation ×92 — advisor-flagged, but these are **DB migrations you apply**. (M)
- 🤖 ◻️ `/discover` streaming **iff** it's truly dynamic (it's `revalidate=3600` ISR today — verify before touching). (S)

## 7. AI fabric → A+
- ✅ Vera live + governed, content paths wired, kill switch + ledger, Help RAG.
- 🏗️ ◻️ **Sentinel** scheduled agentic sweeps — needs a cron/GitHub-App runner. (M, infra)
- 🤖/🧑 ◻️ Live-Claude marketing **content** drafts (the Market Read path is deterministic; winback already has the Claude path) — code is in-repo, but only runs once `ANTHROPIC_API_KEY` + `ai_enabled` are on (owner). (M)
- 🤖 ◻️ Vera memory-summarization cron + finish `draft_intro`. (S)

## 8. Money / monetization → A+ (owner/traction-gated)
The **code** is A (entity-partitioned ledger, Connect rails, tiers, recorders wired, types current). The C+ is because **money isn't flowing** — and that is **not a code problem**:
- 🧑 ◻️ **Stripe go-live**: keys + `STRIPE_WEBHOOK_SECRET`, Connect onboarding, `host_payouts_enabled`, then real purchases. The ledger fills automatically. **This is the ceiling on the money grade and it is yours.**
- 🔴 The Collective / Affiliate / Donations / Lab Spaces verticals — after PMF + legal entity. (L each)

## 9. Undeveloped trails — captured so nothing is dropped
Intentional stubs / dormant seams (not bugs — flagged so they're never silently forgotten):
- **SMS send path** (`lib/comms/sms.ts`) — `TODO(SMS legal track)`; provider call stubbed until A2P/legal. 🧑
- **Teaser / paywall gate** (`lib/teaser.ts`, `TEASER_GATE_ENABLED=false`) — flip on when paid tiers go live. 🧑
- **`project` walkthrough trigger** (`lib/walkthroughs.ts`) — `UNWIRED_TRIGGERS`; no project concept yet. 🤖(when the concept exists)
- **Coming-soon nav** (`lib/nav-areas.ts`) — Website · Hook Network · Finances route to `/coming-soon`. 🤖/🧑
- **Walkthroughs Phase B** — in-app triggering/rendering intentionally unbuilt. 🤖 (M)
- **Empty seams** — `financial_transactions` / `trust_signals` / `journey_runs` / `profile_personas` applied, 0 rows (need flows + a launched cohort). 🧑/🤖
- **Member theming switcher** — the four-axis cookie is read but no UI writes generation/skin. 🤖 (M)
- _(updated as the trail sweep + future work surface more — this section is the catch-all.)_

## 10. Bottom line — what code can reach vs what needs you
- **Code can reach A+:** code-health, security (+ two owner toggles), performance, docs, and most of SEO.
- **Needs you (no code path):** **money go-live** (the big one), The Lab's address/socials for LocalBusiness, the prod env/config switches, secret-scanning/leaked-password toggles, sitemap submission, and applying the perf/RLS DB migrations.
- **Needs infra/scale:** Sentinel daemon, the `db-tests` CI service, the larger verticals (PMF + legal).

I'll work the 🤖 items down one at a time (each its own PR, tsc/eslint/test-gated, preview-checked), keep this file + `OPEN-THREADS.md` current, and surface each 🧑 item as we reach it so you can unblock it.
