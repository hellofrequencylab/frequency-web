# Open threads — the live development tracker

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
| A1 | **Events-catalog migration wave** | 🧑 (I can apply via Supabase MCP on your go-ahead) | **UNAPPLIED to prod** — `event_dispatches` + `event_post_reactions` tables **absent**; the events-geo / `event_cover_theme` migrations not stamped. Repo files: `20260625030000_*`(geo) · `20260625040000_event_dispatches` · `20260625050000_event_cover_theme` · `20260626000000_event_post_reactions`. Code already targets them (62 `as unknown as` casts) → the geolocated Catalog / Dispatches / Boops / standalone public events feature is **dark**. | Decide apply strategy (a prior apply caused an outage). Recommend: apply each migration in order via MCP, verifying after each, then regenerate `lib/database.types.ts`. **Confirm before I run it.** |
| A2 | **Migration-ledger drift** | 🧑/🤖 | Prod's last stamp is `20260615125545`; repo files run to `20260626120000` — same content applied under renumbered stamps (apply-on-merge). Not breaking, but it compounds and masks A1. | A `migration repair` to align `schema_migrations` stamps with repo filenames; then enforce the deploy gate. |
| A3 | **Go live on Stripe** | 🧑 | Code path complete (recorders append to `financial_transactions`); ledger has **0 rows** because Stripe isn't live + no purchases. | Configure Stripe keys + `STRIPE_WEBHOOK_SECRET`, run Connect onboarding, set `host_payouts_enabled`. |
| A4 | **Config / env switches** | 🧑 | Much of AI/comms/payout stack inert without them. | Set `ANTHROPIC_API_KEY` + flip `platform_flags.ai_enabled`; `RESEND_WEBHOOK_SECRET`; VAPID push keys; `NEXT_PUBLIC_SITE_URL`/app URLs; OAuth redirect URLs; enable auth leaked-password protection + secret-scanning push-protection. |
| A5 | **Submit sitemap** | 🧑 | `app/sitemap.ts` is live + now includes partners. | Submit to Google Search Console + Bing; verify `frequencylocal.com`. |
| A6 | **`spatial_ref_sys` RLS advisory** | 🧑 | PostGIS system reference table flagged (RLS off). | Known/expected — do **not** blanket-enable (would break PostGIS). Acknowledge + ignore, or add a read-only policy if desired. |

## B. 🟡 In-repo — I can build (working down this list)

| # | Thread | Size | Note |
|---|---|---|---|
| B1 | Stream Home + `/discover` with `<Suspense>` | M | The one real perf miss (they block on Supabase before first byte). PAGE-FRAMEWORK §5. |
| B2 | Wire `pnpm test:rls` into CI | M | A job that boots Postgres → applies migrations → `supabase test db` (ADR-275). Needs the Actions infra, but the workflow is in-repo. |
| B3 | Vertical-registry rail (step 2) | L | Admin dock is registry-dispatched; the right rail is still hardcoded prefix-match (ADR-250 "sequence is law"). |
| B4 | Link the public partner directory into Discover nav | S | Kept out of shared `DISCOVER_NAV` to avoid member-vs-public dual-surface; needs a public-only nav slot. |
| B5 | Prune the ~19 documented dead exports | S | Listed in the audit; some are intentional seams (Journey runs, trust) — keep those. |
| B6 | QR-logo SSRF fetch-time IP pinning | S | Defense-in-depth vs DNS rebinding (ADR-274 shipped the literal-IP block). |
| B7 | CSP enforce + nonces on inline theme/JSON-LD | M | Baseline CSP is report-only today. |
| B8 | Extend `check:authz` to `lib/` mutation helpers | M | Complementary to the ADR-275 runtime scoping tests. |
| B9 | SEO: `/discover/practices`, dynamic OG on pillars, seeker-track articles | M | Audit P2/P3 growth surfaces. |

## C. ⏳ Seams to activate — built, empty in prod (need flows + a little owner)

| # | Thread | State | To light it up |
|---|---|---|---|
| C1 | Money ledger | `financial_transactions` = 0 rows | Flows from A3 (real purchases) start recording automatically. |
| C2 | Trust score | `trust_signals`/`trust_scores` = 0 rows; few emitters | Route marketplace/moderation/verification to emit signals + add the SECURITY DEFINER read RPC + recompute job. |
| C3 | Journeys v2 | `journey_runs`/`journey_enrollments` = 0 rows | Seed a curriculum + launch one Circle cohort to prove the loop. |
| C4 | Personas | `profile_personas` = 0 rows | Onboard the first verified business/practitioner; per-persona Stripe binding still stubbed. |

## D. ✅ Shipped this session (the trail)

PRs #770–#778, all merged to `main`:
- #770 module-assignment engine (ADR-270) · #771 scope cascade + per-module role gate (ADR-271) · #772 CodeQL property-injection fix
- #773 interior templates + slot-assignable modules (ADR-272) · #774 content-aware side rail (ADR-273)
- #775 full-site audit + security hardening (ADR-274) · #776 `/llms-full.txt` + per-article help OG
- #777 authz test harness (ADR-275) · #778 public partner directory + LocalBusiness (ADR-276)

_(This file is the live index; move items between sections as they progress and add the PR to §D when they land.)_
