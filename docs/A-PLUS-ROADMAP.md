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
- 🤖 ✅ **`lib/events/*` `untyped()` pattern dropped** — the regenerated types let 7 readers (questions · capacity · rsvp-depth · dispatch · dispatch-audience · reactions · geocode) use the typed admin client + typed `nearby_events`/`set_event_geog` RPCs, retiring the `untyped()` escape hatch and the blanket `as unknown as Row` casts (tsc + 36 events tests green). Remaining casts are *justified* escape hatches kept on purpose: `claim-trust.ts` (dynamic `from(table)`), `cohosts.ts` (embedded-join shape), `event-drafts.ts` (non-literal `COLS` projection). (done)
- 🤖 ◻️ Drop the remaining `as unknown as` row casts outside events. **Done so far:** the `createAdminClient() as unknown as SupabaseClient/Db` *client*-level casts in `page-settings/{store,actions}.ts` + `connections/introductions.ts` (now that `page_settings`/`friendships`/`introductions` are typed). Remaining: per-row casts in digest, journey-plans, partners, … where the generated types line up (tsc-gated, per-file). (S)
- 🤖 ✅ **Verified-dead exports pruned** — removed 12 functions + `HOSTING_AMPLITUDE_ACTIONS`/`_MULTIPLIER` (`getConsentScope`, `typeIconKey`, `priorityChipClass`, `getStreakFreezeEarnedAt`, `canDecodeQr`, `getRealCallerWebRole`, `myListings`, `hasTag`, `getMyEntryPoint`, `listEntryPointsByCampaign`, `draftInputFromExtraction`, `canAccessGrowthStudio`) after a full-repo reference check (tsc + eslint + 16 covered tests green). **`buildFirstTouch` was a FALSE POSITIVE — kept** (it's live in `proxy.ts:84`). `canAccessGrowthStudio` verified redundant (the `/admin/growth` route guards itself via `requireAdmin('admin', { staff: 'marketing' })`). KEPT the in-progress seams (`enrollInRun`, `listRunsForCircle`, `getTrustScore`, `getSpaceBySlug`, `verticalAdminModules`, `savePageDraft`). (done)
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
- 🤖 ◻️ Add unit coverage on the highest-value untested paths: the economy (zaps/gems award math), the billing recorders (ledger), the capability resolver. **Started:** the gem-store fulfillment classifier (`classifyRedemption`, ADR-280) is extracted to `lib/store/fulfillment.ts` + unit-tested (a regression guard for the silent-Gem-loss bug). The pure cores (zaps, rewards rules, season ranks, access matrix) are already covered; the remaining gaps are async-DB orchestration (needs the recorder harness). (M)

## 5. SEO / AIO → A+
- ✅ `llms-full.txt`, per-article help OG, partner LocalBusiness, public `/discover/practices`.
- 🧑 ◻️ **LocalBusiness/Organization for The Lab** — the single most on-brand local-SEO lever — needs The Lab's real **street address + social URLs** (owner data + the city-level-privacy decision, ADR-186). (S once data is provided)
- 🤖 ✅ **Browse-by-Pillar** (ADR-281) + **Practice slugs** (ADR-282) + **per-entity OG images** — dynamic `opengraph-image` routes for the practice / partner / Pillar detail pages (branded card, entity title, no remote-font fetch, `.catch` fallbacks), mirroring the `events/[slug]` OG pattern.
- 🧑 ◻️ **Light the public practice library** — there are **0 `is_public` practices in prod**, so the directory, Pillar pages, and detail pages render empty despite being crawlable. The SEO value of ADR-279/281/282 is real but **dark until an operator publishes practices**. The affordance already exists — flip practices public via the `is_public` toggle on **`/admin/content`** (`content-controls.tsx`). Pure owner action, no code. (🧑 owner)
- 🤖 ◻️ Seeker-track pillar article cluster (5 pain-first pieces) — content, on the CONTENT-VOICE canon. (M)
- 🧑 ◻️ Set `NEXT_PUBLIC_SITE_URL` in prod; submit the sitemap to Search Console + Bing. (S)

## 6. Performance → A+
- ✅ Home live-proof band now streams (ADR — B1).
- 🤖 ✅ Migrate raw `<img>` → `next/image` for LCP/bandwidth (per-surface, **host-verified** — `next/image` throws at runtime on a host outside `remotePatterns`). **Migrated (host confirmed safe):** the 7 list avatars, the circle cover (`site-media`), the **profile header** (`avatars` bucket via `uploadHeader`), the **journey covers** (seed/demo = picsum, configured). **Left as raw `<img>` ON PURPOSE — freeform-URL inputs (any host → would throw):** channel cover (staff-set, no upload action), market listing images (freeform URL textarea), practice `header_image` (freeform URL input). **Wrong-tool (also kept raw):** blob/data upload previews, `/api/qr`, map overlays, OG `ImageResponse` `<img>`s, the operator brand-mark logo. (done)
- 🤖 ✅ **Circles list bounded** — `app/(main)/circles/page.tsx` fetched unbounded; capped at 500 (filters run server-side over the returned set, so the cap bounds the scan without breaking facets) + a "showing the first 500" notice when hit. **People** = a redirect to `/network` (not a separate unbounded list). (done)
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
Intentional stubs / dormant seams (flagged so they're never silently forgotten). A fresh
read-only trail sweep (2026-06-15) confirmed these and is folded in below; false positives
(`page_settings.status`/`visibility_role` and `qr_codes.style` ARE wired; `app/(main)/admin/ai/*`
is a live shared module library imported by the `vera-ai` page, **not** an orphan to delete)
were dropped after spot-checks.

**Fixed this pass**
- 🤖 ✅ **Gem-store silent redemption loss** — `redeemItem` charged Gems but applied only cosmetics, so the `membership-1mo`/`3mo` credit SKUs ate Gems for nothing. Refused defensively + the two SKUs deactivated (ADR-280); perks now read "Recorded ✓". The *real* membership-credit grant + an operator "redemptions to honor" queue remain **A3/Stripe-gated** follow-ups.

**Confirmed dormant seams (located, in-repo)**
- 🤖 **Member theming switcher** (M) — `lib/theme/cookie.ts` ships `serializeThemeCookie()`/`THEME_COOKIE_ATTRS` but **no UI writes the cookie**; `structureFor()` (`lib/theme/structure.ts`) has zero non-test callers. The axis is built + tested, never consumed.
- ✅ **`resolvePageChrome` was a FALSE POSITIVE** (corrected after verifying) — operator rail overrides ARE live: `(main)/layout.tsx` loads `loadChromeOverrides()` and `app-shell.tsx` applies `mergeChrome(railFor(pathname), chromeOverrides, pathname)` per render. `resolvePageChrome` is just an unused server-side convenience twin; only its doc comment was stale ("shell does not call this yet"), now fixed. No render gap. (no action needed)
- 🤖 **`savePageDraft` server action unwired** (S) — `app/edit/actions.ts:36` ("not yet wired to a UI button; kept for parity"); the draft-save backend has no caller.
- 🤖 **Entry-point flyer/PDF designer** (M) — `entry-points-client.tsx:321` ("Flyer downloads are turned off for now"); QR PNG/SVG stay, the flyer pipeline is unbuilt.
- 🤖 **Messages/Channels Phase B** (M) — DMs are 1:1 only; group chat is a private room; channel rooms are read-open with posting gated. The multi-party/group-DM evolution is staged, not finished.
- 🤖 **`stewardships` outpost forward-compat** (L) — `role='outpost_lead'`/`scope_type='outpost'` baked into CHECK constraints (P1.5 parked); `lib/core/stewardship.ts:87` makes `outpost_lead` a no-op, nothing writes them.
- 🤖 **`project` walkthrough trigger** — `lib/walkthroughs.ts` `UNWIRED_TRIGGERS`; a `project` walkthrough never fires (no project concept). Part of the larger **Walkthroughs Phase B** (in-app triggering/rendering unbuilt, M).
- 🤖/🧑 **Two deterministic-only marketing drafters** (M each) — `lib/marketing/market-read.ts` + `lib/marketing/content.ts` ("a live Claude operator slots in behind it"); the concrete seams behind §7's live-Claude line (mirror the live winback drafter; needs the key).
- 🤖 **Engagement currency capture/reward orchestration** (M-L) — `lib/engagement/currency.ts:10`; gems/zaps **routing** is wired, the at-scale capture/reward engine that consumes it is deferred.

**Ledger-correctness gaps (matter the moment Stripe is live)**
- 🤖 **Membership-tier entity tagging** (S) — `20260618…_entity_partition…:92` defers tagging `membership_tier` dues with entity + revenue_type; tier dues aren't entity-attributed.
- 🧑/🤖 **Donation `revenue_type` unused** — enumerated in `lib/finance/record.ts`, no capture UI/webhook (Donations vertical, after PMF + Foundation status).
- 🧑/🤖 **Affiliate commission ledger** — `lib/qr/referral.ts` grants **zaps only**; the commission→payout half is absent (after PMF).

**Known stubs (unchanged)**
- 🧑 **SMS send path** (`lib/comms/sms.ts`) — `TODO(SMS legal track)`; stubbed until A2P/legal.
- 🧑 **Teaser / paywall gate** (`lib/teaser.ts`, `TEASER_GATE_ENABLED=false`) — flip on when paid tiers go live.
- 🤖/🧑 **Coming-soon nav** (`lib/nav-areas.ts`) — Website · Hook Network · Finances → `/coming-soon`.
- 🧑/🤖 **Empty seams** — `financial_transactions`/`trust_signals`/`journey_runs`/`profile_personas` applied, 0 rows (need flows + a launched cohort).
- 🤖 **`page_revisions` rollback** (M) — greenfield (no table/code exists yet); a build, not a "wire-up".
- 🧑 **Beta-induction subsystem** (`app/onboarding/beta/**`, `lib/onboarding/beta-*`) — "TEMPORARY, deleted at launch"; a deliberate teardown someone owns at launch.
- 🤖 **"Temporary" admin-reorg redirects** (S) — `next.config.ts:74-90` (`/crm`·`/marketing`·`/growth`, `permanent:false`); revisit when the final mapping is decided.

**Tracker wording corrections**
- **Push (P1.4) already shipped** — `lib/notification-preferences.ts:5` says "hasn't shipped"; in fact `components/push/registration.tsx` is mounted, `public/sw.js` + `lib/push.ts` send, and the settings form enables the channel. Push is fully wired, gated only on VAPID keys (A4). Stale comment + an unused disabled-state branch to prune.
- **CSP already enforced** (B7/ADR-170) and the **`page_settings`/`qr_codes`/`admin/ai` "seams" are actually wired** — see the header note.

## 10. Bottom line — what code can reach vs what needs you
- **Code can reach A+:** code-health, security (+ two owner toggles), performance, docs, and most of SEO.
- **Needs you (no code path):** **money go-live** (the big one), The Lab's address/socials for LocalBusiness, the prod env/config switches, secret-scanning/leaked-password toggles, sitemap submission, and applying the perf/RLS DB migrations.
- **Needs infra/scale:** Sentinel daemon, the `db-tests` CI service, the larger verticals (PMF + legal).

I'll work the 🤖 items down one at a time (each its own PR, tsc/eslint/test-gated, preview-checked), keep this file + `OPEN-THREADS.md` current, and surface each 🧑 item as we reach it so you can unblock it.
