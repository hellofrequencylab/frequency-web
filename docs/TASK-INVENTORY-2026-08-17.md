# Task inventory — every open item on every list (2026-08-17)

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

> **What this is.** A full sweep of every to-do list, plan doc, backlog, audit tail, checkbox and
> in-code marker in the repo, consolidated into one inventory. It is a **census, not a new plan** —
> sequencing authority stays with [`UX-MATURITY-PLAN.md`](UX-MATURITY-PLAN.md),
> [`BUILD-LIST.md`](BUILD-LIST.md), [`FINALIZE-PLAN.md`](FINALIZE-PLAN.md) and
> [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md).
>
> **Sources swept:** 232 markdown files under `docs/`, `resonance/docs/`, `design_handoff/` and the
> repo root · 400 unchecked checkboxes across 12 files · ~250 `⏳`/`🔴`/`📋` status rows across 150
> files · 24 in-code `TODO`/`FIXME` markers · the live `check:adoption` ratchet · the Idea Inbox ·
> the ADR record through **ADR-1042**.
>
> **Method note, and it matters.** Every list older than ~2026-08-12 was spot-verified against the
> code before being reported. §12 records the items that turned out to be **already done** — they
> are the largest single category found, and re-working them is the main risk this inventory exists
> to prevent.

---

## 1. The answer, first

| | Count | Reading |
|---|---:|---|
| **Genuinely live, next up** | **~14 items** | §3 — the 8b state sweep, 5c body retirement, contrast residue, four verified bundle/ISR defects |
| **Owner-gated (config or a decision, no code)** | **21 items** | §4 — the single largest blocking category. CP-1 and the Stripe go-live sequence are the load-bearing ones |
| **Named multi-quarter programs, not yet started** | **6 programs / 41 phases** | §5 — Editor E0–E10, App Platform A1–A5, White Label W1–W6, Loom D1–D7, Retheme P4–P9, DAWN Phases 1–6 + 9 |
| **Verified-open engineering findings** | **~35 items** | §6 |
| **Deferred product phases (owner-parked)** | **~28 items** | §7 — Etsy P3–P7, Booking P1–P4, Housing ×2, Money verticals D1–D5, `resonance/` rungs |
| **Domain feature backlog (superseded lists, unabsorbed items)** | **~120 items** | §8 — BACKLOG §A–§V, REMAINING-WORK, ROADMAP, CHECKLIST |
| **In-code markers** | **24** | §9 |
| **Open questions / decisions** | **13** | §10 |
| **Doc + repo hygiene debt** | **~15 items** | §11 |
| **Already done but still listed as open** | **≥ 22 verified** | §12 — **read this before picking anything up** |

**The one structural finding.** The repo has **five documents that call themselves the master
to-do**, and the newest ones are the only accurate ones. `META-SCAN-STATUS.md`'s 2026-07-27 "🟠
Medium" list — 60+ items, the longest single open list in the repo — is **substantially closed and
was never updated**. I verified nine of its correctness rows at random; **seven were already fixed**
in code with explanatory comments sitting right at the cited line numbers. Treat that section as an
archive.

---

## 2. Authority map — which list is live, which is history

Read this before treating anything below as work.

| Doc | Status | What it is good for |
|---|---|---|
| [`UX-MATURITY-PLAN.md`](UX-MATURITY-PLAN.md) | ✅ **LIVE** (ADR-925) | The eight lifts + §Sequencing = the near-term order of operations |
| [`BUILD-LIST.md`](BUILD-LIST.md) | ✅ **LIVE** (ADR-921) | The phase runway; the parked phases; the editor program placement |
| [`FINALIZE-PLAN.md`](FINALIZE-PLAN.md) | ✅ **LIVE** (ADR-960) | The seven finish-line phases + §7c owner actions + §9/§10 audit findings |
| [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md) | ✅ **LIVE** (ADR-974–978) | E0–E10; supersedes `PAGE-EDITOR-SPEC`, re-points W1–W5, amends `LOOM-PLATFORM` |
| [`BASELINE-TODO-2026-08-12.md`](BASELINE-TODO-2026-08-12.md) | ✅ **LIVE**, 36 of 47 closed | §END-OF-DAY table is the accurate row-by-row state |
| [`META-SCAN-STATUS.md`](META-SCAN-STATUS.md) | ⚠️ **Mixed** | The 2026-08-12 pass is live. **Everything from 2026-07-27 back is an archive** (see §12) |
| [`HANDOFF-2026-08-12.md`](HANDOFF-2026-08-12.md) | ⚠️ **Mixed** | §Threads parked is live; §Status is resolved history |
| [`DAWN-CONVERSION.md`](DAWN-CONVERSION.md) | ✅ Live, subordinate | The element-level denominator under UX-MATURITY §3 |
| [`INTERACTION-STATES.md`](INTERACTION-STATES.md) | ✅ Live | §5 sweep queue = Lift 8b's actual remaining items |
| [`VALUE-LADDER.md`](VALUE-LADDER.md) | ✅ Canonical (2026-07-30) | Supersedes earlier tier/rate strategy |
| [`CIRCLES-C3-PLAN.md`](CIRCLES-C3-PLAN.md) | ⏳ **Proposed, awaiting owner approval** | Nothing built. Live decision, see §10 |
| [`A2P-REGISTRATION.md`](A2P-REGISTRATION.md) | ⏳ Not started, operator packet | 14-step filing checklist, blocks SMS |
| [`FOUNDATION-HARDENING-PLAN.md`](FOUNDATION-HARDENING-PLAN.md) · [`ENTITY-MANAGEMENT-OVERHAUL.md`](ENTITY-MANAGEMENT-OVERHAUL.md) · [`GROWTH-OS-BUILD-PLAN.md`](GROWTH-OS-BUILD-PLAN.md) | ⚠️ **No banner, unclear** | The three `BUILD-SEQUENCE` tracks. Wave 0 reads 📋 "next" but the DAWN/UX program overtook it. **These three need a banner** (§11) |
| `BUILD-SEQUENCE` · `MASTER-TODO` · `BUILD-CATALOG` · `A-PLUS-ROADMAP` · `OPEN-THREADS` · `REMAINING-WORK` · `DEVELOPMENT-MAP` · `BACKLOG` · `MASTER-PLAN` · `BUILD-PHASES` · `CHECKLIST` · `PATCH-LIST` · `ROADMAP` | 📚 **History, bannered** | Mined below for items no current plan absorbed. Never for status |

---

## 3. The live queue — what is actually next

From UX-MATURITY §Sequencing "Now"/"Next", plus the four verified-open bundle findings.

### 3a. Lift 8b — the kit state sweep, four controls left

`INTERACTION-STATES.md` §5 items 5, 7, 8, 9 are the honest remainder (7 of 10 shipped in PR #2084).

| # | Item | Where |
|---|---|---|
| 1 | **RowCard: ring + `.press` on the surface** — brings the third card primitive level with EntityCard | `components/ui/cards/row-card.tsx:100` |
| 2 | **A `loading` prop on IconButton**, matching Button's | `components/ui/icon-button.tsx` |
| 3 | **A visible busy state on `ConfirmSubmitButton`** — the ref guard blocks the second fire; nothing tells the member the first landed | — |
| 4 | **An in-flight cue on `DirectorySearch`** — an empty result and a pending one currently look identical | — |
| 5 | **Lift 8d: the gate** — extend `check:elements` so a new `components/ui/*` primitive must ship a colocated test naming its required states | 📋 not built |

### 3b. Lift 5c — retire the coded marketing bodies, one slug per PR

Committed order in `scripts/render-path-bodies.txt`: **`about` → `spaces` → `the-lab` →
`the-quest` → `the-community` → `pricing`** (partial). `check:render-path` ships an **exact-match**
ratchet, so the PR retiring a body edits the baseline in the same PR.

Then **Lift 5d** (unblocked): the eight seeker articles join `EDITABLE_PAGES` with a shared
`templates/article.ts` seed. `DawnHowToSteps` exists and owns its HowTo JSON-LD.

> ⚠️ **Sequencing collision.** 5c and 5d **grow** `EDITABLE_PAGES`; editor phase **E3 replaces
> it**. 5c/5d land first, E3 after. Run in the other order and each silently undoes the other.

### 3c. The contrast residue (Lift 3a)

| Item | Measured | State |
|---|---|---|
| **Amber as display text** — ~30 marketing sites render `text-primary` as the accent word inside a display heading | **2.18–2.86:1 against a 3:1 bar** — fails the *large-text* floor, so no size or weight rescues it | 🔴 owner decision: swap to `--color-primary-strong` (`#965C12`, already used for links directly beneath these headings) or waive explicitly |
| **`.text-text/10` watermark numerals** in the dark skins | What the `/spaces` (2) and `/the-community` (3) dark baselines count | ⏳ |
| **`.dark [data-skin="midnight"]` never matches on the `<html>` path** | A descendant combinator cannot match an element against itself. `app/layout.tsx:144` stamps `data-skin` on `documentElement`; the shell root at `app-shell.tsx:1961` is a descendant and works. **Verified still present: `app/globals.css` uses the descendant form** | 🔴 one selector, but it moves every midnight-dark visual baseline — its own pass with a recapture. ⚠️ The comment at `app/layout.tsx:142-143` asserts the opposite |

### 3d. Four verified-open performance findings (FINALIZE-PLAN §10)

All four re-verified against the tree on 2026-08-17.

| # | Finding | Verified | Fix |
|---|---|---|---|
| **10.8** 🔴 | **The app shell statically imports the entire admin module registry.** `settings-panel.tsx:13` still does `import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'` — a `'use client'` pure registry with 38 static imports, reaching `crypto-browserify`/`stream-browserify`: **406 kB raw / 121 kB gzip on every authed page** | ✅ **still open** | `next/dynamic` per module; `settings-panel` imports module *ids*; add `import 'server-only'` to `lib/journey-plans` + `lib/practices` so the class fails the build |
| **10.10** 🔴 | **Sentry ships on all 385 routes whether or not a DSN is set.** `instrumentation-client.ts:10` still imports `@sentry/nextjs` at module scope. The comment is right about *network* traffic and wrong about *bytes*: ~150 kB of a 233 kB baseline chunk | ✅ **still open** | Gate the import behind `NEXT_PUBLIC_SENTRY_DSN` |
| **10.9** 🔴 | **`revalidate = 3600` is dead on 8 public `/discover` routes.** Three index pages call `createClient()` → `cookies()` for an `isAuthed` boolean; four detail routes lack `generateStaticParams` — `circles/[id]` and `journeys/[slug]` confirmed absent from the list while declaring `revalidate` | ✅ **still open** | **The detail routes are independent and safe to fix alone.** The three index pages need an owner call: (a) make `proxy.ts` set `next=` on its sign-in redirect, or (b) resolve `isAuthed` client-side via the `authMode="client"` pattern. **Do NOT "just remove the auth read"** — `communityHref` is the only thing preserving post-sign-in destinations, and `proxy.ts:172-173` never sets `next` |
| **10.11** 🟠 | `@supabase/supabase-js` (223 kB raw / 58 kB gz) on 122 public pages for a switched-off feature | ⚠️ **unverifiable here** — `components/support/support-chat-widget.tsx` no longer matches. Re-locate before scheduling | Dynamic import inside an effect, per `marketing-header.tsx:68-82` |
| **10.12** 🔴 | `(main)/layout.tsx` reads auth during render, forcing dynamic on the highest-value indexable routes | Open | Same decision as 10.9 |
| **10.15** ⚠️ | **Members pay Gems for things nothing renders.** All 5 borders, 5 flairs and 4 titles have one reader: a text chip in the Vault summary. The **13 SKUs on today's shelf carry `metadata = '{}'`**, so `classifyRedemption` routes every one to `pending` — including five whose copy promises a visible profile change. **No fulfillment queue exists** | Open | Product decision + a queue |

> **📏 Why 10.8/10.10/10.11 have not landed.** All three are bundle-size fixes needing a route-level
> first-load measurement before and after. `next build` in the agent container completes compilation
> but fails page-data collection (`/discover/cities/[citySlug]` reaches `createAdminClient()` with no
> service-role key), so chunks cannot be attributed to routes. **The blocker is a measurement
> environment, not the fixes.** Deliberately not worked around by pulling prod credentials into a
> container.

### 3e. The live adoption ratchet (re-derived 2026-08-17)

`node scripts/check-adoption.mjs` → **exit 0, 17 debt classes held or shrank, −3 sites**.

| Key | Baseline | Current | Note |
|---|---:|---:|---|
| `literal-radius` | 2287 | **2284** | ⚠️ raised 2284→2287 on 2026-08-13 (+3 from other branches). **L**, spend inside screen passes, never its own wave |
| `raw-button-bg` | 514 | **514** | ⚠️ raised (+2). Pattern should move to the opening-tag form under a new basis |
| `raw-input` | 119 | **119** | ⚠️ raised (+1). ~30 structurally un-primitivable; **blocker gone** — `field.tsx:105` exports `FieldVariant = 'boxed' \| 'seamless'` |
| `literal-display-type` | 96 | **96** | Pass 2b, 37 files. Per-site design judgment, not a codemod |
| `shadow-literals` | 50 | **50** | ⚠️ raised (+1) |
| `white-black-literals` | 27 | **27** | ⚠️ rebased for scope parity (ADR-1002 OG move) |
| `raw-px-arbitrary` | 115 | **115** | |
| `adhoc-progress` | 8 | **8** | **4 are false positives** (`rounded-pill object-cover` avatars) |
| `handrolled-icon-button` | 3 | **3** | 2 are `app-shell` (MENU-CONTRACT, snapshot-sensitive). Blocker gone — the `tinted` variant shipped |
| `raw-select` / `raw-textarea` | 3 / 1 | **3 / 1** | Blockers gone — `seamless` + `Select`'s `tone` prop |
| `subtle-tiny-type` | 0 | **0** | ✅ swept (#2133) |
| `literal-type` · `bespoke-cards` · `bespoke-rows` · `handrolled-tabs` · `raw-palette` | 0 | **0** | ✅ done |

**5 baselines are unearned floors** (raised or rebased, not bought by a sweep) and print with their
reason on every run until a sweep brings them down. That is working as designed.

### 3f. Remaining UX-MATURITY workstreams not yet started

| Lift | Item | Size |
|---|---|---|
| **1a** | The five journeys as a registry (`lib/analytics/journeys.ts`) + `journey_funnel()` RPC + `/admin/insights` Journeys panel | M |
| **1d** | Session-replay lite, consent-gated | M, deferred until >1k WAM |
| **2b** | RowCard + EntityCard/PersonCard sweeps | M each |
| **3c** | Focus-visible + keyboard sweep over the interactive kit | M, once |
| **3d** | Reduced-motion completeness — every `animate-*`/`.reveal`/`.stagger` consumer inside a `prefers-reduced-motion` guard or a documented exemption | S |
| **4b** | Mobile visual baselines now, before the grammar lands | S |
| **4c** | The mobile implementation wave — shell + five highest-traffic screens | L, gated on DAWN's mobile round |
| **6a** | Visual-suite surface expansion to all `EDITABLE_PAGES` + the app shell trio + the Space console (needs the 🔴 seeded beta account) | M |
| **6c** | Auto-run the COMPARE job on PRs touching `globals.css`/`components/**`/`lib/page-editor/**` against the PR's Vercel preview | S |
| **7c** | The round ritual — SYNC.md outbound handoff carries the vitals table; two consecutive 🔴 weeks = a perf task enters the next wave | S |
| **7d** | Guard the collector — `SAMPLE_RATE` → 0.25 past ~10k daily loads; add `viewport_class` | S |
| **7 follow-up** | 🔴 **The vitals ratchet** — ADR-928's shape applied to live p75. Waits on beta traffic, not on a decision |
| **7 follow-up** | ⚠️ **Sitemap `lastmod` for the dynamic sets** — several could carry one but their list functions never project `updated_at` (`listNetworkedSpaces` is the largest). A data-layer change |
| **8c** | Optimistic-UI conventions written down + existing sites aligned | M |
| **UX §3 pkg 2** | **R3 — the radius ladder.** `xs`/`3xl`/`4xl` left at Tailwind's `rem` while `sm`…`2xl` are authored in px: the top rung is a 1.5px step and the only part of the scale ignoring the density lever. Touches 1,317 sites' *meaning*, owes a baseline recapture | S, +2.0 |
| **UX §3 pkg 4** | **Adopt or retire `edge-light` · `scanlines` · `vignette`** — three effect classes at zero adopters | XS, +0.5 |
| **UX §3 pkg 5** | **R7 — unify the eyebrow.** Split **ten** ways (`tracking-wide` 484 · `wider` 77 · `widest` 75 · 62 arbitrary) against **3** adopters of the `eyebrow` utility. The dominant hand-rolled value is 7.2× tighter than `--tracking-eyebrow`. **The single most visible type tell** | M, +3.0 |
| **UX §3 pkg 7** | **The rail ladder** (Auto / Open / Strip, persisted) + a desktop left-rail fold. Today the right rail is binary, its state lives in `useState` keyed on `pathname` so it resets on navigation, and the left rail has a `compact` mode with **no user control at all** | M, +3.0 |
| **UX §4 f3** | **Four tokens where production is ahead of DAWN and DAWN does not know** — `--color-focus-ring` · `--color-text-on-primary` · `--color-text-on-broadcast` · `--color-text-subtle`. `SYNC.md` requires these go back on the next round |
| **UX §4.2 residue** | `.mk-hero:not(.mk-hero-dock) + .mk-beat` in `app/globals.css` is dead — no hero emits `.mk-hero` unconditionally |
| **Gate gap** | **Raw-px gap** — the guard bans `text-[Npx]` only; arbitrary sizing px (`h-[18px]`) passes, ~150 in-app instances. Extend with an icon/OG/print allowlist |
| **Hygiene carried** | 6 zero-reference images in `public/images/site` (verify against published Puck docs before deleting) · `va.vercel-scripts.com` in `script-src` looks stale but is an owner CSP call · `.rank-dot`/`tap-target`/`text-scaled-*` stay as await-adoption contract classes |

---

## 4. Owner-gated — config or a decision, no code unblocks it

**The largest blocking category in the repo.** Sources: FINALIZE-PLAN §7c, BASELINE-TODO
§END-OF-DAY, META-SCAN-STATUS §Owner-gated, BUILD-LIST §C, MASTER-TODO §Owner actions.

### 4a. 🔴 Load-bearing — do these first

| # | Action | Blocks |
|---|---|---|
| **1** | **Prove the Vercel Build Command is `pnpm build`, then pin it.** `vercel.json` holds **only** a `crons` array — still no `buildCommand`. Both artifact gates (`check:build-budget`, `check:og-trace`) run as `postbuild`. **If the command was ever overridden to skip pnpm lifecycle scripts, neither gate has ever run** — and they are the two that would have caught the 2026-08-11 ENOSPC. Verified unchanged 2026-08-17 | The only defence against a repeat of the outage that killed production for a day |
| **2** | **Create the beta test account + `PW_STORAGE_STATE` secret** | **44 of 84 a11y tests and the whole member-shell visual suite do not run. The signed-in product is unmeasured, not clean** |
| **3** | **Create the Vercel Protection Bypass secret** → `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview e2e validity. Deployment Protection serves its interstitial to Playwright, so suites test the wall (viewport-tall captures, `/login` redirects). Until then e2e verdicts are valid **against production only** |
| **4** | **Flip `pr-compare`, `check:adoption` and `check:contrast` to required** in branch protection — all three are green | Phase 1 sign-off. Until then the ratchet is the only thing holding the line and it cannot see a visual regression |
| **5** | **Upgrade Healthchecks.io** (~$5/mo) — free tier caps at 20 checks, `vercel.json` declares 27 crons. **The first 20 to ping win; which 7 lose is decided by schedule order, not importance.** Also set each period from the real schedule — auto-created checks arrive at 1 day / 1 hour, so `process-queue` (every 2 min) could be dead most of a day before anyone is paged | 7 cron jobs unmonitored, arbitrarily chosen. Alternative: pin the 20 that matter with `CRON_HEARTBEAT_URL_<SLUG>` overrides |
| **6** | **Sweep every `revoke ... from public` block in `supabase/migrations/`** (ADR-959). Supabase's `ALTER DEFAULT PRIVILEGES` grants anon/authenticated on new objects as **explicit per-role grants**, which `REVOKE ... FROM public` does not touch — the statement succeeds and removes nothing. **The idiom is used throughout the migration history and every instance has the same hole.** Audit with `has_function_privilege('anon', …)` + `information_schema.role_table_grants` against prod, never by reading the SQL | 29 anon-executable SECURITY DEFINER functions rest on a human reading an advisor |

### 4b. Stripe go-live, in order (nothing charges until both `billing_live` AND keys)

| # | Step | Status |
|---|---|---|
| 1 | Confirm `STRIPE_SECRET_KEY` is the **live** key (`sk_live_…`) | 📋 |
| 2 | `STRIPE_WEBHOOK_SECRET` + **one** webhook endpoint at `/api/webhooks/stripe` (ADR-506 consolidated all events onto this route) | 📋 confirm |
| 3 | **Sync products to Stripe** — `/admin/pricing` → "Sync products to Stripe" | 📋 **0 / 24 synced.** Safe: creates the catalog, charges nobody |
| 4 | Review the created Products/Prices (amounts, monthly/annual) | 📋 |
| 5 | Turn ON the per-plan `*_enabled` flags | 📋 |
| 6 | **Flip `billing_live`** — the real go-live | 📋 do last |
| 7 | Test one real checkout end to end (buy Practitioner, confirm the 14-day trial + the plan grant via webhook, then cancel/refund) | 📋 |
| — | **Re-run the two Stripe pricing syncs** — Collective/Independent checkouts currently dead-end | 📋 |
| — | Stripe **Connect** onboarding + `host_payouts_enabled` | 🔴 blocks W4, E7, marketplace payouts |

### 4c. Google OAuth verification (feature is already live behind the 100-user cap)

| # | Step | Status |
|---|---|---|
| 6 | **Safe Browsing "deceptive pages" flag** → Request Review in Search Console | ⏳ requested 2026-06-23. **MUST clear before #7** |
| 7 | **Submit OAuth verification** (branding done) | 📋 after #6 |
| 8 | **Demo video** (~90 sec, shot list + scope justification are written in BUILD-LIST §A) → YouTube Unlisted → paste in the scope form | 📋 |

### 4d. Config and env

| Action | Impact |
|---|---|
| **`CRON_SECRET`** | `lib/cron-auth.ts` is fail-closed in prod. Without it **every** cron 401s: the outbox drain (all email/push/SMS), importer research, automation + drip runners, event reminders, scheduled publish, demo-decay |
| **`ANTHROPIC_API_KEY`** + flip `platform_flags.ai_enabled` | The whole AI/Vera stack is inert without it |
| **Enable Supabase Auth leaked-password protection**; **disable anonymous sign-ins** | Two standing advisors since June. Anon sign-ins fire 147× but the code never calls it — unused attack surface |
| **VAPID push keys** (P4.5) · **`RESEND_WEBHOOK_SECRET`** (P4.10 email metrics) | Push and email metrics dark |
| **Verify `frequencylocal.com` in Resend** + SPF/DKIM/DMARC subdomain isolation | Blocking for email volume (ADR-046) |
| **Submit `sitemap.xml`** to Google Search Console + Bing | Crawl coverage of the programmatic hubs |
| Importer: `BRAVE_SEARCH_API_KEY` (optional), `BUSINESS_IMPORT_CAP_USD` (optional, $1.50) | Search degrades to `[]`; cap bounds per-import spend |
| **Supabase → Pro** (capacity + backups); back up every secret in a password manager | Launch readiness |
| **Supabase vanity domain** — changes the auth callback; update the Google redirect URI + `NEXT_PUBLIC_SUPABASE_URL` in lockstep | After OAuth verification |
| Enable **secret-scanning push protection** (repo setting) | |
| **Dismiss 3 CodeQL false positives** | |
| Flip practices public via the `is_public` toggle on `/admin/content` | **0 `is_public` practices in prod** — `/discover/practices`, the Pillar pages and the slug detail pages are crawlable but render empty |
| Greyed-emoji tuning (`grayscale` vs `saturate-50`) | Reaction selector rest state |
| `accentize()` amber (~26 elements, design-visible) | |
| Delete the four dead branches — `feat/studio-kernel`, `claude/studio-reland`, `fix/codeql-allowlist`, `fix/codeql-seeder-write-allowlist`. **All four verified by content to hold nothing `main` lacks** | Housekeeping; **do not resurrect `feat/studio-kernel`** — it still carries `app/opengraph-image.tsx`, the root metadata image that caused the outage |
| **The `/the-community` design gap goes to DAWN** | Blocks Lift 5b's template regeneration for that route |

### 4e. 🅿️ Parked by the owner (not dropped)

| Item | Resume condition |
|---|---|
| **The moderated research round** (Lift 1b, `docs/research/PROTOCOL.md`) — five members, one hour each, quarterly, on the Vercel preview of a `design-sync/*` branch. ~2 hrs/quarter: pull the pool from `/admin/beta`, check `analytics` consent, send 8 invites to land 5 sessions, aim for 3 members + 2 operators so J5 is observed twice, grant Zaps within 24h | **The owner calls it.** No engineering prerequisite. **Lift 1 sits at literal zero** — `docs/research/findings/` holds only its `README.md`, no moderated round has ever run. This is the single largest distance from world-class (scored 40/100) and **the only item on any list no amount of engineering can close** |
| **App Platform A1–A5** and **White Label E10** | 🅿️ **The technical resume condition IS MET** — the tenancy walls are up, 26 tables policied, and the pgTAP four-seat cross-tenant matrix passed in `db-tests` CI. **Only the owner's scheduling call remains. Do not re-list "run the pgTAP suite" as work** |

---

## 5. Named programs — specced, sequenced, not started

### 5a. The editor program — E0–E10 (ADR-974/975/976/977)

**Honest total: five XL, five L, one M–L — a multi-quarter program.** One block model authored once,
rendered on a member's Spotlight, a Space's profile, a Space's Site, and email.

| # | Phase | Lift | Gate |
|---|---|:---:|---|
| **E0** | **Foundations** — node-id keying, unknown-block byte-for-byte preservation, immutable `page_versions` + publish as pointer swap, `app_instances` writers (**absorbs A2**), undo + `base_revision`, the `render_path` runtime flag, surface-vocabulary reconciliation, **plus the CRDT** (Yjs schema ⇄ tree mapping, Realtime channel + authz, awareness, debounced snapshot, per-client undo, reconnect) | **XL** ⬆ | `check:doc-safety` green on a frozen corpus of **real stored documents**; CRDT ⇄ tree round-trip exact; two clients converge; **zero editor bytes on the public render** |
| **E1** | **Block contract** — one registry, `defineBlock`, Zod `content`, up/down migrations, `reads: 'live' \| 'authored'`, the binding layer, three new gates | **L** | Every registry row resolves to a renderer for every declared surface |
| **E2** | 🔴 **Re-scope before a target is locked.** Loom projection + usage index, *then* consolidate — **304 block types across five systems**, mapping to **~49 held as a range**, so it is a **6:1 cut, not 2:1**. Aggressive real retirements with migrations rewriting stored documents | **XL** | "Which tenants use this block" is answerable **before** the first retirement |
| **E3** | **Axis work** — widen `kinds[]` to `member` + member commerce adapters; density as a declared property; Site's four things | **L** | Zero visual diff across four surfaces. 🔴 **No instrument exists** — the 72 baselines cover none of E3's four targets and **no phase owns capturing them. Add it to E3** |
| **E4** | **Canvas** — same-origin iframe + single React tree via `createPortal`, `bubbleEvent` + coordinate translation, inline Tiptap on `y-prosemirror`, live cursors, device switcher | **L** | **The first point where the thing is demonstrable** |
| **E5** | **Inspector + responsive** — fields derived from schemas, sparse breakpoint overrides with provenance, container queries, **the touch-native inspector** (D-5) | **L** ⬆ | Real viewports, not simulated widths |
| **E6** | **Direct manipulation** — drag/drop, layer tree, keyboard model, spacing handles, presets-first inserter, **the touch gesture model** (D-5) | **XL** ⬆ | Keyboard path complete, **and the full authoring path completes on a phone** |
| **E7** | **Functional blocks** — five transactional widgets made placeable, the form block, **member Stripe Connect** (onboarding, capability checks, platform fee, payouts, tax) | **XL** ⬆ | A member completes onboarding and takes a real payment |
| **E8** | **Vera** — streaming, per-Space retrieval, composer generalized past 15 blocks/one surface, structural + validator layers, bounded critic, ghosted diff review, **creation-time only** | **L** | One prompt → a valid, reviewable, single-undo page |
| **E9** | **Loom authoring** — Layer-2 config editing, per-surface settings console, declarative composer, `check:loom-integrity` | **M–L** | An operator composes a function without a deploy, and cannot write JavaScript |
| **E10** | **Sites** — domains, host routing, per-tenant theming and SEO. Subdomain on any paid plan, custom domain as the upgrade. **Absorbs W1–W5** | **L** | A tenant serves a custom domain off the same registry |

**Also owed by the program:** 5 gates · 6 ratchets in a **sibling** ledger `scripts/block-baselines.json`
(`block-systems` 5→1 · `unbound-app-surfaces` 157→0 · `block-types-total` 304→~49 ·
`blocks-without-totext` 304→0 · `raw-css-paths` must stay 0 · `editor-bytes-on-public-render` falls) ·
5 equivalence harnesses · the `platform_flags.render_path` runtime flag per surface.

> ⚠️ **E0–E3 carry roughly half the risk and produce almost nothing visible.** Say so at the start,
> not when someone asks why nothing has shipped.
>
> 🔴 **D-9 is still outstanding:** the five orphan block types in three draft pages get a **separate
> hotfix PR now**, ahead of the program.
>
> 🔴 **`cacheComponents` is not adoptable, out of scope** — zero `revalidateTag` against 1,094
> `revalidatePath`, 50 `export const revalidate` (which the flag rejects), 234 `force-dynamic`.

### 5b. App Platform — A1–A5 (🅿️ owner-gated)

| # | Scope | Lift | Status |
|---|---|---|---|
| **A1** | Feature modules with enforced boundaries — `modules/<app>/{components,server,db,index.ts}`, ESLint import-boundary rule (public API via barrel only); CRM · booking · email-design · QR first. Generalizes then retires `check:crm-parity` | M | 📋 |
| **A2** | Instance contract live (four layers per ADR-499) | M | ➡️ **absorbed by E0** |
| **A3** | Enablement inside RLS — module-table policies also check the enablement key so a disabled module's data is unreachable even via direct API | M | 📋 |
| **A4** | Flagship packaged apps — CRM as ONE module on `/admin/crm`, `/spaces/[slug]/crm` and entity consoles, each reading only its tenant's rows. Then booking, then email design. pgTAP enablement tests per app | L | 📋 |
| **A5** | **Meters go live** — the decorative freemium meters (200 contacts · 300 sends/mo · 3 QR codes · 1 journey · 1 seat) enforced at the module boundary with upgrade prompts, behind `gatesLive` | M | 📋 |

### 5c. White-label sites — W1–W6

**W1–W5 are re-pointed to E10, not deleted.** Read them as E10's scope inventory; do not schedule
independently. **W6 stays deferred.**

| # | Scope | Lift |
|---|---|---|
| W1 | Foundations — `space_domains` table; `pages` drops global-unique slug for `unique(space_id, slug)`; `site_templates` + `pages.template_version`; `custom_domain` entitlement key; converge `spaces.preferences.pageDocs` → `pages` | M |
| W2 | Subdomains live — Sites apex purchased (**owner, DNS lead time**); Vercel wildcard; host router in `proxy.ts` short-circuiting before session/cookies; resurrect the ADR-508 BlockRender public renderer from git history; per-tenant SEO; per-Space site nav; 301 from `/sites/[slug]` | L |
| W3 | Per-Space editor — replace the hardcoded 8-slug `EDITABLE_PAGES` with per-Space page resolution under quota; Website tool row; `site_templates` gallery; publish via `revalidateTag('site:<spaceId>')` | L |
| W4 | Custom domains + billing — `lib/vercel/domains.ts`, DNS wizard, `pending→verifying→active→error`, bind-time entitlement gate, downgrade→redirect (never 404). 🔴 **Blocked on Stripe connector authorization** | L |
| W5 | Hardening — per-site CSP, embed sandbox + allowlist, abuse kill switch at the edge, dangling-DNS monitor cron, per-tenant quotas, optional per-Space sender domains/DKIM | M |
| W6 | **Members + marketplace** — member sites on the same rails; theme/template marketplace on DTCG portable themes + `site_templates`. 📋 **not part of E10** | L |

### 5d. The Loom (DAM) — D1–D7

| # | Scope | Status |
|---|---|---|
| D1 | Loom Studio + gallery | ⏳ shipped; **ingest extras still pending** — checksum dedupe · EXIF strip · dims/colors/blurhash · rendition set · FTS-ranked/trigram search |
| D2 | **AssetField seam** — one `Upload / Pick from library / Paste URL` control replacing `ImageField` everywhere; blocks store an **asset reference** (+ URL cache); **backfill** existing `site-media` URLs into the catalog + rewrite references | 📋 |
| D3 | **Editor + versions** — Filerobot image editor; edit saves a new `library_versions` row (non-destructive); rollback via `is_current`; on-the-fly rendition resolver | 📋 |
| D4 | **Organization at scale** — collections, saved views, tag governance, and the **usage index**. ⚠️ **Re-scoped: this is a build from zero, not a wiring.** `library_usages` was created at `20260920000000:101` and **dropped five days later** at `20260925000000:17`; ADR-979 deleted every reader. The replacement is `block_usage` per ADR-975 (an `app_instances` trigger + a periodic JSONB scan, treated as disposable). **Size grows accordingly** | 📋 |
| D5 | **Per-space Looms** — space-scoped libraries, upload-to-library, fork-on-edit, quotas, per-space console, client-facing RLS, capability keys, entitlements, flags | 📋 |
| D6 | **Privacy system** — `library-private` bucket, signed URLs, storage RLS, download gating + audit, EXIF strip enforced, optional watermark/proofing. Hooks already in the schema | 📋 |
| D7 | **Semantic + AI** — populate `embedding`, hybrid FTS+vector RRF, AI auto-tag + colour extraction, background removal / upscale. Later: the Weave generative composer | 📋 |

### 5e. Re-theme — P4–P9 (P0–P3, P8 shipped or in flight)

| # | Scope | Lift | Status |
|---|---|---|---|
| P1 | Radius tokens — ⏳ **second half genuinely outstanding**: `check:tokens` still has zero occurrences of `rounded`; the `literal-radius` ratchet holds the line instead | L | ⏳ |
| P3 | Control + card consolidation — 526 raw styled buttons → `Button`; lint flags raw styled buttons/cards | M | ⏳ |
| **P4** | **Universal browse hero** — the 24 plain `IndexTemplate` pages adopt `heroOverlay` | M | 📋 |
| **P5** | **Entity headers → `PageHero`** — fold the 43 `DetailTemplate` band pages onto one grammar | M–L | 📋 |
| **P6** | **Copy cascade** — generalize `page_content` into a `site → section → page` inherit-cascade; widen editable fields to body copy + images; extend `check:canon` to `.tsx` | L | 📋 |
| **P7** | **Per-Space / white-label depth** — widen the child-theme override surface, operator theme controls, a theme-contract compile check | L | 📋 |
| P8 | Dark-mode + a11y + visual regression | M–L | ⏳ substantially shipped |
| **P9** | Marketing ↔ in-app reconciliation (optional) | M | 📋 |

### 5f. DAWN conversion phases (the element-level denominator)

**~3,176 elements**, of which **3,124 (98%) are raw `<button>`/`<input>`/`<select>`/`<textarea>`
that never reach a primitive** — and **11 of DAWN's 30 primitives do not exist or have under two
call sites**, so half the sweep volume is blocked on building them first.

| Phase | Scope | State |
|---|---|---|
| Phase 1 | The bug class: styling that ignores theming outright | ⏳ |
| Phase 2 | **Build the missing primitives** — *blocks Phase 3*. Badge · RankBadge · Stat · Select · Checkbox · CounterRow · Toast · Avatar. ⚠️ Several landed in Phase 2 with **zero importers** | ⏳ |
| Phase 3 | The mechanical sweeps — **the bulk, ~3,124 sites** | ⏳ |
| Phase 4 | Type | 🔴 |
| Phase 5 | Shape and depth | 🔴 |
| Phase 6 | Structure and the framework | ⏳ |
| Phase 7 | Marketing | ✅ closed 2026-08-11 |
| Phase 8 | `resonance/` | 🅿️ |
| **Phase 9** | **The instruments** — added 2026-08-05, **unscheduled, and it should not be.** Two instrument defects found independently by two agents: `raw-input`'s lookahead excludes only `type="hidden"`, so **~18 `type="file"` triggers behind `hidden`/`sr-only` are permanently un-retirable debt inside a ratchet**; and `white-black-literals` does not exclude `app/print/**` though DAWN-CONVERSION §1 names it a carve-out, so **its floor is permanently 2** | ⏳ |

### 5g. Practice library — Phase 4 + carry-overs

| # | Scope | Status |
|---|---|---|
| **4.1** | **`computePracticeReward()` wired as the valuation authority** + the **per-Pillar Zap attribution ledger** (the primary/secondary split's payoff — columns shipped in Phase 1) | 📋 |
| **4.2** | **Vera curation** — auto-suggest Pillar/subcategory from the embedding, auto-tag, auto-summary, voice-check, generate remix prompts | 📋 |
| **4.3** | **Library health dashboard** — growth, coverage gaps by Pillar/subcategory, adoption funnel, top/bottom performers, review SLA, contributor leaderboard | 📋 |
| Ph1 carry | Residual ("minus-self") facet counts → Phase 2 · **server-backed saved views** (Phase 1 ships localStorage presets) · `lib/database.types.ts` regen + drop the untyped admin-handle casts · adding a `selection` slot to `DataTable` (the documented follow-up of the bespoke-table decision) | 📋 |
| Ph2 in-flight | On a branch, not merged: **review-queue v2 UI · "Needs attention" panel · merge UI · tag governance**, plus a table-overlap rework, the "System" → "Frequency" house-practices rename, and converting the page body into layout-editor block areas | ⏳ |

### 5h. Spotlight — the remaining MySpace/Discord socials

| Item | Scope | Status |
|---|---|---|
| **Guestbook** | Visitors leave a note. Needs a `spotlight_guestbook` table (RLS: owner reads all, anyone-signed-in writes), moderation (hide/report, owner delete), rate-limit + anti-spam, read-side render | 📋 specced |
| **Stickers / decals** | A playful decorative layer — place emoji/earned stickers absolutely, validated coordinates + an allowlisted set | 📋 specced |
| Deferred embeds | Bandcamp, Apple Music, Twitch — each needs a host-allowlist entry + `frame-src` | 📋 |
| Cosmetics lane | Earned frames/skins tied to gems/streaks | 📋 |

---

## 6. Verified-open engineering findings

Beyond §3d. Grouped by kind. Sources: META-SCAN-STATUS 2026-08-04 + 2026-08-12, FINALIZE-PLAN,
BASELINE-TODO.

### 6a. Wiring and dead surfaces

| Item | Sev |
|---|---|
| **12 layout modules can never render** — 4 community blocks under `'*'` (never reached), 8 `entity-*` under `'/spaces/*'` (no page mounts it) | 🔴 |
| **`app_instances` is 0 rows with no reader or writer** — the Loom where-referenced backbone, shipped ahead of its code. Verified 2026-08-17: the only non-generated references are `lib/database.types.ts` and `components/admin/library/apps-lane.tsx`. **Owner-gated: migrate-or-retire** | ⚠️ |
| **`/admin/elements` renders QR Studio toggles and role gates nothing consumes** — saving them silently does nothing (`lib/elements/qr-studio.ts:83`) | 🟠 |
| **246 of 284 registry rows are placeable (87%) through three pickers that cannot see each other** (layout engine 127 · entity grid 31 · Puck 88). Through `APPS`, the catalog built to unify them: **0 of 351**. `App.surfaces.page` is a literal `{}` with zero production readers and `appsForScope(..., 'page')` is never called. **ADR-927 §3 remains the blocking project** | 🔴 |
| Puck picker unscoped — a marketing page can take all 19 Space profile blocks · `lockedAppsForScope` can never return a row · `/onboarding/vera` unreachable with a permanently-zero funnel step · 4 `MODULE_ROUTES` are redirect-only stubs | ⚠️ |
| **Nav commit `4444d28b6`** (⌘K palette + My Frequency badge) — stranded on the deleted `feat/studio-kernel`; needs rebasing onto main and a PR | ⏳ |
| **`/drafts` rail badge counts proposals only** — should also count unfinished wizard drafts now that both render on the same list | ⏳ |
| **Admin footer "Report a problem" links to a POST-only handler**, so a click returns 405. Verified the link is still at `components/admin/admin-footer.tsx:117` | 🟠 |
| **A root-type Space's "Manage" affordance dead-ends in a 404** (`lib/spaces/types.ts:47`) | 🟠 |

### 6b. Gates that check shape rather than truth

| Item | Sev |
|---|---|
| **`check:authz` cannot see `app/api/**` at all** — 54 routes, 15 bypassing RLS. All 15 hand-audited clean; **nothing catches a bad one tomorrow** | ⚠️ |
| `check:authz` is file-level, not function-level; `check:admin-client` counts imports, not soundness (**733 files bypass RLS**) | ⚠️ |
| **No repo-side gate for function grants at all** — `check-grants.mjs` covers tables only, and nothing anywhere references `has_function_privilege`. **E-4: build a function-grant guard** (M, backlog) | ⚠️ |
| **axe returns `incomplete`, not `violation`,** for `background-image`, pseudo-elements >25%, and `opacity: 0`. **Every ink band's contrast debt and everything below the fold inside a `Reveal` is unmeasured. 219 is a floor, not a census** | ⚠️ |
| `check:contrast` cannot model alpha for status tones on `canvas`/`marketing-canvas`; `success` measures 4.05–4.40 there, unmeasured | ⚠️ |
| **`tsconfig` excludes `scripts/`**, so the CI guard test files vitest runs are never typechecked | ⚠️ |
| **Three of the nine shell a11y baselines are ceilings, not readings** — `/feed` 12, `/settings` 7, `/spaces/…/manage` 8 (all dawn-light desktop) were seeded as raw totals without subtracting waivers because the run log truncated at 5 nodes. **The node cap is now 40; tighten those three on the next run. They are the widest holes in the gate** | ⚠️ |
| **Add a CI drift guard** asserting materialized `admin_header` rows still match `defaultMenu('admin_header')` — the read-side hazard MENU-CONTRACT should document | 📋 |
| The `pr-compare` Lighthouse thresholds (Lift 7e) **are first-run guesses and should be re-set from the first real runs rather than defended** | ⚠️ |

### 6c. Build headroom (measured 5.81 GB / 499 functions, 2026-08-13, vs an 8 GB gate)

| Item | Size |
|---|---|
| ⏳ **`searchSiteIcons` behind a route handler** — `lib/loom/site-icons.ts:14-16` statically imports the `lucide`/`ph`/`tabler` `icons.json` sets (~7 MB); `loom-picker.tsx:19` imports the search fn; LoomPicker is statically imported by ten components. **Do not stop at one importer** — `components/ui/icon.tsx:3-5` pulls the same three collections for two RSC consumers, so the floor after the fix is ~3 functions, not 1. Verify with `check-build-budget`, never by inspecting the client bundle | M |
| ⚠️ **A-6 · the `spaces/[slug]` OG card** — per-entity OG cards inherit `sharp` into **67 incidental functions against a budget of 70**. **Adding four ordinary pages under `spaces/[slug]` fails a disk gate whose message talks about share cards.** Raise the ceiling with a reason, or move the cards to route handlers and re-prove the private-Space privacy contract | L |
| ℹ️ **A-7 · the irreducible floor** — XL, **do not chase** | — |

### 6d. Accessibility

| Item |
|---|
| **~105 `<Label>` uses across ~40 files are still unassociated.** Create Event (the worst, 17) is fixed and `Field` exists as the shared primitive. Next by volume: `circle-builder.tsx` (12), `movement-session.tsx` (9), `events/drafts/[id]/editor.tsx` (9), the six onboarding `*-render.tsx`. Mechanical: wrap in `Field`, or thread `htmlFor`/`id`, or `role="group"` + `aria-labelledby` for button groups. **Verified 2026-08-17: 44 files still contain `<Label`** |
| The header wordmark's keyboard focus indicator is **explicitly deleted** (`app/globals.css:1028`) |
| Four member-facing toggle switches have no accessible name |
| **Vera's chat transcript is not a live region**, so replies are never announced |

### 6e. Menus (ADR-860 backlog, first tranche shipped)

| Item |
|---|
| **The sync engine still inserts-only** — build the non-destructive "re-check for new pages" action, key identity on a stable `default_key` instead of href, and surface per-item drift badges (synced / edited / retired / missing) in the Menu manager |
| **The marketing MOBILE menu renders registry triggers only** — submenu items are unreachable on phones and operator menu edits never appear there (`marketing-mobile-menu.tsx:96-105`) |
| **`AdminSubNav` flattens away group headings and drops depth-3 groups**, so Menu-manager sub-organization of `admin_header` has no visible effect (`admin-sub-nav.tsx:56-61`) |
| The two account-menu renderers gate the same items differently (`user-menu.tsx:73` vs `app-shell.tsx:427`) — unify on one gate |
| `/admin/library` and `/admin/spaces` have no `admin_header` section (empty sub-nav band) |
| **`/marketplace/housing` is the last member-facing `/marketplace/*` URL** — needs `/market/housing` + redirect per ADR-596, then the nav/footer/menu rows re-pointed |

### 6f. SEO / AIO

| Item |
|---|
| **Spotlight pages render a double-branded title, "Name · Frequency · Frequency"** (`app/spotlight/[handle]/page.tsx:27`) |
| **Four indexable public hubs have zero inbound internal links** — crawlable only from `sitemap.xml` |
| **Eight Space sub-tabs canonicalize to the profile root** (FINALIZE §9.5) |
| **N+1 in the sitemap** — `app/sitemap.ts:379` fires one `podcast_shows` query per networked Space, up to **200 round trips in a single request** |
| Nine `/discover` pages remain dynamic for their own reasons (filterable indexes read `searchParams`). Worth a pass now the layout no longer forces it |
| ⚠️ **`check:seo`'s coverage boundary, stated** (FINALIZE §9.7) — know what it does not measure |

### 6g. Naming and voice (member-facing, outside `check:canon`'s scope)

| Item |
|---|
| ⚠️ **"Drafts" names three member surfaces and `NAMING.md` defines none of them.** `/drafts` carries two row kinds by design (ADR-1001); `/events/drafts` is a separate surface whose back-link also reads "My drafts". **Plus an unresolved collision: Studio proposals vs wizard autosave are both called "drafts"** |
| The "Around You" dashboard calls Dispatches "broadcasts" in three visible strings |
| The Dispatches console is "Broadcasts" in the app rail and "Dispatches" in the admin sub-header |
| Global search labels eight member destinations with the retired name "Marketplace" |
| `/for/community-builders` and Journey copy both sell "cohorts" — the one word the canon bans |
| Public profile and Spotlight stat pills render lowercase "zaps" and "gems earned" |
| **Worth doing: widen `pnpm check:canon` past `content/` to member-facing strings in `app/` and `lib/`.** Every canon break the scan found was outside its current scope |

### 6h. UI consistency

| Item |
|---|
| **Five "Spark" wizards hand-roll the WizardShell lockup** — a header violation `check:headers` structurally cannot see |
| Two hand-rolled `EmptyState` components shadow the kit's variant taxonomy on the two main post feeds |
| Six route skeletons use the retired `px-4 py-8 max-w-2xl mx-auto` shell, double-padding inside the shell |
| ⚠️ **`CircleCard` asks for `p-5` and paints `p-6`** (FINALIZE §9.11) · **`Skeleton` is the second instance of the same collision, at 52 of 329 call sites** (§9.12) |
| 📋 **Convert `app/onboarding/beta/induction.tsx` to the kit — wholesale, not one beat.** ✅ The primitive half of the blocker is gone: `field.tsx:66` exports `FieldSurface = 'default' \| 'post' \| 'inset'`. **This is now a call-site sweep, not a primitive build** |
| 📋 Program detail (`/programs/[slug]`) to DetailTemplate — ⚠️ **but Programs was retired**; see §11 |
| 📋 Build `<RoleActions>` overflow-menu; route `CreateMenu` through the resolver |

### 6i. Login hardening (the audit ADR-959 did not act on)

| Item |
|---|
| 🔴 **A magic link opened on a different device fails** — Supabase's PKCE flow stores the verifier client-side |
| 🔴 **No loading state on submit** — nothing disables the button between press and redirect |
| 📋 **Passwords as a third door**, alongside magic link and Google (NIST best practice) |
| 🔴 **Leave Captcha OFF** — the client sends no captcha token, so enabling it breaks sign-in |

### 6j. Correctness, still open

| Item |
|---|
| **CRM import dedupe** — ✅ the 1,000-row page cap is **fixed** (`commit.ts:230-235` now pages). Left open: nothing |
| **Four incompatible cents-to-price formatters** — the one used by the seller price editor and product emails **drops precision** (`lib/commerce/types.ts:375`) |
| **The host's "List this event publicly" opt-out is honored on one of four public browse surfaces** (`lib/commerce/ticket-projection.ts:99`) |
| ⚠️ **`/settings#payouts` is a dead link for every host while billing is off** (FINALIZE §9.4) |
| ⚠️ **Notification links that land on `/feed`** (FINALIZE §9.2) · ⚠️ **truncation reported as a total** (§9.3) |
| **Fast-fail stock pre-check in `createCommerceCheckout`** — the atomic RPC is the oversell source of truth, but a pre-check avoids charging a buyer then failing soft at settle |
| **Real pagination on `/network` + `/circles`** — both render a capped slice with a "showing first N" notice |
| 🔵 opt · **Resonance: run embeddings BEFORE edges** for same-night effect (a product call, not a bug) |
| **The events embedding cron runs every 30 minutes** — now that the For You lane is mounted the work has a consumer, but the cadence deserves a look |
| **P-SEC · Caller-row double-fetch dedup** — owner-gated: touches the shared `cache()`-wrapped auth boundary used app-wide, for a single-row-SELECT upside |
| **P-DX · Re-run `supabase gen types`** and drop the untyped RPC casts (`decrement_commerce_stock_atomic` / `qr_stats_summary` reached via `as unknown as`). Mechanical. **Recurs on five separate lists** — H0-3, H5-1, Practice Ph1 carry-over, PRICING #9, this row |
| **`pages.space_id` still NULLABLE** (the NOT NULL contract step is owed); stale `as unknown as` casts on now-typed tables |

### 6k. Foundation hardening — the H-track (no superseded banner, so still nominally open)

**H1 data integrity:** ledger integrity audit (append-only + idempotent on every write path incl.
retries) · **tag model reconciliation** (`member_tags` governed vs `network_contact_tags` free-form,
different schemas, no unified search) · constraint & enum sweep · idempotency-key coverage on every
member-triggered mutation that awards or charges · orphan & referential repair jobs.

**H2 security:** finish RLS convergence (ADR-042/056) · authz CI guard coverage · SECURITY DEFINER
`search_path` hygiene · webhook/HMAC audit · **GDPR/CCPA erasure + export workflow** (today deletion
hard-cascades with no formal right-to-erasure or export) · rate-limit coverage · anti-abuse on the
economy at scale · a `/security-review` pass + documented threat model · self-escalation guards.

**H3 scale (metric-gated, not now):** RLS subquery cost · index audit & fill · **geocoding provider
upgrade** (Nominatim is ~1 req/s global and serialized in-process; member-created events at volume
will choke) · ledger partitioning + archival · feed read-model · media + CDN strategy · pooling +
read replicas · realtime scaling review · caching-layer expansion · AI cost controls per user/minute
· **vector index maintenance + backfill the unpopulated embedding columns** · single-region /
residency plan.

**H4 reliability:** 🔴 cron retry/backoff + DLQ · 🔴 email queue resilience (retry + DLQ + lag
alerting on the 2-min `process-queue`) · 🔴 Stripe webhook retry/DLQ so a failed webhook never
strands an order in `pending` · integration/e2e coverage on the money and reward paths · make
`db-tests` a required check · 🔴 **backup & disaster recovery** (verify PITR tier, rehearse a
restore, define RPO/RTO) · 🔴 **incident runbooks** (cron failure, queue backlog, webhook failure, DB
degradation, AI outage, deploy rollback) · structured logging + audit completeness · 🔴 **load & soak
testing harness** so H3 claims are provable.

**H5 code quality:** remove the temporary type casts · centralize duplicated authz into
`lib/core/roles.ts` · page-framework adoption long tail · 🔴 docs reconciliation.

---

## 7. Deferred product phases (owner-parked, specced)

### 7a. Marketplace — Etsy-Grade P3–P7

| # | Scope |
|---|---|
| **P3** | **Shipping & delivery** — seller shipping profiles (flat / weight / zone), buyer address + shipping selection at checkout, digital delivery. Adds a shipping line to order totals |
| **P4** | **Discovery & search** — faceted Market search (category / tags / condition / price / seller type) + relevance/recency/trust ranking + curated collections |
| **P5** | **Cart + multi-seller checkout** — a persistent cart spanning sellers, split into per-seller destination charges in one buyer flow (one intent, N transfers), each take rate preserved |
| **P6** | **Orders, fulfillment & messaging** — buyer/seller order timelines, fulfillment states, tracking capture, order-scoped buyer↔seller messaging |
| **P7** | **Trust, growth & tax** — promotions / discount codes, seller payout + earnings reporting, tax posture (collection config + 1099 thresholds) |

### 7b. Booking — P1–P4

| # | Scope |
|---|---|
| **P1** | **Service types + durations** — multiple bookable offerings per Space (30/60/90 min), each its own duration, price hint, description. `space_service_types` |
| **P2** | **Availability rules** — named schedules with buffers, minimum notice, configurable window, date overrides/blackouts, per-invitee timezone display |
| **P3** | **Reschedule / cancel + reminders** — member self-serve within policy, confirmation + reminder emails on the outbox, booking questions, optional ICS |
| **P4** | **Payments / deposits** — deposit or full payment at booking on the commerce spine (largely the dormant `bookable_services` hold-first seam). Business-gated, dark behind `payoutsLive()` |

### 7c. Housing

| Item |
|---|
| **Natal-chart matching** — beyond the shipped sun-sign quiet-5% (ADR-604): full natal-chart compatibility as an opt-in, both-sides factor. **Needs an ephemeris/compute decision before build** |
| **Resonance match alerts** — notify a seeker when a strong new listing or roommate match appears (the matching RPCs exist; this is the alerting layer) |

### 7d. Money verticals — D1–D5 (🔴 gated on PMF + legal entity)

| # | Scope |
|---|---|
| **D1** | **The Collective** — first commerce build: contributor application → verification → paid offerings → payout |
| **D2** | Freemium: free app + Vault + membership cash-in (ADR-037) |
| **D3** | **Affiliate** — referral attribution → commission → payout ledger |
| **D4** | **Donations & Grants** — the Foundation rail, one-time + recurring |
| **D5** | **Lab Spaces** — the gym-management SaaS + Lab membership + the rollup |
| — | **Money foundation** — entity partition + entity-tagged `financial_transactions` (ADR-029/032) |
| — | **Inter-entity Lab bridge** (ADR-038; mostly legal) |
| — | **Physical merch fulfillment** (`store_items` physical flag + shipping flow) |
| — | **Frequency Shop** (real-money merch), distinct from the Quest Store |

### 7e. `resonance/` (the separate sub-app) — 18 GO gates, nothing built

`resonance/docs/BUILD-PLAN.md`: **"Nothing here is built yet."** Build-order discipline, never
reorder: **sync engine → DJ loop → gamification → embed → then the world.** Each rung ends in a
manual 🚪 GO gate:

sync engine · DJ loop · anonymous auth (**needs "Anonymous sign-ins" enabled in Supabase Auth —
note this conflicts with §4d's advisor-driven instruction to disable them; reconcile before either
lands**) · Awesome votes · host embed + webhook · room directory · watch rooms · lounges · avatars +
emotes · events + RSVP · lobby headcount · proximity chat (**voice via WebRTC is a deliberate
follow-up beyond rung 1**) · room decoration · cosmetics economy · identity federation · trivia
rounds · creator earnings (**fiat cash-out via Stripe Connect deferred; earnings accrue in Zaps**) ·
Discover across both worlds.

### 7f. Mobile / native

Expo/RN app on the shared RPC contract + capability model · native camera/QR, NFC, geofencing, push
· a Postgres-backed **sync engine pilot (PowerSync/Electric/Zero)** on one surface · cross-platform
push reusing the notification-preferences spine · **decide the mobile stack + contract transport**.

### 7g. A2P 10DLC — the operator filing packet (⏳ not started)

**Carrier review runs ~10–15 days**, so the clock should start in Phase 0. Blocks the SMS card-scan
nudge and 1:1 SMS. 14 checklist steps in `docs/A2P-REGISTRATION.md`:

Customer/Business Profile with the §2 legal facts · a **Standard (EIN-backed) brand** · EIN, legal
name and address **exactly as on the IRS record** · the authorized attesting contact · pay + submit ·
record the **Brand SID** → `SMS_A2P_BRAND_ID` · optional external secondary vetting · **use-case
Mixed** · campaign description · sample messages · opt-in description · STOP/HELP enabled on the
Messaging Service · privacy policy URL · record the **Campaign SID** → `SMS_A2P_CAMPAIGN_ID`.

---

## 8. Domain feature backlog — items no current plan absorbed

From the bannered history lists. **Sized, not scheduled.** Many overlap §5–§7; deduplicated where
obvious.

### 8a. CRM (REMAINING-WORK #10–16)

Reciprocal QR handshake (a two-way capture so both members keep each other on a scan) · reconcile
duplicate contact surfaces (`/network/contacts` vs the friends `ContactsList`) · per-segment custom
field templates · custom objects · reach-out home pulse · a member copy pass through
NAMING + CONTENT-VOICE · instrument upgrade-trigger events.

### 8b. Network rework (REMAINING-WORK #17–20, ADR-154 — designed, not built)

Promotion `network_contacts` → `contacts` (**gated; leak risk concentrates here**) · `shared` (team)
visibility, modelled but not surfaced · more capture sources (email / calendar import on the open
`source` field) · the full member-facing Network IA + event-invite capture loop.

### 8c. Circles / discovery / IA

Circle-discovery **visual map layer** · circle lineage + the **"nearly full → seed a new circle"**
flywheel · multi-topic circles (one `topical_channel_id` today) · hub/nexus-scoped events ·
**milestone "wake-up" gating map** (declarative role+milestone unlocks) · a density/demand read-model
(PostGIS) for expansion + the grant story · soften the newcomer Region→Outpost→Nexus→Hub breadcrumb ·
per-Nexus subdomains (`encinitas.frequencylocal.com`) — **overlaps W2/E10**.

### 8d. Messaging / social graph

**Two-way Inbox / member message replies** (BUILD-PHASES 6.7 "v2") · @mention rendering +
notification fan-out (the autocomplete API exists; the parser and fan-out do not).

### 8e. Practice / Quest / gamification

**Stage-driven disclosure** — apply `stageIndex` to dashboard/profile/rails (ADR-146) ·
`practice.verified` host/peer verification + device attestation / P2P mutual-confirm ·
repeatable-node idempotency keying for captures · **realtime reward feedback via Supabase Broadcast**
(cross-device) · community-library moderation + promote-to-tracked Journey · **seasonal-Journey
authoring surface + content** (link to season + Pillar) · **Doomscroll mode**, the named release valve
(ADR-155) · **Quest pipeline + sponsor-backed rewards** (ADR-156a/155) · a member-facing season
banner/countdown + per-action point display · the `welcome_member` achievement is unobtainable ·
**Practice depth PD6** (depth streak) and **PD7** (per-mode live-session walkthrough) from the Idea
Inbox · the threshold chime (the audio half of the live "go deeper" cue) · extend auto-continue to
duration-based Movement · the Vera dispatch AI fallback naming the right activity.

### 8f. Operator: Growth Studio / CRM / Marketing

Visual entry-point/flyer designer · live QR style preview · unified link generator · lead-flow
customization UI · **A/B builder + scheduled publish** · segment builder + Kanban pipelines +
React-Email templates · per-campaign/automation performance drill-down · **live Claude Studio
operator** (gated on the consent harness) · funnel / acquisition-source / cohort-retention analytics ·
`engagement_score` projection off the backbone + `email_events` · semantic search across
dispatches/posts + an AI weekly digest summarizer · **notification router/registry** (event →
category → channels → template) and migrating inline email/push send-sites onto the outbox queue ·
**Automations: add SMS/push actions + a segment builder** (P4.9; Nurture is complete, Automations
email-only).

### 8g. Onboarding / Vera / AI (P6)

Live-loop suggestion chips (the loop returns empty `suggestions[]`) · finish `draft_intro` · warm
demo content · Vera matriarch/coach tweaks · **persistent companion launcher** (one docked Vera on
every surface) · Capture Phases 2–4 (richer kinds; Quest pipeline + sponsor rewards) · journal
framing · 🔴 **Proactive Vera, gated on the consent harness** (ADR-028) · the **AI core governance
kernel** (model router, prompt cache, pgvector RAG, usage ledger, caps, kill switch) · **Sentinel
Layer 2** (scheduled sweeps via Agent SDK + a scoped GitHub App) · Beta Activation surfaces.

### 8h. Signup-lead recovery — the send side (deferred by owner 2026-08-07)

📋 A **"Finish setting up your account" email** (transactional, not marketing) · 📋 the **sweep that
decides who gets one** — a scheduled pass over `signup_leads` · 📋 **graduate the lead into a contact
card** (`network_contacts` + …).

### 8i. Theme & template system (BACKLOG §V, 12 items)

Member generation switch + cookie writer (`serializeThemeCookie` exists, unused) · a
**`spaces.generation` column** + per-Space default · `data-generation` is stamped but unexposed ·
**generation as editable data in Theme Studio** · per-preset contrast/saturation tuning with proper
`.dark` variants · **wire `lib/theme/structure.ts` into the templates** (`structureFor(generation)`) ·
🔴 **template-per-page** (a theme scoped to a page template, THEME.md §13) · occasion
authoring/preview polish · per-Space membership + multi-Space identity · **cross-axis
visual-regression suite** (today's guardrails assert CSS⇄registry *pairing*, not rendering) · **W3C
Design Tokens export + native generation** (THEME.md §10/§15).

### 8j. Roles / permissions long tail (P1, all ⏳ with foundations shipped)

1.3 unified-site refactor · 1.4 scoped stewardship · 1.6 unified capability resolver · 1.7 per-function
permission grid (⚠️ migration `20260614300000` is **DB-applied but not in `schema_migrations`** —
out-of-band drift, idempotent re-run safe) · 1.8 role-advancement training Journeys (remaining: the
in-place curriculum editor + per-step completion).

### 8k. Partners / personas (P3)

3.2 **Collaborator** — featured Practices/Journeys directory + influencer/affiliate kickbacks +
Earnings view · 3.3 **Practitioner** ⚠️ **needs a re-scope before build**: "Paywalled Programs" names
a feature with no substrate (Programs was retired — see §11) · 3.4 **Business** — listing + network
integration + loyalty + CRM + website builder · 3.5 🔴 **Organization + Hook federation** (XL:
white-label sub-communities, identity link + Hook membership rollover, capped idempotent points
rollup, community federation / lead-funnel bubble, isolated tenant admin) · 2.7 per-persona **Stripe
Connect binding** (still stubbed) · 2.8 module registry + inter-entity Lab bridge · 2.6 entitlement
sources beyond `membership_tier` (comp / Lab / staff grants).

### 8l. Nav / IA (P7)

Operator dashboards (`/admin` suites → Community Studio / Insights / Platform) · **Practices+Library
merge** · the `NAV_AREAS` rewrite → a **data-driven Site Navigation admin suite** · reconcile
"Interests" vs "Topics" · the **"tune in" verb decision** · page-editor polish (visual
focal-point/crop picker; `page_revisions` rollback).

### 8m. Moderation / safety / trust

Content-type-agnostic moderation (generalize `reports.target_type`, ADR-036) · ratings / reviews /
disputes for paid offerings · **crew task-volunteering UI inline on circle pages** (`crew_tasks` is a
catalog today) · **trust score wiring** — `trust_signals`/`trust_scores` are 0 rows with few
emitters; route marketplace/moderation/verification to emit signals + add the SECURITY DEFINER read
RPC + a recompute job.

### 8n. Teaser gate / access tiers

Extend the teaser gate to event/interest/best-practice pages · capability resolver gains
tier/entitlement input (free vs entitled sets, ADR-037) · Website Membership tiers horizontal.

### 8o. Empty seams — built, 0 rows in prod

`financial_transactions` (lights up from real purchases) · `trust_signals`/`trust_scores` ·
`journey_runs`/`journey_enrollments` (**seed a curriculum + launch one Circle cohort to prove the
loop**) · `profile_personas` (**onboard the first verified business/practitioner**) · public practice
library (0 `is_public` practices — see §4d) · `app_instances` (0 rows, see §6a).

### 8p. Owner UI/product calls from the 2026-06-05 screenshot review (BACKLOG §S)

S2 streak box half-height when collapsed · S3 broadcast colour → light blue token · S4 evolve the
"Beta Demo Content" box into direct action links · S5 composer "Announce" → "Dispatch" · S6 tiered
post options by role tier · 🔴 **S7 uniform right rail on every interior page** (site-wide
structural rule) · **S8 no orange highlight on input focus, site-wide** · S9 warm up the sterile beta
demo content · S10 Vercel preview deploys hang in "Initializing" · fold Outreach *content* into the
admin Overview · S1b drop the dormant `quest_*` tables.

### 8q. Open audit backlog from the Idea Inbox (IDEA-010 → IDEA-013)

Still 📋 after the sweep: **SEC-4** report-target existence check (`feed/report-actions.ts`) ·
**SEC-5** `joinRoom` per-scope membership check (`messages/…`) · **BUG-7** (Store, per IDEA-012) ·
plus the residue indexed in `SITE-AUDIT-2026-06-29.md`. **IDEA-003** (apply the constrained Effort
tier to remaining game-value setters — challenges, events, other metrics, role-gated) is Triaged for
Wave 3.

---

## 9. In-code markers (24)

| File:line | Marker |
|---|---|
| `app/(main)/admin/pricing/pricing-console.tsx:117` | `TODO(ADR-472 surfaces)` — the catalog editor lists add-ons generically |
| `lib/billing/pricing-keys.ts:312` · `lib/pricing/loadout.ts:8,81` | `TODO(ADR-472 surfaces)` — Marketing / Team / Branding add-ons folded into tier depth; `loadout` still hard-codes the `pro_base` line + a flat per-add-on quantity |
| `app/(main)/marketplace/review-actions.ts:15` · `lib/commerce/reviews.ts:139` · `supabase/migrations/20261112000000_commerce_reviews.sql:19` | `TODO(payments-on)` — gate reviews on `hasPurchasedProduct` once `host_payouts_enabled` is live; today `verified_purchase = false` |
| `components/admin/library/apps-lane.tsx:260` | `TODO(LP3/LP5)` — wire `library_usages` for deep links. ⚠️ **The table does not exist** (dropped `20260925000000:17`); this must become `block_usage` per ADR-975 |
| `lib/beta/stats.ts:122,131,142,149,156,163` | **Six `TODO(instrument)` markers** — beta funnel steps that render `null`: members who go on to host · who convert to a founding membership · first Practice/Journey within 7 days · solo members who host · Circles/metros crossing ~10 active · posts+reactions per active day |
| `lib/crm/lead-capture.ts:999` | `TODO` — build the reciprocal handshake surface (à la HiHello/Blinq). **Same item as §8a row 1** |
| `lib/commerce/products.ts:210` | `TODO(services-marketplace)` — cross-space browse after the Phase 3 backfill |
| `lib/apps/overrides.ts:78` · `supabase/migrations/20261011000000_app_overrides.sql:29,72` | **Phase 2 per-space overrides** — three markers for one unbuilt phase: a per-space row scoping to one Space, NULL = the scope-kind default |
| `lib/core/entitlement.ts:38` | `TODO(ADR-458)` — drop the supporter mapping once the migration has applied and no profile carries it |
| `supabase/migrations/20260925000100_library_lanes_expansion.sql:19` | `TODO(later slice)` — add a `library-files` storage bucket for font/document payloads |
| `lib/importer/edit-wins.ts:5` | Historical reference to the resolved `TODO(P5)`. **No action** |
| `scripts/check-menu.mjs:189` · `scripts/check-elements.mjs:44` | `XXX_MODULES` / `XXX:` are **regex placeholders**, not markers. **No action** |

---

## 10. Open questions and decisions

### 10a. Editor program — O-1…O-5 (none blocks E0)

| # | Question | Owner | Needed by |
|---|---|---|---|
| **O-1** | **Which Stripe Connect account type** — Express (Stripe hosts onboarding + dashboard, fastest) or Custom (we own the whole UI, most work, most control)? ⚠️ **Partly answered by shipped code** — its scope needs rewriting against `lib/billing/connect.ts` before anyone estimates E7 | Owner + billing | Before E7 |
| **O-2** | Does a member's Spotlight commerce carry the same platform fee as a Space's? | Owner | Before E7 |
| **O-3** | "Any paid plan" (D-7) — does that include the entry tier, and is there a Site quota per plan? | Owner | Before E10 |
| **O-4** | **Who owns token coverage, and what is the SLA on a token request?** D-1 (nobody writes raw CSS) converts to a support queue without an answer. **This is the one that can quietly invalidate a decision** | Owner | **Before the first paid Site** |
| **O-5** | Does multiplayer extend to Spotlight, or only Space profiles and Sites? | The doc, once E0 lands | Before E4 |

### 10b. Live decisions

| Decision | State |
|---|---|
| **Circles C3 — remove Space Communities, replace it with Circles** | ⏳ **Proposed, awaiting owner approval. Nothing built.** Zero live data (0 `space_updates`, 0 posts, 0 comments, 0 reactions), 1 route, 1 profile tab, 9 actions. **Two real risks:** (a) the `SpaceCommunity` **block is misnamed — it renders Circles**, and 18 of 20 live Spaces have it in a saved layout, so a careless rename silently drops it (ADR-978 skips unknown types); (b) **nothing replaces reaching everyone who follows the Space** — a Circle does not cover that, and the plan says ship the follower-reach gap as its own decision rather than pretend otherwise. Recommendation on the table: delete the wall, keep `space_updates` as the brand-Updates backend, rename the block **in place** (label + anchor only, never the type key), add the Circles tab, 308 the old URLs |
| **F-1 · Settle EDITOR-ARCHITECTURE's two 🔴 sequencing questions on paper** | ⚠️ **Still open.** Its own audit says starting E0 or E3 blocks immediately. **Cheap on paper, expensive after E1 ships** |
| **White-on-amber button text** | The DS artifact shows white on `#E2912F`; shipped is ink. **Ink measures 7.35:1 (AA + AAA), white 2.52:1.** White cannot ship without failing `check:contrast`. Either darken the amber (~`#8A5410` puts white at 6.26:1 — a real brand shift) or correct the artifact |
| **Amber as display text** | See §3c. Swap to `-strong` or waive explicitly |
| **`/the-lab` + `/spaces` meta descriptions** | ✅ Closed — both now under the cap (154 and 139 chars) |
| **4.1 · Programs** | ⚠️ **RETIRED, needs a re-scope.** See §11 |
| **BUILD-SEQUENCE §5 open decisions** | (1) legal entities live date — gates the money go-live · (2) which entity sells the paid membership tier (ADR-031) · (3) the inter-entity bridge mechanism (ADR-038) · (4) web's long-term role once mobile leads · (5) **data residency posture** (H3-12) |
| **BACKLOG §C economy calls** | `awardZaps` auto-promotes to `luminary` past the earned gate · store-redeem TOCTOU race · `lifetime_gems` doubling as the spendable wallet (**note: the rail read is now fixed; this is the remaining semantics question**) · gem-farm posture |
| **Owner product calls (CHECKLIST, still unanswered)** | "Interests" one word or two · **the "tune in" verb** · reward economy point values per action · **physical merch fulfillment** (the store spends gems today; trading gems for physical goods is a different posture) · **physical rollout & safety** — who may place ghost nodes, partner rules · **web's long-term role once mobile leads** |
| **Anonymous sign-ins conflict** | §4d says **disable** them (advisor, 147 unused calls). `resonance/`'s auth rung says **enable** them. **Reconcile before either lands** |

---

## 11. Doc and repo hygiene

| Item |
|---|
| ⚠️ **Three big track docs carry no superseded banner** — `FOUNDATION-HARDENING-PLAN.md`, `ENTITY-MANAGEMENT-OVERHAUL.md`, `GROWTH-OS-BUILD-PLAN.md`. `BUILD-SEQUENCE` still lists their Wave 0 as 📋 "next" while the DAWN/UX program overtook it. **A reader cannot tell whether the H-track is live.** Either banner them or fold the H-items into the live plan |
| ⚠️ **`META-SCAN-STATUS.md`'s 2026-07-27 "🟠 Medium" section needs an archive banner** — it is the longest open list in the repo and is substantially closed (§12) |
| ⚠️ **4.1 · Programs is stale in the dangerous direction.** The row says "✅ already built: 4 frameworks live in `content/programs/`". Re-measured: **`content/programs/` does not exist**, there is **no member `/programs` route**, and `20261113000000` removed the `program` arm from the catalog RPC while `20261114000000` dropped the tables. The feature was retired *after* the row was written, so "already built" now reads as "do not schedule" for a thing that no longer exists. **Three downstream rows inherit the error**: P5's "Programs content depth", P3.3's "Paywalled Programs", and DESIGN.md's "Program detail to DetailTemplate" |
| **Seven ADR numbers (088–094) are each used twice, 090 three times; 75 cross-references are ambiguous** |
| **ADR-219 is still marked "Accepted"** after ADR-305 retired it |
| **`ARCHITECTURE.md` documents two cron endpoints deleted by ADR-305**, still warns about a removed `vercel.app` canonical fallback, and still lists shadcn |
| **Doc fixes:** the em-dash sweep (23 files; **the rule is violated in `AGENTS.md` too**) |
| **Doc-vs-code discrepancies to reconcile** — partner redemption-on-capture, and the Notion drift on geography/tables/Stripe |
| **The `fix/codeql-seeder-write-allowlist` reconciliation** — an agent produced a superset branch and warned "do not merge both"; #2099 merged first. **Verified: it is superseded by #2099 + #2105 together**, six of seven files byte-identical. One thing to carry forward, not a blocker: in extracting `isUnsafeObjectKey()`, `main` dropped the branch's comment explaining **why** the guard sits at the write rather than upstream — *"consolidating it upstream for elegance is exactly what let the alerts come back once already."* The guard is intact; only its rationale was lost |
| **The standing habit, not a gate:** re-derive every debt count from `node scripts/check-adoption.mjs` before quoting it, and **say the date you read it**. A `check:baseline-citations` guard was built, measured at **41 candidates of which ~8 were real**, and deliberately **not shipped** — a guard that cries wolf 33 times in 41 gets muted within a week, at which point it is worse than no guard because it looks like coverage |
| **DOCS-PROTOCOL's per-change checklist** (6 steps) is the standing routing rule, not a backlog |

---

## 12. ⚠️ Already done but still listed as open — verify before working any older row

**This is the largest single category found.** Every row below was verified against code on
2026-08-17 and is **closed**, while at least one list still asks for it.

| Item | Listed as open in | Actually |
|---|---|---|
| **Circle-placed events invisible to the circle-membership gate** | META-SCAN 2026-07-27 | ✅ Fixed — `placement-actions.ts:116-117` now writes the bare `scope_id`/`scope_type` pair alongside the typed `scope_circle_id`, with a comment explaining why the typed column alone is invisible |
| **Reactivating a suspended operator bypasses the licensed-seat wall** | META-SCAN 2026-07-27 | ✅ Fixed — `lib/spaces/roster.ts:116-127` gates on `checkSeatForOperatorInvite`, and only a change that NEWLY consumes a seat is checked |
| **CRM import dedupe truncates at 1,000 rows** | META-SCAN 2026-07-27 | ✅ Fixed — `commit.ts:230-235` pages with an explicit note about PostgREST's `max_rows` |
| **Circle handoff has no way to see or cancel a pending offer** | META-SCAN 2026-07-27 | ✅ Fixed — PR #2122, ADR-1025 (a pending offer is shown before either picker) |
| **The Vault card shows `lifetime_gems` as "gems to spend"** | META-SCAN 2026-07-27 | ✅ Fixed — `right-sidebar.tsx:114-119` reads `getSpendableBalance`, with the reasoning inline |
| **The 7-day streak strip keys days in server UTC** | META-SCAN 2026-07-27 | ✅ Fixed — same file now calls `resolveMemberDay(profileId)` |
| **The per-topic notification Frequency selector is inert** | META-SCAN 2026-07-27 | ✅ A `frequencyDeferred` seam exists in `lib/comms/send-gate.ts` and `notification-preferences.ts:212-215` branches on it |
| **Space FAQ dead-ended with 62 live rows** — no editing UI, operators can neither edit nor delete | META-SCAN 2026-08-04 (🔴) | ✅ Fixed — `components/spaces/space-faq-editor.tsx` is the caller, mounted at `spaces/[slug]/settings/basics/page.tsx:187`, under tests |
| **`library_usages` — the admin Library splash lane still queries it** | META-SCAN 2026-07-27 | ✅ Fixed — ADR-979 deleted every reader; `splash-registry.ts:163` now documents the history in past tense |
| **`/spaces/<slug>/podcasts` canonicals to the profile root** | META-SCAN 2026-07-27, FINALIZE §10.12 | ✅ Fixed — routes through `spaceProfileMetadata` like the other tabs |
| **QR Studio reads `qr_scans` + `captures` unbounded** | META-SCAN 2026-07-27, BUILD-LIST P-PERF | ✅ Closed by ADR-969 — now `node_capture_counts` + `qr_stats_summary` RPCs. **The ADR records why it mattered beyond speed:** PostgREST caps a response at 1,000 rows, so past a thousand captures the page silently UNDER-counted with no error |
| **Beta graduation / admission-wave / referral prizes orphaned** | META-SCAN, BUILD-LIST | ✅ Closed by owner ruling (ADR-1006/1012) — the beta program is over, the board was empty (0 referrals, 0 founding grants), the code is deleted and **both unbacked promises came down** |
| **Email Studio Phase-3 template gallery is a dead subtree** | META-SCAN 2026-07-27 | ✅ Deleted 2026-08-12 |
| **Household/Circle bundle checkout has no caller and no webhook seating branch** | META-SCAN 2026-07-27 | ✅ **Mounted with both halves** (deliberately not deleted) — half-mounting was the specific risk |
| **The declared CRM policy layer + membrane contact-card primitive are unreferenced** | META-SCAN 2026-07-27 | ✅ Both `lib/crm/capabilities.ts` and `lib/crm/scope.ts` deleted |
| **The `<AppElement>` embeddable-elements mounter is orphaned** | META-SCAN 2026-07-27 | ✅ **There was never a mounter to orphan** — it existed only in comments. The dead component map is deleted |
| **`lib/marketing/personas.ts` is a second unwired persona registry** | META-SCAN 2026-07-27 | ✅ Deleted (ADR-915) |
| **`check:research-freshness` is built and advisory** | four docs said so | ✅ **Deleted (ADR-1011)** — it ran in no workflow and its own output ended *"Nothing a PR can fix, which is why this exits 0"*. It was structurally unable to fail |
| **`check:tokens` scope hole — `lib/` is entirely ungoverned** | UX-MATURITY §Gate corrections | ✅ Fixed — `ROOTS = ['app','components','lib']` with a documented allowlist |
| **The visual baselines are stale / "do not re-record"** | BUILD-LIST, UX-MATURITY | ✅ Recaptured in #2071 — `pr-compare` went 62 failures → 1. **The standing "do not re-record" order was the line that had to go** |
| **`RECRAFT_API_KEY` is unset** | HANDOFF | ✅ **Set, and was already** — owner-confirmed present on Production + Preview since Jul 1. This row asserted the opposite for a month |
| **`CRON_HEARTBEAT_BASE_URL` unset** / `check:cron-freshness` runs nowhere | FINALIZE | ✅ Both closed — the var is set, and the guard runs weekly in `maintenance.yml:147`. ⚠️ **The owner half remains** (§4a #5): a scheduled guard over unarmed monitors reports coverage it does not have |
| **UnderlineTabs needs moving to `components/ui/`**; `handrolled-tabs` at 3 | UX-MATURITY | ✅ Moved (ADR-971); the ratchet reads **0** |
| **`bespoke-cards` 24 / `bespoke-rows` 14 sweeps owed** | UX-MATURITY | ✅ Both rebased to **0**. Four sites were genuinely owed to the kit and all four converged; **the other 34 were filename collisions** — the classes key off the FILENAME, so they counted action clusters, QR panels, settings forms, and `grow-network.tsx`, which matched only because **grow** contains **row** |
| **P7 10.3 Network hub · P7 10.5 Settings hub** | BUILD-LIST P7 | ✅ Shipped. **One file listed them as both shipped and remaining, in two different paragraphs** |
| **`--radius-cover` is a phantom** | asserted in two docs | ❌ **RETRACTED — the claim was wrong** and did not survive the first grep. It is a Space-theme token, absence from `:root` is deliberate, both consumers call it with a fallback, and a test already enforces it |
| **`.mk-cream` / `.mk-ink` at zero adopters** | asserted in three places incl. `app/globals.css` | ✅ **CLOSED** — `Section` emits the tone class on every render, asserted in a committed snapshot. **The `globals.css` copy was the dangerous one:** it told the reader the halving rule "has never fired", so a spacing bug the rule causes would have been diagnosed against a comment saying it cannot happen |
| **`robots.ts` has drifted from `PROTECTED_PATHS`** | FINALIZE §10.16 | ❌ **RETIRED FALSE** — measured with the gate's own parser, the uncovered set is exactly `['/events']`, which `robots.ts` documents as deliberate and `proxy.ts` implements. Now pinned by a test |
| **`check:elements` would trip a block registry** | BUILD-LIST | ✅ Closed by inspection — it only fires on a `const X: ElementDef[]` in a file that *imports* `ElementDef` |
| Six 2026-08-11 fan-out findings — forged friendships · six browser-reachable SECURITY DEFINER RPCs · a 12-seat SKU that could sell 6 · swallowed DM failures · a store rank gate failing OPEN · event dates in two timezones · FAQ questions with no heading element · `eventSchema` hardcoding USD · **the maps being broken in every keyless environment** | FINALIZE §10 | ✅ All fixed (PRs #2089/#2090 and 2026-08-11 follow-ups) |

**Two things nobody has proven** (flagged so they are not treated as fact): see
`BASELINE-TODO-2026-08-12.md` §11.

---

## 13. How to use this

1. **Anything from §4 first.** 21 items, no code, and six of them block instruments that would
   otherwise catch the next outage. CP-1 is the one that matters most: two artifact gates may never
   have run.
2. **Then §3** — the live queue, in the order UX-MATURITY §Sequencing already committed to.
3. **Before touching anything in §6, §8 or §12's neighbourhood, verify it against the code.** The
   verification cost is minutes; the re-work cost is a session.
4. **Never quote a debt number without re-deriving it.** `node scripts/check-adoption.mjs` takes two
   seconds and settles every count in this document. Say the date you read it.
5. **§5 programs need a scheduling decision, not a start.** E0 and the two parked phases are waiting
   on the owner's call, not on engineering.
