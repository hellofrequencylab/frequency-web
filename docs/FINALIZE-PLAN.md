# Finalize plan — the run to a fully functional platform

> **The answer, first.** The platform is built and green: `tsc` clean, **8,870 tests passing**,
> **all 24 `check:*` gates exit 0**, CI green on `main`, and the migration ledger is an exact
> bijection with the repo (594 ⇄ 594, ADR-963).
> What is left is not features. It is **three instruments that stopped telling the truth**, one
> **access-grant layer** that was never actually closed, and a **short, verified list of real
> defects**. Nothing on this list is speculative: every item below was reproduced against the
> working tree or the live database on 2026-08-10, and the ones that turned out to be already
> fixed are recorded as such in §9 so nobody re-audits them.
>
> Companion plans: [`UX-MATURITY-PLAN.md`](UX-MATURITY-PLAN.md) (ADR-925) stays the design-maturity
> program and [`BUILD-LIST.md`](BUILD-LIST.md) (ADR-921) stays the phase runway. **This document is
> the finish line for the current build** and, where it disagrees with either, this one is newer.
> The ratchet JSON remains the scoreboard: `scripts/adoption-baselines.json`. Decision record:
> [ADR-960](DECISIONS.md).

Legend: ✅ done · ⏳ in flight · ⚠️ needs attention · 🔴 blocker.
Sizes: **XS** under an hour · **S** one PR · **M** 1 to 3 PRs · **L** a wave.

---

## 1. Where the site actually stands

| Dimension | State | Evidence |
| :--- | :--- | :--- |
| Build + types | ✅ | `tsc --noEmit` rc=0 |
| Tests | ✅ | 704 files, 8,870 tests, 0 failures |
| Machine gates | ✅ | all 24 `check:*` scripts exit 0 |
| CI (`ci.yml`) | ✅ | green on `main` |
| Migrations applied | ✅ | every repo migration is live in prod |
| Cron wiring | ✅ | 27 `vercel.json` entries ⇄ 27 handlers, zero drift both ways |
| Route reachability | ✅ | of 240 static routes, 8 have no inbound link and **all 8** are documented redirects or dev tools |
| Marketing metadata | ✅ | the 15 pages without `generateMetadata` are all intentional 308 redirect stubs (spot-checked 4) |
| Code hygiene | ✅ | **18** TODO markers in the entire `app` + `lib` + `components` tree |
| SEO/AIO surface | ✅ | 14 OG-image routes, 25 JSON-LD emitters, `llms.txt` already carries live first-party stats |
| Help centre | ⚠️ | 55 articles, core coverage 27/27, **10 orphan feature keys** |
| **Visual regression** | 🔴 | **fails on every run**, both branches, since at least 2026-08-06 |
| **Anon/authenticated grants** | 🔴 | **1,907 explicit grants across 273 tables** (2 worst RPCs closed, ADR-961) |
| **Migration ledger numbering** | ✅ | **594 ⇄ 594, zero drift both directions** (ADR-963) — was 607 vs 594 |

**The single most important sentence in this document:** six merges' worth of rendering changes have
landed with no working visual gate, so *every* claim about how the site looks is currently unverified.
Phase 1 exists to fix that before anything else touches a pixel.

---

## 2. The phases

Ordered so each phase restores the ability to verify the next. Do not reorder 1 and 2 ahead of
themselves; the rest can be parallelised once the instruments are back.

| Phase | Name | Size | Why it sits here |
| :--- | :--- | :---: | :--- |
| **1** | Restore the instruments | M | Nothing visual can be trusted until the suite is green |
| **2** | Close the access layer | M | The one finding with real blast radius |
| **3** | The verified defect sweep | M | Small, concrete, user-visible |
| **4** | Finish the menu system | M | Half-landed from the last thread; DB owns what members see |
| **5** | One render path | L | Retires the dual truth the redesign inverted |
| **6** | Kit, a11y, and interaction states | L | The mechanical debt the ratchets already measure |
| **7** | Voice, docs, and the owner handoff | S | Makes the record match the code |

---

## Phase 1 — Restore the instruments 🔴

**Definition of done:** `pr-compare` is green on a PR that changes nothing, the shell a11y baselines
exist, and all three gates are eligible to be flipped to required.

> ## ✅ Phase 1.1 is DONE — the 22px is explained, and the diagnosis found something worse
>
> **The 22px is not a mystery drift, and it is not one cause.** `app-settings--*-mobile` has a
> committed baseline of exactly **390×10276** — the "expected" half of the quoted failure. The
> received 10298 is +22, and `--tab-bar-clearance` is defined as `--tab-bar-h + 22px`
> (`app/globals.css:237-238`), consumed at `app-shell.tsx:2152` as
> `pb-[var(--tab-bar-clearance)] md:pb-0`. Commit `a6be25a` (#2052) moved the shell's main column
> onto it **after** the baselines were captured at `5d15a1e`. That change is correct — it stopped
> the raised Zap disc painting over the primary conversion control on two pages — so for the shell
> surfaces **the baselines are stale and recapture is the right remedy.**
>
> ⚠️ **It cannot be the whole story.** That rule is `md:pb-0` (mobile only) and marketing pages do
> not mount `AppShell` at all, so the reported failures on `/` · `/spaces` · `/the-lab` · `/pricing`
> · `/discover` and on desktop have **at least one other cause**. Candidates in range: `d408162`
> (white labels on amber — colour, not height) and the Phase 7 marketing-rhythm tightening, which
> BUILD-LIST records as costing a mid-page `Statement` ~22px at 390 and ~77px at 1280 — the same
> number in the opposite direction, which is precisely why nine failures read as one uniform drift.
> Settling it needs the diff images, which needs owner item 1.4 (the `PW_REQUIRE_SHELL` secret is
> redacting every number in the logs).
>
> 🔴 **The find that changes the recapture plan: four baselines were photographs of the wrong page.**
> All four `app-room` baselines were the marketing **home** page — hero copy, JOIN THE BETA button,
> **100.0% identical** to the `home` baselines at fingerprint resolution. `appSurfaces()` defaulted
> `PW_ROOM_PATH` to `/channels`, which is in `proxy.ts`'s `PROTECTED_PATHS`; the visit bounced, and
> the guard written in the very same commit only tested for `/sign-in`, so a bounce to `/` read as
> success. **A blind recapture would have re-frozen the marketing home page as the reference for a
> member room.** Shipped in this pass: the four files deleted, the `/channels` fallback removed (an
> absent surface is honest, a bounced one lies), `assertMemberSession` widened to fail on *any*
> off-path landing and on a missing shell region, and `test/e2e/baseline-distinctness.test.ts` added
> as the second lock on the committed tree. The new gate was confirmed to **fail** against the
> pre-fix tree on all four files before it was accepted.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 1.1 | ✅ **SETTLED from the run log, and the question is now moot** | — | Measured on run `31413554371` (2026-08-10): **`10 passed · 62 failed`, and ZERO size mismatches.** The `expected 390x10276, received 390x10298` shape this item was written to explain **no longer occurs at all** — every remaining failure is a same-size **pixel-content** diff, ratios **0.03 to 0.17**, clustered at 0.06-0.12 against a 0.02 tolerance. Heights matching exactly while content differs rules out the font-metric/runner hypothesis (that moves heights) and leaves the design itself having moved. **So the baselines are stale and recapture is the whole remedy** - no diff-image forensics needed, which is what 1.1 was holding 1.2 for. |
| 1.2 | 🔴 **Owner: recapture — now unblocked by 1.1** | S | `e2e-manual.yml` → `update_baselines`, and **tick `capture_shell` too**: `PW_MEMBER_EMAIL` is set (checked 2026-08-10), so the run can mint a session and finally photograph the member shell, which is the precondition `PW_REQUIRE_SHELL=1` is already asserting. It must not absorb feature changes — one recapture against a settled tree beats four against a moving target, and the runner's capture commit does not re-trigger CI. |
| 1.3 | **Seed the shell a11y baselines** | S | `/feed` and `/settings` are currently held to zero serious+ violations against debt that predates the gate, because their baselines were never captured. `e2e-manual.yml` → `capture_shell` + `update_a11y`. |
| 1.4 | ✅ **Already resolved — it is a VARIABLE, not a secret** | — | Verified 2026-08-10 two ways. The Variables tab holds `PW_REQUIRE_SHELL = 1`; the Secrets tab does **not** (its six entries are `ANTHROPIC_API_KEY`, both Supabase keys, `PW_MEMBER_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`). And the run log contains **zero** `***` redactions while printing figures full of the digit 1 (`117474 pixels`, `ratio 0.03`) — which is only possible if `1` is not a secret. The log-redaction problem this item describes is gone. |
| 1.5 | ✅ **Already resolved — the account exists and the session mints** | — | `PW_MEMBER_EMAIL` is set (Secrets tab, checked 2026-08-10), and the proof it works is in the run itself: `app-feed` and `app-settings` were **photographed**, which is only possible behind a minted session. What is still missing is narrower than "an account": `app-room` has no baseline (Phase 1 deleted all four as wrong-page captures of the marketing home), and the Space console needs the **`PW_SPACE_SLUG`** repo variable, which is not set — the Variables tab holds only `PW_REQUIRE_SHELL`. Both are covered by one `update_baselines + capture_shell` run. |
| 1.6 | 🔴 **Owner: flip `pr-compare`, `check:adoption`, `check:contrast` to required** | XS | Only after 1.2 is green for two weeks. Required contexts today are `checks` and `analyze` only (integration 15368). |

> **Standing rule from the last thread, worth keeping:** on a GitHub `pull_request`-event outage,
> add a bypass actor to ruleset `17640795` rather than toggling enforcement off.

---

## Phase 2 — Close the access layer 🔴

**Definition of done:** `anon` holds no grant it does not need, no `SECURITY DEFINER` function is
anon-callable without a deliberate reason recorded, and the ledger stops diverging.

### 2a. The grant sweep — the finding with real blast radius

Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public` granting `anon`/`authenticated` on every
new table and function. Those land as **explicit per-role grants**, which `REVOKE … FROM PUBLIC`
does not touch. The statement succeeds, reports nothing, and removes nothing — and this idiom is used
throughout the migration history.

Measured against prod on 2026-08-10:

| Measure | Value |
| :--- | ---: |
| Explicit table grants held by `anon` | **1,907** across **273** tables |
| Same for `authenticated` | **1,907** across **273** tables |
| Tables with RLS on and **zero** policies (fail-closed by RLS alone) | **77** |
| `SECURITY DEFINER` functions in `public` | 112 |
| …executable by `anon` | **34** |
| …executable by `authenticated` | **54** |

**Two functions prove the idiom is still failing today.** Migration `20270207000000` writes
`revoke all on function public.journey_funnel(...) from public;` then grants only `service_role`.
Against prod, `has_function_privilege('anon', 'journey_funnel(...)', 'EXECUTE')` returns **true**.
Same for `vitals_p75`. These are operator analytics RPCs added for Lift 1/7 and they are readable
by the anon key that ships in the browser bundle.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 2.1 | **Audit by privilege, never by reading SQL** | S | The SQL reads correct. Use `has_function_privilege('anon', …)` and `information_schema.role_table_grants` against prod. Produce the full inventory as a committed artifact under `docs/maintenance/`. |
| 2.2 | **Lock the two proven leaks** | XS | `journey_funnel`, `vitals_p75` → `service_role` only, with an explicit `revoke … from anon, authenticated`. |
| 2.3 | **Triage the other 32 anon-callable definers** | M | The `public_*` family is deliberate and stays. Needing a decision each: `ensure_calendar_token`, `members_near`, `my_orbit`, `near_misses`, `profile_zap_total`, `node_within_range`, `match_help_chunks`, `capture_signup_lead`. Record the verdict per function so this is never re-litigated. |
| 2.4 | **Retire the broken idiom** | S | One migration that revokes the default-privilege grants where they are not wanted, plus a `check:grants` guard so a new table cannot ship anon-writable. The 77 RLS-no-policy tables are second-order today, but a grant held back only by RLS is one policy mistake from being live. |

### 2b. The migration ledger — fix the cause, not the symptom

Third recurrence of the same thing. Four repo files sit above the ledger head and are already applied
under CLI-minted timestamps:

| Repo file | Applied as |
| :--- | :--- |
| `20270213000000_menu_regroup_and_canon` | `20260806191527` |
| `20270214000000_profile_menu_points_at_profile` | `20260806221343` |
| `20270215000000_signup_leads` | `20260807152516` |
| `20270215000001_signup_leads_close_default_grants` | `20260807152551` |

**The schema is correct** — `signup_leads` plus both `capture_signup_lead` and
`mark_signup_lead_converted` are live. The risk is that `supabase db push` would re-run all four
against a schema that already has them, and `create policy` / `add constraint` are not idempotent,
so it fails partway and leaves a third state.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 2.5 | ⚠️ **Repair the ledger** | XS | `supabase migration repair --status applied 20270213000000 20270214000000 20270215000000 20270215000001`. Verify each against the live schema first, never from a filename. |
| 2.6 | **Stop renumbering applied migrations** | S | This is the root cause of both the gap and the ~13 duplicate rows. Either stop renumbering after apply, or make the repair part of whatever renumbers. Extend `check:migrations` to fail when a repo version exceeds the ledger head while an identically-named older version exists. |

### 2c. Advisor regressions

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 2.7 | **7 unindexed foreign keys returned** | XS | `claim_tokens` ×2, `event_host_transfers` ×3, `member_practices.journey_plan_id`, `topical_channels.template_id`. All point at delete-bearing parents; free at current row counts. |
| 2.8 | **`multiple_permissive_policies` regressed 0 → 1** | XS | `space_billing_agreements`, `authenticated`/`SELECT` — two policies where one OR-merge belongs. |
| 2.9 | ℹ️ Not action | — | The single ERROR is `spatial_ref_sys` (PostGIS reference table, documented no-action). 254 unused indexes stay untouched until real traffic. |

> ✅ **Banked:** `auth_leaked_password_protection` no longer appears in the advisors. The owner action
> that had been carried since June is **done**.

---

## Phase 3 — The verified defect sweep

Every item reproduced in the working tree on 2026-08-10. Sorted worst-first.

| # | Severity | Defect | Fix | Where |
| :--- | :---: | :--- | :--- | :--- |
| 3.1 | ✅ | ~~**Spotlight titles double-brand.**~~ **FIXED, and a second instance the scan missed.** `app/layout.tsx` sets `template: '%s · Frequency'`; the page sets `title: '${name} · Frequency'`, so every Spotlight renders **"Name · Frequency · Frequency"** | Suffix dropped. Made durable as **`check:seo` Scan D**, which walks brace depth so it can tell a top-level `title` (gets the template) from `openGraph.title` / `twitter.title` (do not, and correctly carry the brand on 14 marketing pages). It immediately found `journeys/[slug]`'s private fallback, which the plan had not recorded | `app/spotlight/[handle]/page.tsx` · `app/(main)/journeys/[slug]/page.tsx` |
| 3.2 | ✅ | ~~**QR Studio reads whole tables on every load.**~~ **FIXED, and one of them was silently wrong** | Three whole-table reads retired (ADR-969). `captures` now goes through a new `node_capture_counts()` RPC — it was not only unbounded but **truncating**: PostgREST caps a response at `max_rows` (1,000), so past that the per-node count was quietly under-reported with no error, the same class as the CRM import dedupe. `qr_scans` now reuses the existing `qr_stats_summary` RPC that `/admin/qr/stats` already calls; the numbers are identical because the RPC's totals and per-code aggregates carry no date filter and its `daily` is the trailing 30 UTC buckets, exactly what `summarizeScans(scans, 30)` produced. `qr_codes` was read twice, the second time only for `page_path`; it is one selection now. Migration applied to prod and ledger-repaired (**597 ⇄ 597**, proven by md5 of both version sets) | `app/(main)/admin/qr/page.tsx` · `supabase/migrations/20270219000000` |
| 3.3 | ✅ | ~~**Meta descriptions over the ~155 snippet window.**~~ **FIXED — five, not four, plus one more only the gate could see** | Rewritten inside the canon (no em dashes, clean sentence boundaries): `/the-lab` **200→154**, `/spaces` **186→139**, `/beta` **158→148** (the plan missed this one), `/the-community` **158→142**, `/the-quest` **158→140**. `check:seo` **Scan E** now enforces it at **160** (155 is where truncation starts to bite, 160 is where it is certain; a gate at 155 would fail copy that renders fine). Scan E immediately found `/discover/journeys` at **163**, which no hand pass had recorded, and it is scoped to pages a crawler can actually reach so a private route's long copy is not a false failure |
| 3.4 | ✅ | ~~**3 `MODULE_ROUTES` entries point at redirect-only pages**~~ **FIXED** — `/admin/crm/graph`, `/admin/crm/playbooks`, `/admin/crm/today`, all merged into `/admin/crm/intelligence`. The Layout panel is advertised on a route that immediately redirects | All three retired, from `MODULE_ROUTES` **and** `ROUTE_MODULE_IDS` (whose keys were also giving the App catalog route scopes that navigate away). Every one of their six block ids already lives on `/admin/crm/intelligence`. The two live outbound links, in the Vera owner-brief email and the dashboard worklist, now point at the merged page instead of through a redirect. A new test asserts **every** `MODULE_ROUTES` entry resolves to a page that really renders `<PageModules>` | `lib/widgets/module-routes.ts` · `lib/widgets/modules.ts` |
| 3.5 | ✅ | ~~**13 serial awaits in the authed layout**~~ **The count was stale; two remained, both now folded in** | Re-measured 2026-08-10. The layout had already been refactored: the main wave (22 reads) and the theme wave (5) exist, and the whole onboarding tail (`nextStepsEnabled` → `getProfileChores` → `getOnboardingStatus` → `getFounderTasks` → `getActiveTraining`, plus `autoPopupsEnabled`) already streams behind `<Suspense>` in `VeraLauncherSlot` / `CoachOverlaySlot` / `AutoPopupsSlot`, off the critical path entirely. What was genuinely still serial between the main wave and the theme chain: **`getMyFrequency` and the janitor `openTicketCount`** — each one pushing first paint back a full round trip. Both folded into the existing wave as speculative reads, exactly like `getStaffMember` and the operator trio already were. The janitor read stays gated on the **true** `profile.web_role`, which is known before the wave, so it does not become a new read for everyone. The remaining serial steps are genuinely dependent: `createClient` → `getUser` → the profile row, and `theme` → `loadActiveThemeCss` | `app/(main)/layout.tsx` |
| 3.6 | ✅ | ~~**10 orphan help feature keys**~~ **FIXED, and the direction was backwards** | The plan said they "point at articles that do not exist". It is the reverse: all ten are declared by **published** articles and had no row in `lib/help/feature-keys.ts`, so every in-product affordance that resolves by feature key found nothing while the article sat there. Added with routes **verified to exist** first: `on-air` · `journeys` · `challenges` · `achievements` · `leaderboard` · `profile` · `connections` · `location` · `resonance` · `billing`. Coverage **29/36 → 39/46**, core **36/36**, orphans **0**. `help:coverage` is now the 24th guard (`check:help`) and an orphan key **always** fails — it is a broken link, not a backlog item, unlike the undocumented-core list which stays behind `--strict` (ADR-970) | `lib/help/feature-keys.ts` · `scripts/help-coverage.mts` |

**Carried from the 2026-07-27 scan — now VERIFIED, 2026-08-10.** Every one was re-reproduced
against current code rather than trusted from the old record. Two were not what the record said:

| # | Item | Verdict | Status |
| :--- | :--- | :--- | :--- |
| 1 | Circle-placed events invisible to the circle gate | ✅ **already fixed** in `9c81b8d` — `livePlacementPatch` writes `scope_id`/`scope_type` explicitly, so the trigger's condition is moot | closed |
| 2 | Reactivating a suspended operator bypasses the seat wall | 🔴 confirmed, both single and bulk — `usedSeats` counts `status='active'` **and** a seat-consuming role, so a suspended operator consumes none and bringing them back newly consumes one | ✅ **fixed** (ADR-968) — one shared `seatDenialForReactivation` for both paths, so they cannot drift again; single fails with the wall's own reason, bulk skips per its partial-success contract. Two of the five tests proven to fail on the pre-fix shape |
| 3 | CRM import dedupe truncates at 1,000 | 🔴 confirmed, **three** reads not one | ✅ **fixed** — all three paged, regression test proven to fail on the single-page shape |
| 4 | Circle handoff cannot cancel a pending offer | 🔴 confirmed — `cancelSpaceCircleOfferAction` and `pendingOfferForCircle` both had **zero callers**, while the error text told the operator to "cancel that first" | ✅ **fixed** — both halves wired in `space-circles-manager.tsx` |
| 5 | Vault card shows `lifetime_gems` as spendable | 🔴 confirmed — the rail was the only surface not using `getSpendableBalance` | ✅ **fixed** |
| 6 | 7-day streak strip keys days in server UTC | 🔴 confirmed, and worse than recorded: built with server-local `setDate` but read back with UTC `toISOString`, so it was self-consistent only on a UTC server | ✅ **fixed** — anchored on `resolveMemberDay` |
| 7 | Admin footer "Report a problem" → 405 | 🔴 confirmed — `/help/ask` is POST-only with no `page.tsx` | ✅ **fixed** |
| 8 | `splash-registry.ts` queries `library_usages` | 🔴 confirmed — **dropped five days after creation** by `20260925000000` and never recreated. The read discarded `error`, so it returned `[]` silently and the lane paid one doomed round trip per template per load | ✅ **inert**, with the rebuild-or-delete decision recorded |
| 9 | Four incompatible cents formatters | ⚠️ confirmed but **misdescribed** — there are **nine**, and nothing loses precision. What it drops is the thousands separator and the **currency**: `formatPriceCents` hardcoded `$` while `CommerceProduct.currency` is a real column, so a non-USD product was mislabelled in the price editor and product emails | ✅ **fixed** — Intl-backed, currency-aware, and falling back rather than blanking a price on a bad code |

---

## Phase 4 — Finish the menu system

The last thread rebuilt the gate contract (ADR-953) and shipped seven PRs. Three things did not land,
and one architectural hazard was named but not guarded.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 4.1 | ✅ **Guarded (ADR-973), and the hazard was overstated** | — | Verified: raw SQL cannot call `revalidatePath`, and `app/(marketing)/layout.tsx` reads `getMenu('header')`/`getMenu('footer')` while deliberately avoiding `cookies()`/`getUser()` so those pages stay **static**. So a menu reseed does leave the marketing rail stale. **But not "until the next deploy"** — those pages carry `revalidate = 3600`, so ISR picks it up within an hour, and the in-app `(main)` layout is request-time and never goes stale at all. `check:migrations` now refuses any migration writing `menus` / `menu_items` / `menu_categories` / `menu_settings` / `menu_rail_cards` without a `-- MENU CACHE:` note. A gate cannot make SQL flush a cache; it can refuse a change that does not state its own consequence. The four existing menu migrations carry the note (safe to edit: the ledger records **0 statements** for all four, checked on the cluster). |
| 4.2 | ⚠️ **The proposed guard is the WRONG assertion, and it cannot live in CI** | S | Two findings from re-reading the code and the live DB (2026-08-10). **(a) "Assert materialized rows still match `defaultMenu(surface)`" would be false by design.** A seeded surface an operator has reordered, relabelled or hidden items on is *supposed* to differ — that is the whole point of the editor. Equality would go red the first time anyone used the feature. The real invariant is **presence**: every href the code registry declares should EXIST in the seeded surface, hidden or reordered as the operator likes. A developer adding a nav item in code and not seeing it is the failure the last thread hit twice. **(b) Gate drift is already impossible** — `applyRegistryGates` re-derives permissions from the registry at the one read seam (ADR-390), so a stored gate cannot disagree with the code. **(c) It cannot be a `check:*` gate**: CI has no app-DB credentials. It belongs in the `/maintenance` sweep, which already has them. Live counts today: `header` **138** items / 6 categories, `left` **128** / 4, `footer` 6, `profile` **0** — and a zero-row surface is not a bug, `getMenu` explicitly falls back to the code defaults for a half-seeded row. |
| 4.3 | ⏳ **Mobile header sub-links** | M | Verified: the `header` surface holds **23 items, all 23 inside categories**, while `marketing-mobile-menu.tsx` renders `headerTriggers()` plus a hardcoded `DISCOVER_NAV`. Every categorised child — including the `/for/*` doors — is unreachable on a phone, and operator menu edits to them never appear there. *Deferred by the owner; listed so the deferral is a choice.* |
| 4.4 | ⏳ **Duplicate Profile row in Menu Manager** | XS | Verified: exactly **one** row exists in `menu_items` (`surface_key='left'`, `href='/profile'`, position 1). The DB is clean. This is purely a render bug in the Menu Manager editor, not a data problem. |
| 4.5 | ⏳ `AdminSubNav` flattens group headings and drops depth-3 groups | S | Menu-manager sub-organisation of `admin_header` therefore has no visible effect. |
| 4.6 | ✅ **CLOSED — already fixed, and by deletion rather than by unification** | — | Re-verified 2026-08-10. There is no longer a second account-menu renderer: `app-shell.tsx` used to re-render the `profile` menu's link list in the rail and does not any more (My Frequency carries "you, and what you run" at the top of that same rail, and the DAWN three-docks card says a control appears in exactly one dock). The resolver + gate imports that fed the duplicate went with it. Both surviving renderers import `canSeeMenuItem` from the one shared `menu-role` module. |
| 4.7 | ⚠️ **Half stale, and the other half is not XS** | S | `/admin/spaces` **does** resolve: it is a leaf in Operations → Platform, and `activeSectionFor` matches on any href in a section's subtree, so the Operations band draws there. Only **`/admin/library`** (Loom Studio) is genuinely sectionless. It is not a one-line addition, because `adminHeaderMenu()` applies the **section's** gate to every item in it (`minAccess: toAccess(section.min)`, `staffDomain: section.staffDomain`), not the leaf's own. Loom Studio is `janitor` + `marketing`; the Growth section is `host` + `marketing`, so filing it there would **expose a janitor-only tool to hosts** in the sub-nav, and Operations would relabel it `platform` domain. Needs either a per-leaf gate override in the admin_header derivation or an owner call on where it belongs. |

---

## Phase 5 — One render path

The redesign made the coded marketing pages **ahead of** the Puck templates, inverting the drift the
three-rung chain was built to survive. Two sources of truth is a standing invitation for the next one.

**The duality, measured.** Eight gated slugs in `EDITABLE_PAGES` still carry a full bespoke body:

| Slug | Coded body |
| :--- | ---: |
| `/pricing` | 859 lines |
| `/the-community` | 634 |
| `/the-quest` | 497 |
| `/the-lab` | 381 |
| `/about` | 327 |
| `/spaces` | 284 |
| `/circles` | 103 |
| | **~3,085 lines of duplicate truth** |

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 5.1 | ✅ **`check:render-path` — DONE (ADR-967)** | — | The 23rd guard. Two rules: (1) every `EDITABLE_PAGES` slug's route actually renders `<BlockRender>`, so a page an operator can "edit" with no effect fails; (2) `scripts/render-path-bodies.txt` records the coded-component count per slug and the measured count must **match** — a rise is new duplicate truth, a fall means a body retired and the scoreboard comes down with it in the same PR. It gates on **components, not lines**: lines are the figure this plan quotes, and a copy edit moves them, so gating on them would fail for reasons unrelated to the duality. Measured today: **8 slugs, 7 still carrying a body (27 components, 4,032 route-file lines); `circles` is already template-only.** Seven failure modes probe-tested for the exit code.
| 5.2 | **Retire the coded bodies, one slug per PR** | L | Gated on Phase 1: only retire a body once the visual suite proves the template is equivalent. Order by risk: `circles` → `about` → `spaces` → `the-lab` → `the-quest` → `the-community` → `pricing` (partial only, live bindings, never frozen figures). |
| 5.3 | ✅ **The seeker-article blocker is stale — 5d is unblocked** | M | `UX-MATURITY-PLAN` §Lift 5d says the articles are "blocked on the `DawnHowToSteps` block emitting HowTo JSON-LD". **That block exists and owns its structured data**, with a dedicated test at `components/page-editor/blocks/dawn.howto.test.tsx`. The eight slugs can join `EDITABLE_PAGES` with a shared `templates/article.ts` seed. |

---

## Phase 6 — Kit, a11y, and interaction states

The ratchets already measure this and already hold the line, so it is safe, mechanical, and
review-friendly. **The live baselines are substantially better than either plan doc claims** — see §8.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 6.1 | ✅ **Label contract — DONE, and the number was wrong twice (ADR-966)** | — | The plan's "103 of 229" was a line-scoped grep artifact; the real count of *that* pattern was 23. But scoping the re-count to the `Label` **component** was itself the error: the same bug in plain `<label className={lbl}>` form was more common and invisible to any search for `Label`. Asking about `<label>` **elements** instead found **39 sites across 16 files**, all fixed. `deal-form.tsx` (6), `profile-form.tsx` (5), `circle-settings-form.tsx` (5), `event-form.tsx` (4), `ticket-tiers-panel.tsx` (4), `broadcast-compose.tsx` (3), 12 more. Nine of those had papered over the symptom with a duplicate `aria-label`, which fixes the name and leaves click-to-focus broken. **`pnpm check:labels` is the 22nd guard** and holds it: 635 labels, every one naming exactly one control, none nested. Proven to exit 1 on the pre-fix tree (62 violations) and 0 now; 18 unit tests cover the five violation shapes *and* the seven correct shapes that must stay silent.
| 6.2 | ✅ **Icon-button accessible names — CLOSED, the finding was false** | — | `IconButton` declares **`label: string` as required** and `Omit<…, 'aria-label'>`, so a site without a name would not typecheck. A brace-aware parse of every opening tag: **79 real call sites, 79 named, 0 missing** (the other 3 of 82 are `Record<IconButtonTone, string>` generics inside `icon-button.tsx` itself). 82 − 34-with-it-on-the-opening-line = 48, which reproduces the reported number exactly. All 79 label strings were audited against NAMING/CONTENT-VOICE: clean. Two consistency nits remain in `movement-session.tsx` ("Less"/"More" name the direction, not the object — `session.tsx` already says "One minute less"), which is a copy call, not an a11y gap. |
| 6.3 | ✅ **Moved (ADR-971)** | — | Now `components/ui/underline-tabs.tsx`. **17** importers repointed (the plan said 22 — a stale count; `git grep` finds 17 files). `handrolled-tabs` was already **0**, so the sweep half was done and this closes the item. Owner-ruled 2026-08-03. |
| 6.4 | **Kit state sweep (Lift 8b)** | M | ⚠️ **Do not measure this with a grep — I tried, and the numbers are meaningless.** Counting `hover:` / `active:` / `focus-visible:` / `disabled:` per file in `components/ui/` reports 52 of 56 primitives "missing focus" and 54 "missing pressed". Both figures are **false**: `app/globals.css:1784` rings every `button, a, select, [tabindex]` on `:focus-visible` and `:1788` covers `input, textarea`, while `:1668`/`:1673` supply `:active`. `INTERACTION-STATES.md` §2 says so in as many words ("focus-visible is mostly free"). A real audit has to ask, per primitive: which **class** is it, which states does that class require, and does it get them from its own utilities, from globals.css, **or** by rendering a native `<button>`. That is per-component judgement across **56** primitives (14 have tests today), which is what makes this M and not S. |
| 6.5 | **Low-adoption primitives** | M | `RowCard` 5 consumers vs `bespoke-rows` 14 · `StreakMeter` 4 · `Meter` 6 · `GateNotice` 5. ⚠️ **Triage before sweeping**: the ratchet is a filename heuristic, and `ContactCard`/`GroupCard` carry docstrings saying they are deliberate variants. Separate "owed to the kit" from "filename collision" first — forced conversions to move a number are the exact failure the ratchets exist to prevent. |
| 6.6 | **67 raw `<img>`** | S | → `next/image` on the LCP surfaces first. |
| 6.7 | **Remaining ratchet tails** | M | `raw-input` 186 (needs a borderless/inset variant on the primitive, not call-site swaps — see the induction note in BUILD-LIST §P8), `literal-display-type` 96, `raw-button-bg` 526 (replace the proximity-window pattern with the opening-tag form under a new basis fingerprint), `literal-radius` 2,450 (**spend inside screen passes, never as its own wave**). |

---

## Phase 7 — Voice, docs, and the owner handoff

### 7a. Member-facing canon (26 real hits)

A scoped scan of `app/` + `components/`, excluding operator surfaces and comments, found a small and
fully actionable list. This is far smaller than the raw counts suggest: repo-wide greps return 125
"Marketplace" and 652 em dashes, but almost all are operator copy, route names, or comments.

| Rule | Hits | Worst examples |
| :--- | ---: | :--- |
| `broadcast` / `broadcasts` (retired noun) | 6 | `broadcast/page.tsx` "Latest broadcast", `broadcast/loading.tsx`, `broadcast-compose.tsx` placeholder |
| `cohort` (banned) | 7 | `journey/discovery-widgets.tsx` ×2, `spaces/enroll/program-form.tsx`, `analytics-retention.tsx` ×2 |
| lowercase `zaps` / `gems` | 6 | `events/[slug]/check-in-button.tsx`, `crew/challenges/page.tsx` |
| em dash in member copy | 4 | `pages/sequences/page.tsx`, `people/[handle]/profile-settings-drawer.tsx` |
| `unlocked` (banned) | 2 | `crm/leads/leads-view.tsx`, `gamification-stats.tsx` |
| `Marketplace` (retired noun) | 1 | `marketplace/facet-nav.tsx` `aria-label` |

| # | Item | Size |
| :--- | :--- | :---: |
| 7.1 | ⚠️ **The 26 is not reproducible; a scoped re-scan finds ~8** | S | Re-measured 2026-08-10 over `app/` + `components/`, operator paths excluded, comments stripped. A raw pass returns **97**, but the overwhelming majority are import specifiers (`@/lib/gems`), routes (`/broadcast`), and DOM ids (`broadcast-scope`, `achievement-unlocked`) — identifiers, not copy. Filtering those leaves **16**, of which about half are the scanner matching CODE through a `>…<` JSX-text pattern. The genuinely member-readable set is roughly **eight**: `invite-launcher` "the zaps are yours" · `claim-button` "Offer unlocked:" · `upgrade` "All features are unlocked" · `achievement-toast` "Achievement Unlocked" · `journey-export` "a Hook cohort" · two in `pages/sequences` (a `cohort` and an em dash) · and one more. ⚠️ `broadcast/actions.ts:38` "Only staff can broadcast globally" is the **verb** and is correct copy. Several of the rest sit on `/pages/sequences` and `/upgrade`, where member-vs-operator is a judgement call per string, not a sweep. |
| 7.2 | ⚠️ **Needs an AST, not a regex — measured** | M | The 97→16→~8 funnel above is the evidence. A regex scan cannot tell `@/lib/gems` from "the zaps are yours", nor JSX text from code that happens to sit between `>` and `<`. Three filters (drop `@/`-and-`/`-prefixed, require a space, drop all-lowercase token runs) got the noise from 97 to 16 and no further — the residue needs real JSX parsing to separate text nodes and string literals from expressions. Sizing raised from S to **M**. Until it exists, `lib/menus/canon.ts` (ADR-957) remains the only enforced canon on the write path, and `check:canon` still covers `content/**` and marketing source. |

> `check:canon` scans `content/**` only, which is why every canon break found by this scan and the
> two before it was outside its scope. `lib/menus/canon.ts` (ADR-957) already solved the DB half of
> this problem by moving the guard to the write path; this is the JSX half.

### 7b. Docs cleanup

202 docs, 67,945 lines, and **five files describe themselves as the single source of truth**.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 7.3 | **Add the missing superseded banners** | XS | `MASTER-PLAN.md`, `CHECKLIST.md`, `PATCH-LIST.md` have none. The other nine legacy plans do. |
| 7.4 | **Re-derive the stale baseline tables** | XS | Both live plans quote numbers the ratchet has moved past (§8). Generate from `scripts/adoption-baselines.json`; never hand-maintain. |
| 7.5 | **Fix the ADR record** | S | Seven numbers (088–094, 090 three times) each name two or more decisions; ADR-219 is still "Accepted" after ADR-305 retired it; `ARCHITECTURE.md` documents two cron endpoints deleted by ADR-305. |
| 7.6 | **`tsconfig` excludes `scripts/`** | XS | The CI guard test files vitest runs are never typechecked. |

### 7d. The two open product calls, with the evidence and a recommendation

Both were left as open questions. Neither needs research any more — here is what the code says and
what I would do.

| Call | Evidence | Recommendation |
| :--- | :--- | :--- |
| ✅ **`library_usages`** — DONE, deleted (ADR-974) | **Nothing has ever written to it.** Zero inserts in the creating migration or anywhere since, so rebuilding gives an empty table and the control still shows nothing. | **Deleted.** `listSplashUsages`, `SplashUsage`, `UsageList`, `liveUsageRef`, the two `usagesBy*` maps, both `<Field label="Used in">` blocks, and `splashUsageHref` **plus its six tests** — its only consumer was `UsageList`, so keeping it would have been dead code carrying passing tests. Rebuild it *with* LIBRARY.md D4. |
| ✅ **`/admin/library`** — DONE, its own section (ADR-974) | Filing it under an existing section is the wrong fix: `adminHeaderMenu()` stamps the SECTION's gate onto every item, so Growth would offer a janitor tool to hosts and Operations would drop it for a marketing-domain janitor. | **Its own `ADMIN_NAV_SPECS` row** — `min: 'janitor'`, `staffDomain: 'marketing'`, no groups; the shape `/admin/qr` already has. Three tests pin it. ⚠️ The first gate test asserted `staffDomain` only, so flipping `min` left it green — it now asserts **both** axes, verified by flipping each. |

### 7c. Owner actions, collected

Everything on this list is config or a decision — no code unblocks it.

| Owner action | Blocks |
| :--- | :--- |
| Delete `PW_REQUIRE_SHELL` from **Secrets** | Diagnosing 1.1 (logs are redacted to `***`) |
| Create the beta test account + `PW_STORAGE_STATE` secret | 44 of 84 a11y tests + the whole member-shell visual suite |
| Create the Vercel Protection Bypass secret → `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview e2e validity (suites currently test the interstitial) |
| Flip `pr-compare` / `check:adoption` / `check:contrast` to required | Phase 1 sign-off |
| `/the-lab` + `/spaces` meta descriptions | 3.3 — a copy decision, not a trim |
| **White-on-amber button text** | The DS artifact shows white on `#E2912F`; shipped is ink. Ink measures **7.35:1** (AA + AAA), white **2.52:1**. White cannot ship without failing `check:contrast` and degrading every primary button. Either darken the amber (~`#8A5410` puts white at 6.26:1 — a real brand shift) or correct the artifact |
| Greyed-emoji tuning (`grayscale` vs `saturate-50`) | Reaction selector rest state |
| Recruit 5 test users per quarter | Lift 1 — see below |
| Re-run the two Stripe pricing syncs | Collective/Independent checkouts currently dead-end |
| Set `CRON_HEARTBEAT_BASE_URL` | 27 cron jobs are paging-blind |
| Submit `sitemap.xml` to Search Console + Bing | Crawl coverage |

---

## 3. The one gap no phase closes

**Lift 1, the user-evidence loop, is at literal zero.** `docs/research/findings/` contains only a
`README.md` — no moderated round has ever run — and `check:research-freshness` was never written.
The UX plan scores this dimension **40/100** and calls it "the single largest distance from
world-class", and it is the only item on any list that **no amount of engineering can close**. Five
users per quarter, on the Vercel preview, running the five named journeys.

Everything else in this document is work. This one is a decision.

---

## 4. Sequencing

| When | Ships | Phase |
| :--- | :--- | :--- |
| **Now** | 22px diagnosis → baseline recapture → shell a11y seed | 1 |
| **Next** | Grant inventory + the two proven RPC leaks + ledger repair | 2 |
| **Then, parallel** | Defect sweep · menu completion | 3 · 4 |
| **After Phase 1 is green** | `check:render-path` → coded-body retirement, one slug per PR | 5 |
| **Rolling, inside screen passes** | Label/aria sweep · kit states · ratchet tails | 6 |
| **Continuous** | Canon fixes as touched; docs corrected in the same pass as the code | 7 |

**Batching rule, non-negotiable while `pr-compare` is not required:** batch the rendering changes,
then capture once. One recapture against a finished tree beats four against a moving target.

---

## 5. Gates this plan adds

| Gate | Catches | Phase |
| :--- | :--- | :---: |
| `check:grants` | A new table shipping anon-writable under default privileges | 2 |
| `check:migrations` extension | A repo version above the ledger head with an older twin | 2 |
| Menu drift guard | Seeded DB rows drifting from `defaultMenu(surface)` | 4 |
| `check:render-path` | A gated slug keeping a bespoke body | 5 |
| `check:elements` extension | A new `components/ui` primitive with no state test | 6 |
| `check:canon` widened | Retired names in member-facing JSX | 7 |

Six new gates, each one closing a class this scan found by hand. That is the test of whether this
plan worked: **the next scan should find nothing these gates could have caught.**

---

## 6. What is genuinely finished — do not re-audit

| Area | Evidence |
| :--- | :--- |
| ✅ Cron wiring | 27 ⇄ 27, zero drift in either direction |
| ✅ Route reachability | 8 unreferenced static routes, all 8 documented redirects or dev tools |
| ✅ Marketing metadata | The 15 "missing" pages are intentional 308 stubs |
| ✅ The old SEO backlog | `llms.txt` carries live first-party stats · `/discover/practices` exists · 14 OG-image routes · 25 JSON-LD emitters including `howToSchema` with 11 marketing consumers |
| ✅ Leaked-password protection | Gone from the advisors; the owner enabled it |
| ✅ Space FAQ | `space-faq-editor.tsx` is the caller the 2026-08-04 scan said did not exist |
| ✅ Beta admission engine · Email Studio gallery · `<AppElement>` | All three deleted, not orphaned |
| ✅ `autonomousSend` | Wired at both send executors |
| ✅ `handrolled-tabs` · `raw-palette` | Both swept to **0** |
| ✅ Code hygiene | 18 TODO markers repo-wide |

---

## 7. Findings this scan retired as false

| Claim | Verdict |
| :--- | :--- |
| "15 marketing pages missing metadata" | **False** — all 15 are 308 redirect stubs with a comment explaining the consolidation (4 spot-checked) |
| "Duplicate Profile menu row" | **False as data** — exactly one row in `menu_items`; a Menu Manager render artifact |
| "4 migrations unapplied" | **False** — all four applied under CLI timestamps; the schema is correct, only the ledger numbering diverged |
| "`/journal` and `/library/review` are redirect-only module routes" | **False** — both render `<PageModules>`; only the three `/admin/crm/*` rows are genuine stubs |
| "Seeker articles blocked on `DawnHowToSteps`" | **False** — the block ships and owns its HowTo JSON-LD |

---

## 8. The scoreboard, re-derived

`scripts/adoption-baselines.json` is the source of truth. Both live plan docs quote an older column.

| Baseline | Plan docs say | **Live** | Delta |
| :--- | ---: | ---: | :--- |
| `literal-radius` | 3,824 | **2,450** | −1,374 |
| `literal-display-type` | 301 | **96** | −205, pass 2b largely shipped |
| `white-black-literals` | 266 | **27** | −239 |
| `handrolled-icon-button` | 37 | **6** | −31 |
| `raw-palette` | 48 | **0** | swept |
| `handrolled-tabs` | 3 | **0** | swept |
| `adhoc-progress` | 14 | **8** | −6 |
| `raw-px-arbitrary` | 127 | **117** | −10 |
| `raw-button-bg` | 528 | **526** | instrument noise |
| `subtle-tiny-type` | 24 | **23** | −1 |
| `shadow-literals` | 54 | **49** | −5 |
| `bespoke-cards` / `bespoke-rows` | 23 / 14 | **24 / 14** | comment-blanking revealed 1 |
| `raw-select` / `raw-textarea` | — | **6 / 6** | effectively retired |
| `raw-input` | 184 | **186** | ⚠️ raised, correctly, by ADR-959 |

**Consequence:** the DAWN-parity scorecard's **80.0 / 100** and its "packages 1 to 9" list understate
where the site is. Packages 1 (`raw-palette`) and 4 (`handrolled-tabs`) are **done**, and package 9
(display literals) is two-thirds done. Re-derive the score before using it to sequence anything.

---

*Living document. Update a row the same day its work lands; when this plan and the code disagree,
the code wins and this doc gets fixed in the same pass.*
