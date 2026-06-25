# Open threads — the live development tracker

> ▶ **Driving every domain to A+:** see **[`A-PLUS-ROADMAP.md`](A-PLUS-ROADMAP.md)** (the per-domain
> gap analysis + what's code-reachable vs owner-gated). This file is the live per-item tracker.
>
> The single place that tracks **every trail of work in flight, blocked, or queued** so nothing
> is missed. Updated as items move. This is the *active* companion to the detailed lists:
> [`BUILD-LIST.md`](BUILD-LIST.md) (full reconciled backlog), [`AUDIT-2026-06-15.md`](AUDIT-2026-06-15.md)
> (graded audit + §9 master list), and [`DECISIONS.md`](DECISIONS.md) (ADR log).
>
> Owner legend: **🧑 you** (needs Supabase/Stripe/owner access or a product call) · **🤖 me**
> (in-repo, I can build). Status: 🔴 blocking · 🟡 ready/queued · ⏳ later · ✅ done.
> Prod = Supabase project **`azsqfeonabsbmemvddqd`** ("Frequency Community"). Verified 2026-06-15.

## A. 🔴 Owner / ops — blocking, do not lose these

| # | Thread | Owner | Verified state (2026-06-15) | Next action |
|---|---|---|---|---|
| A1 | **Events-catalog migration wave** | ✅ **DONE (2026-06-15, ADR-277)** | **Applied to prod** via Supabase MCP: all 7 migrations (geolocation · standalone public events · rsvp depth · questions · dispatches · cover/theme · post-reactions). 3 latent bugs fixed while applying (KNN `<->` search-path, an anon-executable `set_event_geog` write hole, a superseded-policy duplicate). Tables + columns + RPCs verified present; new tables RLS-on. **`lib/database.types.ts` regenerated** from prod (tsc-clean, additive: events tables + RPCs + page_settings). The `as unknown as` cast removal is now unblocked (incremental, per-file). |
| A2 | **Migration-ledger drift** | 🧑/🤖 | Prod's last *named* baseline lagged the repo; the events wave above is now stamped. Repo files still carry renumbered timestamps vs prod (apply-on-merge). Not breaking. | A `migration repair`/`db pull` to align `schema_migrations` with repo filenames; then enforce the deploy gate. |
| A3 | **Go live on Stripe** | 🧑 | Code path complete (recorders append to `financial_transactions`); ledger has **0 rows** because Stripe isn't live + no purchases. | Configure Stripe keys + `STRIPE_WEBHOOK_SECRET`, run Connect onboarding, set `host_payouts_enabled`. |
| A4 | **Config / env switches** | 🧑 | Much of AI/comms/payout stack inert without them. | Set `ANTHROPIC_API_KEY` + flip `platform_flags.ai_enabled`; `RESEND_WEBHOOK_SECRET`; VAPID push keys; `NEXT_PUBLIC_SITE_URL`/app URLs; OAuth redirect URLs; enable auth leaked-password protection + secret-scanning push-protection. |
| A5 | **Submit sitemap** | 🧑 | `app/sitemap.ts` is live + now includes partners. | Submit to Google Search Console + Bing; verify `frequencylocal.com`. |
| A6 | **`spatial_ref_sys` RLS advisory** | 🧑 | PostGIS system reference table flagged (RLS off). | Known/expected — do **not** blanket-enable (would break PostGIS). Acknowledge + ignore, or add a read-only policy if desired. |
| A7 | **2026-06-25 security migrations** | ✅ **DONE (2026-06-25)** | **Applied to prod** (`azsqfeonabsbmemvddqd`) via Supabase MCP + verified: `lock_down_dashboard_rpcs` (the `dashboard_*_summary` IDOR — `authenticated`/`anon` EXECUTE revoked, now `service_role` only; security advisor cleared), `fix_space_gate_profile_id` (the Space gates + `space_members_read` now resolve via `get_my_profile_id()`), `listings_update_with_check` (WITH CHECK present). Behavior-neutral for the app (it reads via the service role). Repo files `20260818000000/100/200` are idempotent, so a later CLI re-apply is a no-op. | — |
| A8 | **Decide Spaces-SEO + Resonance-launch directions** | 🔴 | Two built-but-blocked features from the survey: networked `/spaces/<slug>` is anon-redirected yet sitemap-advertised (#8); the Resonance Engine has no member opt-in entry point so it dead-ends (#5). | **Product calls** — see [`AUDIT-2026-06-25.md`](AUDIT-2026-06-25.md) Owner-gated #2/#3 before either is wired. |

## B. 🟡 In-repo — I can build (working down this list)

| # | Thread | Size | Note |
|---|---|---|---|
| B1 | Stream Home + `/discover` with `<Suspense>` | M | **Home ✅ done**: the live-proof band (counts/events/posts) now streams in its own `<Suspense>` so `getLiveData` no longer blocks the hero's first byte. `/discover` deferred: it's `revalidate = 3600` (ISR), so its fetch is largely off the request path. Benefit unclear, revisit if it goes dynamic. |
| B2 | Wire `pnpm test:rls` into CI | M | **Workflow added** (`.github/workflows/db-tests.yml`): boots a fresh local Supabase, applies all migrations, runs `supabase test db` (ADR-275). **Manual (`workflow_dispatch`) for now**: a fresh full apply may surface more latent migration bugs until the ledger is reconciled (A2), so it's not a PR gate yet. Run it from the Actions tab; flip on the `pull_request` trigger + mark required once green. |
| B3 | Vertical-registry rail (step 2) | L | **✅ done (ADR-278)**: a vertical now owns its routes' right-rail panels via a `rail` field on its descriptor; `pageRailPanels` consults the registry (`verticalRailRules()`) before the base map. Marketplace migrated as the first adopter. Remaining: registry-compose the rail-panel *components* too (needs `RailPanelDef` lifted into a lib) so a vertical can add a brand-new panel without touching `rail-registry.tsx`. |
| B4 | Link the public partner directory into nav | S | **✅ done**: added "Partners" → `/discover/partners` to `MARKETING_NAV` (the public footer, every public page). Kept out of the shared `DISCOVER_NAV` (in-app + public) to avoid the member-vs-public dual-surface; a public-only header slot is a possible follow-up. |
| B5 | Prune the ~19 documented dead exports | S | Listed in the audit; some are intentional seams (Journey runs, trust), keep those. |
| B6 | QR-logo SSRF fetch-time IP pinning | S | **✅ done**: `inlineLogo` now resolves the host (DNS) and rejects any private/loopback/metadata IP before fetching, closing the DNS-rebind residual (the ADR-274 literal-IP block only covered the hostname). Shared `isPrivateIp` helper; unit-tested. Residual TOCTOU noted (acceptable for a blind, capped, image-only fetch). |
| B7 | ~~CSP enforce~~ + nonces | — | **Correction (double-check):** CSP is already **ENFORCED** (ADR-170) with full HSTS + a tight `connect-src` gate. The only soft spot is `script-src 'unsafe-inline'` — `nonces` are a **deliberate tradeoff** (they force every page dynamic, killing static/ISR), so this is **not pursued**. See A-PLUS-ROADMAP §3. |
| B8 | Extend `check:authz` to `lib/` mutation helpers | M | Complementary to the ADR-275 runtime scoping tests. |
| B9 | SEO growth surfaces | M | **`/discover/practices` ✅ (ADR-279)** + **browse-by-Pillar ✅ (ADR-281)** — public directory, per-practice `HowTo` detail pages, four crawlable per-Pillar landing pages + filter chips, all in the sitemap. Remaining: practice **slugs** (needs a column + backfill), dynamic OG on marketing pillars, the seeker-track article cluster. |

## C. ⏳ Seams to activate — built, empty in prod (need flows + a little owner)

| # | Thread | State | To light it up |
|---|---|---|---|
| C1 | Money ledger | `financial_transactions` = 0 rows | Flows from A3 (real purchases) start recording automatically. |
| C2 | Trust score | `trust_signals`/`trust_scores` = 0 rows; few emitters | Route marketplace/moderation/verification to emit signals + add the SECURITY DEFINER read RPC + recompute job. |
| C3 | Journeys v2 | `journey_runs`/`journey_enrollments` = 0 rows | Seed a curriculum + launch one Circle cohort to prove the loop. |
| C4 | Personas | `profile_personas` = 0 rows | Onboard the first verified business/practitioner; per-persona Stripe binding still stubbed. |
| C5 | Public practice library | **0 `is_public` practices** in prod | The public `/discover/practices` directory + Pillar pages (ADR-281) + slug detail pages (ADR-282) are crawlable but render empty. **Owner action, no code:** flip practices public via the `is_public` toggle on `/admin/content`. |

## D. ✅ Shipped this session (the trail)

PRs #770–#788, all merged to `main`:
- #770 module-assignment engine (ADR-270) · #771 scope cascade + per-module role gate (ADR-271) · #772 CodeQL property-injection fix
- #773 interior templates + slot-assignable modules (ADR-272) · #774 content-aware side rail (ADR-273)
- #775 full-site audit + security hardening (ADR-274) · #776 `/llms-full.txt` + per-article help OG
- #777 authz test harness (ADR-275) · #778 public partner directory + LocalBusiness (ADR-276)
- #779 live OPEN-THREADS tracker · #780 events-wave applied to prod (ADR-277, A1 done)
- #781 Home live-proof band streams (B1) · #782 db-tests workflow (B2) · #783 partner nav (B4)
- #784 QR DNS-rebind hardening (B6) · #785 registry-driven rail (ADR-278, B3)
- #786 public `/discover/practices` (ADR-279, B9) · #787 types regenerated · #788 A+ roadmap

**Full-site survey (2026-06-25, [`AUDIT-2026-06-25.md`](AUDIT-2026-06-25.md)):** 12-slice
fan-out audit + adversarial verify. 8 confirmed HIGH defects (0 refuted), 10 medium, 15 low.
Fixed in-repo: Vera member privilege-escalation, `deactivateMember` janitor gate, cron
constant-time compare, broadcast-editor body loss, `/network` unbounded scan, circle-feed
streaming, retired-link redirect hops, canonical breadcrumb + meta length, three security
migrations. Deferred to owner: A7 (apply migrations), A8 (Spaces-SEO + Resonance launch).

**In flight (this PR):**
- **Gem-store redemption fix (ADR-280)** — `redeemItem` no longer charges Gems for items it can't deliver; the `membership-1mo`/`3mo` credit SKUs are refused + deactivated; perks read "Recorded ✓". The full undeveloped-trail sweep (2026-06-15) is folded into **[`A-PLUS-ROADMAP.md`](A-PLUS-ROADMAP.md) §9** — that section is now the catch-all for every dormant seam.

_(This file is the live index; move items between sections as they progress and add the PR to §D when they land.)_
