# Session Plan — tiered work for sequential cloud sessions

This is an **execution plan**, not a spec. It breaks the audited backlog into
ordered tiers, where **each tier is one Claude Code on the web session**, run in
sequence. Open a new session per tier, paste the kickoff prompt (bottom of each
tier), let it ship a PR, merge, then start the next tier.

Source: full-repo audit on 2026-06-01 (code health, docs, hygiene, roadmap).
Canonical product plan lives in [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md) and
[`BACKLOG.md`](BACKLOG.md); decisions in [`DECISIONS.md`](DECISIONS.md).

## How to run a tier

1. Start a fresh web session on this repo.
2. Paste that tier's **kickoff prompt**.
3. The session reads this file for its tier's full scope, implements, validates
   (`npx tsc --noEmit`, `npx eslint .`, `npm test`), opens a **draft PR**, and
   updates docs per [`DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md).
4. Review, merge, then start the next tier from updated `main`.

## Ordering rationale

Tiers 1–4 **harden the foundation before launch** (this is the "harden → launch"
path in DEVELOPMENT-MAP). Tier 5 is the actual beta launch. Tiers 6–7 are
post-launch product. **If you want to ship beta sooner, you can pull Tier 5
forward to first** — it has no code dependency on Tiers 1–4. The default order
optimizes for a low-risk launch over speed.

| Tier | Theme | Effort | Depends on |
|------|-------|--------|-----------|
| 1 | Quality guardrails (lint + CI) | M | — |
| 2 | Type-safety convergence | L | 1 (CI to verify) |
| 3 | Security hardening (RLS) | L | 2 (trustworthy types) |
| 4 | Reliability & observability | M | 1 |
| 5 | Beta launch | S–M | — (pullable forward) |
| 6 | Analytics & PMF instrumentation | M | 5 (live data) |
| 7 | Product expansion | L | 5 |

---

## Tier 1 — Quality guardrails (lint baseline + CI gating)

**Goal:** A clean lint baseline and a CI gate so no future tier can merge
type/lint/test regressions. Do this first — it protects every tier after it.

**Why now:** `eslint .` currently reports **94 errors + 79 warnings** of
pre-existing debt, and CI does **not** gate on `tsc`/`eslint`/`vitest` today
(only the non-blocking docs-drift warning runs). Every later tier adds code into
that blind spot.

**Scope:**
- [ ] Fix the 94 `eslint` **errors** (warnings can stay or be triaged). Expect
      mostly `@typescript-eslint/no-explicit-any`, `no-unused-vars`, and a
      `react-hooks/set-state-in-effect` in `components/rooms/invite-to-room-button.tsx`.
- [ ] For `any`s that genuinely can't be typed yet, downgrade the rule to `warn`
      in `eslint.config.mjs` rather than leaving hard errors — but prefer real types.
- [ ] Add `.github/workflows/ci.yml` (model it on the existing
      `.github/workflows/docs-drift.yml`) that runs on PRs to `main`:
      `npm ci` → `npx tsc --noEmit` → `npx eslint .` → `npm test`. These **block**.
- [ ] Keep the existing non-blocking `docs-drift` workflow as-is.

**Key files:** `eslint.config.mjs`, `.github/workflows/ci.yml` (new), scattered
fixes across `app/`, `components/`, `lib/`.

**Acceptance:** `npx eslint .` exits 0; new CI workflow is green on its own PR;
`npm test` still 20/20.

**Docs:** Add an ADR to `DECISIONS.md` recording the CI gate + lint policy.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 1 (Quality guardrails)**. Fix the
> eslint errors to get `npx eslint .` to exit 0, add a blocking CI workflow
> (tsc + eslint + vitest) modeled on the existing docs-drift workflow, add an ADR,
> then open a draft PR. Validate with tsc/eslint/test before pushing.

---

## Tier 2 — Type-safety convergence

**Goal:** Eliminate the type-safety debt that hides bugs and makes refactors
unsafe.

**Why now:** ~117 `as unknown as` double-casts and ~27 `any` annotations bypass
the type checker, mostly to paper over Supabase view/RPC return types. Tier 1's
CI gate lets you verify the cleanup didn't regress.

**Scope:**
- [ ] Regenerate Supabase types so generated types match runtime
      (`supabase gen types ...`) and commit them (`lib/database.types.ts`).
- [ ] Replace `as unknown as X` casts with real interfaces / typed query helpers.
      Hotspots: `components/feed/*`, `components/sidebar/right-sidebar.tsx`,
      `app/(main)/admin/*`, `app/(marketing)/beta/actions.ts`, `lib/*`.
- [ ] Replace `catch (err: any)` with `catch (err)` + `err instanceof Error` narrowing.
- [ ] Remove dangerous non-null assertions (`!`) in data paths; use optional
      chaining + guards.
- [ ] Replace `Math.random()` slug generation in `app/(main)/admin/actions.ts`
      with `crypto.randomUUID()`/`nanoid` **plus** a DB uniqueness constraint + retry.

**Acceptance:** Grep shows no new `as unknown as` introduced; `as unknown as`
count materially reduced; `tsc`/`eslint`/`test` green.

**Docs:** Note the type-generation workflow in `docs/ARCHITECTURE.md` (or
`DATABASE.md`); ADR if you change the type-generation convention.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 2 (Type-safety convergence)**.
> Regenerate Supabase types, replace `as unknown as`/`any`/non-null-assertion
> patterns with real types, fix the `Math.random()` slug generation, update docs,
> and open a draft PR. Validate tsc/eslint/test.

---

## Tier 3 — Security hardening (RLS)

**Goal:** A verified authorization boundary — prerequisite for mobile and any AI
agent autonomy.

**Why now:** Many hot reads go through the service-role admin client (bypassing
RLS). With types now trustworthy (Tier 2), lock the boundary and prove it with
tests.

**Scope:**
- [ ] Create an RLS policy test suite at `supabase/tests/policies.test.ts` (new
      dir). For each sensitive table (profiles, circles, memberships, events,
      messages, posts, practices): one positive, one negative, one scope case.
- [ ] Wire it into `npm test` (extend `vitest.config.ts` if needed; document how
      to point it at a local Supabase).
- [ ] Convergence on the highest-traffic reads — `app/(main)/feed/page.tsx`,
      `app/(main)/circles/[slug]/page.tsx`, profile view — moving them off the
      admin client onto `SECURITY DEFINER` RPCs + RLS. Add a migration under
      `supabase/migrations/`.

**Acceptance:** Policy tests pass and demonstrably fail when a policy is loosened;
the three hot-read surfaces no longer use the admin client.

**Docs:** Update `docs/CAPABILITIES-AND-MOBILE.md` + `docs/ARCHITECTURE.md`; ADR
for the RLS-convergence approach.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 3 (Security hardening / RLS)**.
> Add an RLS policy test suite, converge feed/circle-detail/profile reads onto
> SECURITY DEFINER RPCs + RLS, add a migration + ADR, update docs, open a draft
> PR. Validate tsc/eslint/test.

---

## Tier 4 — Reliability & observability

**Goal:** Trustworthy logging and email delivery so beta is operable and
debuggable.

**Why now:** ~49 raw `console.*` calls (some in cron/lifecycle paths) give no
structure and risk leaking PII; inline email sends drop silently on failure.

**Scope:**
- [ ] Introduce a structured logger (e.g. `pino`); replace `console.*` in server
      actions, cron routes, and `lib/` with leveled, context-carrying logs.
      **Never log emails/tokens.**
- [ ] Email deliverability: verify `findafreq.com` in Resend (SPF/DKIM/DMARC).
      Optionally route inline sends through the existing outbox queue
      (`lib/queue/outbox.ts`) with idempotency + retries.
- [ ] Cron hardening: fail-closed if `CRON_SECRET` is unset in production/preview
      (see `lib/cron-auth.ts`); convert silent `.then(({error}) => ...)` swallows
      in cron routes into tracked failures.

**Acceptance:** No raw `console.*` in `app/api`/server-action/`lib` hot paths;
tsc/eslint/test green. (Resend DNS verification is a manual ops step — document it.)

**Docs:** Update `docs/ARCHITECTURE.md` (logging) and the ops notes; record the
Resend domain-verification steps. Operator-facing how-to → Notion per DOCS-PROTOCOL.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 4 (Reliability & observability)**.
> Add structured logging replacing console.*, harden cron auth + email outbox,
> document Resend domain verification, update docs, open a draft PR. Validate
> tsc/eslint/test.

---

## Tier 5 — Beta launch

**Goal:** Frequency live on `findafreq.com` with the Phase 3 partner loop closed.
**This tier has no code dependency on Tiers 1–4 and may be done first if you want
to ship beta sooner.**

**Scope:**
- [ ] Apex cutover + production config per [`docs/LAUNCH.md`](LAUNCH.md): add
      `findafreq.com`/`www` to Vercel, DNS, set prod env vars (now documented in
      `.env.example`), confirm `robots.txt`/`sitemap.xml`/OG images resolve to the
      apex. (DNS/Vercel are manual ops; the session prepares config + verifies code.)
- [ ] Partner redemption-on-capture wiring: when a node is claimed in
      `app/(main)/n/[nodeId]`, emit a `partner_redemption` event alongside the
      capture (`lib/engagement/capture.ts`) and surface the earned discount to the
      member. Partner data layer is `lib/partners/read.ts`.
- [ ] Run the smoke tests in `docs/LAUNCH.md` (signup → circle → practice → WAM increment).

**Acceptance:** Smoke tests pass on the preview/prod deploy; partner redemption
records end-to-end; tsc/eslint/test green.

**Docs:** Tick off `docs/LAUNCH.md` / `docs/START-HERE.md`; CHANGELOG entry for
the member-facing partner reward; help article if member behavior changes.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 5 (Beta launch)**. Wire partner
> redemption-on-capture, prepare/verify the apex production config per
> docs/LAUNCH.md, run the smoke tests, update CHANGELOG/launch docs, open a draft
> PR. Flag any DNS/Vercel steps I must do manually.

---

## Tier 6 — Analytics & PMF instrumentation

**Goal:** Observe the North Star (WAM) and retention so you can judge PMF.

**Why now:** Beta is unobservable without metrics; depends on Tier 5 producing
live data.

**Scope:**
- [ ] Build a `/studio/analytics` dashboard (under `app/(studio)/`) showing WAM
      (weekly members with ≥1 `practice.verified`), 7-day activation, and weekly
      practice-retention cohorts, sourced from `engagement_events`.
- [ ] Implement queries in `lib/analytics/` (alongside `practice.ts`) /
      `lib/studio/analytics.ts`; gate the page behind the existing admin role.

**Acceptance:** Dashboard renders against seed/live data; admin-gated;
tsc/eslint/test green.

**Docs:** `docs/ENGAGEMENT-ARCHITECTURE.md` note; operator how-to (reading the
dashboard) → Notion.

**Kickoff prompt:**
> Read `docs/SESSION-PLAN.md` and execute **Tier 6 (Analytics & PMF
> instrumentation)**. Build the admin-gated /studio/analytics dashboard (WAM,
> activation, retention cohorts) with queries in lib/analytics, update docs, open
> a draft PR. Validate tsc/eslint/test.

---

## Tier 7 — Product expansion (post-launch)

**Goal:** Deepen the mission flywheel. Larger; **split into separate sessions per
sub-item** if needed.

**Scope (each can be its own session):**
- [ ] **AI consent test harness** — `lib/ai/consent.test.ts` (+ `lib/ai/` mocks)
      proving agent proposals respect `shouldSend` prefs across categories ×
      channels. Gates AI autonomy per **ADR-028** (`docs/DECISIONS.md`).
- [ ] **Local Marketplace MVP** — new `marketplace_listings` table + migration,
      `/marketplace` browse + detail, host posting, "contact seller" reusing the
      DM thread, RLS scoping. No in-app payments.
- [ ] **Density / demand read-model** — PostGIS queries over
      `engagement_events` + `circles` to surface unmet demand / expansion targets,
      on an admin-only page; CSV export for funders.

**Acceptance:** Per sub-item; tsc/eslint/test green; RLS tests cover any new
member-facing tables.

**Docs:** New `BACKLOG.md`/`DEVELOPMENT-MAP.md` ticks; ADRs for the marketplace
data model and density read-model; help articles for member-facing marketplace.

**Kickoff prompt (per sub-item, e.g. marketplace):**
> Read `docs/SESSION-PLAN.md` and execute the **Local Marketplace MVP** sub-item of
> **Tier 7**. Add the table + migration, browse/detail pages, host posting, RLS,
> docs + ADR + help article, and open a draft PR. Validate tsc/eslint/test.
