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

### Phase 2 — SEO / AIO completion
- ⏳ Extend JSON-LD to in-app entity detail (circle · journey · space · practice); marketing pages
  already emit it. Self-canonical + OG audit on the entity pages.
- ⏳ Confirm `sitemap.ts` / `llms.txt` / `llms-full.txt` include the live entity routes and stay fresh.

### Phase 3 — performance (D3 + tail)
- ⏳ `messages` / DM / room fetch waterfalls → waves.
- ⏳ Authed `(main)/layout.tsx` serial-await tail → `Promise.all` + per-section `<Suspense>`.
- ⏳ `(marketing)` / `discover` / splash `cookies()`+`getUser()` defeats ISR → client-island auth.
- ⏳ `GameStatsDock` its own `<Suspense>`.
- 🟡 ~26 `<img>` → `next/image` on LCP surfaces (practices library, space profile, spotlight, market).
- 🟡 Help search index re-parsed per request + shipped in every RSC payload → cache.

### Phase 4 — control-condensing + polish + a11y
- ⏳ Extend the rail-editor's modern icon-group inspector density (ADR-570 primitives) to the
  operator/admin surfaces still hand-rolling chunky controls: Theme Studio, walkthrough editors,
  marketplace manager, admin row-actions.
- ⏳ a11y tail: missing `error.tsx` / `not-found.tsx` per route group; icon-only buttons need
  `aria-label`; dialog focus-trap soundness; client mutations without error feedback.
- 🟡 Page-framework nits: hardcoded hex + `text-[11px]` in admin/marketplace components; hand-rolled
  headers in Theme Studio / walkthrough editors.

### Phase 5 — Business Importer P5 polish
- ⏳ Edit-wins re-apply: write `_editedProse` from the review board so a re-run preserves operator
  prose edits (closes the live `TODO(P5)` in `lib/importer/pipeline.ts`).
- ⏳ Confidence-threshold tuning · source-manager UI · demo decay.

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
