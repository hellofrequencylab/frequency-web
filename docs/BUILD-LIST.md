# Master build list — Frequency web

> **The single, prioritized, execute-from list for the whole platform.** Consolidates every
> scattered roadmap (BACKLOG · ONBOARDING-BUILD-LIST · DEVELOPMENT-MAP · IA-RESTRUCTURE ·
> EDIT-PATH-AUDIT · STUDIO-REVIEW · LAUNCH · CHECKLIST) into one ranked list, after the
> 2026-06-08 five-domain code sweep + the owner's Roles & Permissions redesign.
> Legend: ✅ done · ⏳ partial / in flight · 📋 specced, not built · 🔴 blocked / gated.
> Spec detail still lives in the per-topic docs; this is the **order of operations**.

## 🧭 Practice library at scale — 2026-06-28 ([ADR-438](DECISIONS.md), full spec [PRACTICE-LIBRARY.md](PRACTICE-LIBRARY.md), economy detail [REWARDS-ECONOMY §3a](REWARDS-ECONOMY.md))

Re-architect the practice library from a ~200-item staff set into an **endlessly growing,
member-remixable library** across the four Pillars (Mind / Body / Spirit / Expression), with
**auto-valued, farm-proof points** and a **primary + secondary Pillar split**. The backend
taxonomy is already strong (Pillars, 21 subcategories, hybrid tags, `vector(384)` embeddings +
`match_practices()`, status workflow, slugs, `space_id`); the gap is the **admin surface** (hard
200 cap, no server search/filter/pagination, client-only sort, bulk capped at 500, view-only
review queue, no archive, no dedup, no remix lineage) plus two product variables locked in ADR-438.
Verified on prod (`azsqfeonabsbmemvddqd`): embeddings unpopulated (0/21), no lineage column, no
`tsvector`, `practice_tiers` already dropped. **Sequence: Scale → Clean → Grow → Autopilot.**

### Two locked variables (ADR-438)
- **Primary + secondary Pillar split.** Keep `domain_id` (primary); add `secondary_domain_id`
  (`CHECK <> domain_id`) + `primary_pct smallint default 75 CHECK (between 50 and 100)` (secondary =
  `100 - primary_pct`; null secondary = 100%). One slider, snaps 75/25, floor 50 keeps the primary
  dominant. The split **attributes earned Zaps across Pillars** (per-Pillar progress) and **never
  changes the wallet total** — no inflation lever. Columns ship Phase 1; attribution ledger Phase 4.
- **Auto-valued, creator-proof points.** `computePracticeReward(practice)` derives **intensity** from
  structure (`timer_kind`, required `duration_min`, modality → light/standard/heavy = 8/12/15 Zaps),
  with **cadence as the frequency-normalizer** (ADR-303 balance preserved). Writes `weight_class` /
  `reward_zaps`; log-time chokepoint unchanged. Free-form pick + manual override become a **staff-only
  audited break-glass**. Anti-farm: value is bound to required engaged time and the timer gate forces
  it to be spent (no 2-minute "heavy"), so Zaps-per-real-minute stays flat. Stacks on the existing
  one-log/practice/day, 25-distinct/day cap, partial=1, Zaps-non-spendable, validated-creation gates.

### Phase 1 — Scale it (the operator workspace)
| # | Scope | Status |
|---|---|---|
| 1.1 | **Search foundation.** `search_vector tsvector` (from title/summary/body/tags) + GIN; **backfill `embedding` (0/21)** + generate on every write; hybrid retrieval RPC (full-text + pgvector fused with RRF). | ✅ ADR-445 (`search_vector` + GIN + `search_practices_hybrid()` RRF RPC; `embedPractice` on-write + `embed-practices` backfill cron) |
| 1.2 | **Unbounded list.** Replace the 200-row cap (`rankedPractices`) with keyset (cursor) pagination + server-side sort. | ✅ `searchAdminPractices` — keyset on default score sort, offset on alternates, exact total |
| 1.3 | **Faceted query layer.** Server facet counts: Pillar · Subcategory · Status · Weight · Public/Template/Featured · Creator · Tag · computed (no image · no body · never logged · no Pillar · possible duplicate). | ✅ `searchAdminFacets` + `practice_admin_facets` RPC (global counts by design; residual faceting → Phase 2). Possible-duplicate is the gated `findPracticeDuplicates` |
| 1.4 | **Lifecycle.** Add `archived` status (deprecate without delete; hidden from members, history preserved) + archive bulk action. | ✅ `archived` status; archive/restore actions set `is_public=false` so member reads never surface it |
| 1.5 | **Pillar split + lineage columns (schema).** `secondary_domain_id`, `primary_pct`; `remixed_from` + `root_practice_id` populated by `forkPractice`/`claimPractice` (no UI yet). | ✅ columns + constraints shipped (migration `20260827000000`); fork/claim populate them in Phase 3 |
| 1.6 | **Bulk at scale.** Bulk ops act on the whole filtered set, not the visible 500. | ✅ `resolveAdminPracticeIds` + `bulkPracticesByFilterAction` (`ADMIN_BULK_MAX=5000`, reports `capped`) |
| 1.7 | **Workspace UI.** Recompose on the Dashboard template + faceted Index body: `StatCard` row, search box, facet rail, saved views. Rail via `page-chrome.ts`. | ✅ `DashboardTemplate` + StatCard band + in-page facet rail (admin is rail='none') + URL-driven search/sort/filters + keyset "Load more"/offset paging + localStorage saved views |
| 1.8 | **DataTable call.** Extend the shared `DataTable` (ADR-233) vs. formalize the bespoke table — decided in-build. | ✅ **decided: bespoke** — `DataTable` is presentational/server-sorted with no selection slot; the table needs row checkboxes + per-column master switch + per-row optimistic toggles. Filtering/sorting/paging are now server-owned; a thin client wrapper owns only selection + the bulk bar (rationale in `practices-table.tsx`). Adding a `selection` slot to `DataTable` is the documented follow-up |
| — | **Phase-1 carry-overs** (deferred, not regressions): residual ("minus-self") facet counts → Phase 2; server-backed saved views (Phase 1 ships localStorage presets); `lib/database.types.ts` regen + drop the untyped admin-handle casts (integrator step). | 📋 |

### Phase 2 — Keep it clean (quality + moderation)
| # | Scope | Status |
|---|---|---|
| 2.1 | **Triage review queue.** Bulk approve/reject; prioritize by submitter trust + similarity; near-duplicate flag at submission via `match_practices()`. | ✅ server ([ADR-446](DECISIONS.md)) — `listReviewQueue` (near-dup + submitter-trust + recency order; trust join inert until Phase 3) + bulk approve/reject in `actions.ts` (`requireCurator`). ⏳ review-queue v2 UI in flight on the branch |
| 2.2 | **Dedup + merge.** Pick canonical, redirect adoptions/logs, keep old slug as a redirect. | ✅ server ([ADR-446](DECISIONS.md)) — `merge_practices(from_id,to_id)` RPC (re-point never delete; drop-dup-then-repoint on the unique relations) + `mergePractices`/`mergePracticesAction`; `practice_slug_redirects` + `resolvePracticeSlugRedirect` 301 fallback on `/practices/[id]`. Migration `20260828000000` applied to prod. ⏳ merge UI in flight |
| 2.3 | **Quality score** (completeness + engagement + freshness) → a real "Needs attention" panel (orphaned · imageless · never-logged · stale). | ✅ server ([ADR-446](DECISIONS.md)) — `computeQualityScore` + `isStale` (`lib/practices/quality.ts`) + `needsAttention`; `updated_at` + `trg_practices_touch_updated_at` is the freshness signal. ⏳ "Needs attention" panel UI in flight |
| 2.4 | **Tag governance.** Promote member tag → canonical; merge synonyms. | ✅ server ([ADR-446](DECISIONS.md)) — `listAllTags`/`promoteTagToCanonical`/`mergeTags` + `promoteTagAction`/`mergeTagsAction` (`requireCurator`). ⏳ tag-governance UI in flight |
| 2.5 | **Vera pre-screen.** Auto-check voice (CONTENT-VOICE), completeness, safety before public. | ✅ server ([ADR-446](DECISIONS.md)) — `lib/ai/practice-publish-screen.ts` (budget-gated voice/completeness/safety, deterministic fallback, advisory-only) + `screenPracticeAction`; `budget.ts` cap. ⏳ surfaced in the in-flight publish UI |
| — | **Phase-2 in-flight UI** (on the branch, not merged): review-queue v2 · "Needs attention" panel · merge UI · tag governance; plus a table-overlap rework, the "System" → "Frequency" house-practices rename, and converting the page body into layout-editor block areas (`PageModules`, per [ADR-270](DECISIONS.md)/272). | ⏳ |

### Phase 3 — Make it grow (remix engine) — ✅ shipped (#1214, [ADR-447](DECISIONS.md))
| # | Scope | Status |
|---|---|---|
| 3.1 | **Surface lineage.** Remix trees, "most remixed," credit to originals (uses Phase 1 columns). | ✅ `lib/practices/lineage.ts` (`getPracticeLineage`/`mostRemixed`/`topRemixContributors`, one indexed scan via `root_practice_id`) + `practice-detail-lineage` |
| 3.2 | **Remix prompts.** "Make it yours" / "Remix it" variation list. | ✅ `remix-practice-button` + `forkPractice` populating `remixed_from`/`root_practice_id` |
| 3.3 | **Operator levers.** Mark remix seeds, view lineage depth, spotlight prolific remixers. | ✅ `components/widgets/practices/admin/remix-levers` |
| 3.4 | **Contributor recognition** surfaces in admin. | ✅ `components/widgets/practices/admin/contributor-recognition` |

### Phase 4 — Run it on autopilot (AI curation + analytics)
| # | Scope | Status |
|---|---|---|
| 4.1 | **`computePracticeReward()`** wired as the valuation authority + **per-Pillar Zap attribution ledger** (the split's payoff). | 📋 |
| 4.2 | **Vera curation.** Auto-suggest Pillar/subcategory from the embedding, auto-tag, auto-summary, voice-check, generate remix prompts. | 📋 |
| 4.3 | **Library health dashboard.** Growth, **coverage gaps by Pillar/subcategory**, adoption funnel, top/bottom performers, review SLA, contributor leaderboard. | 📋 |

**Cross-cutting (every phase):** naming + voice canon (no em dashes, "Make it yours") · page-framework kit (compose, don't author) · docs protocol (ADR in git, operator how-to in Notion) · audit log · RLS · `space_id` scoping · tuning via `zap_config`/`gem_config` (data, not code).

## ✨ Spotlight — remaining MySpace / Discord socials — 2026-06-27

The Spotlight editor shipped rounds 1–7 (blocks, images/GIF/bg, gallery/quote/stats, themes
+ gradients + fonts + per-block colours, Crew+ self-enable, the live split-screen builder,
media embeds — Spotify/YouTube/SoundCloud/Vimeo). The iconic socials still to build, each a
bigger lift (storage + moderation), captured here as the build queue:

| Item | Scope | Status |
|---|---|---|
| **Top Friends** | The MySpace "Top 8": pick N friends to feature in a grid on your Spotlight. Reuses the existing friends/friendships data — no moderation needed. **Build first.** | 📋 specced, not built |
| **Guestbook** | Visitors leave a note on your Spotlight. Needs a `spotlight_guestbook` table (RLS: owner reads all, anyone-signed-in writes), moderation (hide/report, owner delete), rate-limit + anti-spam, and the read-side render. | 📋 specced, not built |
| **Stickers / decals** | A playful decorative layer — place emoji/earned stickers on the page (absolute-positioned, validated coordinates + an allowlisted sticker set). | 📋 specced, not built |

Deferred embed providers: Bandcamp, Apple Music, Twitch (each needs a host-allowlist entry +
`frame-src`). Earned cosmetics (frames/skins tied to gems/streaks) remain in the cosmetics lane.

## 🌐 Resonance Feed + access model — 2026-06-26 ([ADR-414](DECISIONS.md), [spec](RESONANCE-FEED-ARCHITECTURE.md))

The worldwide, density-adaptive ("ripple") resonance feed + the real-Crew create gate. One feed that
is always full, gets more local the denser your area is, expands outward when sparse, and quietly
introduces people on the same wavelength. Built ON the shipped resonance graph, embeddings, and geo
RPCs (the composition layer was the gap, not the data). Full design: [`RESONANCE-FEED-ARCHITECTURE.md`](RESONANCE-FEED-ARCHITECTURE.md).

| Phase | Scope | Status |
|---|---|---|
| **0. Foundations** | Real-Crew create gate across Events · Circles · Journeys · Practices (four `*.create` capabilities reading the real tier so the free-beta upgrade popup fires) + `CrewGateButton` everywhere. Additive schema: `suggestion_hidden` (hide/X a suggestion), `resonance_density_cells` (per-geocell activity rollup), `member_match_prefs` (reserved romance + astrology baselines, off/null). | ✅ this PR |
| **1. Blended rank** | The five-signal score (proximity + graph + interest + recency + soft signals) + diversity rerank as one unified feed rank, composing the existing proximity RPCs, resonance edges, and embeddings. People-suggestions enter the feed. | ✅ shipped (ADR-415) |
| **2. Adaptive radius + founder prompt** | The density-rollup job + the expanding-ring walk (neighborhood → city → region → world). Founder-vs-closest-activity branch. The "turn on location, we never share your exact spot" nudge. | ✅ shipped (ADR-416) |
| **3. Radius slider + hide control** | Member radius slider (writes `feed_radius_m`); X-to-hide wired to `suggestion_hidden`; streak-as-a-quiet-signal in the rank. | ✅ shipped (ADR-417) |
| **4. Safety + verification** | Safety guidance + verification. | ✅ shipped (ADR-418 + ADR-420: "showed up" verification, gates the romance lane) |
| **5. Romance + astrology** | Opt-in astrology compatibility signal + a mutual-opt-in romance lane, on the Phase 0 scaffolding. Off by default, no swipe, meet-safely throughout. | ✅ shipped (ADR-419) |

**Cardinal rule across every phase:** exact location never leaves the DB. All discovery reads use the
fuzzed ~1.1km geocell or coarse band labels, never raw coordinates. Privacy controls already exist
(`location_band`, `discoverable_by`, `discovery_radius_m`, `ghost_mode`).

## 🔎 Audit-backlog clearance — 2026-06-25 (merged #1086)

The full deferred backlog from [`AUDIT-2026-06-25.md`](AUDIT-2026-06-25.md) was designed as 10
blueprints (parallel agent fan-out), applied in themed, individually-validated batches, and
**merged (#1086, squash `500e67e`)**. Gate green per batch: `tsc` · `eslint` · `vitest` (2,286) ·
`check:authz`. **Shipped:** commerce inventory enforcement (no oversell), campaign double-opt-in,
bounded `qr_stats_summary` RPC, `/circles` + `/network` read parallelization, `/practices/<slug>`
links + canonical, nightly resonance embeddings, and Batch 1 (CRM drill links · moderation N+1 →
grouped fetch · event/circle share-card metadata · dead-export removal). **Two RPCs applied + verified
on prod** (`azsqfeonabsbmemvddqd`): `decrement_commerce_stock_atomic`, `qr_stats_summary` — both
`SECURITY DEFINER`, `service_role`-only, zero new security advisors.

**Remaining follow-ups this pass surfaced (none blocking; ranked):**

| Pri | Item | Why / where |
|---|---|---|
| **P-SEC** | **Caller-row double-fetch dedup** — collapse the duplicate caller read | Owner-gated: touches the shared `cache()`-wrapped auth boundary used app-wide for a single-row-SELECT upside. `lib/auth.ts` caller resolution. |
| **P-DX** | **Re-run `supabase gen types`** + drop the two untyped RPC casts | `decrement_commerce_stock_atomic` / `qr_stats_summary` are reached via `as unknown as { rpc … }` until `lib/database.types.ts` is regenerated. Mechanical cleanup. `lib/commerce/checkout.ts`, `app/(main)/admin/qr/stats/page.tsx`. |
| **P-PERF** | **QR Studio + per-Space QR settings still load `qr_scans` unbounded** | The stats page is fixed; the Studio (`app/(main)/admin/qr/page.tsx`) + per-Space QR settings have the same full-table smell. Reuse the `qr_stats_summary` group-by pattern. |
| **P-COMMERCE** | **Variant-level stock not enforced** | `commerce_variants.stock` + `order_items.variant_id` are untouched — only `commerce_products.stock` decrements. Extend the RPC if/when variants sell. |
| **P-UX** | **Fast-fail stock pre-check in `createCommerceCheckout`** | The atomic RPC is the oversell source of truth, but a pre-check avoids charging a buyer then failing soft at settle. `lib/commerce/checkout.ts`. |
| **P-SCALE** | **Real pagination on `/network` + `/circles`** | Both render a capped slice with a "showing first N" notice; true pagination/infinite-scroll is the follow-up when the community outgrows the 500 fetch cap. |
| **P-SEO** | **CSP `connect-src` GA4 regional collect endpoint** | Dormant until GA4 is configured; add the endpoint when analytics goes live. |
| 🔵 opt | **Resonance: run embeddings BEFORE edges for same-night effect** | Embeddings currently run after edges (tonight's edges use last night's embeddings — converges over nights). A product call, not a bug. |

## 🟢 CRM contacts import + go-live owner actions (2026-06-23)

Two threads finished their **build** this session and now sit on **owner / external setup only (no more
code for v1)**. Captured here so nothing lives only in chat.

### A. Google Contacts import — shipped (#1003, [ADR-374](DECISIONS.md)); Google review pending

The free "Import from Google" button on My Contacts is **built, merged, and live**. It works in
production today behind the standard Google "unverified app" warning (Google caps that at **100 users**
until the app is verified). Remaining steps are all in Google Cloud Console, owner-run:

| # | Step | Status |
|---|---|---|
| 1 | `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel | ✅ |
| 2 | Redirect URIs on the shared "Frequency Web" OAuth client (`/api/integrations/google/callback`, prod + localhost) | ✅ |
| 3 | Branding: app name "Frequency", logo, support email, home/privacy/terms, authorized domain | ✅ |
| 4 | Domain ownership (frequencylocal.com, Search Console DNS TXT) | ✅ |
| 5 | Homepage explains the app's purpose + links Privacy/Terms; `/privacy` carries the Google-data + Limited Use disclosure | ✅ (this PR) |
| 6 | **Safe Browsing "deceptive pages" flag** → Request Review in Search Console | ⏳ requested 2026-06-23 (~72h). MUST clear before #7 |
| 7 | **Submit OAuth verification** (Verification Center: branding + sensitive scope) | 📋 owner, after #6 clears |
| 8 | **Demo video** (~90 sec) → upload to YouTube **Unlisted** → paste link in the scope verification form | 📋 owner, feature is already live |

**Demo video shot list:** open frequencylocal.com → sign in → My Contacts → "Import from Google" →
Google consent screen (shows "Frequency" + the contacts permission) → approve → "Imported N contacts"
banner with the new contacts. Narrate one line: "This lets a member import their own Google contacts
into their private contact book."

**Scope justification** (paste into Data Access):
> Frequency lets a signed-in member import their own Google contacts into their private personal address
> book ("My Contacts"). We request contacts.readonly solely to read the user's own contacts and create
> contact records owned by and visible only to that same user. We do not access email, calendar, or any
> other data. We use one-time online access and store no Google access or refresh tokens. We never sell or
> share this data and use it for no advertising. Read-only is the minimum scope, as we never modify Google data.

Verification removes the warning + the 100-user cap and shows the logo on the consent screen (Google
review typically 1–2 weeks). The feature needs no further code either way.

### B. Stripe billing — built + inert; products never synced, switch never flipped

The full pricing/billing layer (ADR-362 / 363 / 364 / [373](DECISIONS.md)) is **built but OFF**: nothing
charges until BOTH the master `billing_live` flag is on AND Stripe keys are present (`billingLive()`).
Products have not been synced, so the Stripe catalog is empty. To go live, **in order**:

| # | Step | Status | Where |
|---|---|---|---|
| 1 | `STRIPE_SECRET_KEY` present | ✅ | Vercel (confirm it's the **live** key, not test, when you actually charge) |
| 2 | `STRIPE_WEBHOOK_SECRET` set + a webhook endpoint added in Stripe pointing at `/api/stripe/webhook` | 📋 confirm | Stripe dashboard → Developers → Webhooks, then Vercel env |
| 3 | **Sync products to Stripe** (creates the ~24 Products/Prices from the admin pricing values) | 📋 **0/24 synced** — SAFE, creates the catalog, charges nobody | `/admin/pricing` → "Sync products to Stripe" |
| 4 | Review the created Products/Prices look right (amounts, monthly/annual) | 📋 | Stripe dashboard |
| 5 | Turn ON the per-plan `*_enabled` flags for the plans you want to sell | 📋 | `/admin/pricing` |
| 6 | **Flip the master switch `billing_live`** (the real go-live; this is when charging begins) | 📋 do last | `/admin/pricing` |

**Deferred:** per-seat operator billing (the "+$9/seat" auto-charge, ADR-373). **Recommendation:** you can
do step 3 (Sync) any time to populate and review the catalog with zero risk; keep step 6 (`billing_live`)
OFF until you are truly ready to charge members.

**Update 2026-06-23 ([ADR-375](DECISIONS.md)):** launch prices lowered — Practitioner **$19/$190**,
Business **$49/$490**, Nonprofit **$29/$290** (Crew/Supporter/Org/White-label/Partner unchanged) — and a
**14-day card-upfront trial** added on Space plans (members have none). The live `pricing_settings` rows
were updated, so the **first product sync uses the new numbers** (re-sync after any later change; safe while
billing is OFF). Also added a **global AI spend ceiling** (`GLOBAL_DAILY_CAP_USD`, `lib/ai/budget.ts`) that
hard-caps total daily Anthropic spend across every feature — always-on cost protection for the solo launch.

### C. Launch day — order of operations (2026-06-23)

The exact sequence to take Frequency live, safest-first. Everything through Phase 1 is **free and OFF**;
real charges only begin at Phase 3. Legend: ✅ done · 📋 owner action · ⏳ waiting.

**Phase 0 — staged (mostly done, safe anytime)**
- ✅ Stripe products synced (16/16) · prices live ($19/$49/$29) · 14-day Space trial · webhook + `STRIPE_WEBHOOK_SECRET` set
- 📋 Confirm `STRIPE_SECRET_KEY` is the **live** key (`sk_live_…`) before you ever flip billing on (if it's `sk_test_…`, swap it and re-sync)
- 📋 Move Supabase to **Pro** (capacity + backups) and back up every secret in a password manager

**Phase 1 — soft launch (free, billing OFF) — do this first**
- Keep the master switch **OFF**. Personal features are free; Spaces run on the free plan. Nothing charges.
- Open the doors: onboard members and **Partners** (comped + rev share is the audience engine). Lean on the free tier.
- Google contacts import works behind the one "unverified app" warning (≤100 users). The global AI cap protects spend.

**Phase 2 — Google verification (when ready / nearing 100 import users)**
- ⏳ Wait for the **Safe Browsing** review to clear (requested 2026-06-23, ~72h)
- 📋 Submit **OAuth verification** (branding is done) + record the **90-sec demo video** → YouTube *Unlisted* → paste the link
- Result: the warning and the 100-user cap disappear and your logo shows on the consent screen

**Phase 3 — turn billing ON (only when Spaces are pulling for paid features)**
1. 📋 Confirm the **live** Stripe key + that `STRIPE_WEBHOOK_SECRET` matches the live webhook endpoint; redeploy
2. 📋 `/admin/pricing` → toggle ON the **per-plan enable** switches for the plans you'll sell
3. 📋 `/admin/pricing` → flip the master switch **`billing_live` ON**
4. 📋 Test one real checkout end to end (buy Practitioner, confirm the 14-day trial starts + the plan grants via the webhook, then cancel/refund)
5. Watch the first subscriptions reconcile (`customer.subscription.*` → `setSpacePlan`)

**Phase 4 — optional, later**
- 📋 Supabase **vanity domain** (after verification — it changes the auth callback; update the Google redirect URI + `NEXT_PUBLIC_SUPABASE_URL` in lockstep)
- 📋 **A2P / SMS** registration (when you want SMS; see [A2P-REGISTRATION.md](A2P-REGISTRATION.md))
- 📋 **Per-seat billing** ("3 included, +$9/seat") when you need multi-operator Spaces
- 📋 **CRM admin suite migrations** — the suite shipped this session (ADR-376/377/378/379/380/381: admin person timeline + notes + consent, edit safe fields + bulk consent, Space contact detail + tasks, email/Resend timeline adapters, Twilio SMS rail, funnel analytics, saved segments + email templates). Two new tables are **fail-closed until applied**: `20260730000000_space_segments` and `20260730010000_space_email_templates` (saved segments + email templates simply stay empty until then). The SMS consent table `20260626010000_sms_consent` is the gate for the Twilio rail. **Apply on a Supabase branch + regenerate `lib/database.types.ts` before relying on typed reads.** Everything else in the suite uses existing tables and is live now.

**Rollback:** flipping `billing_live` **OFF** instantly stops all new charges (existing Stripe subscriptions keep running until you cancel them in the Stripe dashboard). The OFF invariant means the whole layer goes inert the moment the switch is off.

## 🔎 Full-site audit — 2026-06-09 (post events / journeys / circles)

Four-agent sweep (incompleteness · security · journeys/events/circles completeness · UI/linkage).
**Verdict: ~85–90% launch-ready. No broken routes, no orphans, no critical security holes.** Two
items were fixed during the audit; the rest is the prioritized list below.

**Fixed this pass:** 🟢 **Events migrations applied to prod** — `events` capacity/visibility, `event_ticket_types`,
`circle_current_transactions` (orig. `circle_field_transactions`; renamed to canon, ADR-208), `event_embeddings`,
the `adjust_ticket_sold` RPC + capacity trigger were **not live** (only the journey migration was), so the whole
events ticketing/Circle-Current system was broken in production. Applied all five (ADR-185). 🟢 **AI event-blurb
prompt-injection** hardened (user fields sanitized).

| Pri | Item | Why | Where |
|---|---|---|---|
| ✅ ~~P0~~ | **Regenerate `lib/database.types.ts`** | Done — regenerated from the live schema (all recent tables/columns now typed). The `as unknown as SupabaseClient` casts still compile and can be removed file-by-file as follow-up cleanup | `lib/database.types.ts` |
| ✅ ~~P0~~ | **Journey reward fires** | Audit false positive — Full-Day/Rhythm/Journey-complete are **already** wired (ADR-200, `lib/journey-rewards.ts`, 10/10 tests). No work needed | done |
| ✅ ~~P0~~ | **RSVP confirmation email** | Done — sends on going/waitlist via the durable outbox + prefs/suppression + calendar links | `events/actions.ts`, `lib/email.ts` |
| ✅ ~~P0~~ | **Event cancel → bulk refund + notify** | Done — cancel refunds every succeeded ticket (idempotent `refundTicket`) + emails attendees; behind the host/admin gate + a first-cancel transition guard | `admin/events/actions.ts`, `lib/email.ts` |
| ✅ ~~P1~~ | **Public/unlisted event RLS** | Done — visibility-aware SELECT policy (applied to prod) + app-level gate on the detail page + listable-only browse filter. ADR-202 | `20260612000000_events_visibility_rls.sql` |
| 🟠 **P1** | **Owner go-live configs** | Remaining owner-side: Stripe Connect payouts (`host_payouts_enabled`), `RESEND_WEBHOOK_SECRET`, enable Auth leaked-password protection, review whether anonymous sign-ins should be off. **Advisors run 2026-06**: the one fixable security class (20 mutable-search_path functions) is pinned (applied to prod); remaining lints are INFO/by-design (service-role-write-only tables) or deferred perf tuning (RLS initplan ×59, permissive-policy consolidation ×92, FK indexes ×38 — all pre-launch noise) | owner / env |
| ✅ ~~P2~~ | Journey depth-tier UI (Initiate/Adept/Master) | **Audit false positive** — already built + live (`TierControl` wired in `/journeys/[slug]`, `setMyJourneyTierAction`, `resolveTier` chain, 17 tests, 48 seeded tiers; tier names renamed to canon by migration `20260613000020`). The journeys-audit findings were read from JOURNEYS.md (marked "planned") but the code shipped them — **verify journey items against code before building** | done |
| ✅ ~~P2~~ | Circle-scoped challenges model | Done — a host adopts a global `season_challenge` for the circle to do **together**; the CircleQuest Challenges column shows collective progress ("N of M members done") and members completing it credit the circle's Circle Current (collaborative, ADR-201). New `circle_challenge_adoptions` table (applied to prod) | `lib/circles/challenges.ts`, `circle-challenges`, `admin-actions.ts` |
| ✅ ~~P2~~ | Practice backlinks ("used in these journeys/circles") | Done (#489) | `app/(main)/practices/[id]` |
| ✅ ~~P2~~ | Plus-ones + "maybe" RSVP controls | Done (#489) | event RSVP form |
| ✅ ~~P2~~ | Library "Propose to Library" + review queue | **Audit false positive** — fully shipped: `ProposeToLibraryButton` on owned practices/journeys, `/library/review` queue (Host/Guide+ gated, approve/reject), linked from the Library header with a pending-count badge | `/library/review` |
| ✅ ~~P2~~ | Extend Settings panel to events/channels/people (PX.5) | Done — events/hubs/nexuses already had modules; added **ChannelSettingsModule** (staff-only, `channel.manage`) and **PersonSettingsModule** (janitor-only moderation surface) to the page admin dock | `page-admin-bar`, `admin/modules/*` |
| ✅ ~~P3~~ | Font-token cleanup | Done — zero `text-[10/11px]` remain (bulk in #489; stragglers in QR module, season-progress, rail panels swept after) | — |
| ✅ ~~P3~~ | Per-section Suspense on `/events` · per-event OG image · `offers` in eventSchema · distance facet | Done — "For You" lane streams behind `<Suspense>` (shell no longer waits on embeddings/AI); dynamic OG image at `/discover/events/[slug]/opengraph-image`; `offers` + honest `isAccessibleForFree` from `price_cents` (public RPCs updated, applied to prod); "Distance" facet from the viewer's fuzzed home geocell → hosting-circle coords (hidden without a home location) | events |
| 🔵 **Deferred** | SMS reminders (EIN/Twilio/A2P) · post-event recap album (`event_posts` unused) · duo-streaks/reciprocity/bridge-badge metrics | Owner decisions / later waves | — |

## 🔎 Full-site sweep — 2026-06-10 (post naming-canon · journeys-icons · economy-CRUD · contacts-merge)

Three-lens sweep (security/dead-ends · SEO/AIO · infra/migration-drift) after the day's ships
(#497, #503, #506, #508, #511, #514, #515, #516). **Verdict: clean. No broken routes, no orphans,
no critical security holes.** Owner/config items (Stripe Connect, VAPID, Resend webhook, the auth
leaked-password toggle, anonymous-sign-ins decision) are tracked elsewhere and deliberately **omitted
here** — this is the *buildable* backlog only.

**Shipped today:** ✅ Reward-economy **add/edit/delete** CRUD in `/admin/gamification` (#514) · ✅ Journeys
**lucide icon faces** (no emoji) + cleaner index (#511) · ✅ Network **member-counts on the tab row** +
**My Contacts** header standardized (#515) · ✅ **Contact ↔ Community merge** — detect/alert/merge +
private profile card (#516, migration `20260610060000`).

**Buildable backlog the sweep surfaced** (ranked; owner-config excluded):

| Pri | Item | Why | Where |
|---|---|---|---|
| **P-SEO.1** | **Enrich `public/llms.txt`** with a first-party **Frequency Stats** block (WAM, circle count, top practices, return-rate) | CONTENT-VOICE §8c — original data is the AIO citation lever; `llms.txt` is currently bare | `public/llms.txt` (+ a tiny stats read) |
| **P-SEO.2** | **Public `/discover/practices`** (list + detail, HowTo/Article JSON-LD) | Practices are high-intent search terms (breathwork, meditation…) with **no public mirror** — the one missing discover surface | new route + `public_practices()` RPC |
| **P-SEO.3** | **Dynamic OG images** for marketing pillars + discover detail (`/the-lab`, `/the-community`, `/the-quest`, `/discover/circles/[id]`, `/discover/journeys/[slug]`) | Only 1/23 public routes has a content OG image; the rest fall back to the generic root card | reuse the event OG template |
| **P-SEO.4** | **Schema gaps:** Circle schema on `/discover/circles/[id]`, Person on event organizer, Article/Course on journeys | Rich-result + AIO coverage; Event/HowTo/ItemList already strong | `lib/jsonld.ts` |
| ✅ ~~P-SEO.5~~ | **Seeker-track article layer** (5 pain-first pillar pieces, FAQ schema, internal links) | DONE — all five CONTENT-VOICE §7a pain clusters now have a pillar page: `/loneliness`, `/friendship-as-an-adult`, `/life-after-the-feed` (PRs #1036/#1062), plus `/calm-down-fast` (always-wired stress) and `/meet-people-new-city` (new-city connection). Answer-first question H2s, Article + FAQPage + BreadcrumbList JSON-LD, in-cluster internal links to each pillar's `find-your-people` help article and into `/the-community` + `/discover`. Registered in `app/sitemap.ts`. Supporting help articles live under `content/help/find-your-people/`. | `app/(marketing)/*` |
| **P-SEC.1** | **RLS perf debt:** wrap `auth.uid()` → `(select auth.uid())` (advisor `auth_rls_initplan` ×59) + consolidate `multiple_permissive_policies` (×92) | Per-row re-eval at scale; pre-launch noise but a clean, mechanical migration | RLS policies |
| **P-SEC.2** | **Index hygiene:** add covering indexes for `unindexed_foreign_keys` (×39); review/drop `unused_index` (×130, carefully) | Advisor perf; FK indexes are safe wins | migration |
| **P-SEC.3** | **Rate-limit `requestBetaAccess`** (open signup, no throttle) + tighten `public_bucket_allows_listing` on avatars/posts/event-media/site-media | Abuse surface; object-name enumeration | `beta/actions.ts`, bucket policy |
| **P-SEC.4** | **CSP report-only → enforce** (nonces) · remove `as unknown as SupabaseClient` casts now types are regenerated · purge retired `'crew'` role refs (`@deprecated`) | Hardening + tech-debt the regen unblocked | `csp`, lib casts, `roles.ts` |

> Migration note: prod's `schema_migrations` versions are stamped at apply-time (MCP) so they differ
> from the repo filenames (e.g. canon batch `20260613*` files ↔ `20260610*` applied), but **every repo
> migration is applied by name** — no unapplied drift. Cosmetic; a `migration repair` would re-align.

## 🔎 Post-restructure reconciliation — 2026-06-14 (Journeys v2 / roles / IA)

Six-agent sweep (Journeys-v2 reconcile · dead-code/junk · migration-drift+advisors · code-level
security · SEO/AIO · buildable-backlog) cross-checked against this list after the day's 58-commit
restructure. **Verdict: clean and on track. Lint clean, 905 tests green, no broken routes, no
critical security holes, DB perf debt dropped sharply. The one real risk flagged here — the
ADR-253 half-migration (v2 rewards running in parallel with the legacy season engine, a live
double-earn surface) — has since been **fully executed and verified on prod (2026-06-29):** the
grant firing is gone, displays use the v2 reader, the orphaned engine is deleted, and the dead
columns are dropped. No double-earn remains.**

**Fixed this pass:** 🟢 **Security** — three crown-jewel role actions (`setAreaPermission` ·
`setStaffRole` · `addStaffMember`) gated on the **deprecated `community_role`** axis; moved to
`isJanitor(webRole)` (ADR-208), closing a privilege-escalation path. 🟢 **Cleanup** — 13 verified
orphaned modules + stale `package-lock.json` removed. 🟢 **SEO** — `public/llms.txt` corrected to the
naming canon (it was misinforming answer engines with retired Domains/Interests/Arcs); BreadcrumbList
second-crumb URLs fixed on discover circle/topic detail; `/the-lab` surface copy de-jargoned
(CONTENT-VOICE §3b/§5c). 🟢 **P-SEC.3** — `requestBetaAccess` now per-IP rate-limited.

**Status corrections (rows below were stale — the code shipped):** P1.4/P1.6 scoped stewardship
(`community_level` threaded end-to-end, `scope` passed into `surfaceAccess`) · P1.7
`capability_permissions` (grid UI + `getCapabilityOverrides` in the live gate) · P6 §1.5 suggestion
chips · P6 §2.2 `draft_intro` · P6 §3 AI core kernel (built, not 📋) · P7 10.3 Network hub · P7 10.5
Settings hub · the June 13-14 event migrations (`event_posts`/`event_media`/`event_cohosts` wired).
**Migration reconcile:** every "apply-pending" migration (stewardships `20260614100000`,
capability_permissions `20260614300000`, journeys_v2) is **LIVE in prod** — those ⏳ rows are now ✅.

**Remaining, ranked (buildable; owner-config items tracked separately in §P4/§P8):**

| Pri | Item | Why | Where |
|---|---|---|---|
| ✅ ~~P0~~ | **Execute ADR-253** — retire the legacy season reward/progress engine | **DONE (verified prod 2026-06-29).** All 5 steps shipped: grant firing removed from `logPractice` (no double-earn — a practice log no longer grants journey rewards, `lib/practices.ts`); displays repointed to the v2 reader (`lib/journeys/progress.ts`); the orphaned engine files deleted (`journey-rewards`/`journey-coop-rewards`/`journey-grants`/`journey-quest-clock` gone, `CompletionRuleBlock` retired); the dead columns (`season_locked`/`min_practices_per_day`/`target_weeks`) **dropped in prod** (migration `20260624000000`, confirmed absent + zero code refs). Residual: a full `database.types.ts` regen to drop the last `as unknown as` casts (tracked as H0-3/H5-1). | done |
| **P1** | Hardening tails | Add plan-ownership checks on journey insert/checkoff actions (low sev); "// caller must enforce host gate" contracts on untyped `lib/journeys/runs.ts`/`store.ts`. | journeys edit/learn actions |
| **P1** | `lib/experiments/*` is orphaned | Zero importers, yet PI claims it's part of the owned spine — wire it (PI.4 needs it) or stop claiming it. | `lib/experiments/*` |
| **P2** | Segment builder UI | Eval is pure+tested; admin page is read-only. Add a predicate-form + `createSegment`. | `lib/traits/segments.ts`, `/admin/segments` |
| **P2** | Push actions for Automations | `lib/push.ts` exists; add a `push_actor` action type + evaluator branch + form fields. | `lib/automations.ts`, automations rule-form |
| **P2** | Role-promotion coachmark tours (P1.8) | The one in-product "Coming soon" card with real backlog behind it. | `/pages/sequences` |
| **P3** | FK covering indexes on the new restructure tables | Clean advisor perf win (~13 indexes on `journey_runs`/`journey_enrollments`/`journey_lesson_progress`/`spaces`/`menu_config`/`platform_settings`/`walkthrough`). | new migration |
| **P3** | Vera memory cron · Practices+Library merge · warm-demo action surface | P6 §2.3 / P7 10.4 / P6 §2.4 — buildable, no owner config. | per BACKLOG |

> **Process note (migration ledger):** 22 repo migrations dated ≥`20260615` are applied to prod but
> never stamped in `schema_migrations` (apply-on-merge keeps the schema correct, but the ledger is
> stale → compounding cosmetic stamp-drift). A `migration repair` re-aligns it. The out-of-band
> `energetics` schema (8 tables, live, not in repo) is a **separate project — leave alone** (owner
> direction); it is the source of all "new" advisor lints and must not be read as a restructure regression.

## 🔎 Editor-pattern sweep — 2026-06-16 (Add/Edit/Delete popups · curation · block-editor plan)

A five-agent survey (Events·Circles · Channels·Boards · Journeys·Practices · Challenges·Quests ·
block-editor coverage) mapped every primary entity against one rubric: **clean Add / Edit / Delete,
a fully-featured `StudioWindow` popup for Add+Edit, well-organized content, and a block editor
(`<PageModules>`) on the page.** Workstreams **A** (popup add/edit), **B** (confirmed
delete/archive), and **C** (curation) shipped; **D** (block editor everywhere) is specced below, not
built. **Owner directive: never remove the global community right rail; editors are overlays, the
page area only.**

**A/B/C — DONE (PRs #834–#852).** Every primary entity now has a popup Add + Edit (the shared
`StudioWindow`) and a confirmed Delete/Archive (`DangerModal`), owner **and** admin where it applies:

| Entity | Add popup | Edit popup | Delete / Archive | Curation |
|---|:--:|:--:|:--:|:--:|
| Practices | ✅ | ✅ owner+admin | ✅ owner+admin (type-to-confirm) | ✅ feature star |
| Journeys | ✅ | ✅ owner+admin | ✅ owner+admin | ✅ official + feature |
| Challenges | ✅ popup launcher | ✅ StudioWindow | ✅ type-to-confirm | ✅ reorder/pause |
| Events | ✅ member + admin | ✅ detail + admin | ✅ cancel/reinstate | ✅ **Featured** (`events.featured_at`) |
| Circles | ✅ member + admin | ✅ host + admin | ✅ archive (host+admin) | ✅ **Featured** (`circles.featured_at`) |
| Message Boards (rooms) | ✅ | ✅ (was missing) | ✅ (wired the orphaned `deleteRoom`) | — |
| Channels | ✅ | ✅ | ✅ confirmed archive | `display_order` |
| Seasons | ✅ popup launcher | (Composer) | end-season (confirmed) | — |

Also this sweep: reusable `<ImageUpload>` (header/cover photo; URL **and** storage-path modes) wired
into every popup editor; the **Journey editor popup** rebuilt into one continuous form (Settings ·
Structure · Advanced, single-divider rhythm — was three competing cards); the **Practice/Challenge**
editors moved onto `StudioWindow`; **Leader Training** rebuilt as a two-pane docs library (left
index, right content) + the *Circles and Journeys* foundations guide; the Leader-Training **right
rail restored** (a no-rail registration was reverted); and the wiped **join/share Zaps reinstated**
(every initial member's `community_join`/`referred_join_bonus`/`invite_accepted` re-synced into
`current_season_zaps`, plus one member's missing join created).

**Curation columns (applied to prod + committed):** `circles.featured_at` (`20260616181000`),
`events.featured_at` (`20260616181100`). ✅ **Member-facing Featured badge shipped** (ADR-298):
reusable `<FeaturedBadge>` (filled star, `signal` tokens) in the `EntityCard` badge slot, threaded
into the member Circles + Events cards via `featured_at`. Featured-first **sort** is still an optional
follow-up; Channels curation rides existing `display_order`.

**✅ Vera Journey composer + three gamification layers (ADR-298 → ADR-300).** New Journeys open
pre-propagated with a **balanced four-Pillar shape** — a Mind, Body, Spirit, and **Expression**
practice (all regular `practice` blocks tagged to their Pillar, so the Journey starts centered on the
Signature). Vera fills each slot, reusing fitting library practices (validated ids) or writing new
inline ones; `scaffoldJourneyAction` lays the empty shape when AI is off. **Part 2 (extra-credit
Challenges) shipped:** Vera seeds one above-and-beyond bonus task per Journey (and the author can add
more), an `exercise` block with `settings.extra_credit` + `settings.bonus_zaps` that pays regular Zaps
exactly once on completion (`reward_grants` lock) without touching the Pillar Signature. **Part 3
(Side Quests) shipped:** reward-only missions on a `/crew/side-quests` board, built on the
`achievements` engine — a Side Quest is an `achievements` row flagged `is_side_quest` (migration
`20260616230000`) with manual criteria; claiming unlocks the **special badge** (`user_achievements`,
the idempotency lock) and pays `zaps_reward` once, no Pillar credit. (Admin authoring UI is a tracked
follow-up; starter quests are seeded.)

**✅ Single-page Journey editor + deferred creation (ADR-301).** The tabbed builder is now **one page**
on the `HeaderSidebarTemplate` shell, laid out like the Journey: a **cover upload band up top**,
**click-to-edit Title + subtitle** (`EditableText`), the curriculum (Vera's four-Pillar composer +
phases) in the main column, and **all settings in a right sidebar** (`JourneySettings` gains
`hideIdentity`; `JourneyAdvanced` + `JourneyDangerZone` stack under it). **New journey** no longer
writes on click: it navigates to `/journeys/new` (draft mode, inert ghosts), and the row is created
only when the author **names it** (`createJourneyDraftAction` → plan + 3 phases → `/edit`). No more
untitled drafts. `HeaderSidebarTemplate` gained `sidebarWidth="wide"`.

**✅ Journey course builder — full-page editor (ADR-297).** The Journey editor moved off the Studio
**popup** onto a full-page **course builder** at `/journeys/[slug]/edit` (both "New journey" and
"Edit" land here): sticky builder bar + three tabs (Curriculum · Details · Settings), autosave, panels
stay mounted across tabs. Four parts shipped: (1) full-page builder (`journey-builder.tsx`, popup
retired); (2) **mini rail** — the global rail stays mounted but starts collapsed to a `w-14` strip
with a foot expand/collapse toggle (new `railStartsCollapsed` in `page-chrome.ts`; `railFor` still
`'global'` — rail never removed, owner rule honored); (3) **Pillar-faceted practice selector** —
facet chips preload a Pillar's practices, unselected Pillars stay greyed and one tap away; (4)
**per-slot Vera coaching** — `lib/ai/journey-slot-coaching.ts` (Haiku) drafts a short line dynamically
from season + Journey name + practice + Pillar, stored on `settings.coaching_prompt`, editable, shown
in the player as a nudge. No schema change.

### 📋 D — Block editor (`<PageModules>`) on every primary page  *(specced, not built — XL; paused 2026-06-16 by owner)*

**Goal:** every primary page renders `<PageModules route="…">` so an operator rearranges its blocks
from the on-page Settings → Layout panel — the treatment `/journeys`, `/admin/content/journeys`,
`/crew`, and `/lead` already have.

**Why it can't fan out to parallel agents:** every page conversion edits the same three central
registry files — `lib/widgets/modules.ts` (`LAYOUT_MODULES` + `ROUTE_MODULE_IDS`),
`lib/widgets/registry.tsx` (id→component `COMPONENTS`), `lib/widgets/module-routes.ts`
(`MODULE_ROUTES`). Concurrent agents collide there. The **per-page block components are disjoint**
and *can* be authored in parallel; the registry wiring + page swap must be serialized.

**Pages WITHOUT it today** (hand-authored): `/feed`, `/events`(+detail), `/circles`(+detail),
`/channels`(+detail), `/practices`(+detail), `/journeys/[slug]` detail, `/messages`, `/programs`,
`/admin/circles`, `/admin/events`, `/admin/channels`, `/admin/content/practices`,
`/admin/content/seasons`, `/crew/challenges`. **Risk tier:** the faceted member libraries
(`/practices`, `/events`, `/circles`) carry URL search + Pillar/tag facets + pagination — decomposing
them into self-fetching blocks is a careful refactor, **NOT** a copy of `/journeys`; getting it wrong
breaks library search. Do the **simple admin pages first, faceted member pages last.**

**The recipe (per page, sequenced):**
1. Author each block as a self-fetching async RSC in `components/widgets/<area>/<block>.tsx` —
   returns `null` when empty (renders in its own `<Suspense>`). *(parallelizable across pages)*
2. Add `{ id, label, description }` to `LAYOUT_MODULES` (`lib/widgets/modules.ts`).
3. Declare the route's set: `const <ROUTE>_MODULE_IDS = [...]`, keyed under the route in
   `ROUTE_MODULE_IDS` (key = exact route / `'/seg/*'` / `'*'`; order = default render order).
4. Bind each id → component in `COMPONENTS` (`lib/widgets/registry.tsx`) — the only file that
   imports the block RSCs.
5. Register the route in `MODULE_ROUTES` (`lib/widgets/module-routes.ts`) — this reveals the
   Settings → Layout panel (`isModuleRoute`).
6. Swap the page body to `<PageModules route="/your-route" />` inside its kit template; keep the
   operator-editable header (`PageHeading`/template chrome) **outside** `PageModules`.
7. (Optional) extend `lib/widgets/modules.test.ts` (set resolves; every id has metadata).

Persistence/resolution is already generic (`loadLayoutForRoute` + `resolveSlots` +
`moduleIdsForScope`, `components/widgets/page-modules.tsx`) — no per-route wiring there. **Effort per
page** ≈ steps 2–6 are ~5 small config diffs; the real work is step 1 (authoring N block RSCs),
scaling with how many blocks the page decomposes into.

**Sequence when resumed:** admin content/list pages (low risk) → simple member pages → `/feed` →
the faceted libraries last.

## The headline

The platform is **substantially built** — member surfaces, the practice engine + gamification,
the CRM/marketing suite, and the onboarding/Vera/AI stack are largely complete and wired. The
real work is two things: **(1) the role & permissions system** the owner just designed — *one
site for everyone, function-gated per role* — and **(2) the money layer** (entitlement + billing
+ partner suites). Everything else is targeted gap-fill and hardening.

## Priority ladder (the spine — work top to bottom)

| Rank | Track | Delivers | Size | Status |
|---|---|---|---|---|
| **P1** | **Permissions & Roles** | One site, function-gated per role (the matrix) | XL | ✅ matrix+menu+nav synced to sheet; scope edge-cases ⏳ |
| **P2** | **Entitlement & Billing** | Free → Member → Supporter + Stripe; the ✋ gates go live | L | ✅ live (Supporter + lifetime rank); Connect binding blocked on owner setup |
| **P3** | **Partners** | Collaborator · Practitioner · Business · Organization + Hook | XL | ⏳ personas + verification + listings done; Hook/paywalled left |
| **P4** | **Platform completion** | The concrete stubs the sweep found | M | ⏳ few small gaps (4.2/4.8/4.9) |
| **P5** | **Member · Practice · Operator depth** | The feature-depth backlog | L | ⏳ |
| **P6** | **Onboarding / Vera / AI / Capture** | Finish the last-mile activation items | M | ⏳ (AI core largely built via PI) |
| **P7** | **Navigation & IA** | Collapse sprawl into dashboards; data-driven nav | L | ✅ 4-section menu + matrix-driven nav (this session) |
| **P8** | **Infra · Data · Security · Hardening** | Migrations, RLS Phase 2, CI gates, scale ladder | L | ⏳ hardening |
| **PI** | **Intelligence & Activation Engine** | Wide behavioral capture → feature store → AI site-improvement loop → retroactive rewards | XL | ✅ all 5 layers built (PI.1–PI.5) |
| **PX** | **Extension opportunities** | Extend the new seams (Settings panel · content registry · per-page QR · Circle Quest) | S–M | 📋 high-leverage next steps (see §PX) |
| **PM** | **Money verticals** (gated) | Collective · Affiliate · Donations · Lab Spaces | XL | 🔴 after PMF |

**Outpost is parked** (owner direction) — tracked in ROLES.md/§11.5 but not scheduled.

## Progress log

- **2026-06-10 ✅ Contact ↔ Community merge** — a logged contact (`network_contacts`) and the member
  profile that is the same human are now reconciled: detect by hard signal (email / phone, via the
  `find_contact_matches` SECURITY DEFINER RPC, migration `20260610060000`), alert on `/network/contacts`
  with Merge/Dismiss, link via `linked_profile_id` (your logged fields + notes untouched; the live
  profile fills the card; an **On Frequency** badge shows), and surface a **private contact card** on the
  member's profile that only the owner who merged sees. `lib/connections/matching.ts` + UI islands. (#516)
- **2026-06-10 ✅ Reward-economy CRUD** — `/admin/gamification` reward editor gained **add + delete**
  (was edit-only): define a new `action_type` (normalized, dup-guarded), remove one (ledger rows
  untouched). Gate moved to the staff axis `isJanitor(webRole)` (ADR-208). Changes stay live-immediately
  (the award engines read `zap_config`/`gem_config` at grant time). (#514)
- **2026-06-10 ✅ Journeys: lucide icon faces + cleaner index** — retired the freeform emoji "face" for a
  curated 24-icon lucide set (`lib/studio/journey-icons.ts`); the key rides the existing `emoji` column,
  `JOURNEY_ICON_MAP` resolves legacy emoji so existing journeys keep a face with no backfill. Studio
  identity kit (`IconAccentFace`/`IconGrid`), builder + launcher, index + detail all render the icon;
  two side-by-side entry cards on the index. (#511)
- **2026-06-10 ✅ Network header pass** — Community member counts moved onto the tab row; `/network/contacts`
  title standardized to **My Contacts** with a Contact icon (matching the Community header). (#515)
- **2026-06-13 ✅ Naming Canon 2026 (ADR-208)** — locked the platform vocabulary in
  [`NAMING.md`](NAMING.md) (the single source of truth) and aligned the schema to canon: **Pillars**
  (`pillars`, `topical_channels.pillar_id`), depth tiers **Initiate/Adept/Master**
  (default Adept), season ranks **Echo/Signal/Beacon**, **Circle Current**
  (`circles.season_current`, `circle_current_transactions`), **Co-op**, and a
  two-axis role split (`profiles.web_role` alongside `community_role`) — see NAMING.md for the full
  rename map. Migrations `2026061300*` (data-preserving, idempotent); thresholds/economy/RLS substance
  unchanged. Also retired: the legacy action-chain engine (dropped, ADR-152), and the prior Quest/tier/
  currency phrasing now superseded by canon. Technical docs rewritten to canon this pass.
- **2026-06-09 ✅ Page Settings panel on every page** — the on-page operator editor: `page-admin-bar` rendered by the templates (PageHeading/DetailTemplate) via `PageAdminProvider` (`page-admin-context`). One "Settings ▾" surface that composes the content editor, per-page QR, and circle-rail order — each gated by capability so a non-manager sees nothing. The pattern the next three items hang off.
- **2026-06-09 ✅ Site-wide editable page content (ADR-180/182)** — operator-tunable header (title + description) per route, additive over the coded fallback (`resolvePageContent`). Now wired SITE-WIDE via the single `CONTENT_EDIT_ROUTES` registry (`lib/layout/editable-content.ts`) across **/network · /circles · /channels · /events · /market · /messages · /journeys · /practices · /library · /broadcast** (`/feed` excluded — personalized greeting). To add a page: one registry line + a `resolvePageContent` read.
- **2026-06-09 ✅ QR per-page folders (ADR-179)** — `qr_codes.page_path` is the folder key; `PageQrManager` (compact StyleEditor `compact`+`controls` variants) creates a QR *from* a page in the Settings panel; QR Studio groups codes into per-page folders + an "Unfiled" group.
- **2026-06-09 ✅ Circle rail order + permalink + Circle Quest (ADR-181)** — `circles.sidebar_order` (NULL = coded default) arranged by a drag-and-drop `SidebarWidgetEditor`; `updateCirclePermalink`/`saveSidebarOrder` gated on `circle.editSettings`. `CircleQuestModule` replaces the old practice-only module — picker **plus** the circle's adopted journeys/practices/challenges (challenge model currently empty → extension below).
- **2026-06-09 ✅ Founder's First Week config centralized (ADR-184)** — `lib/onboarding/founder-config.ts` is the single edit point (reward gems/badge · Vera coach copy · page copy · the six tasks); `founder-tasks.ts`/`founder-actions.ts`/`layout.tsx`/`founder/page.tsx` all read from it. Badge seeded by `20260606170000_founders_first_week_badge`.
- **2026-06-09 ✅ Onboarding edge tabs + Next-Steps popup** — `edge-pill` tabs tucked into the margins (icon-only at rest) + the `chores-overlay` coach popup redesigned (only "Don't show till tomorrow").
- **2026-06-09 ✅ Admin guard redirects home, not 404 (ADR-183)** — `requireAdmin`/`requireAdminFloor` redirect an unauthorized viewer (logged-out → `/`, insufficient role → `/feed`) instead of `notFound()`. Nav fix: `/admin` root matches **exactly** in `app-shell` `isActive`, so a deep admin sub-route highlights only its own rail item.
- **2026-06-09 ✅ Live-DB migration reconcile (ADR-185)** — a batch merged without being applied was applied this session: `page_content` · `qr_page_folders` · `circle_sidebar_order` · `founders_first_week_badge` · `training_paths` · `connect_accounts` · `tips` · `event_tickets`. Process gate added (CHECKLIST §"Standing deploy gate") so it doesn't recur.
- **2026-06-08 ✅ "Ask Vera before you file"** — the support-deflection intake: the member report dialog gets an **Ask Vera first** button that runs their question through the grounded help RAG (`askHelp` → `answerHelpQuestion`, logged as a demand signal). If Vera answers, the member closes with a "That solved it" — no ticket filed; otherwise it folds into "Send to the team". Cuts ticket volume on the intake side, completing the support loop with the operator-side AI draft/triage. 443 tests green.
- **2026-06-08 ✅ AI ticket triage** — an **AI triage** button in the support console: `suggestTriage` (host+) has Claude classify the ticket and **set its priority** (low/normal/high/urgent) with a one-line reason; budget-gated with a keyword-heuristic fallback when AI is off. Completes the virtual-staff support trio (draft · ground · triage).
- **2026-06-08 ✅ Agentic support (AI draft, help-grounded)** — an **AI draft** button in the support console (`/admin/support/[id]`): `draftReply` (host+) has Claude draft a warm, on-tone reply from the ticket thread **grounded in retrieved help articles**, returned to the agent to **edit and send** (never auto-sends). Grounding uses a new non-logging `retrieveHelpChunks` (extracted from the RAG path; DRY), so drafting doesn’t pollute the help-gap demand signal. Budget-gated (`support-draft`) with a deterministic fallback. The "virtual staff fields support through Claude" vision (ADR-167). 443 tests green.
- **2026-06-08 ✅ P8 (CI gate)** — added `.github/workflows/ci.yml`: typecheck (`tsc --noEmit`) + lint (`eslint`) + tests (`vitest run`) on every PR to main + pushes, with pnpm cache + concurrency cancel. The Vercel build never ran the suite; now a red PR is caught before merge. No app secrets needed (tsc/eslint/vitest don’t touch env). `pnpm lint` is clean repo-wide; 443 tests green.
- **2026-06-08 ✅ Roles/permissions + menu (owner sheet)** — synced `lib/core/access-matrix.ts` to the owner CSV exactly (full-grid conformance test, all 30×13 cells) and rebuilt the left-nav into the sheet’s four sections — **Community · The Quest · Studio · Platform** — in the exact item order/labels. Message Boards → Messages; Website / Hook Network / Studio-Finances / Financial-Dashboard / Status are gated **Coming-soon** stubs; the Quest dashboard is now member-full (only the Vault stays paid-gated). Each nav item carries its `surface` (the matrix seam). 443 tests green. *Nav visibility floors are reviewable in the preview (open decision: structure mgmt → Admin-only).*
- **2026-06-08 ⏳ PI.5 (retroactive rewards)** — the final PI layer (ADR-168, migration `20260608110000`): a governed reward-rule registry (pure predicates over the durable history — lifetime rank, feature-store traits, tags, tier) + an idempotent **claim-then-pay** batch evaluator that grants once against the immutable history (the reward lands in the gem/zap ledgers; `reward_grants` unique guard makes re-runs safe). `/admin/rewards` previews pending grants (dry-run) and grants them one-click. v1 ships 5 gem rules (e.g. *ever reached Beacon → 200 gems* — Beacon is the rank formerly named Agent, ADR-208). 415 tests green. **Completes the engine: capture → feature store → predictions → AI Studio → retroactive rewards.**
- **2026-06-08 ⏳ PI.4 (AI Studio — increment 1)** — the AI Intelligence Studio is live (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) turns the banked signal — feature store + PI.3 predictions + interaction-surface rollups + **support tickets + help-gaps** — into **ranked, evidence-backed recommendations**, with Claude narrating the summary (deterministic fallback). The safety core is a **governed allow-list** of reversible, audited, role-gated site actions (`reindex_help`, `set_flag`) an operator applies one-click — the AI can only ever propose a registered action, never an arbitrary backend mutation. Every change logs to `studio_site_changes` with one-click revert. 407 tests green. Ties support pain → recommendation → applied fix (the "virtual staff" loop); agentic support replies + experiment-spawn are the next increments.
- **2026-06-08 ⏳ PI.3 (predictive traits)** — the prediction layer is live (ADR-166): a new `predicted` trait kind + `churn_risk` / `activation_propensity` / `next_best_action`, computed nightly by heuristic rules over the feature store (lifecycle + RFM + engagement-depth). The trait refresh now merges the ledger + interaction views per member so ledger/behavioral/predicted traits all derive from one consistent picture. Pure compute unit-tested; 398 tests green. Heuristic v1 behind stable keys — a model/Claude-graded path swaps in later. Feeds Vera nudges, campaigns, and PI.4/PI.5.
- **2026-06-08 ⏳ PI.2 (feature store)** — the firehose now feeds the durable feature store (ADR-166, migration `20260608090000`). 8 registry-declared behavioral traits (interaction volume/active-days/surfaces/dwell-minutes/sessions/scroll-depth/last-interaction + an `engagement_depth` band) computed from a new `member_interaction_stats` RPC and merged into `member_traits` by the existing nightly trait refresh; a `interaction_surface_stats` RPC gives the per-surface site-level rollup for PI.4. Pure compute is unit-tested; 394 tests green. The clean per-member aggregate the AI + reward engine read (never the raw firehose).
- **2026-06-08 ⏳ PI.1 (wide capture spine)** — the raw behavioral firehose is live (ADR-166, migration `20260608080000`): `interaction_events` (wide + jsonb-extensible, append-only, retention-bounded) + a batched client buffer (`observe()` → sendBeacon flush) + the consent-gated `/api/observe` batch sink + `ObserveProvider` auto-capturing view/dwell/scroll-depth/rage-click/visibility, mounted beside `PageViewTracker`. The semantic `engagement_events` pipe is unchanged; this is its high-volume twin. 90-day raw purge wired into the retention cron. 391 tests green. *The un-retrofittable "capture wide now" piece — banking history before PI.2–PI.5 read it.*
- **2026-06-08 ✅ P2.7 (verification half)** — partner persona claims now run a real, staff-gated ladder (ADR-165, migration `20260608070000`). Self-serve **claim** lands in *pending review* (no longer an instant tool unlock); a `profiles`-domain operator (or janitor) runs **verify → activate** from the new `/admin/personas` queue, with suspend/reinstate, allow-map-validated transitions, and an audit trail (`verified_by/at`). `getActivePersonas` now lights surfaces on verified/active only. The per-persona Stripe Connect binding stays stubbed until Connect is configured. 384 tests green.
- **2026-06-08 ✅ P2.6 (lifetime rank)** — the locked, never-resetting **peak rank** (`profiles.lifetime_rank`, ADR-164, migration `20260608060000` applied + backfilled). The zap trigger ratchets it (`GREATEST(lifetime_rank, current_season_rank)`); `reset_season()` locks it from the final rank before wiping the season (catching manual Luminary) and leaves it untouched after. Surfaced on the member's Vault (Store widget + ledger headline); `lib/season-ranks.ts` mirrors the enum order (`RANK_ORDER`/`higherRank`, tested). *Remaining P2.6:* entitlement sources beyond `membership_tier` (comp/Lab/staff grants — speculative beta infra).
- **2026-06-08 ✅ P2.2–2.5 (Stripe membership + Supporter)** — the env-gated Stripe layer is the membership rail: `/upgrade` + `/settings/billing` are a real checkout/manage flow (inline price + success-redirect confirm + webhook), the ✋ gates already read the tier. **P2.4 Supporter** (this round): pay-more tier wired end-to-end — `STRIPE_SUPPORTER_AMOUNT` (default $25), a "Become a Supporter" CTA on `/upgrade`, tier-aware billing confirmation, and a reusable `SupporterBadge` endorsed on the profile header.
- **2026-06-08 ⏳ P3.1 (Partners foundation)** — `profile_personas` table (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (the matrix's partner columns now activate per active persona; closes PB.1f) + self-serve `/partners/join`. 43 core tests green.
- **2026-06-08 ✅ Admin in the framework + view-as for Host+** — `AdminPage` promoted to a first-class `AdminTemplate` (composes the shared `PageHeading`); all 20 admin pages adopt it unchanged. The "view as a role under you" selector, previously janitor-only, now works for **every steward Host and above** (downgrade-only, scoped to roles beneath them) — `lib/view-as.ts` `canViewAs` + the control/action. (Owner directive: no separate "admin mode" — admin functions inline + role view.)
- **2026-06-08 ✅ PB (framework dialed)** — PB.1 access control unified (one `isPaid(tier)` predicate; beta-grant regression fixed). PB.2 page framework: genuine primitive-cobbling fixed (`StatInline` dedup; `/support`+`/growth` recomposed; `/crew`+`/broadcast` headers → `PageHeading`); the rest already compose the kit or are sanctioned-rich detail headers (PB.2d). Tails tracked: PB.1i (`isEndorsed`→tier via feed RPCs), PB.1f/g/h, remaining `Stat` variants.
- **2026-06-08 ✅ model correction + audits** — Crew = the paid membership tier (migration `20260608050000`, values `free|crew|supporter`); ROLES.md vision rewritten. Two best-practice audits (access-control · page-framework) folded into track **PB** — no security holes, no `text-[Npx]`; main work = unify "is paid" to the tier + re-compose ~26 hand-rolled pages.
- **2026-06-08 ✅ P2 (decouple, §11.2)** — paid is now the **tier only** (removed the role≥crew proxy from `columnsForHats`); stewards (host+) get full on steward surfaces via their role, not payment; `/upgrade` sets `membership_tier` (Crew = pure stewardship). Backfill means no current user loses access. *Follow-up policy: auto-comp leaders' membership on promotion?* PR #411.
- **2026-06-08 ✅ P2.1 (live)** — `membership_tier` migration **applied** to the DB (backfilled: 10 paid / 1 free); read path flipped from the crew proxy to the real column (`lib/auth.ts` → `getViewerHats` → `deriveTier`). The entitlement is now real.
- **2026-06-08 ⏳ P2.1 (foundation)** — `deriveTier` + `lib/core/entitlement.ts`; `getViewerHats` sets `tier`; migration `20260608040000_membership_tier.sql` authored (⚠️ apply pending). Behavior-preserving. PR #410.
- **2026-06-08 ✅ P1.3 (rollout)** — centralized the scattered `['crew',…]` paid-proxy into `isPaidViewer()` across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes`. One matrix-backed source. PR #410.
- **2026-06-08 ✅ P1.3 (pilot)** — `lib/core/viewer-hats.ts` seam + Vault/Store wired to `surfaceAccess('vault')`. The unified-site pattern is established. PR #410.
- **2026-06-08 ✅ P1.2** — Scope re-validation on structure/event mutations + `assignRole` escalation closed (`app/(main)/admin/actions.ts`). PR #410.
- **2026-06-08 ✅ P1.1** — Access matrix encoded (`lib/core/access-matrix.ts`, 18 tests, tsc+eslint clean). PR #410.
- **2026-06-08 ✅ docs** — Master list, ROLES.md access matrix + unified-site principle, ADR-163.

---

## P1 — Permissions & Roles  (the headline)

> Spec: [ROLES.md](ROLES.md) (three systems + entitlement, the **access matrix**, the
> **unified-site principle**) + ADR-163 + [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11.
> Foundation already exists: `community_role` ladder, the staff capability matrix
> (`lib/core/staff-roles.ts`), the 32-area `NAV_AREAS` grid + janitor-editable `area_permissions`.
> The shift: **route-level gating → per-capability gating inside shared pages.**

| # | Item | Status | Notes |
|---|---|---|---|
| **1.1** | Encode the matrix as one source of truth | ✅ | `lib/core/access-matrix.ts` — `accessTo(surface, hats) → none/limited/full`. Done. |
| **1.2** | 🔴 **Security: re-validate scope on mutation** | ✅ | Structure/event mutations now re-resolve per-scope leadership (`requireScopedManage`); `assignRole` privilege-escalation closed (janitor/owner/staff-roles only). Done. |
| **1.3** | Unified-site refactor | ⏳ | ✅ Vault/Store + the scattered `['crew',…]` paid-proxy across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes` now route through the matrix (`isPaidViewer` / `surfaceAccess`). ✅ **In-page admin advanced this session:** the **page Settings panel** (`page-admin-bar`) now puts content-editing · per-page QR · circle-rail order **on the page** (the "collapse `/admin/*` into in-page controls" direction). **Remaining:** open the member-facing ✋ surfaces per the sheet (Studio Overview, Personal CRM, QR Studio — a deliberate access change) + continue migrating remaining `/admin/*` management into in-page Settings (IA-RESTRUCTURE §10). |
| **1.4** | Scoped stewardship (`stewardships` table) | ⏳ | §11.1 — **Foundation shipped** (ADR-218, additive/behavior-preserving like 2.1): `stewardships` edge table `(profile·role·scope·state)` + derived `profiles.community_level` cache (floored by `community_role`, kept fresh by trigger); backfilled from `circles.host_id`/`hubs.guide_id`/`nexuses.mentor_id`; pure derivation `lib/core/stewardship.ts` (+ tests) + reader `lib/stewardships.ts`. Migration `20260614100000` **DB-applied** (table + `community_level` cache + backfill verified live — 2 edges = the 2 leader FKs; but **not yet recorded in `schema_migrations`** — out-of-band drift, idempotent re-run safe). **No read path flips yet** — `getViewerHats`/`load-capabilities`/`requireScopedManage` still read the FKs + `community_role`. *Remaining:* the resolver reads edges (a scoped host lights Host surfaces only in-scope) — lands with **1.6**. |
| **1.5** | Admin axis formalization | ✅ | §11.3 (ADR-223) — `team_members` formalized as the single staff source: the System-3 **super-ladder** is named in code (`SUPER_STAFF_ROLES`/`isSuperStaff`: owner=Executive/Janitor, admin=Site Admin), no schema change needed (the `20260606000100` CHECK already holds all 7 roles). **Missing staff-domain unlocks added** — Support + Members roster via the `members` domain (owner/admin/operations/support), Vera via `insights`. The bespoke host-only `/admin/support` inline guard swapped to `requireAdmin('host', { staff: 'members' })`, matching its nav link; the Members page guard aligned to `requireAdmin('janitor', { staff: 'members' })`. **Access note:** both swaps are additive supersets (host+ now joined by `members`-write staff) — no one loses access. Unit tests cover the unlocks + unchanged grants. |
| **1.6** | Unified capability resolver | ⏳ | §11.6 — one resolver = union of Community edges ⊕ Entitlement ⊕ Partner personas ⊕ Admin matrix. **PR 1 — foundation shipped** (ADR-220, additive/behavior-preserving): the per-scope resolver (`capabilities.ts`) reads `stewardships` edges via a `leadsScope` predicate **OR'd with the leader FK** (provably a no-op on the backfill data — every FK has a matching edge; scope-isolated by construction); edges fetched once/request in `load-capabilities.ts`; parity test locks no-behavior-change; `requireScopedManage` re-bases for free. **PR 2 — scoped surfaces shipped (additive)** (ADR-221): `community_level` threaded through `auth.ts` (view-as floors it); `getViewerHats` sources community standing from the derived level via `communityStanding` (a no-op for member…mentor, `max`-guards a global admin/janitor's column); `surfaceAccess`/`canUseSurface` take an optional `scope` and elevate the in-scope standing for an edge-leader (circle⇒host/hub⇒guide/nexus⇒mentor) so a global-member edge-leader gains the in-scope surfaces; the `load-capabilities` parent-walk loosened with an OR so a guide/mentor EDGE (any scope) also triggers the walk (FK **or** edge confirms the specific parent). **The `community_level` floor (ADR-218) protects global roles — nothing regresses; strictly a superset of today.** **PR 3 — scoped-surface adoption shipped (additive)** (ADR-225): the circle / hub / nexus detail pages now PASS their `scope` into `surfaceAccess('insight', { type, id })`, so the ADR-221 seam actually fires — a global-member edge-leader sees the in-scope **Insight** view at the matrix depth (Host ⇒ limited basic health; Guide/Mentor ⇒ full analytics); pure presentation helper `lib/core/scoped-surface-ui.ts` (+ test). `/admin/insights` + `/admin/vera` stay global; scoped Vera deferred (no UI yet). Org-tenant isolation satisfied by absence (no tenant infra yet — deferred until Hook tenancy). |
| **1.7** | Per-function permission grid | ⏳ | **Built** (ADR-222, migration `20260614300000` **DB-applied** — table + RLS verified live; not yet in `schema_migrations` (out-of-band drift, idempotent re-run safe)): `/admin/roles` now edits permissions at the **capability** level, not just per-route. New `capability_permissions` table is a sparse OVERRIDE store over the ADR-127 staff `CAPS` matrix (precedence **override > code-default**); `resolveStaffAccess`/`staffCan(…, overrides?)` layer it in (pure, parity-tested — empty override == today). `getCapabilityOverrides` threads it into the **live** gate (`requireAdmin`/`requireAdminFloor`/`authorizeAction`) so a denied capability actually blocks entry + mutations. Janitor-only `CapabilityGrid` panel (domains × staff roles, click to cycle none→read→write). RLS mirrors `area_permissions`; route-grid untouched (additive). |
| **1.8** | Role-advancement training Journeys | ⏳ | §7 — assignment-on-promotion ✅; curriculum (7.3–7.5) ✅ full ladder member→host→guide→mentor (registry + pure selectors, ADR-224); help-article `role` tagging ✅ (front-matter + loader, additive); authoring surface ✅ read-mostly `/admin/content/training`. Remaining: in-place curriculum editor (write-through table) + per-step coachmark tours. |

## P2 — Entitlement & Billing

> The matrix's **✋ cells are the paid gate** (Vault · Studio Overview · Personal CRM · QR Studio).
> Billing was flagged a stub by **three** sweeps. Spec: §11.2 + DEVELOPMENT-MAP Stage C2/D2.

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Tier flag `free / member / supporter` | ✅ | Migration applied (backfilled); `profiles.membership_tier` threaded `getCallerProfile → getViewerHats → deriveTier` — the ✋→✅ gate is driven by the **real entitlement column**. **Remainder closed (ADR-226):** `membership_tier` is now the **sole paid source of truth** across `/upgrade`, `confirmCheckout`, and the webhook (which no longer writes `community_role='crew'` — the retired ADR-207 conflation removed); paid = the **tier only**, fully decoupled from the community role. |
| 2.2 | Stripe membership layer | ✅ | Env-gated (`billingEnabled()`); `lib/billing/{stripe,checkout}.ts` + webhook (`checkout.session.completed` / `subscription.updated\|deleted` → `membership_tier`). Inline `price_data` fallback (no price ID needed) + `confirmCheckout` success-redirect fallback (works pre-webhook). Partner payouts/commissions still pending (2.7). |
| 2.3 | Stripe membership checkout | ✅ | Real `/upgrade` checkout + `/settings/billing` (manage/cancel via portal). Beta free toggle stays when keys absent. |
| 2.4 | Supporter badge | ✅ | Pay-more tier live — `STRIPE_SUPPORTER_AMOUNT` (default $25) inline price; "Become a Supporter" CTA on `/upgrade`; reusable `SupporterBadge` endorsed on the profile header. |
| 2.5 | Wire the ✋ gates to the tier | ✅ | Matrix-driven: `accessTo()` + `isPaid(tier)` gate Vault · Studio · Personal CRM · QR Studio (the ✋ cells read the real entitlement column). |
| 2.6 | Freemium Vault + season cash-in | ⏳ | Accrual (zap/gem ledgers) ✅, season `zaps → gems` conversion ✅, persistent Vault + "how you earned" log ✅. **Lifetime rank** ✅ — locked monotonic peak (`profiles.lifetime_rank`, ADR-164/migration `20260608060000`): zap trigger ratchets it, `reset_season()` preserves it, surfaced on the Vault. **Cash-in eligibility** ✅ (ADR-226) — pure `canCashIn(tier) = isPaid(tier)`; `redeemItem` now enforces it **server-side** (free members get a clean `/upgrade` upsell; accrual stays free, only claim/spend is paid). *Remaining:* entitlement **sources** beyond `membership_tier` — host comp-grant / Lab rollup / staff grant (ADR-037 §6c/d; speculative beta infra); optional RLS cash-in floor on `store_redemptions`. |
| 2.7 | Persona verification + Connect binding | ⏳ | **Verification half** ✅ (ADR-165, migration `20260608070000`): the `profile_personas` ladder is real — claim → *pending review* → staff **verify** → activate (suspend/reinstate), validated by `canStaffTransition`; surfaces light on verified/active only; audit trail (`verified_by/at`, `updated_at`); admin queue at `/admin/personas` (janitor / `profiles`-staff). *Remaining:* per-persona **Stripe Connect binding** (the money gate at `active`) — stubbed until Connect is configured. |
| 2.8 | Module registry + inter-entity Lab bridge | 📋 | Verticals self-declare (ADR-033); audited for-profit↔Foundation transfers (ADR-038). |
| 2.9 | Operator-managed pricing entitlements (P1-P3) | ✅ (ships OFF) | [ADR-362](DECISIONS.md) / [ADR-363](DECISIONS.md) / [ADR-364](DECISIONS.md), spec [PRICING.md](PRICING.md). Three operator-managed entitlement flags + `featureAllowed` (P1); Stripe products/prices + subscription checkout + webhook reconciliation, incl. Space plans + Space memberships (`lib/billing/space-subscriptions.ts`, P2); member-facing surfaces rendered from the operator values — `/upgrade`, Space plan picker + billing route, paid membership join, white-label as a high-touch lead (P3). Structurally safe while `billing_live` is OFF. Deferred gates tracked in [REMAINING-WORK.md](REMAINING-WORK.md). |

## P3 — Partners (personas + Hook federation)

> Self-serve account personas, multi-select hats. Spec: §11.4 / §8 + [ROLES.md](ROLES.md) System 2.

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `profile_personas` + per-persona dashboards | ⏳ | ✅ **foundation:** `profile_personas` migration (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (matrix partner columns now activate per active persona) + self-serve `/partners/join` claim. ✅ **3.2:** `/crm` + `/growth` open to Business/Org personas. ✅ **3.3:** Business/Org self-serve **directory listing** (`/partners/listing` → the `/partners` directory). ✅ **3.4:** Collaborator featured directory (`/partners/collaborators`). **Remaining (mostly need Stripe/infra):** website builder · Hook sub-community · Collaborator affiliate kickbacks · Practitioner paywalled Programs. |
| 3.2 | Collaborator | 📋 | Featured Practices/Journeys directory + influencer/affiliate kickbacks + Earnings view. |
| 3.3 | Practitioner | 📋 | Paywalled Programs + client gamification + private Channel/Circles (Frequency-branded) + Connect. |
| 3.4 | Business | 📋 | Listing + network integration + loyalty + CRM + **website builder** (Studio › Website stub). |
| 3.5 | Organization + Hook federation | 🔴 | XL — white-label sub-communities; identity link + Hook membership rollover (§8.1); points rollup, idempotent+capped (§8.2); community federation / lead-funnel bubble (§8.3); isolated tenant admin (ADR-158). |

## P4 — Platform completion (verified 2026-06-08)

> **Verification pass corrected the sweep:** several "stubs" were false positives — the
> sweep pattern-matched an `EmptyState`/`coming soon` *fallback branch* in code, but the
> feature is actually built/populated. Real, code-completable gaps are few.

| # | Item | Status |
|---|---|---|
| 4.1 | **Programs library** — ✅ **already built**: 4 frameworks live in `content/programs/`, page renders them (the "coming soon" is the empty-state fallback). Sweep false positive. | ✅ done |
| 4.3 | **Outreach member-send** — ✅ **completed**: `sendOutreach` fans a steward's direct note to the members of the scope(s) they lead, via the email+push spine. | ✅ done |
| 4.2 | Help-center articles — ✅ **expanded 2026-06**: 7 new member articles (season challenges · achievements · leaderboard · Circle Current · gem store · partners · location privacy), each verified against the code, + 2 extensions. 32 articles across 7 categories. Further coverage = ongoing authoring. | ✅ expanded |
| 4.9 | Nurture/Automations — per the operator audit these are **wired** (Nurture complete; Automations email-only). Add SMS/push actions + segment builder. | ⏳ |
| 4.8 | Library submission flow — ✅ **completed**: members get a status-aware **"Propose to Library"** control on their own practice (`ProposeToLibraryButton` → `submitToLibrary` → `status='pending'` → the existing leadership review queue → approve flips it public). Journeys already publish via the builder's "Share to community". | ✅ done |
| 4.7 | Founder task-assignment model — ✅ **done 2026-06 (ADR-205)**: circle-scoped claimable crew tasks (`circle_id`/`assigned_to`/`claimed_at`, applied to prod); real `openTaskCount` wired into `getCircleCapabilities`; race-safe claim; host panel + Crew-dashboard section. | ✅ done |
| 4.6 | `/hubs` + `/nexuses` index pages — **won't build**: the approved IA keeps Hubs/Nexuses **contextual** (reached via circle drill-down). Not a gap. | ✅ by design |
| 4.4 | Engagement physical sources (QR/NFC/geo/p2p) | 🔴 needs device/verification infra |
| 4.5 | Push notifications — needs **VAPID keys** + delivery config | 🔴 owner keys |
| 4.10 | Email metrics need the **Resend webhook** configured; donor flow needs design | 🔴 owner config |

## P5 — Member · Practice · Operator depth (the feature backlog)

**Member & Community** (BACKLOG §G/§H, STUDIO-REVIEW): Network hub unification (`/people`+`/connections`+`/marketing/contacts`) · ✅ directory filters (topic/location/role — ADR-204, on `/network`) · ✅ friend suggestions ("People you may know", real signals only — ADR-204) · ✅ My Contacts CRM P1-P3 (the personal keep-in-touch CRM + in-person QR capture + graduation into the paid Spaces CRM — [ADR-361](DECISIONS.md), [CRM-STRATEGY.md](CRM-STRATEGY.md), [NETWORK-CRM.md](NETWORK-CRM.md); follow-ups in [REMAINING-WORK.md](REMAINING-WORK.md)) · circle-discovery map layer · circle lineage + "nearly full → seed a new circle" flywheel · multi-topic circles · hub/nexus-scoped events · two-way message inbox · richer profile header + privacy-safe public profile schema · (later) Postgres sync-engine pilot.

**Practice / Quest / Gamification** (BACKLOG §F): ✅ daily-streak achievement badges (2026-06 — `practice_streak` criteria over `profiles.current_streak`, evaluated on each log, pays zaps; 3 badges seeded: Week of Devotion 7d · Moon Cycle 30d · 100 Days 100d) · stage-driven disclosure (apply `stageIndex` to dashboard/profile/rails) · `practice.verified` host/peer verification + device attestation/P2P mutual-confirm · realtime reward feedback via Broadcast · Programs content depth (>4 frameworks) + program-as-template "Add to Circle" · community-library moderation + promote-to-tracked Journey · seasonal-Journey authoring surface + content (link to season + Pillar).

**Operator: Growth Studio / CRM / Marketing** (ONBOARDING-BUILD-LIST §9, BACKLOG §I): visual entry-point/flyer designer (9.2) · live QR style preview (9.3) · unified link generator (9.4) · lead-flow customization UI (9.6) · A/B builder + scheduled publish (9.7) · segment builder + Kanban pipelines + React-Email templates · per-campaign/automation performance drill-down · live Claude Studio operator (gated on consent harness) · funnel/acquisition/cohort analytics.

## P6 — Onboarding / Vera / AI / Capture

> Detail + status in [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md).

- **§0 Pre-test enablement (config, not code):** `ANTHROPIC_API_KEY`, flip `ai_enabled`, build help index, run pending migrations, prod env, verify funnel.
- **§1.5 live-loop suggestion chips** ⏳ · **§2.1 welcome post** ✅(tweaks) · **§2.2 finish `draft_intro`** ⏳ · **§2.3 memory summarization cron** 📋 · **§2.4 warm demo content** 📋 · Vera matriarch/coach tweaks ⏳.
- **§6 Capture Phases 2–4** 📋 (richer kinds; Quest pipeline + sponsor rewards) · journal framing (3.1).
- **§3 Proactive Vera** 🔴 gated on the consent harness (ADR-028) · **AI core** governance kernel (router, RAG, caps, kill switch) 📋.

## P7 — Navigation & IA

> [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) §10. The unified-site refactor (P1.3) and this converge.

- 10.1 Quest tabbed dashboard ✅ · 10.6 widget-free rail ✅ · 10.2 Marketing→Growth ✅ — **remaining:** 10.2 operator dashboards (`/admin` suites → Community Studio/Insights/Platform) · 10.3 Network hub · 10.4 Practices+Library merge · 10.5 Settings hub · 10.7 `NAV_AREAS` rewrite → later **data-driven Site Navigation admin suite** (BACKLOG §J).
- Polish: soften newcomer breadcrumb · milestone wake-up gating map · reconcile "Interests" vs "Topics" · "tune in" verb decision.

## P8 — Infra · Data · Security · Hardening (BACKLOG §A/§B/§C/§D/§I/§O)

- **Migrations/data:** ✅ **2026-06-09 reconcile** — a batch that merged without being applied to the live DB was applied (`page_content` · `qr_page_folders` · `circle_sidebar_order` · `founders_first_week_badge` · `training_paths` · `connect_accounts` · `tips` · `event_tickets`); a **standing deploy gate** (apply-on-merge, ADR-185) now lives in CHECKLIST so it doesn't recur. ✅ **2026-06-09 second verify** — `lock_economy_columns` (the `prevent_economy_self_edit` trigger) and `perf_indexes` (all 5 indexes) were **already live** in prod, and the zap ledger + `trg_after_zap_transaction` confirm the economy double-award / online-pay-zaps fixes are applied — those "pending" rows were stale. ✅ **quest engine dropped** — `/admin/quests` rebuilt as the Journey-Library manager (chain CRUD removed), the retire migration applied to prod (`quest_outcomes` RPC + the legacy action-chain engine gone, ADR-152), and types regenerated. ✅ **zap-award paths already collapsed** (stale row) — every grant flows through `awardZaps`/`awardZapsForAction` → one `zap_transactions` insert → `trg_after_zap_transaction` owns totals + rank; the only other ledger writers are the deliberate, audited janitor grant/revoke overrides (`economy-actions.ts`). *Remaining (decisions, not code):* resolve gem-farm / store-redeem TOCTOU / zap auto-promotion decisions.
- **Security:** ✅ **CSP (report-only)** + the `/api/csp-report` sink (next step: tighten + nonces → enforce) · RLS convergence Phase 2 (blocked on test harness) · ✅ **Stripe webhook replay/idempotency** (claim `event_id` before handling, migration `20260608120000`) · ✅ **rate-limit** `check-handle` · `search-handles` · `search` (Upstash sliding-window, 60/min/IP; fails-open + no-ops without the `KV_*` env) · ✅ **admin audit log** — unified `admin_audit_log` (+ `logAdminAction`) instrumented on the crown-jewel actions (role grants · partner verification), read at `/admin/audit` (admin+); complements the domain ledgers (`platform_flag_events` · `studio_site_changes` · `reward_grants`).
- **CI / quality:** ✅ gate `tsc`+`eslint`+`vitest` in CI (`ci.yml`) · ✅ Dependabot (`dependabot.yml`, grouped weekly) + CodeQL (`codeql.yml`, JS/TS security-and-quality) · *remaining:* enable secret-scanning push-protection (repo setting) · vitest consent harness · lint debt (`pnpm lint` is now clean repo-wide) · doc fixes.
- **Comms infra:** notification router/registry + migrate email/push onto the outbox queue · deliverability hardening (SPF/DKIM/DMARC subdomain) · verify `frequencylocal.com` in Resend + OAuth redirect URLs · submit sitemap/robots.
- **Scale (Phase 4, when measured):** paginate People/Circles · `force-dynamic`→ISR on CMS pages · profile zap-sum via SQL · `<img>`→`next/image` · Supavisor/read-replicas/denormalized feed read-model/partitioning/Broadcast realtime.
- **Design system:** unify pill/button radius (shared `Button`/`Badge` primitive) site-wide.

## PM — Money verticals (gated on PMF + legal entity)

Designed, sequenced after Stage C2: **D1 The Collective** (contributor verification → paid offerings → payout) · **D3 Affiliate** (referral → commission → payout ledger) · **D4 Donations & Grants** (Foundation rail) · **D5 Lab Spaces** (gym SaaS + Lab membership + rollup) · **Money foundation** (entity partition + `financial_transactions` ledger, ADR-029/032).

## PI — Intelligence & Activation Engine (track everything → AI-guided improvement)

> **Vision (owner):** *"Track everything a member does; have the AI studio recommend site changes
> for better member engagement, and build future rewards based on past behaviors."* The full spec
> is the **6th layer** of [MEMBER-DATA-PLATFORM.md](MEMBER-DATA-PLATFORM.md) (ADR-166). **We already
> own the spine** — `engagement_events` (append-only, idempotent), `member_traits`/`member_tags`,
> `segments`, the nightly rollup crons, `lib/experiments` (variant assignment + holdouts), the
> consent ledger, and the Vera/Claude kernel (router, budget, kill switch). This track adds the
> two things you **cannot retrofit** (raw width + immutable history), then *composes* the rest on
> what exists.

**The one rule that prevents re-developing later: capture wide and immutable NOW.** Every future
metric, reward, or model must be a *read* over data we already banked — never a backfill we can't
do. So PI.1 ships first, even before the AI can use it.

| # | Item | Status | Notes |
|---|---|---|---|
| PI.1 | **Wide interaction capture (the fire-hose)** | ⏳ | **Spine shipped** (migration `20260608080000`, ADR-166): `interaction_events` (wide, jsonb-extensible, append-only, host-read RLS) + batched client buffer `lib/analytics/observe.ts` (`observe()`, sendBeacon flush on interval/full/page-hide) + batch sink `/api/observe` (consent-gated, member-tied, service-role bulk insert) + `ObserveProvider` auto-capturing view · dwell · scroll-depth · rage-click · visibility. Retention-bounded (90d purge in the nightly cron). *Remaining:* explicit per-feature `observe()` calls (search/zero-result/form-abandon at the call sites), anon-session capture, per-kind sampling tuning. |
| PI.2 | **Member feature store (durable behavioral profile)** | ⏳ | **Built** (migration `20260608090000`): the firehose now rolls into the feature store. 8 registry-declared **behavioral traits** (`interaction_count_30` · `interaction_days_30` · `surfaces_touched_30` · `dwell_minutes_30` · `sessions_30` · `scroll_depth_avg` · `last_interaction_at` · `engagement_depth` band) computed by `computeBehavioralTraits` from the `member_interaction_stats` RPC and upserted into `member_traits` by the nightly refresh. Plus `interaction_surface_stats` — the per-surface site-level rollup (views/dwell/scroll/rage/reach) PI.4 reads. *Remaining:* near-real-time path for live signals; affinity vectors. |
| PI.3 | **Predictive traits** | ⏳ | **Built** — new `predicted` trait kind + 3 registry-declared predictions computed nightly from the feature store: **`churn_risk`** (low/med/high), **`activation_propensity`** (0–100), **`next_best_action`** (reengage/activate/join_circle/deepen/invite/none). Heuristic v1 (pure, unit-tested) over lifecycle + RFM + engagement-depth; the refresh now merges the ledger + interaction views per member so all three trait families compute from one picture. A model/Claude-graded path slots in behind the same keys. *Remaining:* LTV band (needs billing signals), model upgrade. |
| PI.4 | **AI Intelligence Studio (predict → recommend → apply → audit)** | ⏳ | **Built — increment 1** (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) reads the feature store + predictions + `interaction_surface_stats` + **the Support DB** (tickets + help-gaps) and emits **ranked, evidence-backed recommendations** (`synthesizeRecommendations`, pure/tested; Claude narrates the summary with deterministic fallback). The safety core: a **governed allow-list** of reversible, role-gated, param-validated site actions (`lib/studio/site-actions.ts` — `reindex_help`, `set_flag`) the operator applies one-click; every apply/revert is audited (`studio_site_changes`). The AI can never emit an arbitrary mutation. *Remaining:* experiment-spawn + lift measurement; more registered actions (publish help draft, promote segment, tune Vera); agentic support replies. |
| PI.5 | **Retroactive reward engine (future rewards from past behavior)** | ⏳ | **Built** (ADR-168, migration `20260608110000`): a governed **rule registry** (`lib/rewards/rules.ts` — pure predicates over the durable snapshot: lifetime rank, feature-store traits, tags, tier; e.g. the `seasoned_agent` rule [code key unchanged] = ever reached Beacon (the rank formerly named Agent) → 200 gems) + an **idempotent batch evaluator** that **claims-then-pays** against the immutable history (`reward_grants` unique `(rule, member)` backstop; reward lands in the gem/zap ledgers). `/admin/rewards` (Admin/Janitor): dry-run **preview** of pending grants + one-click grant. Re-running never double-grants. *Remaining:* zap-kind rules, tag/badge rewards, cron auto-run when trusted. |

**Sequencing:** PI.1 now (urgent, un-retrofittable) → PI.2 → PI.3/PI.5 in parallel (both read the feature store) → PI.4 last (it consumes all of the above). Most of PI.4–PI.5 is *composition* of existing primitives (experiments, segments, ledgers, AI kernel, idempotency); only PI.1–PI.2 need new data infra.

---

## PX — Extension opportunities (build *on* what just shipped)

> The 2026-06-09 session landed four reusable seams — the **page Settings panel**, the
> **content-edit registry**, **per-page QR folders**, and the **Circle Quest module**. Each is a
> small, high-leverage extension, not new infra. Ordered roughly by value/effort; pick from the top.

| # | Extension | Builds on | Status | Notes |
|---|---|---|---|---|
| PX.1 | **Content editor → hero/CTA, not just title+description** | `page_content` (ADR-180) + Settings panel | ✅ done (ADR-206) | Add optional `hero_image` / `cta_label` / `cta_href` columns + module fields; pages keep the coded fallback. The header is editable; the rest of the chrome should be too. |
| PX.2 | **Editable content → SEO metadata** | `resolvePageContent` (ADR-180/182) | ✅ done (ADR-206) | Feed the operator-set title/description into the route's `generateMetadata` (og/twitter + `<title>`), so an in-place edit also tunes search/share cards — no second editor. |
| PX.3 | **Per-page QR analytics in the Settings panel** | `qr_codes.page_path` (ADR-179) + existing `qr_scans` rollups | ✅ done | Surface scan counts / last-scan / top source for *this page's* codes inside `PageQrManager` (the data already exists in QR Studio — just scope it to `page_path`). Closes the create→measure loop on-page. |
| PX.4 | **Fill the Circle Quest challenge model** | `CircleQuestModule` (ADR-181) | ✅ done | Shipped as the circle-challenge adoption model (ADR-201): hosts adopt a global season challenge, the column shows collective progress, completions credit Circle Current. |
| PX.5 | **Settings panel → remaining entity types** | `page-admin-bar` / `PageAdminProvider` | ✅ done | Events already had a module; channels (`channel.manage`, staff) + people (janitor moderation) modules added — see the audit-table PX.5 row. |
| PX.6 | **Circle rail order pattern → other rail-bearing pages** | `circles.sidebar_order` (ADR-181) | 🔵 deferred | **Assessed 2026-06: no second consumer.** Circles are the only entity with a per-entity reorderable rail; every other route uses the global/scoped rail with fixed blocks. Generalizing now is speculative infra — revisit when a second rail-bearing entity needs ordering. |
| PX.7 | **Founder-config pattern → other milestones** | `founder-config.ts` (ADR-184) | ✅ convention | **Codified 2026-06:** any new milestone/quest ships as ONE config module (reward + copy + steps) that the code reads — `founder-config.ts` is the reference shape; circle-challenge constants (`CIRCLE_FIELD_CHALLENGE_AWARD`) and tier metadata (`tier-meta.ts`) already follow it. Enforced by review, not tooling. |

---

## PB — Best-practice cleanup & hardening (2026-06-08 audits)

> Two read-only audits (access-control architecture · page-framework consistency). Verdict:
> **the architecture is well-layered and there are no security holes** — the gaps are *semantic
> drift* (gating computed two ways) and *incomplete framework adoption* (cobbled pages).

### PB.1 — Unify access control (one capability layer)

The permission stack (matrix → per-scope resolver → staff matrix → nav grid) is sound; the issue
is **"is paid / is steward" computed in divergent ways**. Now that Crew = the paid tier (decoupled
from role), the role-based proxies are wrong and must move to the tier.

| # | Item | Where | Status |
|---|---|---|---|
| PB.1a | Drop the role≥crew fallback in `deriveTier` | `lib/core/entitlement.ts` | ✅ done |
| PB.1b | **Unify "is paid" → the tier** — `isPaid(tier)` is now the single predicate; gamification gates moved off `atLeastRole(role,'crew')` (capabilities task · zaps rate · entry-points · codes). Also fixed a regression: beta-grant now comps the Crew **tier**. | `capabilities.ts`, `zaps.ts`, `entry-points`/`codes` actions, `beta/actions.ts` | ✅ done |
| PB.1c | Thread the tier into the per-scope resolver (`Viewer.tier`, fed by `load-capabilities`) | `load-capabilities.ts`, `capabilities.ts` | ✅ done |
| PB.1d | `requireCrew()` — name is now correct (Crew = the paid tier); body checks `isPaid(tier)` | entry-points/codes | ✅ done |
| PB.1e | Page-level `requireAdmin('janitor')` on `/admin/roles` (defense in depth for `assignRole`) | `/admin/roles` | ✅ already in place |
| PB.1i | **`isEndorsed` display → tier** + retire the `community_role='crew'` value | `season-ranks.ts` + feed/profile types | ✅ done (ADR-207, migration applied — incl. the role-as-paid read floor: entry-points · messages rooms · events composing · Vault nav · demo generators) |
| PB.1f | Thread `profile_personas` through `getViewerHats` | `lib/core/viewer-hats.ts` | ✅ done (P3.1) |
| PB.1g | Capability **reason** metadata | resolver | ✅ done — additive `capabilityGaps()` (needs-membership/paid-tier/role), 8 tests (ADR-207) |
| PB.1h | Bring janitor-only admin surfaces (Vera/AI) under the matrix | `access-matrix.ts` | ✅ done — Vera → `insights`, AI → `platform` staffDomains (ADR-207) |

### PB.2 — Page-framework re-composition (same framework on every page)

**54% template adoption** (62/115 pages) — the rest hand-roll headers/layouts. Target 75%+.

| # | Item | Status |
|---|---|---|
| PB.2a | Dedup the `Stat` components. ✅ done — `StatCard` gained `bordered`/`detail`/`size='sm'`; the bespoke stats in `practices/[id]`, `admin/qr/analytics`, `admin/qr/stats` are deleted in favor of the kit. | ✅ |
| PB.2b | Quick wins → kit. ✅ `/support` + `/growth` recomposed (IndexTemplate + EmptyState). `/crew/quests` + `/crew/store/ledger` were **already** composing PageHeading + StatCard + EmptyState. | ✅ |
| PB.2c | Crew section + broadcast headers → shared `PageHeading`. ✅ `/crew` + `/broadcast` (the two raw-`<h1>` offenders). achievements · challenges · journey · streaks **already** compose PageHeading/IndexTemplate — verified. | ✅ |
| PB.2d | `/crew/store`, `/people/[handle]`, `/journeys/[slug]` — assessed: these have **intentionally rich detail headers** (Vault aside-card · avatar/rank identity · accent emoji-tile + pillar chips) that PAGE-FRAMEWORK explicitly sanctions ("Detail pages keep their richer context band"). They use the kit's type scale + primitives in their bodies. Forcing the generic templates would regress the visuals — **left as sanctioned custom, not recomposed.** | ✅ assessed |

> **Audit recalibration:** the "46% hand-rolled" overcounted — many pages compose `PageHeading`/`StatCard`/`EmptyState` directly without the template *wrapper*, which is correct (e.g. where a back-link/eyebrow is needed). The real cobbling is pages that hand-roll the *primitives* (raw `<h1>`, bespoke empties/stats): `/support`, `/growth`, `/circles`+`/channels` (StatInline), `/crew`, `/broadcast` — now fixed — leaving PB.2d.

### PB.2e — Full template-wrapping (2026-06-08 definitive audit)

> Owner standard: **every interior page wraps one of the 5 templates** (slots = easy to assign/reorganize). Verified: the **framework is complete** (no missing slot). ✅ **2026-06-09 re-verified page-by-page: the migration list below is DONE** — a prior wave ("Standardized internal-page system, Wave 1") wrapped every listed interior page; two agents confirmed each file (crew/broadcast/connections/support chunk + help/discover/system chunk) with zero edits needed. Remaining custom pages are all sanctioned exceptions: discover index pages + `/sign-in` (full-bleed marketing-ui heroes), Admin (on `AdminTemplate`), editors, real-time threads, join/onboarding flows, redirects. Historical migration list kept below for reference:

- **Wrap (trivial, PageHeading-only):** `/broadcast`→Stream · `/crew`→Dashboard · `/crew/quests`→Stream · `/crew/store`→Dashboard · `/crew/store/ledger`→Dashboard
- **Member/crew:** `/crew/{achievements,challenges,leaderboard,streaks,journeys,journey,arcs}` → Dashboard/Index · `/people/[handle]`→Detail · `/connections`(+`[id]`,`shared/[id]`)→Index/Detail · `/support/[id]`→Detail
- **Help:** `/help`, `/help/[category]`, `/help/[category]/[slug]`, `/help/changelog` → Index/Stream/Detail
- **Discover:** `/discover`(+`/circles`,`/events`,`/topics` & their `[id]`/`[slug]`) → Index/Detail
- **Focus/system:** `/sign-in`(+confirm) · `/privacy` · `/unsubscribe` · `/code-unavailable` · `/n/[nodeId]` · `/g/[slug]` → Focus
- **Sanctioned exceptions (do NOT migrate):** `(marketing)/*` · `/edit/[slug]`, `/journeys/[slug]`, `/practices/[id]/edit`, `/pages/sequences/[slug]/{build,edit}` (editors) · `/messages/[id]`, `/messages/r/[roomId]` (real-time) · `/join/[token]`, `/onboarding/*` (flows) · redirects/print.
- ✅ **`/admin/*` (20 pages) now on the template system** — `AdminPage` promoted to a first-class **`AdminTemplate`** in `@/components/templates` that composes the shared `PageHeading` (was a parallel hand-rolled header). All 20 admin pages adopt it via a back-compat alias — zero per-page changes. The sixth template; the admin-nav sibling of Dashboard.

*(Specialist surfaces — message threads, editors, QR/CRM tools, scan landings — stay custom by
design; ~27 pages.) Token hygiene is good: **zero** `text-[Npx]`, only 3 acceptable hardcoded-hex
specialist tools.*

## Source map — legacy lists folded in here

| Doc | Role now |
|---|---|
| [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) | **Detail track** for P1 (§11) + P6 + P7; still the spec for onboarding/Vera. |
| [BACKLOG.md](BACKLOG.md) | Source for P5/P8 items; keep for per-item depth (§A–§S). |
| [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) | Stage view of P2/P3/PM (entity/money/verticals). |
| [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) | Detail for P7. |
| EDIT-PATH-AUDIT · STUDIO-REVIEW | Folded into P4/P5 (Nurture/Automations, Studio KPIs). |
| BUILD-PHASES · CHECKLIST · LAUNCH · REDESIGN-STATUS | History / runbook / done — no open items (see harvest). |

*Living master list — re-rank as tracks land; update the Progress log on every ship.*

## 🧵 The Loom — built-in asset library — 2026-07-01 ([ADR-478](DECISIONS.md), spec [LIBRARY.md](LIBRARY.md))

The built-in, searchable asset library for the whole web editor: every entity has its own,
Frequency shares a master set, spanning **images, themes, app assets, and Puck-droppable
elements/templates/flows**, meant to grow for years without a deploy per asset. Search is
Supabase-native (FTS + `pg_trgm` now, `pgvector` semantic fast-follow). Decisions locked with the
owner: Supabase-native search · semantic as fast-follow · foundation first.

| # | Scope | Status |
|---|---|---|
| L1 | **Catalog + storage framework.** One polymorphic `public.library_assets` table (`kind` = image·icon·element·template·flow·theme·app_asset; file payload OR parametric `config`; `space_id` null = Frequency shared, set = entity's own), generated `search_tsv` + `pg_trgm` + `tags` GIN indexes, reserved `embedding vector(384)`, service-role-only RLS, and a `library-media` bucket. Typed contract `lib/library/types.ts`. | ✅ migration `20260919000000`, ADR-478 |
| L2 | **Seed the existing kit into the catalog.** The 17 illustration elements as `element` rows (registry ref in `config`), the LeadFunnel as a `flow` row, the theme registry as `theme` rows. Idempotent upsert by slug. | 📋 |
| L3 | **Search + browser.** `searchAssets({ q, kinds, tags, category, scope, color, sort })` (FTS + trigram + facet counts) and a janitor `/admin/library` browser (Index template): search box + facet rail + grid + preview. | 📋 |
| L4 | **Editor integration.** A `type:'custom'` "insert from library" picker + a Library panel in the Puck editor; `LibraryImage` / `LibraryElement` / `LibraryFlow` blocks; media blocks pick from the library. | 📋 |
| L5 | **Tenancy + roles.** Per-space libraries + upload-to-library (extend `uploadSiteMedia`, space-scoped), client-facing RLS, capability keys (`library.view` / `library.manage`), entitlements `library.*`, feature flags. | 📋 |
| L6 | **Semantic search (killer search+).** Populate `embedding`, hybrid FTS+vector ranking (RRF, matching the practice-library pattern), AI auto-tagging + color extraction, collections/favorites, usage-ranked results. | 📋 |
| L7 | **The Weave composer.** Brand-token-aware element/texture designer, versioning UI, cross-tenant publishing, template marketplace. | 📋 |
