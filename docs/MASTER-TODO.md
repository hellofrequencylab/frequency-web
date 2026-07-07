# Master to-do — the single burn-down

> **This is the one list.** It supersedes the scattered "open" tails in
> [`META-SCAN-STATUS.md`](META-SCAN-STATUS.md), [`PATCH-LIST.md`](PATCH-LIST.md),
> [`REDESIGN-STATUS.md`](REDESIGN-STATUS.md), and the in-code `TODO(...)` markers. Those docs
> stay as the historical record of what shipped; **new planning happens here.** Update a row as it
> closes (✅), and move genuinely-new subjects to their own ADR when they warrant one.
>
> Legend: ✅ done · ⏳ open (code) · 🔵 owner action (no code — dashboard/env/config) · 🟡 polish.
> Standing directives on every code item: bug/wiring/abandoned-code check on each surface touched ·
> condense controls (modern icon-groups, not chunky labeled buttons) · polish · SEO + AIO ready.

## Snapshot (2026-07-07)

The admin/menu program (`MODULAR-MENU.md`) and the editor overhaul are **complete + CI-locked**; the
Business Importer is **P0–P3 shipped** (usable today), P4–P5 remain. What's left is a quality tail
(perf, a11y, SEO/AIO, control-density polish), two decision-gated features, and a set of owner config
actions. Build/lint/test green; no migration drift; no known correctness or security bugs open.

## Owner actions (no code — do these in the dashboards / env)

| # | Action | Impact | Where |
|---|---|---|---|
| 🔵 | Set **`CRON_SECRET`** | `lib/cron-auth.ts` is fail-closed in prod — WITHOUT it **every** cron 401s: the outbox drain (all email/push/SMS), importer research, automation + drip runners, event reminders, scheduled publish, demo-decay. Highest priority. | Vercel env |
| 🔵 | One **Stripe webhook** endpoint + `STRIPE_WEBHOOK_SECRET` | ADR-506 consolidated the two routes into `/api/webhooks/stripe`; without the single endpoint configured, reconciliations drop. | Stripe dashboard + Vercel env |
| 🔵 | Enable **leaked-password protection**; disable **anonymous sign-ins** | Closes two standing Supabase advisors (anon sign-ins fire 147× but the code never calls it — unused attack surface). | Supabase → Auth |
| 🔵 | Importer env: `BRAVE_SEARCH_API_KEY` (optional), `BUSINESS_IMPORT_CAP_USD` (optional, $1.50) | Search degrades to `[]` without the key; cap bounds per-import spend. | Vercel env |
| 🔵 | Submit `sitemap.xml` to Google Search Console + Bing | Crawl/index of the programmatic hubs. Needs domain verification. | GSC / Bing |

## Code — the sweep (Phases 1–5, executing now)

### Phase 1 — safe cleanup + bug/wiring/abandoned-code
- ⏳ Re-verify the flagged single-symbol exports (`MapPreview`, `DeltaBadge`, `StudioSectionLabel`,
  `canSeeMenuCategory`) — remove if truly dead, or keep with an explicit intended-surface reason.
- ⏳ `docs/PAGE-EDITOR-SPEC.md` cites the retired `/studio/pages/[slug]/edit` route — fix + stale-pointer sweep.
- 🟡 `_input` unused-var lint warning (`lib/importer/pipeline.test.ts:227`).
- 🟡 Help-doc naming audit: sweep `content/help/**` for retired member terms.
- 🟡 Em dashes in operator/admin copy + `lib/demo/engine.ts` demo content.

### Phase 2 — SEO / AIO completion ✅
- ✅ Audit found coverage was already **complete**: every PUBLIC entity surface (`/discover/*` events,
  circles, journeys, practices, places, topics, partners; `/spotlight/*`; `/sites/*`; the space
  profile) emits valid JSON-LD + self-canonical + OG. The in-app `(main)` pages are auth-gated (correctly
  NOT indexed), so schema there would be wrong. `check:seo` green; sitemap/llms.txt/llms-full.txt current.
- ✅ The one gap was consistency: the circle detail carried an INLINE `Organization` node while every
  other entity used a helper. Extracted `circleSchema()` into `lib/jsonld.ts` (city-level location,
  never fabricated) + a test, and wired the page to it.

### Phase 3 — performance (D3 + tail)
Audit finding: the meaningful perf work is **already shipped** — the meta-scan's "open" tail was stale.
- ✅ Authed `(main)/layout.tsx` serial-await tail → one `Promise.all` wave (lines ~239-298) + overlay
  slots streamed behind `<Suspense>` (Vera/Coach/AutoPopups). Verified in-code.
- ✅ `messages` inbox → already on `Promise.all` ("~6 serial round-trips" fixed). Verified.
- ✅ `GameStatsDock` already has its OWN `<Suspense>` (`right-sidebar.tsx` ~237). Verified.
- ✅ Help search index already React-cached (once per request), streamed in `VeraLauncherSlot`. Verified.
- ⏳ **Deferred to a dedicated PR (HIGH-risk, out of scope for this sweep):** `(marketing)`/`discover`/
  splash `cookies()`+`getUser()` → client-island auth to restore ISR. Changes the public-page auth model;
  the meta-scan flags it for an isolated, test-gated change.
- 🟡 **Deferred (needs per-surface QA):** `<img>`→`next/image`. The 27 raw `<img>` are almost all in
  auth-gated editors/admin/upload-preview/map contexts (no LCP benefit); the few LCP candidates
  (event poster, block renderer) have variable aspect ratios needing visual QA a headless sweep can't do.

### Phase 4 — control-condensing + polish + a11y ✅ (first pass)
- ✅ Condensed the marketplace seller storefront row-actions (Publish / Mark sold out / Unpublish /
  Delete) from a wrap of labelled ghost buttons into a tight cluster of 32px icon controls, each with an
  `aria-label` + tooltip + focus ring (`makers/manage/page.tsx`). The modern-icon exemplar.
- ✅ Page-framework canon: killed `text-[11px]` (→ `text-xs`) and the hardcoded `#7a5c3a` accent-hex
  fallback (→ token `var(--color-primary)`) across `function-grid`, `type-defaults-grid`, `icons-lane-view`.
- ✅ **Added the "Import a business" wizard box to `/admin/spaces`** (owner request) — a polished CTA card
  linking to the P3 seeder console (`/admin/business-seeder`), shown even with zero Spaces.
- ✅ **Fixed the Space-profile right-margin gap** (owner report): `OwnerSpaceLayoutPreview` carried
  `lg:pr-4 xl:pr-8` that double-counted the shell's content↔rail gutter, leaving a dead vertical strip.
  Removed it so the owner preview fills the same width the visitor render does.
- ⏳ Remaining (future pass): extend the icon-group density to Theme Studio / walkthrough editors;
  a11y tail (missing `error.tsx`/`not-found.tsx` per route group, dialog focus-trap).

### Phase 5 — Business Importer P5 polish
- ✅ **Edit-wins on RE-RESEARCH (reframe prose)**: the review board (`updateImportField`) now stamps
  `draft._editedProse` via the pure `nextEditedProse` writer (edit/confirm add, drop removes), the
  write-twin of the already-tested `editedProsePaths` reader. A re-research (`runResearch`) carries the
  operator's tagline/about/story forward instead of overwriting with fresh AI copy. Closes the live
  `TODO(P5)` in `pipeline.ts`. 4 new pure tests + a writer→reader round-trip.
- ⏳ **Edit-wins on RE-APPLY (materializer)** — a DISTINCT, larger item still open (`TODO(P5)` in
  `materialize.ts`): an `edited_fields` marker on the live Space so a re-apply diffs the draft against
  the Space and only writes un-edited fields. Needs a Space-side marker + per-field write gating.
- ⏳ Confidence-threshold tuning · source-manager UI · demo decay (feature work; own phase).

## Code — decision-gated (deferred by owner, 2026-07-07)
- ⏳ **Importer P4 — Owner Wizard** (Vera-led conversational intake → same `business_intake` draft →
  P3 review board). Multi-day; its own phase when greenlit.
- ⏳ **Pricing page four-tier rebuild** (`TODO(ADR-472)`, `app/(marketing)/pricing/page.tsx`). Blocks
  on the owner supplying the tier names / prices / what each unlocks.

## Already done (do not re-open)
- ✅ Modular admin menu on one contract, every scope, CI-locked (`MODULAR-MENU.md` P0–P5).
- ✅ Editor / rail-arranger overhaul (ADR-565→573).
- ✅ Business Importer P0–P3 (spec, materializer, harvest/extract/verify, reframe + 3-surface compose,
  operator seeder console at `/admin/business-seeder`); `business_intake` migration applied to prod.
- ✅ Stripe/economy atomicity, DB advisor sweeps, `@measured/puck` removal, dead-code sweep, Gift Gems
  UI, timezone system — see `META-SCAN-STATUS.md` / `PATCH-LIST.md` for the shipped detail.
