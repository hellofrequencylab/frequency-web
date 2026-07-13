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

### Phase 1 — safe cleanup + bug/wiring/abandoned-code ✅
- ✅ Re-verified the flagged single-symbol exports. `MapPreview` no longer exists in the tree (only
  stale doc mentions). `DeltaBadge`, `StudioSectionLabel`, and `canSeeMenuCategory` were genuinely
  dead (no import/dynamic reference) and were REMOVED with their now-dead types/records/imports; the
  kit reference docs (KIT.md, ADMIN-DESIGN-SYSTEM.md, STUDIO.md) were trimmed to match.
- ✅ `docs/PAGE-EDITOR-SPEC.md` retired-route reference fixed (`/edit/[slug]`); stale `/studio/pages`
  pointers corrected to `/pages` in PAGE-EDITOR-SPEC §5 + BUILD-PHASES.
- ✅ `_input` (`lib/importer/pipeline.test.ts:227`) verified lint-clean: it is a warn-level
  `no-unused-vars` with `argsIgnorePattern: '^_'` (already suppressed) and its TYPE is load-bearing for
  `mock.calls[0][0]`, so no change was needed.
- ✅ Help-doc naming audit: corpus is canon-aligned; the one retired-term swap was first-party
  "the Shop" → "the Frequency Store" (ADR-596) in `content/help/connecting/search.md`.
- ✅ Em/en dashes removed from operator/admin surfaced copy (prose + numeric/date ranges → "to") and
  from `lib/demo/engine.ts` demo content. Code comments, null-value glyphs, and AI system prompts
  left untouched (out of scope).

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
- ✅ **Edit-wins on RE-APPLY (materializer)** (ADR-606) — the materializer stamps
  `preferences.importerEditWins` (`{ editedFields, appliedIdentity }`, no new column) recording the identity
  values it last wrote; a re-apply diffs the live Space against that snapshot and skips any field the operator
  edited (name / tagline / brandName / brandAccent). Pure diff logic in `lib/importer/edit-wins.ts` +
  `edit-wins.test.ts`. Mirrors the re-research edit-wins. (`about`/profileData widening is a noted follow-up.)
- ⏳ Confidence-threshold tuning · source-manager UI · demo decay (feature work; own phase).

## Importer v2 — strategic seeding + Loom (owner request, 2026-07-07)

A cohesive next project on the Business Importer. Good news: the **Loom (DAM) already has the
architecture** — `library_assets` are space-scoped (`space_id NOT NULL`), the MASTER Loom IS the root
space's Loom, `library_collections` give categories, and `lib/library/space-images.ts` already handles
space image ingest. So #3–6 are mostly WIRING the importer into existing infra, not new plumbing.

| # | Request | Shape | Notes |
|---|---|---|---|
| 1 | Explore brand marketing language, ID primary demographic, improve via Frequency Voice | ✅ code (ADR-606) | `lib/importer/reframe/demographic.ts` runs a demographic/positioning pass over the verified grounding before reframe; stores `BusinessProfile.demographic` and folds it into the reframe prompt as a private voice steer. Additive + fail-safe. |
| 2 | Multi-image upload in the importer | ⏳ code | An uploader on the seeder review page → the Space's Loom. Reuse `components/ui/image-upload` + `lib/library` ingest. |
| 3 | Uploaded images assigned to the Space's Loom, available on claim/edit | ✅ infra | `library_assets.space_id` = the seeded Space; already surfaces in that Space's Loom on claim. Importer must write assets with the space_id. |
| 4 | Each account has its own Loom | ✅ infra | Space-scoped Loom already exists per Space. No new work beyond seeding assets there. |
| 5 | Uploaded images in the Master Loom, segmented by Space | ✅ infra | Master Loom = root-space Loom; segmentation = `space_id`. The admin Loom view filters by Space. |
| 6 | Master (admin) Loom: a "Spaces" category with all their images | ✅ code (ADR-606) | A root-space `library_collection` (slug `spaces`, `ensureSpacesCollection`) groups seeded Spaces' assets; `fileSeedImagesIntoLoom` files each image into it; `searchLibraryAssets` gained a `crossSpace` mode so the admin Loom rail surfaces + browses them across spaces. No new schema. |
| 7 | Seed AND Re-Seed using different moods | ⏳ code + decision | `runResearch` is already idempotent-friendly (reuses cached sources unless `forceRefetch`). NEEDS a **mood taxonomy** decision (what moods? how do they steer extract/reframe/compose + block choices?). |
| 8 | Return to a Space's seed page, upload images, tweak, re-seed | ⏳ code | The seeder [id] page gains an editable inputs + image panel and a "Re-seed" action (calls `runResearch({forceRefetch})` / re-compose). Edit-wins (P5, shipped) protects operator prose. |
| 9 | Analyze market/strategy/demographics → a best-practice block page with content, images, strategic CTAs specific to the business | ⏳ code + design | The biggest: a strategy pass that picks blocks + composes an `EntityLayout` (the materializer already composes layouts). Needs a compose-strategy design (which blocks, which CTAs per business type/mood). |

**Sequencing (proposed):** (A) #1 demographic+voice deepening → (B) #2/#3/#6 Loom image ingest + Spaces
category → (C) #8 re-seed page + #7 moods (needs the mood taxonomy call) → (D) #9 strategic page gen
(needs the compose-strategy design). Coordinate with the concurrent importer track (P4 Owner Wizard).
Any new table/column is coordinator-applied (ADR-574 pattern). Auto-refresh of the review page is
already shipped (this PR) — it just needs #1606 to merge to reach production.

## Code — decision-gated (deferred by owner, 2026-07-07)
- ⏳ **Importer P4 — Owner Wizard** (Vera-led conversational intake → same `business_intake` draft →
  P3 review board). Multi-day; its own phase when greenlit.
- ⏳ **Pricing page four-tier rebuild** (`TODO(ADR-472)`, `app/(marketing)/pricing/page.tsx`). Blocks
  on the owner supplying the tier names / prices / what each unlocks.

## Marketplace — future phases (deferred by owner, 2026-07-11)

The commerce/housing work merged in #1698 shipped the near-term slice; these are the planned follow-on
phases, parked here until the owner greenlights them. Specs: [`ETSY-GRADE-PLAN.md`](ETSY-GRADE-PLAN.md)
(ADR-601), housing matching in ADR-604. All build on the one commerce spine (ADR-596), Business-account
gated for payments. Migrations for the shipped slice (`commerce_variants`, `housing_matching_v2`) are
**applied to prod + types regenerated** (2026-07-11); payments are live (`payoutsLive()` on).

| # | Phase | Shape | Notes |
|---|---|---|---|
| ⏳ | **Etsy-Grade P3 — Shipping & delivery** | code + migration | Seller shipping profiles (flat / weight / zone), buyer address + shipping selection at checkout, digital-delivery for `digital` products. Adds a shipping line to order totals; charge model unchanged. |
| ⏳ | **Etsy-Grade P4 — Discovery & search** | code | Faceted Market search (category / tags / condition / price / seller type) + relevance/recency/trust ranking + curated collections. Reads the existing products + ticket-projection union, no new store of truth. |
| ⏳ | **Etsy-Grade P5 — Cart + multi-seller checkout** | code + migration | A persistent cart spanning sellers, split into per-seller destination charges in one buyer flow (one intent, N transfers), each seller's take rate preserved. |
| ⏳ | **Etsy-Grade P6 — Orders, fulfillment & messaging** | code + migration | Buyer/seller order timelines, fulfillment states (shipped / delivered / completed), tracking capture, order-scoped buyer↔seller messaging (reuse the messaging spine). |
| ⏳ | **Etsy-Grade P7 — Trust, growth & tax** | code + migration | Promotions / discount codes, seller payout + earnings reporting, tax posture (collection config + 1099 thresholds). Extends the T&S of ADR-598. |
| ⏳ | **Housing — natal-chart matching** | code + migration | Beyond the shipped sun-sign quiet-5% (ADR-604): full natal-chart compatibility as an opt-in, both-sides factor. Needs an ephemeris/compute decision before build. |
| ⏳ | **Housing — Resonance match alerts** | code | Notify a seeker when a strong new listing or roommate match appears (the matching RPCs exist; this is the alerting layer on top). |

## Booking — future phases (deferred by owner, 2026-07-12)

Booking v1 (weekly availability -> slot picker -> `space_bookings`) plus the operator setup prompts
shipped in #1708. These are the Calendly-grade follow-on phases, parked until greenlit. Full spec:
[`BOOKING-PLAN.md`](BOOKING-PLAN.md) (ADR-605). Every phase is additive over the one booking spine
(`lib/spaces/booking.ts`); payments build on the commerce spine (ADR-596), Business-gated + dark
behind `payoutsLive()`.

| # | Phase | Shape | Notes |
|---|---|---|---|
| ⏳ | **Booking P1 — Service types + durations** | code + migration | Multiple bookable offerings per Space (e.g. 30 / 60 / 90 min), each its own duration, price hint, description (the Calendly "event type"). `space_service_types`; slot generation respects the chosen service's duration. |
| ⏳ | **Booking P2 — Availability rules** | code + migration | Named availability schedules with buffers before/after, minimum notice, configurable booking window, date overrides/blackouts, and per-invitee timezone display. `space_availability_schedules` + `_overrides`; buffer-aware conflict checks. |
| ⏳ | **Booking P3 — Reschedule / cancel + reminders** | code + migration | Member self-serve reschedule/cancel within policy, confirmation + reminder emails (reuse the outbox), booking questions, optional ICS attachment. |
| ⏳ | **Booking P4 — Payments / deposits** | code + migration | Take a deposit or full payment at booking on the commerce spine (largely the already-written, dormant `bookable_services` hold-first seam). Business-gated + dark behind `payoutsLive()` until launch. |

## Already done (do not re-open)
- ✅ Modular admin menu on one contract, every scope, CI-locked (`MODULAR-MENU.md` P0–P5).
- ✅ Editor / rail-arranger overhaul (ADR-565→573).
- ✅ Business Importer P0–P3 (spec, materializer, harvest/extract/verify, reframe + 3-surface compose,
  operator seeder console at `/admin/business-seeder`); `business_intake` migration applied to prod.
- ✅ Stripe/economy atomicity, DB advisor sweeps, `@measured/puck` removal, dead-code sweep, Gift Gems
  UI, timezone system — see `META-SCAN-STATUS.md` / `PATCH-LIST.md` for the shipped detail.
