# Finalize plan — the run to a fully functional platform

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

> **The answer, first.** The platform is built and green: `tsc` clean, **8,943 tests passing**,
> **all 27 `check:*` gates exit 0**, and CI is green on `main`.
>
> ✅ **CLOSED 2026-08-12 — §2.5 and §2.6 both shipped. Kept in place, not deleted, because the
> reasoning is the reason the fix took the shape it did.**
>
> *What this paragraph said until now:* the ledger bijection claim ("an exact bijection with the
> repo, 594 ⇄ 594, ADR-963") had gone false — re-checked 2026-08-11, the repo carried
> `20270220000000_fk_indexes_and_billing_policy_merge.sql` while production held the same file under
> `20260811003019`. That was the **fourth** recurrence, and the direct consequence of §2.6 never
> being done: `check:migrations` read the tree only and had **no ledger-head rule**, so it
> structurally could not see this class. A gate that cannot fail on the defect it was written for is
> the repo's own named failure mode.
>
> *Where both stand now, verified against the live database on 2026-08-12:*
>
> | Item | State | Evidence |
> |---|---|---|
> | §2.5 repair the ledger | ✅ Done | All four listed versions (`20270213000000`, `20270214000000`, `20270215000000`, `20270215000001`) plus `20270220000000` return **1 row each** in `supabase_migrations.schema_migrations` |
> | §2.6 stop it recurring | ✅ Done ([ADR-1007](DECISIONS.md)) | `scripts/check-migrations.mjs` gained **Rule 4** — the repo and the ledger head must be the same set, compared **live** with no pinned numbers, degrading to a loud SKIP (never a vacuous pass) when CI has no credentials |
> | Repo ⇄ ledger today | ✅ **609 ⇄ 609** | `ls supabase/migrations/*.sql \| wc -l` → **609**; `select count(*) from supabase_migrations.schema_migrations` → **609**, head `20270226000100`. The last gap, `20270226000100_household_bundle_invites.sql`, was applied 2026-08-12 (DDL via `execute_sql`, ledger row inserted at the file's own version per [`DATABASE.md`](DATABASE.md) — never `apply_migration`, which stamps wall-clock). Repo and ledger now agree byte for byte: versions digest `3a19c090…d580a50`, version⇥name digest `84fea62d…168e80b` |
>
> ⚠️ The old count in this paragraph ("598 unique, well-ordered filenames") was stale within a day of
> being written. It is replaced above by the command rather than by another number to inherit.
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
| Tests | ✅ | 708 files, 8,943 tests, 0 failures |
| Machine gates | ✅ | all 27 `check:*` scripts exit 0; CI runs 26 of them, and the 27th now runs **weekly** — `.github/workflows/maintenance.yml:147` calls `node scripts/cron-freshness.mjs --markdown` in the "Cron heartbeat coverage" step (2026-08-11). This row read *"defined but scheduled nowhere"* until 2026-08-12, which was the **second** copy of that claim to outlive the wiring; `.github/workflows/ci.yml:148-150` documents why the gate lives there and not in CI |
| CI (`ci.yml`) | ✅ | green on `main` |
| Migrations applied | ✅ | every repo migration is live in prod |
| Cron wiring | ✅ | 27 `vercel.json` entries ⇄ 27 handlers, zero drift both ways |
| Route reachability | ✅ | of 240 static routes, 8 have no inbound link and **all 8** are documented redirects or dev tools |
| Marketing metadata | ✅ | the 15 pages without `generateMetadata` are all intentional 308 redirect stubs (spot-checked 4) |
| Code hygiene | ✅ | **19** TODO markers and **0** FIXME in the entire `app` + `lib` + `components` tree (word-boundary `\bTODO\b`; a bare `TODO` substring match reads 25, because `AUTODOC_MARKER` contains the letters) |
| SEO/AIO surface | ✅ | 14 OG-image routes, 25 JSON-LD emitters, `llms.txt` already carries live first-party stats |
| Help centre | ✅ | 55 articles, core coverage **36/36**, **0 orphan feature keys** (the 10 were added to `feature-keys.ts`; `check:help` now fails on an orphan in every mode). `--strict` is wired into `check:help` as of 2026-08-11, so a new `core: true` row without an article fails CI. Wiring it changed no outcome the day it landed (core was already 36/36) — it is a ratchet forward, not a fix. Both the article count and the registry size carry floors |
| **Visual regression** | ✅ | **71 of 76**, was 10 of 72. `/feed`'s viewport capture WORKS (passes now). App shell coverage **3/3 surfaces, 12/12 checks**, from zero this morning. The 4 remaining failures are `/settings` × 4 and are a TRUE POSITIVE — see 1.10. |
| **Accessibility ratchet** | 🔴 | first full run with a session (2026-08-10): **32 failed · 28 passed · 26 skipped** — 4 absent baselines, 28 real rises, **all 16 dark-mode contrast checks among them** (1.7, ADR-980) |
| **Anon/authenticated grants** | ⏳ | **1,556 across 195 tables**, down from 1,907 across 273 (Phase 2a swept 76 tables, ADR-965). This row said 1,907/273 until 2026-08-11: it was written before Phase 2 shipped and never updated when it did |
| **Migration ledger numbering** | ✅ | **Closed 2026-08-12.** The fourth recurrence (repo `20270220000000_fk_indexes_and_billing_policy_merge.sql` ⇄ prod `20260811003019`) is repaired — that version now holds a ledger row — and [ADR-1007](DECISIONS.md) gave `check:migrations` a live ledger-head rule so the class fails a guard instead of a re-freeze. Today **609 repo files ⇄ 608 ledger rows**, the one gap being a written-but-unapplied file. ⚠️ Do not restore a pinned pair here: this row has now been wrong twice by quoting a number instead of a command. See §2.5 and §2.6 |

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
exist, and `pr-compare` is eligible to be flipped to required.

> ⚠️ **"All three gates" was wrong, corrected 2026-08-11.** `check:adoption` and `check:contrast`
> are **not GitHub check runs and cannot be added as required contexts.** `.github/workflows/ci.yml`
> declares exactly three jobs — `lint`, `test`, `checks` — and both of those guards are entries in
> the `guards=(…)` array *inside* `checks` (`ci.yml:173`). GitHub gates on check runs, so a required
> context naming either of them would match no job and gate on nothing, which is the failure the
> ci.yml header already warns about for renamed jobs.
>
> **They are already required, transitively.** `checks` is one of the four required contexts, and a
> failing guard fails that job. So both have been enforced since the split. Nothing to promote.
>
> The owner action is **one** context: `pr-compare`. This row said three across two places and both
> are fixed. The lesson is the same one ADR-983 records for `platform_flags`: a promotable context is
> a checkable fact, so check it rather than repeating a list.

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
| 1.2 | ✅ **DONE — recaptured on run `31422100196` (#15)** | — | `update_baselines` + `capture_shell` against the branch preview: **62 of 72 baselines refreshed, zero additions**, runner-committed as `b0129d6`. The zero additions are the point — every refreshed file already existed, so the recapture absorbed no new surface and no feature change. `test/e2e/baseline-distinctness.test.ts` passes on the new set. ⚠️ The member shell stayed at **2 of 4** surfaces (`app-feed`, `app-settings`): `appSurfaces()` no longer defaults `PW_ROOM_PATH`/`PW_SPACE_SLUG`, so those two surfaces are absent rather than wrong — see 1.8. |
| 1.3 | **Seed the shell a11y baselines** | S | `/feed` and `/settings` are currently held to zero serious+ violations against debt that predates the gate, because their baselines were never captured — confirmed: `a11y-baselines.json` `surfaces` has **no `/feed` or `/settings` key at all**, so they fall to `$defaultMax`. Run #15 duly failed all four of their checks. `e2e-manual.yml` → `capture_shell` + `update_a11y`. ⚠️ **Re-running `update_a11y` as-is does nothing.** `scripts/a11y-baselines.mjs` refuses a new context whose debt exceeds `$defaultMax` (0) — *"a new surface joins at zero tolerance"* — so `/feed` (7) and `/settings` (2) land in `added`, the script `exit(1)`s **before** it writes, and the file is unchanged. Seeding them is a deliberate `--force` with a reason in the commit. ✅ **One of the 9 is now fixed** (6.15), so the numbers to seed are 6 and 1. |
| 1.9 | ⚠️ **`pr-compare` ANSWERED: 68 of 72 pass. The 4 that fail are one surface, and recapturing it again will not help** | S | Run `31426644985` on `74c7387`: **`68 passed · 4 failed`**, against **`10 passed · 62 failed`** before the recapture. Phase 1's premise held — the baselines were stale and recapture was the remedy — for **68 of 72** surfaces. The 4 failures are `app-feed` alone, both modes × both viewports, and they are **size** mismatches (`390×11772` expected, `390×11848` received, +76px) rather than the pixel-content diffs the pre-recapture run showed. ⚠️ **Do not re-run `update_baselines` for this.** `surfaces.ts:319` already records `/feed` drifting 8497 → 9272 → 9390px and attributes it to five `<Suspense fallback={null}>` boundaries that **append** height as they resolve (a null fallback reserves zero height), which is why `settle()` grew a height wait and why the file states masking cannot fix it — *"the failure is the page's HEIGHT, not its pixels."* **But the Suspense theory does not survive this run:** `/settings` carries **twelve** such boundaries and **passed all four of its checks**. The surface with more boundaries is the stable one. What separates them is the data: `/settings` renders the caller's own settings, `/feed` renders a **shared, live** post stream, and the baseline was taken ~70 minutes before the comparison. A full-page pixel baseline of a live feed measures when it was taken. Options, in order of honesty: capture `/feed` at **viewport height** rather than `fullPage`; seed deterministic content for the beta member; or drop `/feed` from the visual set and let the a11y suite carry it. All three are a decision about what the instrument should measure, so none is a silent fix. |
| 1.7 | ⚠️ **NEW, measured on run #15: the a11y ratchet is as stale as the visual baselines were, and it must NOT be re-frozen the same way** | M | The smoke job of run `31422100196` reports **32 failed · 28 passed · 26 skipped**. Four are 1.3's absent shell baselines. The other 28 are a **real rise against a real baseline**, and the shape is systemic: **all 16 dark-mode contrast checks fail** (`dawn-dark` ×8, `midnight-dark` ×8), against baselines that are **0 on every surface but `/spaces` (2) and `/the-community` (3)** — plus `midnight-light` on `/the-lab` · `/pricing` · `/discover`, and 7 `dawn-light` serious+ checks on `/about` · `/the-lab` · `/pricing` · `/discover`. **The baseline is not an artefact:** its counts track the *mode* axis and ignore the *skin* axis (`midnight-light` is identical to `dawn-light`, `midnight-dark` to `dawn-dark`), which is what contrast should do, so these numbers were real when frozen on 2026-08-04. What moved is the design — the same churn that staled 62 of 72 visual baselines (#2042 the DAWN pass, #2053 which recorded a contrast cost *as a waiver*, #2061). ⚠️ **The remedy is NOT `update_a11y`.** A visual baseline is **descriptive** (recapture is always right); this ratchet is **normative** — ADR-928 lets debt fall, never rise, and `update_a11y` over a rise erases the regression instead of recording it. Per the file's own header, *"baselines are debt, and debt gets a name"*: audit each risen surface, fix what is fixable, and waive the rest **with a reason in the same commit**. Start with the 16 dark-mode failures — one cause across eight pages and two skins is one fix, not sixteen. ⚠️ Do not read `check:contrast` being green as a contradiction: it validates the **token layer** against a hand-declared `PAIRS` list, while axe validates what was **painted**, so a token used on a ground it was never paired with is invisible to it. Full reasoning: [ADR-980](DECISIONS.md). |
| 1.8 | ⚠️ **Owner: ONE variable, not two — `PW_ROOM_PATH` has no valid value** | XS | 🔴 **Measured against production 2026-08-10: `channels_total = 0`.** There is not a single channel in the database, so no value of `PW_ROOM_PATH` can point at a room. This item was listed as a five-minute config action four separate times and it is not one: it needs a channel to EXIST first. `app-room` staying absent is correct until then, and is exactly what the deleted `/channels` default was faking. `PW_SPACE_SLUG` is real and unblocked. ⚠️ It must name a Space the `PW_MEMBER_EMAIL` account can MANAGE — `danieltyack` has exactly one manager (its owner), so unless that is the test account, use a Space the test account owns rather than granting automation credentials admin on a live business Space. |
| 1.8b | ~~Owner: two repo variables~~ | XS | The member shell photographs **2 of 4** surfaces. The missing two need a value only you can supply, because there is no safe default — the last default (`PW_ROOM_PATH` → `/channels`) is exactly what made four baselines photographs of the marketing home page. Settings → Secrets and variables → Actions → **Variables**: `PW_ROOM_PATH` = a room route the beta member can reach, `PW_SPACE_SLUG` = a Space slug that account can manage. Then re-run `e2e-manual.yml` with `capture_shell` + `update_baselines`. |
| 1.4 | ✅ **Already resolved — it is a VARIABLE, not a secret** | — | Verified 2026-08-10 two ways. The Variables tab holds `PW_REQUIRE_SHELL = 1`; the Secrets tab does **not** (its six entries are `ANTHROPIC_API_KEY`, both Supabase keys, `PW_MEMBER_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`). And the run log contains **zero** `***` redactions while printing figures full of the digit 1 (`117474 pixels`, `ratio 0.03`) — which is only possible if `1` is not a secret. The log-redaction problem this item describes is gone. |
| 1.5 | ✅ **Already resolved — the account exists and the session mints** | — | `PW_MEMBER_EMAIL` is set (Secrets tab, checked 2026-08-10), and the proof it works is in the run itself: `app-feed` and `app-settings` were **photographed**, which is only possible behind a minted session. What is still missing is narrower than "an account": `app-room` has no baseline (Phase 1 deleted all four as wrong-page captures of the marketing home), and the Space console needs the **`PW_SPACE_SLUG`** repo variable, which is not set — the Variables tab holds only `PW_REQUIRE_SHELL`. Both are covered by one `update_baselines + capture_shell` run. |
| 1.6 | ⚠️ **Owner: flip `pr-compare` to required. Only that one — `check:adoption` and `check:contrast` are already enforced and cannot be promoted, see below** | S | Required contexts are now **four** (`checks` · `analyze` · `lint` · `test`). ⚠️ **A green `pr-compare` on a Dependabot PR means nothing was tested.** GitHub does not expose repo secrets to Dependabot runs, so `VERCEL_AUTOMATION_BYPASS_SECRET` is empty, and the job takes its documented skip path — *"Skipping is the honest result; a red X here would mean nothing about this PR"* — and **exits 0**. Verified on #2076 job `93578379589`: `BYPASS:` empty, `::notice ... Nothing was tested`, conclusion `success`. The reasoning is right and the skip is the correct behaviour; the problem is that it produces a checkmark **indistinguishable from a real pass** in the PR list, on exactly the PRs that bump the CI actions themselves. Promote it to required and every Dependabot PR satisfies it vacuously, forever. Fix before promoting: report the skip as **neutral** rather than success, or gate the required context on a job that cannot skip. |

> **Standing rule from the last thread, worth keeping:** on a GitHub `pull_request`-event outage,
> add a bypass actor to ruleset `17640795` rather than toggling enforcement off.

---

## Phase 2 — Close the access layer ⏳

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
| Explicit table grants held by `anon` | **1,556** across **195** tables (was 1,907 / 273 before Phase 2a) |
| Same for `authenticated` | **1,556** across **195** tables (was 1,907 / 273) |
| Tables with RLS on and **zero** policies (fail-closed by RLS alone) | **77** |
| `SECURITY DEFINER` functions in `public` | 112 |
| …executable by `anon` | **34** |
| …executable by `authenticated` | **54** |

~~**Two functions prove the idiom is still failing today.**~~ ✅ **CLOSED 2026-08-12 — both are
locked.** The claim was that migration `20270207000000` revokes from `public`, grants only
`service_role`, and that prod nonetheless answered **true** for `anon`. Re-run against prod on
2026-08-12, the same `has_function_privilege` query, both signatures:

| Function | `anon` EXECUTE | `authenticated` EXECUTE |
| :--- | :---: | :---: |
| `journey_funnel(text, jsonb, integer)` | **false** | **false** |
| `vitals_p75(integer, text, text)` | **false** | **false** |

Neither is reachable from the anon key in the browser bundle. Recorded here rather than deleted,
per this document's own rule at the top: already-fixed items get written down so nobody re-audits
them.

⚠️ **This closes 2.2 and nothing else, and the table above it has moved.** Re-counted against prod
on 2026-08-12: **114** `SECURITY DEFINER` functions in `public` (was 112), **29** executable by
`anon` (was 34), **48** by `authenticated` (was 54). The grant and RLS rows were **not**
re-measured. So 2.3's *"the other 32"* is now the other **29 minus whatever the `public_*` family
accounts for** — re-derive 2.1, 2.3 and 2.4 before working them, and do not read the 2026-08-10
column as current.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 2.1 | **Audit by privilege, never by reading SQL** | S | The SQL reads correct. Use `has_function_privilege('anon', …)` and `information_schema.role_table_grants` against prod. Produce the full inventory as a committed artifact under `docs/maintenance/`. |
| 2.2 | ✅ **Lock the two proven leaks — DONE** | XS | `journey_funnel`, `vitals_p75` → `service_role` only. Verified against prod 2026-08-12: `has_function_privilege` answers **false** for both roles on both signatures. See the closed paragraph above. |
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
| 2.5 | ✅ **Repair the ledger — DONE** | XS | Was: `supabase migration repair --status applied 20270213000000 20270214000000 20270215000000 20270215000001`. Verified against the live ledger 2026-08-12 — all four versions return exactly one row, as does `20270220000000`. |
| 2.6 | ✅ **Stop renumbering applied migrations — DONE** ([ADR-1007](DECISIONS.md)) | S | Was the root cause of both the gap and the ~13 duplicate rows. `scripts/check-migrations.mjs` Rule 4 now compares the repo against the **live** ledger head, with no pinned count or digest anywhere — the previous instrument was a hand-re-frozen number in `scripts/maintenance/ledger-parity.test.ts`, and "a guard whose correctness depends on a human doing a fiddly thing right, every time, has already failed." It degrades to a loud, named SKIP when CI has no database credentials rather than passing vacuously. |

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
| 3.3 | ✅ | ~~**Meta descriptions over the ~155 snippet window.**~~ **FIXED — five, not four, plus one more only the gate could see** | Rewritten inside the canon (no em dashes, clean sentence boundaries): `/the-lab` **200→154**, `/spaces` **186→139**, `/beta` **158→148** (the plan missed this one), `/the-community` **158→142**, `/the-quest` **158→140**. `check:seo` **Scan E** now enforces it at **160** (155 is where truncation starts to bite, 160 is where it is certain; a gate at 155 would fail copy that renders fine). Scan E immediately found `/discover/journeys` at **163**, which no hand pass had recorded, and it is scoped to pages a crawler can actually reach so a private route's long copy is not a false failure | `app/(marketing)/**/page.tsx` · `scripts/check-seo.mjs` |
| 3.4 | ✅ | ~~**3 `MODULE_ROUTES` entries point at redirect-only pages**~~ **FIXED** — `/admin/crm/graph`, `/admin/crm/playbooks`, `/admin/crm/today`, all merged into `/admin/crm/intelligence`. The Layout panel is advertised on a route that immediately redirects | All three retired, from `MODULE_ROUTES` **and** `ROUTE_MODULE_IDS` (whose keys were also giving the App catalog route scopes that navigate away). Every one of their six block ids already lives on `/admin/crm/intelligence`. The two live outbound links, in the Vera owner-brief email and the dashboard worklist, now point at the merged page instead of through a redirect. A new test asserts **every** `MODULE_ROUTES` entry resolves to a page that really renders `<PageModules>` | `lib/widgets/module-routes.ts` · `lib/widgets/modules.ts` |
| 3.5 | ✅ | ~~**13 serial awaits in the authed layout**~~ **The count was stale; two remained, both now folded in** | Re-measured 2026-08-10. The layout had already been refactored: the main wave (22 reads) and the theme wave (5) exist, and the whole onboarding tail (`nextStepsEnabled` → `getProfileChores` → `getOnboardingStatus` → `getFounderTasks` → `getActiveTraining`, plus `autoPopupsEnabled`) already streams behind `<Suspense>` in `VeraLauncherSlot` / `CoachOverlaySlot` / `AutoPopupsSlot`, off the critical path entirely. What was genuinely still serial between the main wave and the theme chain: **`getMyFrequency` and the janitor `openTicketCount`** — each one pushing first paint back a full round trip. Both folded into the existing wave as speculative reads, exactly like `getStaffMember` and the operator trio already were. The janitor read stays gated on the **true** `profile.web_role`, which is known before the wave, so it does not become a new read for everyone. The remaining serial steps are genuinely dependent: `createClient` → `getUser` → the profile row, and `theme` → `loadActiveThemeCss` | `app/(main)/layout.tsx` |
| 3.6 | ✅ | ~~**10 orphan help feature keys**~~ **FIXED, and the direction was backwards** | The plan said they "point at articles that do not exist". It is the reverse: all ten are declared by **published** articles and had no row in `lib/help/feature-keys.ts`, so every in-product affordance that resolves by feature key found nothing while the article sat there. Added with routes **verified to exist** first: `on-air` · `journeys` · `challenges` · `achievements` · `leaderboard` · `profile` · `connections` · `location` · `resonance` · `billing`. Coverage **29/36 → 39/46**, core **36/36**, orphans **0**. `help:coverage` is now the 24th guard (`check:help`) and an orphan key **always** fails — it is a broken link, not a backlog item, unlike the undocumented-core list which sits behind `--strict` (ADR-970). ⚠️ Updated 2026-08-11: `--strict` is now passed by `check:help` itself, so undocumented **core** features do fail CI. The seven still-undocumented keys are all `core: false`, which is why turning it on changed nothing | `lib/help/feature-keys.ts` · `scripts/help-coverage.mts` |

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
| 4.3 | **Mobile header sub-links** | M | Verified: the `header` surface held **23 items, all 23 inside categories**, while `marketing-mobile-menu.tsx` rendered `headerTriggers()` plus a hardcoded `DISCOVER_NAV`. Every categorised child — including the `/for/*` doors — was unreachable on a phone, and operator menu edits to them never appeared there. Deferred by the owner at the time; taken up as `LIVE-106` and shipped (ADR-1118) after re-measurement put the real count at **13** destinations, not the twenty the backlog row claimed — the sheet's `DISCOVER_NAV` block covered four of the six `/discover/*` surfaces the row named, and the row missed `/spaces/directory` and `/what-is-frequency`. Status for this row lives in `docs/BUILD-BACKLOG.json`. |
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
| 5.2 | **Retire the coded bodies, one slug per PR** | L | Gated on Phase 1: only retire a body once the visual suite proves the template is equivalent. Order by risk: `circles` → `about` → `spaces` → `the-lab` → `the-quest` → `the-community` → `home` → `pricing` (partial only, live bindings, never frozen figures). ⚠️ **`home` was missing from this order until 2026-08-24**, and from the "duality, measured" table above — which says *eight* gated slugs and lists seven, omitting the 939-line `app/page.tsx`. `LIVE-006` always placed `home` LAST in the series; the live scoreboard is `scripts/render-path-bodies.txt`, never this table. |
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
| 6.4 | **Kit state sweep (Lift 8b)** | M | ⚠️ **Do not measure this with a grep — I tried, and the numbers are meaningless.** Counting `hover:` / `active:` / `focus-visible:` / `disabled:` per file in `components/ui/` reports 52 of 56 primitives "missing focus" and 54 "missing pressed". Both figures are **false**: `app/globals.css:1784` rings every `button, a, select, [tabindex]` on `:focus-visible` and `:1788` covers `input, textarea`, while `:1668`/`:1673` supply `:active`. `INTERACTION-STATES.md` §2 says so in as many words ("focus-visible is mostly free"). A real audit has to ask, per primitive: which **class** is it, which states does that class require, and does it get them from its own utilities, from globals.css, **or** by rendering a native `<button>`. That is per-component judgement across **42** primitives (**17** have tests today), which is what makes this M and not S. ⚠️ This row said **56** until 2026-08-11; the live count is 42 (`find components/ui -name '*.tsx' -not -name '*.test.tsx'`), re-confirmed 2026-08-12. The test count was 14 when written and is **17** now (`ls components/ui/*.test.tsx`). ⚠️ **And the sweep itself has largely run**: [`INTERACTION-STATES.md`](INTERACTION-STATES.md) §5, re-measured 2026-08-12, reads **7 of 10** action + field controls at full required-state coverage, so this row is down to four controls. |
| 6.5 | **Low-adoption primitives** | M | `RowCard` 5 consumers vs `bespoke-rows` 14 · `StreakMeter` 4 · `Meter` 6 · `GateNotice` 5. ⚠️ **Triage before sweeping**: the ratchet is a filename heuristic, and `ContactCard`/`GroupCard` carry docstrings saying they are deliberate variants. Separate "owed to the kit" from "filename collision" first — forced conversions to move a number are the exact failure the ratchets exist to prevent. |
| 6.6 | **Raw `<img>` → `next/image`** | S | ⚠️ **The "67" this row used to assert does not reproduce, under any scope tried.** Live 2026-08-11: **127 `<img` lines across 74 files** in `app` + `components`; **120** after excluding `print/`, `og/` and email templates, which legitimately cannot use `next/image`. The old figure cited no basis, so it cannot be reconciled — re-measure before scoping, and state the basis this time. Do the LCP surfaces first. |
| 6.7 | **Remaining ratchet tails** | M | Re-derived 2026-08-12 (`node scripts/check-adoption.mjs`, baseline / current): `raw-input` **119 / 118** (the borderless variant this row asked for **shipped** — `components/ui/field.tsx:105` `FieldVariant = 'boxed' \| 'seamless'`, so what is left is call-site work), `literal-display-type` **96 / 96**, `raw-button-bg` **524 / 513** (still replace the proximity-window pattern with the opening-tag form under a new basis fingerprint), `literal-radius` **2,440 / 2,288** (**spend inside screen passes, never as its own wave**). The 186 and 526 this row carried were quoted from a column, not a run. |

### 6.8 — The DAWN debt is TWO populations, and only one of them is a sweep

Measured 2026-08-10 with `check:adoption`'s **own** `countEntry`, run per file, so the distribution
and the score cannot disagree. `top25` is the share of a class's total carried by its 25 worst files.

> ℹ️ **This table is a dated distribution, not a live count — read it for shape, not for totals.**
> The finding it carries (three long-tail classes, eleven concentrated ones) is what it is for, and
> that finding still holds. The totals have moved since: at 2026-08-12 the ratchet holds **17**
> classes, not 14, and `literal-radius` is 2,288, `raw-button-bg` 513, `raw-input` 118,
> `subtle-tiny-type` 22, `bespoke-cards` and `bespoke-rows` both **0**. Re-run per file before
> sequencing off the distribution; the shares above were never re-derived.

| Class | Total | Files | top10 | top25 | Median/file | Instrument |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `literal-radius` | 2450 | 816 | 8% | **15%** | 2 | ⚠️ **unblocked (6.9), but NOT a blind codemod — see 6.17** |
| `raw-button-bg` | 526 | 312 | 14% | **26%** | 1 | 🔧 codemod |
| `raw-input` | 186 | 131 | 21% | **37%** | 1 | 🔧 codemod + an inset variant |
| `raw-px-arbitrary` | 117 | 59 | 47% | 71% | 1 | ✋ sweep |
| `literal-display-type` | 96 | 37 | 69% | 88% | 1 | ✋ sweep |
| `shadow-literals` | 49 | 35 | 49% | 80% | 1 | ✋ sweep |
| `white-black-literals` | 27 | 24 | 48% | **100%** | 1 | ✋ sweep |
| `bespoke-cards` | 24 | 24 | 42% | **100%** | 1 | ✋ sweep |
| `subtle-tiny-type` | 23 | 8 | **100%** | 100% | 2 | ✋ sweep |
| `bespoke-rows` | 14 | 14 | 71% | **100%** | 1 | ✋ sweep |
| `adhoc-progress` · `handrolled-icon-button` · `raw-select` · `raw-textarea` | 26 | 22 | **100%** | 100% | 1 | ✋ sweep |

**The finding that changes the plan: 11 of the 14 live classes are fully sweepable, and 3 are not.**
The eleven total **376 occurrences** and every one of them is ≥71% carried by its top 25 files — that
is one focused wave, not a program. The three long-tail classes total **3,162** with a median of
**1 to 2 per file** across 816 · 312 · 131 files; a file-by-file sweep of `literal-radius`'s 25 worst
files buys **15%** of it. Hand-sweeping those three is the wrong instrument, and the ratchet has been
implying otherwise by listing all fourteen in one column.

⚠️ **Sequencing constraint, and it is new as of today.** Every row above changes pixels, and the
visual baselines were just recaptured (1.2). A UI sweep now makes `pr-compare` fail — *correctly*,
because it is catching a real visual change — so these must land **after** `pr-compare` is confirmed
green on an unrelated PR, each sweep carrying its own recapture. Landing a sweep before that
confirmation would leave us unable to tell a regression from the sweep's own intended diff, which is
the exact condition Phase 1 existed to end.

### 6.9 — ✅ RESOLVED: the radius roles now mean the steps (owner decision, 2026-08-10)

**This is the find of the DAWN pass, and it inverts item 6.8's `literal-radius` row.** I had that row
down as a codemod. It is not: converting a literal to its role today makes the component render
**pre-DAWN**.

`app/globals.css` holds two radius systems that were meant to be the same numbers:

| | Role token (`:root`, l.177-179) | Literal step (`@theme`, l.1344-1349) | Agree? |
| :--- | ---: | ---: | :---: |
| control | `--radius-control` **8px** (0.5rem) | `rounded-lg` **14px** | ❌ −6px |
| card | `--radius-card` **16px** (1rem) | `rounded-2xl` **24px** | ❌ −8px |
| *(incidental)* | `--radius-card` 16px | `rounded-xl` **16px** | ✅ |
| pill | `--radius-pill` 9999px | `rounded-full` 9999px | ✅ |

The roles were defined against **Tailwind's stock scale**, and the file says so in its own comment at
l.173: *"control = lg (0.5rem), card = 2xl (1rem)"*. That equivalence was true when written. It stopped
being true when the DAWN port **re-declared the literal steps** at l.1330-1348 — `rounded-lg` 8→14,
`rounded-2xl` 16→24 — and the three role tokens were **not moved with them**. The comment still
documents the old pairing as if it held.

**What that means in the product today**

- A card on `rounded-card` renders **16px**; a visually identical card on `rounded-2xl` renders
  **24px**. Same intent, different corners, and which one you get depends on when the file was written.
- **Migrating a literal to its role — the exact move `check:adoption` rewards — makes corners
  smaller and reverts the component toward its pre-DAWN look.** The ratchet is paying for
  regressions. This is why "consuming rounded-control/card/pill is incremental" (l.176) has stayed
  incremental: every early adopter got a worse-looking component, and the gate called it progress.
- `rounded-full` is already at **1** occurrence out of 2,450, so the pill role is fully adopted and
  is not part of this. The problem is exactly the two roles whose numbers drifted.

**The fix is one owner decision and then three lines**, not a 2,450-site codemod. If DAWN's corners
are the intent — and the port says they are — then `--radius-control: 14px` and `--radius-card: 24px`,
and every skin's overrides (l.595, 729, 840…944, 1023…1079) get re-checked against the same ratio,
since they were all authored against the pre-port roles too. Only after the roles are correct does
converting the 2,450 sites become a no-op that a codemod can do safely.

⚠️ **Do not sweep `literal-radius` until this is settled.** A sweep now writes 2,450 sites to the
wrong number and buries the defect where no gate can see it, because the ratchet would go green.

### 6.10 — Template adoption is 248 to 258 of 383, and the range is the honest answer

🔴 **Re-measured 2026-08-10 by resolving the import graph rather than grepping. The previous
"242" does not reproduce, and neither does the "6" below it.**

Method: `find app -name page.tsx` → **383**. Shell set = the 8 real shells exported by
`components/templates/index.ts` plus the `AdminPage` alias. **Pieces excluded** (`PageHeading`,
`PageHero`, `WizardProgress`, `AdminSection`, `RailGrid`) — a page importing only a piece composes
no shell. A page counts as compliant when it, or an ancestor `layout.tsx`, reaches a shell.

| Resolution | Compliant | Non-compliant |
| :--- | ---: | ---: |
| Direct import in the page or an ancestor layout (**floor**) | 248 | 135 |
| Full transitive import closure (**ceiling**) | 258 | 125 |

⚠️ **The range is not indecision, it is the measurement's actual precision.** Transitive
reachability over-credits: a page scores compliant if *any* module in its closure imports a shell,
even one not on the rendered path. Direct under-credits a page that composes through a helper. A
single number here would be a guess with a number attached. **The 125 list is sound in one
direction** — none of those can reach a shell by any path.

Of the 125, 41 render no JSX (redirect/`notFound` stubs). Of the remaining 84, **38 are under
`app/(main)/`**, which is where a shell is actually owed. Some of those 38 are registered
exceptions in `lib/layout/page-chrome.ts`; that registry keys on route patterns rather than file
paths, so matching the two mechanically would be a claim this measurement cannot stand behind.
Treat 38 as the superset.

⚠️ **There is no instrument here at all** — no gate, no baseline, no ratchet. Every other class in
§6.8 has one, which is why their numbers reproduce and this one did not. `check:headers` is the
nearest thing (305 route entries, 3 named hand-rolled `<h1>`s) but it measures a narrower property.

⚠️ **The correction, because the method had a hole worth naming.** "Imports from
`@/components/templates`" is NOT evidence of composing a template: that barrel also exports
**pieces** — `PageHeading`, `AdminSection`, `WizardProgress`. **Five** pages import only a piece,
compose no shell, and have no ancestor `layout.tsx` composing one either, yet were scored compliant:
`admin/events/[id]` · `admin/spaces/[id]` · `messages/[id]` · `messages/r/[roomId]` ·
`people/[handle]/profile-preview`. Of those, **one is a registered exception** —
`people/[handle]/profile-preview` is in `page-chrome.ts`'s `BUILDER_PATTERNS`, "a profile page whose
own identity/layout paints". The remaining four need a per-page call.

🔴 **This list said six, and the sixth was wrong twice.** It named
`spaces/[slug]/profile-preview` as uncovered because `BUILDER_PATTERNS` is `/^\/spaces\/[^/]+$/`
(root only). But the file lives at `app/(main)/spaces/[slug]/(profile)/profile-preview/page.tsx`,
and its ancestor `app/(main)/spaces/[slug]/(profile)/layout.tsx:5` composes `DetailTemplate` — so
it is **Detail-composed-at-layout**, a category this very section already recognises, and it never
needed the chrome exception at all. The path recorded here omitted the `(profile)` route group,
which is exactly how a page gets audited as if it had no ancestor. Same hole explains
`journey-spark.tsx` and `practice-spark.tsx` below: they import from the barrel and compose nothing. Of the remaining 135, **123 are legitimate and were each read
to confirm it**: 32 redirect stubs · 51 marketing/discover surfaces (a separate system per
PAGE-FRAMEWORK §10) · 8 Detail-composed-at-`layout.tsx` · 8 sanctioned editable indexes (§8.5) ·
5 Studio windows (§9) · 4 registered chrome takeovers · plus dev showcases and the retiring beta funnel.

**That leaves 7 components feeding 8 routes with no shell anywhere in their render tree**, all of
them authoring surfaces, all with a hand-rolled `<h1>` where `PageHeading` belongs:

| Component | Route(s) | Hand-rolled header |
| :--- | :--- | :--- |
| `components/circles/builder/circle-builder.tsx` | `/circles/[slug]/edit` | `:181` |
| `components/circles/builder/circle-wizard.tsx` | `/circles/new` | `:157` |
| `components/journey/v2/journey-spark.tsx` | `/journeys/new` | `:194` |
| `components/journey/v2/journey-guide.tsx` | `/journeys/[slug]/guide` | `:240` |
| `components/studio/practice/practice-spark.tsx` | `/practices/new` | `:152` |
| `components/admin/theme-studio/theme-editor.tsx` | `/admin/appearance/[id]` · `/new` | `:158` |
| `app/(main)/admin/walkthroughs/[id]/editor.tsx` | `/admin/walkthroughs/[id]` | `:168` |

Each imports `WizardProgress` (one piece of `WizardShell`) and then re-declares the band the shell
would have given it. Proof this is a slip rather than a needed exception: `admin/marketing/messaging/
new/guided-client.tsx:19` does exactly the same thing and **says so**, with a reason. These seven do not.

✅ **Rail discipline is clean** — `grep showSidebar` across `app/` + `components/` returns only
`lib/layout/page-chrome.ts` and the shell that reads it. No page toggles its own rail. `FOCUS_NONE_PREFIXES`
being empty is the documented contract (§8.2), not a gap.

✅ Arbitrary content type, the canon's own ban: **1 hit in 1 file, and it is accounted for.**
(Was 6 hits in 2 files: `app/(marketing)/the-community/tour.tsx` carried `text-[9px]` ×4 and
`text-[8px]` under the marketing allowlist, and that file was DELETED on 2026-08-24 with the
`/the-community` coded body it was the only caller of — Lift 5c, LIVE-006.)
`components/feed/post-body.tsx:46` (`text-[0.85em]`, inline `<code>` sizing) carries a
`// token-ok:` annotation with its reason: the mark sizes relative to whatever text surrounds it,
which is the one thing a fixed type role cannot do. The two sites this row used to name are gone —
`join/(induction)/induction.tsx` (né onboarding/beta) and `page-editor/desktop/desktop-editor.tsx` now hold no `text-[…]`
at all. `text-2xs`/`text-3xs` already exist for anything new.

**Re-measured 2026-08-11 (was "8 hits in 4 files"; before that, "6 hits in 4 files" over an
enumeration totalling 7 in 3).** Method now matches the gate exactly rather than approximating it:
`TEXT_ARBITRARY` from `scripts/check-tokens.mjs` run with `matchAll` over `{app,components,lib}`
excluding tests, each file first passed through that script's own `stripComments`. That second pass
is load-bearing, because `people/member-viewer/message-path.tsx:35` mentions `text-[10px]` in a
header comment saying it deliberately does not use one, and a raw grep books it as a hit.

✅ **Both holes this row opened in `check:tokens` are closed.**
- The px-only `TEXT_PX = /text-\[\d+px\]/` is now `TEXT_ARBITRARY`, which matches
  `px|rem|em|pt|ch|ex` and is consumed with `matchAll`, so two literals on one line count as two.
  `clamp()` is left out on purpose: fluid display sizing is a different class with its own rules.
- `app/join/(induction)/induction.tsx` (né app/onboarding/beta) is no longer a whole-file waiver. It is scoped to
  `kinds: ['hex color']` (as is `app/sign-in/`), so the exemption granted for a 4-hex Google brand
  mark covers hex and nothing else. The allowlist supports both forms, and `isAllowed` documents
  why a reason that names one class must not waive the rest.

### 6.11 — ⚠️ ELEVEN rows where the menu and the page disagree, now held by `check:gate-parity`

Measured 2026-08-10 by walking every `STUDIO_LEAVES` row with an `/admin/*` href and comparing its
`min`/`staffDomain` against the page's actual `requireAdmin(...)` call. **`pnpm check:menu` passes on
all eleven** — it validates that the catalog is the single source of menu *shape*, and has no way to
reach into a page body and read its guard. That is the gap, not a bug in the gate. The eleven are
`FROZEN_GATE_DEBT` in `scripts/check-gate-parity.mjs`; `pnpm check:gate-parity` prints the count on
every run, so the heading and this list are both checkable against the script rather than each other.

Two directions, and they fail differently:

- **Menu promises, page denies** (a dead menu item — the user clicks and lands on `/feed`), seven:
  `connections`, `sms`, `nonprofit-verifications`, `content-tips`, `beta-command`,
  `marketing-control-panel`, `crm-pipeline`.
  `content-tips` is the widest: the catalog offers it to every `host`+ community leader and every
  `community`-domain staffer; the page admits **janitor only**.
- **Page allows, menu hides** (a tool its authorized users can never find), four:
  `page-layout`, `crm-marketing`, and `business-seeder`/`listing-seeder` — the last two carry **no
  `staffDomain` at all**, and `lib/nav-areas.ts:227` returns false when it is unset, so a
  `structure`-write staffer who is fully authorized never sees them.

✅ **Fixed in this pass: `qr` + `qr-stats`.** The catalog comment records the decision already made
(*"STRICTER = 'admin'. Resolved to 'admin' + staffDomain 'qr'"*) and the rows say `admin`, but both
pages still ran `requireAdmin('host', …)`. `'host'` reads the **community** ladder (ADR-208), so it
admitted anyone who cleared the staff-only `/admin` floor **in another domain** and happened to be a
host. Pages aligned; a real qr-domain operator still passes on the `staff` branch.

⚠️ `qr` + `qr-stats` were never frozen, so the **eleven** above are all still open, and every one of
them is **product policy, not a defect with an obvious direction** — each needs the owner to say
which side is right before the code moves. Do not "fix" them by making the numbers match. The
script's own header splits them **8 catalog fixes / 3 page fixes**, with the recommendation per row.

### 6.12 — Two fully-built admin pages nothing links to ✅ FIXED

`/admin/marketing/automations` (rules engine) and `/admin/marketing/nurture` (per-persona sequence
builder) are complete, gated, working pages that had **zero** inbound references anywhere in the repo
and no row in any catalog. `lib/nav/studio.ts:277` documented the intent — they were "rolled into the
Resonance CRM Marketing tab" — but `/admin/crm/marketing` has **no automations or nurture UI**. The
menu rows were removed on the assumption the destination existed. It did not.

**Both rows were restored in #2078** and are live at `lib/nav/studio.ts:302` (`marketing-automations`)
and `:304` (`marketing-nurture`). This section still read as open until 2026-08-11; that was the doc
lagging the fix, not a regression.

Still open, same shape and lower severity: `/admin/growth/funnels` and `/admin/marketing/funnels` are
orphaned index pages whose *detail* routes are still linked, so a bookmark works but the list that
would lead you there does not.

🔴 **Owner call:** finish the migration, restore the menu rows, or delete the pages. All three are
defensible; leaving them is the only option that is not.

### 6.13 — Member-surface wiring: 261 routes, 268 links, two real defects (both fixed here)

Method: every `page.tsx` outside `/admin/`, `/crm/`, `/moderation/` → **261 routes**; every literal
and template-literal `href` in those files → **268 links**, each existence-checked against the route
inventory, `next.config.ts` redirects, and the target's own `redirect()`. Host-facing manage/settings
pages were kept **in** scope — a Space owner is a member, not a platform operator.

✅ **267 of 268 links resolve.** No `href="#"`, no `onClick={() => {}}`, no TODO-marked handlers
anywhere in the member surfaces. The list pages all reach an `EmptyState`, directly or through the
shared surface component. This part of the product is wired.

🔴 **Fixed: a 404 shown to every unpaid Space owner.** `settings/billing/billing-body.tsx` rendered
*"See if a founding spot is left"* → `/spaces/[slug]/settings/billing/founding`. That route **does
not exist**: the per-city Founding Business cohort was withdrawn by owner directive on 2026-07-31 and
its route deleted, which `lib/pricing/founding.ts:24` states outright. The CTA survived a later edit
to the same file (#2017, three days after). A door with no room, on the billing page, shown only to
the people being asked to pay. Removed, with the reason recorded in place.

🔴 **Fixed: `/library/review` had no way in.** A working, Host-gated approval queue whose own page
comment claimed it was *"reachable from admin"* — a repo-wide search returns its route, one
`revalidatePath`, and widget bookkeeping, and **no link, in admin or anywhere else**. `/admin` was
never the right home: that floor is staff-only, while this queue gates on the **community** ladder
(host+). Added to `/library`'s action band under the review page's own guard, so the population that
can use it now sees it where they already stand.

⚠️ **Not fixed, recorded:** `market/sell` binds `action={createMakerProductAction}` with no
`useActionState`, and the action returns bare `void` on rejection — native `required`/`min` catch the
obvious cases, so any *other* rejection just makes the page do nothing. Same shape is likely across
the `spaces/[slug]/settings/*` forms; that is a sweep, not a one-line fix. The roommate-seeker form
saves with no confirmation of any kind.

### 6.14 — Dead code: what was removed, what was left, and the comment that misled the audit

Method: every top-level export under `lib/` + `components/` (**9,129 symbols**) looked up against a
whole-repo token index, then each survivor re-checked with a literal word-boundary `grep -rl` across
**all** file types. File-level reachability was tried first and **discarded as evidence** — it
produced 282 false positives, every one of them reachable by bare basename through a string-keyed
registry. That failure mode is worth keeping: in this repo, "nothing imports the path" does not mean
"nothing reaches the file."

**Removed here** (each verified to exactly one occurrence — its own definition):

| What | Why it was dead |
| :--- | :--- |
| `EventTimeFields` + `EventLocationFields` + `EventLocationInitial` (~215 lines) | Extracted so "the Basics editor and the Place & Time editor render the SAME controls". The Place & Time editor was never built, so the extraction never got its second consumer — and the first one still hand-rolls the identical inputs inline (`event-settings-module.tsx:430`). Only `COMMON_TIME_ZONES` was ever imported; the file is now that. |
| `COLLECTIVE_BETA_CENTS` + its test | `@deprecated`, "kept as a named alias for the in-app plan ladder" — and the plan ladder does not import it. Its only code consumers were its own definition and the test asserting it equalled the map cell it aliased. Dead code carrying a passing test, the shape ADR-979 named for `splashUsageHref`. Two prose claims fixed with it. |
| `isCrew` / `isHost` on `EventsIndexData` | ADR-913 moved the paid wall off event creation onto the price field, leaving `isCrew` feeding a prop that renamed it `_isCrew` and never read it. `isHost` was never destructured by any caller. The prop's own comment said "remove once /events stops resolving it" — done. |

**Left deliberately, with reasons:**

- 🔴 **`lib/crm/capabilities.ts`** (`resolveCrmCapabilities`, `canCrm`) — 132 lines of pure, documented,
  well-tested CRM policy with **zero** production callers, open since the 2026-08-04 scan. Deleting it
  discards a design (what the CRM gate *should* be); wiring it is a feature. **Owner call**, not a sweep.
- ⚠️ **~53 further zero-consumer exports and ~86 test-only exports** — verified by grep, not yet by
  reading each one's context. The list and the one-line re-check are in the scan record; they want a
  dedicated pass, because at that volume a single false positive costs a working feature.
- ✅ **12 `@deprecated` markers checked, 11 are live back-compat shims** with real call sites. Do not
  bulk-remove on the marker alone.

⚠️ **The finding worth carrying forward.** The audit examined `lib/pricing/founding.ts` and concluded
*"blocked on PR #1999, don't touch"* — reasoning entirely from a comment there that said the three
`business_*` fields "configure NOTHING" and the console editor "does nothing". **Two of the three are
live**: `business_monthly_cents` and `business_take_bps` are read by `grantFoundingStatus`
(`lib/founding/status.ts:280-281`, `:352-353`) to stamp **lifetime** `locked_rate_cents` /
`locked_take_bps` on every Founding Business minted by the beta-founder grant (ADR-875/880) — a path
that is not a checkout, which is exactly why "no checkout reads them" was true and its conclusion
false. Corrected in place. A stale comment does not merely fail to help; it actively steers the next
careful reader wrong.

### 6.15 — ✅ FIXED: the one member-shell contrast failure that was not an accepted waiver

The member shell's 9 serious+ elements (7 on `/feed`, 2 on `/settings`, dawn-light) resolve into
three groups once you read the actual axe output rather than the counts:

| Element | Painted | Verdict |
| :--- | ---: | :--- |
| `.bg-primary/10` label — `primary-strong` on the tint | **4.45:1** | 🔴 **real, and now fixed** |
| `button[aria-label="Create"]`, profile link — `#FFFFFF` on `primary` | 2.52:1 | already **waived** in `check:contrast` (owner palette decision) |
| `.text-success` ×2 — `success` on `success-bg` | 3.87:1 | already **waived** |
| `.sm:hidden` (21.3×34), `.-bottom-1` (19.1×19.1) | — | `target-size`, genuinely open |

So **most of the shell's "regression" is the palette debt the owner already accepted**, surfacing for
the first time because these two surfaces had never been audited. Only one was a live defect.

**The fix, and the hole it came through.** `primary-strong` on a `bg-primary/10` tint painted
**4.45:1** against a 4.5 floor — short by 0.05 — while every declared pair in `check:contrast` passed.
The gate could not have caught it: it modelled a translucent **foreground** (`alpha`, added for the
focus ring) but had no way to express a translucent **ground**. Shipped here: `bgAlpha`/`bgOver` on the
pair shape, the pair declared, and `--color-primary-strong` moved `#9A5E12` → `#965C12`, which clears
it at **4.62:1** and is imperceptible.

⚠️ **The declared ground is a literal, deliberately.** The natural entry is *primary @10% over canvas* —
exactly what `bgAlpha` was added for — but that composites to **#F8EEE0** while the browser painted
**#F8EAD6**. The element does not sit directly on the canvas. Writing the computed value would have
produced a **passing 4.58:1 for a panel that renders 4.45:1**: a second entry measuring the declaration
instead of the paint, which is the precise defect the focus-ring note in that file was written about.
The literal is attributed to the run that observed it, and carries an instruction to replace it with
the `bgAlpha` form once the real stack is identified.

Proven both ways: the gate reports **4.45:1, short by 0.05** before the token change and passes after.

### 6.16 — `check:gate-parity`, the 25th gate to land (there are 27 now)

`check:menu` is strict about the catalog's **shape** and cannot read a `requireAdmin()` inside a page
body, so a row promising a tool to a population its page rejects passed every gate in the repo.
Measured: **11 of 61** comparable rows disagree, in two asymmetric directions — *menu promises, page
denies* (a dead menu item) and *page allows, menu hides* (a tool its authorized users cannot find).
"Comparable" is the gate's own `compared` counter, so the run line reads back the same pair: **61 of
66 catalog row(s) compared**. The five it skips are rows whose href has no page or whose page makes
no `requireAdmin()` call, which are other gates' jobs. Re-check with `pnpm check:gate-parity`.

The gate does **not** pick a side; which is right is a product call. The eleven are frozen with
today's numbers and a reason each, and it fails on a **twelfth** — or on a frozen row whose numbers
*move* without being fixed, since half a fix is how these accumulated.

⚠️ **Its first version was broken and green**, which is the part worth keeping. The regex used
`[^{}]`, which stops at the nested `adminGroups: [{ … }]`, so it matched nothing, printed
**`0 of 0 ✓`** and exited 0. A gate that scans nothing passes everything. `MIN_ROWS` now turns an
under-scan into a failure — the same guard `check:adoption` and `check:labels` already carry, for
the same reason, which is why those two have it.

### 6.17 — ⚠️ `literal-radius` is unblocked, and it is still not a find-and-replace

6.9 made the roles equal the steps, so `rounded-lg → rounded-control` and `rounded-2xl →
rounded-card` are now **pixel-identical in the default skin**. That covers **1,818 of 2,450** sites
(74%). It is tempting to read that as "run a codemod", and I wrote exactly that in the row above
before catching it.

**A value match is not a role match.** `rounded-2xl` on a *button* is 24px today and would become
`rounded-card` — pixel-identical right now, and **wrong the moment any skin retunes card and control
by different amounts**, which is the entire purpose of having two roles. Midnight already does
(0.75× vs 0.63×), so the divergence is not hypothetical; it is one skin away.

`globals.css` made this exact point about the other direction and it is why the steps were ported
rather than swept: *"a sweep would have had to pick a value per site, and the value it would have
encoded is the wrong one."* Same trap, mirrored.

**What the sweep actually needs** is a per-site judgement of what the element IS — control, card,
pill, or none of the three — which a regex cannot make. The remaining 632 sites (`rounded-xl` 307,
`rounded-md` 275, `rounded-sm` 5, `rounded-3xl` 44) have **no matching role at all** and are a
separate question: either they are deliberate one-offs, or the role set is missing a step.

⚠️ I also claimed `rounded-full → rounded-pill` was the one safe mechanical conversion. It is not,
and the reason is the same one again. The single remaining occurrence is a **spinner**
(`components/layout/notification-bell.tsx:135`). The swap would be pixel-identical forever —
`--radius-pill` is `9999px` in every block — but it puts a **control** role on a decorative circle,
which is the mislabel this very item warns about, and its only effect would be moving a number in a
ratchet by one. Left alone.

**So the mechanical subset of `literal-radius` is empty.** Every one of the 2,450 needs the same
per-site judgement. That is worth stating plainly, because "74% is pixel-neutral" reads like most of
the work is free, and none of it is.

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

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 7.1 | ⚠️ **The 26 is not reproducible; a scoped re-scan finds ~8** | S | Re-measured 2026-08-10 over `app/` + `components/`, operator paths excluded, comments stripped. A raw pass returns **97**, but the overwhelming majority are import specifiers (`@/lib/gems`), routes (`/broadcast`), and DOM ids (`broadcast-scope`, `achievement-unlocked`) — identifiers, not copy. Filtering those leaves **16**, of which about half are the scanner matching CODE through a `>…<` JSX-text pattern. The genuinely member-readable set is roughly **eight**: `invite-launcher` "the zaps are yours" · `claim-button` "Offer unlocked:" · `upgrade` "All features are unlocked" · `achievement-toast` "Achievement Unlocked" · `journey-export` "a Hook cohort" · two in `pages/sequences` (a `cohort` and an em dash) · and one more. ⚠️ `broadcast/actions.ts:38` "Only staff can broadcast globally" is the **verb** and is correct copy. Several of the rest sit on `/pages/sequences` and `/upgrade`, where member-vs-operator is a judgement call per string, not a sweep. |
| 7.2 | ⚠️ **Needs an AST, not a regex — measured** | M | The 97→16→~8 funnel above is the evidence. A regex scan cannot tell `@/lib/gems` from "the zaps are yours", nor JSX text from code that happens to sit between `>` and `<`. Three filters (drop `@/`-and-`/`-prefixed, require a space, drop all-lowercase token runs) got the noise from 97 to 16 and no further — the residue needs real JSX parsing to separate text nodes and string literals from expressions. Sizing raised from S to **M**. Until it exists, `lib/menus/canon.ts` (ADR-957) remains the only enforced canon on the write path, and `check:canon` still covers `content/**` and marketing source. |

> `check:canon` scans `content/**` only, which is why every canon break found by this scan and the
> two before it was outside its scope. `lib/menus/canon.ts` (ADR-957) already solved the DB half of
> this problem by moving the guard to the write path; this is the JSX half.

### 7b. Docs cleanup

202 docs, 67,945 lines, and **five files describe themselves as the single source of truth**.

| # | Item | Size | Detail |
| :--- | :--- | :---: | :--- |
| 7.3 | ~~**Add the missing superseded banners**~~ ✅ **DONE** | XS | This row said `MASTER-PLAN.md`, `CHECKLIST.md` and `PATCH-LIST.md` have none. Verified 2026-08-11: **all twelve** legacy plans carry the banner, each added 2026-08-10 under ADR-960, including those three at line 3 of each file. The row was stale, not the tree. |
| 7.4 | **Re-derive the stale baseline tables** | XS | Both live plans quote numbers the ratchet has moved past (§8). Generate from `scripts/adoption-baselines.json`; never hand-maintain. |
| 7.5 | **Fix the ADR record** | S | Seven numbers (088–094, 090 three times) each name two or more decisions; ADR-219 is still "Accepted" after ADR-305 retired it; `ARCHITECTURE.md` documents two cron endpoints deleted by ADR-305. |
| 7.6 | **`tsconfig` excludes `scripts/`** | ~~XS~~ **M** | The CI guard test files vitest runs are never typechecked. 🔴 **Re-scoped 2026-08-10 after attempting it: this is not a one-line change, and the rationale it was filed under is wrong.** See below. |

**7.6, measured.** Deleting `"scripts"` from `tsconfig.json`'s `exclude` surfaces **46 errors across 12
files**. Fourteen of them are `TS5097` in `scripts/*.mts` — those files import each other with explicit
`.ts` extensions, which is legal under the `tsx` loader they actually run on and illegal under the app's
config. That is a genuine incompatibility between two module systems, not a batch of small fixes, and it
cannot be resolved by editing the test files.

Scoping to `scripts/**/*.test.ts` through a separate `tsconfig.scripts.json` looked promising and was
**abandoned deliberately**: of the 34 errors it reported, several were artifacts of that config rather
than defects in the tests (`Cannot find name 'node:fs'`, `Unused '@ts-expect-error' directive`). Editing
tests to satisfy a misconfigured checker is the same failure this plan keeps naming elsewhere, one level
up: an instrument that reports something other than what it claims to measure. A correct version needs
the `types`/module resolution settled first, and that is the M, not the edits.

⚠️ **The stated benefit does not hold either.** This row was justified as what "would have caught the
`check:gate-parity` regex bug at compile time". It would not. That bug was a regex matching zero rows —
well-typed, and wrong at runtime. What caught it was the `MIN_ROWS` floor, and what generalises from it
is more floors, not more typechecking. Keep the row for its real (smaller) benefit: guard tests are
program code and should be typechecked like the rest.

### 7d. The two open product calls, with the evidence and a recommendation

Both were left as open questions. Neither needs research any more — here is what the code says and
what I would do.

| Call | Evidence | Recommendation |
| :--- | :--- | :--- |
| ✅ **`library_usages`** — DONE, deleted (ADR-979) | **Nothing has ever written to it.** Zero inserts in the creating migration or anywhere since, so rebuilding gives an empty table and the control still shows nothing. | **Deleted.** `listSplashUsages`, `SplashUsage`, `UsageList`, `liveUsageRef`, the two `usagesBy*` maps, both `<Field label="Used in">` blocks, and `splashUsageHref` **plus its six tests** — its only consumer was `UsageList`, so keeping it would have been dead code carrying passing tests. Rebuild it *with* LIBRARY.md D4. |
| ✅ **`/admin/library`** — DONE, its own section (ADR-979) | Filing it under an existing section is the wrong fix: `adminHeaderMenu()` stamps the SECTION's gate onto every item, so Growth would offer a janitor tool to hosts and Operations would drop it for a marketing-domain janitor. | **Its own `ADMIN_NAV_SPECS` row** — `min: 'janitor'`, `staffDomain: 'marketing'`, no groups; the shape `/admin/qr` already has. Three tests pin it. ⚠️ The first gate test asserted `staffDomain` only, so flipping `min` left it green — it now asserts **both** axes, verified by flipping each. |

### 7c. Owner actions, collected

Everything on this list is config or a decision — no code unblocks it.

| Owner action | Blocks |
| :--- | :--- |
| Delete `PW_REQUIRE_SHELL` from **Secrets** | Diagnosing 1.1 (logs are redacted to `***`) |
| Create the beta test account + `PW_STORAGE_STATE` secret | 44 of 84 a11y tests + the whole member-shell visual suite |
| Create the Vercel Protection Bypass secret → `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview e2e validity (suites currently test the interstitial) |
| Flip **`pr-compare`** to required (that is the whole list, see §1.6) | Phase 1 sign-off |
| `/the-lab` + `/spaces` meta descriptions | 3.3 — a copy decision, not a trim |
| **White-on-amber button text** | The DS artifact shows white on `#E2912F`; shipped is ink. Ink measures **7.35:1** (AA + AAA), white **2.52:1**. White cannot ship without failing `check:contrast` and degrading every primary button. Either darken the amber (~`#8A5410` puts white at 6.26:1 — a real brand shift) or correct the artifact |
| 🔴 **Amber as DISPLAY TEXT** (new, 2026-08-11) | ~30 marketing sites render `<span className="text-primary">` as the accent word inside a display heading. Measured: **2.18–2.86:1 against a 3:1 bar** — it fails the *large-text* floor, so no size or weight rescues it. This is NOT covered by the 2026-08-06 white-on-amber ruling: that waiver is scoped in words to a "decorative fill", and `--color-primary-strong` (`#965C12`) already exists as the ink-safe amber and is already used for the links directly beneath these headings on the same pages (5.19:1 on white, 4.50:1 on the canvas band). Either swap the heading accents to `-strong` (a visible but consistent brand change that moves every marketing visual baseline) or waive it explicitly. Until then it stays counted as debt inside the a11y baselines |
| Greyed-emoji tuning (`grayscale` vs `saturate-50`) | Reaction selector rest state |
| ~~Recruit 5 test users per quarter~~ 🅿️ **PARKED by the owner 2026-08-11** | Lift 1. Not dropped: see the note below for the resume condition |
| Re-run the two Stripe pricing syncs | Collective/Independent checkouts currently dead-end |
| ~~Set `CRON_HEARTBEAT_BASE_URL`~~ ✅ **DONE 2026-08-11**, then ⏳ **upgrade Healthchecks** | See the note below: the free tier holds 20 checks and there are 27 jobs |
| Submit `sitemap.xml` to Search Console + Bing | Crawl coverage |

### 🅿️ The moderated research round is parked, and Lift 1 stays at zero until it is not

**Owner decision, 2026-08-11.** The quarterly round (`docs/research/PROTOCOL.md`, UX-MATURITY Lift
1b) is deferred. Recorded here rather than dropped, per ADR-921's rule that deferred work lives on
the list with its prerequisites attached or it is not deferred, it is lost.

**What it is, so the next reader does not have to go looking.** Five members, one hour each, once a
quarter, against the Vercel preview of a `design-sync/*` branch. Never production, never localhost.
The owner's part is §2 and the protocol calls it "the only genuinely human step in this lift":
pull the pool from `/admin/beta`, check each member's `analytics` consent scope, send **8 invites to
land 5 sessions**, aim for 3 members + 2 operators so J5 gets observed twice, and grant Zaps within
24 hours with the reason `Research round YYYY-QN`. Roughly two hours per quarter.

**Resume condition:** the owner calls it. There is no engineering prerequisite and nothing else
blocks on it being scheduled.

**What stays true while it is parked, and is not a defect:**

- ⏳ **Lift 1 sits at literal zero.** `docs/research/findings/` holds only its `README.md`. No
  engineering closes this one, which is why it is a decision rather than a task.
- 🔴 **There is no gate, and this bullet used to claim there was.** It read "`check:research-freshness`
  is built and advisory, so the staleness is visible on every run". The script existed but ran in
  **no** workflow, and its output ended *"Nothing a PR can fix, which is why this exits 0"* — it was
  structurally unable to fail. Deleted 2026-08-12 (ADR-1011). Failing a build on a recruiting
  decision is how a gate becomes something people route around (ADR-970), but the answer to that is
  no gate, not a gate that cannot fire and four docs that say it does.
- ⚠️ **The DAWN handoff carries the gap honestly.** `design_handoff/SYNC.md` standing rule 1 requires
  every outbound handoff to carry a "What users tripped on" section and never omit the heading.
  While the round is parked, that section reads: *"No moderated round has run yet. See
  docs/research/PROTOCOL.md."* It is a fixed line now rather than one a script emits.

### 🔴 `.dark [data-skin="midnight"]` never matches on the `<html>` path

Found 2026-08-11 while reconciling the a11y ratchet, and **verified two ways** rather than inferred.

`app/globals.css:711` is a **descendant** selector: `.dark [data-skin="midnight"]`. `data-skin` is
stamped in two places, and the selector only reaches one of them:

| Where `data-skin` is set | Matches `.dark [data-skin=…]`? |
| :--- | :--- |
| `components/layout/app-shell.tsx:1961`, the shell root, a descendant of `<html>` | ✅ yes |
| `app/layout.tsx:144`, the bootstrap script, on `document.documentElement` itself | 🔴 **no** |

A descendant combinator cannot match an element against itself, so the `<html>`-level skin, which
is how a skin is previewed globally including on marketing pages, **never gets its dark palette**.
Light mode is unaffected: `:575` is the bare `[data-skin="midnight"]`, which matches both.

⚠️ **The comment at `app/layout.tsx:142-143` asserts the opposite**, in as many words: *"the skin
CSS selectors match both `<html>` and the shell div."* True of the light rule, false of the dark
one, which is why this survived.

**Consequence.** On the `<html>` path, midnight dark renders a *mixture*: the generic `.dark`
palette with midnight's light-mode overrides layered under it. That is a plausible reason `/spaces`
midnight-dark reports 6 axe violations where dawn-dark reports 2, though that link is **not proven**.

**Not fixed here on purpose.** The fix is one selector, but it changes which colours paint on every
midnight-dark surface, so it moves visual baselines and wants its own pass with a recapture. Do it
as its own change, not folded into an unrelated one. `#f0ad4e` was deliberately left OUT of the a11y
waiver list on the same reasoning: a waiver for a colour nothing currently paints is noise, and a
test now asserts it stays out.

### ⏳ Upgrade Healthchecks.io, or 7 cron jobs go unmonitored

**Owner action, carried 2026-08-11.** `CRON_HEARTBEAT_BASE_URL` is set in Vercel Production to a
Healthchecks.io **ping key** URL (`https://hc-ping.com/<ping-key>`), so each job auto-creates its own
check on first ping. `lib/observability/cron-heartbeat.ts:49` resolves `${base}/${jobName}` on
success and `${monitorUrl}/fail` on failure, which is Healthchecks' slug convention exactly.

🔴 **The account is on the free tier, which caps at 20 checks. `vercel.json` declares 27 cron jobs.**
The first 20 to ping win the slots and the remaining 7 are rejected. Which 7 lose is decided by
schedule order, not by importance, so today the outcome is arbitrary.

Two ways to close it:

1. **Upgrade** to the paid tier (~$5/mo at time of writing) and all 27 fit. Simplest.
2. **Choose deliberately** with per-job overrides. `CRON_HEARTBEAT_URL_<SLUG>` (SLUG = job name
   upper-snake, e.g. `CRON_HEARTBEAT_URL_PROCESS_QUEUE`) takes precedence over the base, so the
   20 that matter can be pinned and the rest left unmonitored on purpose rather than by accident.

⚠️ **Auto-created checks arrive with a 1 day / 1 hour period**, which is wrong for most of these.
`process-queue` runs every 2 minutes, so a 1-day period means it can be dead for the best part of a
day before anyone is paged. Set each period from the real schedule:

| Job | Schedule | Period |
| :--- | :--- | :--- |
| `process-queue` | `*/2 * * * *` | 2 min |
| `space-campaigns` · `space-drips` · `conversation-batches` · `publish-scheduled` | `*/5 * * * *` | 5 min |
| `season-go-live` · `embed-room-messages` | `*/10 * * * *` | 10 min |
| `nurture` · `event-reminders` · `space-follower-event-reminders` | `*/15 * * * *` | 15 min |
| `referral-release` · `embed-events` | `*/30 * * * *` | 30 min |
| `journey-drips` | `15,45 * * * *` | 30 min |
| `practice-lifecycle` | `5 * * * *` | 1 hour |
| the eight daily jobs | various | 1 day |
| `weekly-digest` | `0 14 * * 0` | 7 days |

**Suggested 20 if you take option 2**, ordered by what a silent death costs: `process-queue` ·
`billing-renewals` · `weekly-digest` · `season-go-live` · `lifecycle-triggers` · `event-reminders` ·
`space-follower-event-reminders` · `publish-scheduled` · `nurture` · `space-campaigns` ·
`space-drips` · `conversation-batches` · `journey-drips` · `journey-prompt` · `referral-release` ·
`enforce-retention` · `practice-lifecycle` · `event-occurrences` · `refresh-traits` ·
`summarize-vera-memory`. The seven left out are the embed jobs plus `demo-decay` and
`vera-owner-brief`: a late embedding degrades search quality, it does not lose money or break trust.

✅ **The second half of this is CLOSED — the guard is wired.** `check:cron-freshness` is what would
notice heartbeats going stale, and this paragraph said it *"runs in no workflow at all"* until
2026-08-12. It runs **weekly** in `.github/workflows/maintenance.yml:147` (the "Cron heartbeat
coverage" step, `node scripts/cron-freshness.mjs --markdown`), landed 2026-08-11 — which is exactly
where this text said it belonged, next to the ledger-parity check. `.github/workflows/ci.yml:148-150`
records why it is not in CI: half of what it measures is Vercel Production state, so on a PR that
half can only report NOT ESTABLISHED, for every author, every time.

⚠️ What is left is the owner half above: the pings themselves. A scheduled guard over unarmed
monitors reports coverage it does not have.

---

## 3. The one gap no phase closes

**Lift 1, the user-evidence loop, is at literal zero.** `docs/research/findings/` contains only a
`README.md` — no moderated round has ever run — and it has no machine gate (a
`check:research-freshness` script was written, ran in no workflow, could not fail, and was deleted
on 2026-08-12; ADR-1011).
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

---

## 9 · Product + performance audit (2026-08-11)

Two fan-out audits against the tree, every claim traced to a file:line. Recorded here rather than
fixed in the same pass, with the reason each was left.

### 9.1 — 🔴 Members pay Gems for things nothing renders

`/crew/store` writes `profiles.profile_border`, `profile_flair`, `custom_title`
(`app/(main)/crew/store/actions.ts:202-206`). The only reader is the Vault page itself
(`components/widgets/vault/vault-summary.tsx:55-73`), which prints them as text chips.
`app/(main)/people/[handle]/page.tsx:82-103` does not select any of the three, so a purchased
border or title never appears on the profile it was bought for. The help centre states the
opposite three times (`content/help/membership/the-gem-store.md:25,26,35`).

Same doc `:28` advertises membership credits; `lib/store/fulfillment.ts:20-22` classifies them
`refuse` and the action returns "Membership credits aren't redeemable yet."

Any other SKU falls to `pending` (`fulfillment.ts:26`), charges the Gems, shows "Recorded ✓", and
lands in `store_redemptions` — which **no operator surface lists**. `/admin/store` reads it as
`{ count: 'exact', head: true }` only. A member pays for a perk no human is ever shown.

**Owner call, not a code fix:** render the cosmetics, or stop selling them.

### 9.2 — ⚠️ Notification links that land on `/feed`

`components/layout/notification-bell.tsx:32-52` ends `return '/feed'`. Four types carry a usable
`reference_id` and fall through it: `conversation_reply`, `crm_inbound_reply`, `gift_received`,
`achievement` — plus `reference_type === 'post'`, which returns bare `/feed` despite having the id.
Small, self-contained, and every one is a click a member makes and gets nothing from.

### 9.3 — ⚠️ Truncation reported as a total

`/search` caps people at 24 and posts at 20 with no cursor (`app/(main)/search/page.tsx:123,138`),
then computes the tab count from the truncated arrays (`:218`, rendered `:271`). A common first name
shows "People 24" as though that were the answer. Message threads hard-stop at 100 with no
load-older control in either `components/messages/thread.tsx` or `components/rooms/room-thread.tsx`.

### 9.4 — ⚠️ `/settings#payouts` is a dead link for every host while billing is off

The menu item is gated on `canReceivePayouts` (`components/layout/app-shell.tsx:336`); the card it
points at additionally requires `payoutsLive()` (`app/(main)/settings/billing/section.tsx:58`). With
billing off the anchor does not exist in the DOM. The "Payouts aren't turned on yet" copy at `:116`
is unreachable for the same reason.

### 9.5 — 🔴 Eight Space sub-tabs canonicalize to the profile root

`app/(main)/spaces/[slug]/layout.tsx:62,77` hardcodes `canonical = '/spaces/' + slug`, and no
descendant defines its own `generateMetadata`. So `shop`, `reviews`, `calendar`, `community`,
`book`, `collaborators`, `[page]` and `profile-preview` all emit the root canonical and the same
title: they are self-declared duplicates and can never index. The shop/reviews/calendar tabs are
exactly the content a LocalBusiness profile wants ranked. The same inherited *indexable* block also
lands on `/manage`, `/settings/*` and `/crm/*`, which appear in neither `robots.ts` nor
`PROTECTED_PATHS`.

### 9.6 — ⚠️ Six discover pages declare `revalidate = 3600` and then void it

`app/discover/{page,events/page,circles/page,places/[citySlug],cities/[citySlug],events/in/[city]/[category]}`
each export `revalidate = 3600` and then call `supabase.auth.getUser()`, which is a dynamic API and
opts the route out of static rendering. `app/discover/layout.tsx:17-22` diagnoses this exact bug and
fixes it for the layout via `authMode="client"`; the pages were not converted.

**Not a one-line fix, contrary to how it looks.** The `isAuthed` it computes is threaded into
`CircleCard`/`EventRow`/`PostPreview` (`components/discover/cards.tsx:49,90,159`) where it selects
the link DESTINATION through `communityHref`. There is no client auth hook in the repo, so removing
the server read silently sends signed-in members to the anonymous destinations. It needs a client
auth read built first.

### 9.7 — ⚠️ `check:seo`'s coverage boundary, stated

It is filesystem-only and reasons about the static hand-written surface. It does **not** check:
dynamic `[slug]` routes at all · JSON-LD · canonical *correctness* (9.5 is invisible to it by
design) · `openGraph`/`twitter` · runtime auth exceptions. It builds its private set from
`robots.ts` ∪ `PROTECTED_PATHS` (`scripts/check-seo.mjs:425`), so `/events/calendar` — public via
`proxy.ts:157-163`'s exception branch, indexable, and absent from the sitemap — reads as private and
is skipped.

### 9.8 — ⚠️ a11y beyond axe

One genuine keyboard trap: `components/admin/messaging/messaging-console.tsx:330-337`, a `<tr>` with
`onClick` and `aria-expanded` but no `tabIndex`, no `role`, no key handler — it announces an
expandable control that cannot be operated. Six icon-only buttons of 297 lack an accessible name
(the rest carry one). Six hand-rolled panels declare `role="dialog" aria-modal="true"` without using
`components/ui/dialog.tsx`, so none traps focus or handles Escape though all promise it.

### 9.9 — ⚠️ N+1 in the sitemap

`app/sitemap.ts:386-388` issues one `listShowsForSpace` per networked Space, inside a route whose
`try/catch` degrades to `[]` — so a timeout silently drops every podcast URL from the index. This is
in the DB-driven section `check:seo` explicitly trusts without verifying (`check-seo.mjs:16-19`).


### 1.10 — ✅ `pr-compare` is no longer a stale-baseline problem, and the radius scare was wrong

Run `31445440131` on `b606814`, the first full evaluation after the radius correction and the
viewport fix:

```
71 passed · 4 failed · 1 flaky
✅ App shell covered: 3/3 surfaces, 12/12 checks.
```

🔴 **The claim that the radius correction "moves corners app-wide, so one recapture is owed" was
wrong, and it was repeated twice.** Every marketing baseline passes. The role tokens live in the app
shell and the kit; marketing composes literals, which is exactly what the earlier capture showed and
what §6.9 records. Nothing about the radius change drifted the public site.

**`/feed`'s viewport capture works.** It failed all four checks before and passes all four now, which
settles §1.9 on its visual half.

**The four failures are `/settings`, in both modes × both viewports, and they are a TRUE POSITIVE.**
`app/(main)/settings/page.tsx:11` renders `NotificationsSection`, which renders `NotificationsForm`
(`settings/notifications/section.tsx:108`) — and the digest decision removed the Frequency column
from that grid, taking a whole column out of the layout. The suite caught an intended change, which
is the instrument doing its job rather than failing.

**So the remedy is a recapture, and this time it is the right remedy** (ADR-980's rule: a visual
baseline is descriptive, and recapture is the whole fix for a described change). One
`e2e-manual.yml → update_baselines` run re-freezes `/settings`.

⚠️ **After that, `pr-compare` is promotable to a required context.** The vacuous-green hole that
blocked promotion is closed — a missing bypass secret now SKIPS the job rather than passing it. The
secret is demonstrably set, since this run executed rather than skipping.

---

### 9.10 — 🔴 `pr-compare`'s first red run as a required context was an incomplete waiver list, not a regression

Run `31456580742` failed exactly three tests, all `/discover`, each **1 over baseline**. The visual
half passed completely (`76 passed`, `3/3 surfaces, 12/12 checks`).

| Element | Painted pair | Ratio / bar | Verdict |
| :--- | :--- | :--- | :--- |
| 2 × status chip (`CircleCard`) | `#b07515` on `#f6ecd8` | 3.31 / 4.5 | ✅ waived — already a frozen `check:contrast` pair at floor 3.32 |
| 1 × embossed small button | `#ffffff` on shadow `#c07b28` / `#b97124` | 3.43 / 3.84 vs 4.5 | ✅ waived — same button family, a composite the large-CTA entries missed |
| 2–3 × `.text-primary` heading accent | `#e2912f`/`#d9852a` on white / canvas | 2.18–2.86 / 3.0 | 🔴 **still counted** — see the owner action in §7c |

**The cause was one sentence.** `a11y-baselines.json` closed with "NOT WAIVED, and staying failed on
purpose: amber as DISPLAY TEXT …, the watermark numerals …, **and the tinted chips on /discover**.
The owner's decision covers a white label on an amber FILL." The first two clauses are right. The
third grouped an unlike thing under a justification that does not govern it: the chips are
`--color-warning` on `--color-warning-bg`, and their sibling the **success** chip had already been
admitted to the waiver list on exactly the `check-contrast.mjs`-frozen-pair citation. Two identical
things, two different rules.

The test that settled it — *does waiving it let anything escape?* No: the pair is already ratcheted
in the instrument that owns token pairs. Counting it a second time here bought no accountability.
Net −2 chips and −1 emboss per context, **with no baseline re-frozen**. PR #2087.

### 9.11 — ⚠️ `CircleCard` asks for `p-5` and paints `p-6`

`components/discover/cards.tsx:51` passes `className="h-full p-5 …"` to `Card`, whose own template is
`` `rounded-2xl p-6 ${tones[tone]} ${className}` `` — a plain string join, not `cn`. Both utilities
land on one element, Tailwind emits `p-5` before `p-6`, so **`p-6` wins and the author's `p-5` does
nothing.** axe's selector for the chip inside it shows the collision directly: `.p-5.p-6`.

The component's own comment, four lines up, names this exact hazard for the `highlight` tone: *"A
tone rather than a className override, so the border width cannot depend on which utility Tailwind
happened to emit last."* A caller two files over walked straight into it.

Cosmetic only (the circle cards render one step roomier than intended), but it moves `/discover`'s
visual baselines in every state, so it is deliberately **not** bundled into the CI-unblocking PR.
Same family as the `Input` inset collision from the sweep round: the fix is a variant on the
primitive, not a className override at the call site.

### 9.12 — ⚠️ `Skeleton` is the second instance of the §9.11 collision, at 52 of 329 call sites

`components/ui/skeleton.tsx:15` hardcodes a radius and joins `className` after it:

```
className={`animate-pulse rounded-control bg-border-strong ${className}`}
```

Of **329** `<Skeleton>` call sites, **126** pass a radius of their own, so on every one of them two
`border-radius` utilities land on one element and the winner is whichever Tailwind emitted last:

| Caller passes | Sites |
| :--- | ---: |
| `rounded-2xl` | 36 |
| `rounded-pill` | 33 |
| `rounded-xl` | 17 |
| `rounded-lg` | 15 |
| `rounded-card` | 10 |
| `rounded-3xl` | 6 |
| `rounded-none` | 6 |
| `rounded-t` | 2 |
| `rounded-md` | 1 |

✅ **RESOLVED and FIXED 2026-08-11 (PR #2090).** Measured first — it IS a bug, at 52 sites,
not 126 — then fixed by making the default radius CONDITIONAL in `components/ui/skeleton.tsx`
rather than by adding a `radius` prop. Suppressing the default when the caller names one
repairs all 52 and leaves all 74 working sites byte-identical, with zero call-site churn; a
prop would have meant editing 126 call sites and would still lose silently for anyone who
kept using `className`. Pinned by `components/ui/skeleton.test.tsx`, 13 assertions drawn from
BOTH sides of `rounded-control` in the emission order — a test against one caller had a
coin-flip chance of catching this.

The built stylesheet emits `border-radius` utilities **alphabetically**:

```
rounded-2xl → rounded-3xl → rounded-card → rounded-control → rounded-full
→ rounded-lg → rounded-md → rounded-none → rounded-pill → rounded-sm → rounded-xl
```

Later wins, so `rounded-control` beats exactly the three that sort before it — and only those:

| Caller passes | Sites | Result |
| :--- | ---: | :--- |
| `rounded-2xl` | 36 | 🔴 paints 14px, not 24px |
| `rounded-card` | 10 | 🔴 paints `--radius-control` |
| `rounded-3xl` | 6 | 🔴 |
| `lg` / `xl` / `md` / `pill` / `none` / `t` | 74 | ✅ sort after, caller wins |

So **52 of 329** call sites paint a radius nobody asked for, and the other 74 were always fine.
Visible cost: `app/(main)/lead/loading.tsx:17,23` and
`components/spaces/dashboard/space-dashboard.tsx:292,299` render placeholders with tighter corners
than the cards that replace them, so those surfaces **snap their corners on hydration**.

**Still not fixed here, and now for a different reason.** The fix is the same shape as §9.11 (a
`radius` prop on the primitive), but it changes rendering at 52 sites and would invalidate a
baseline capture that was already in flight when this was settled. It wants its own PR and its own
capture. Adopting `tailwind-merge` in `cn()` would close the entire class — `lib/utils.ts:4-6` is
a plain `.filter(Boolean).join(' ')` — but that changes the semantics of a helper used in hundreds
of places and is not a drive-by.

The original reasoning, kept because it is why this was measured instead of swept: Unlike §9.11 — where `p-6` provably
beat `p-5` because Tailwind orders the numeric padding scale ascending — the radius scale here
mixes THEME tokens (`--radius-control/card/pill`, declared at `app/globals.css:195`) with built-in
steps (`lg`/`xl`/`2xl`/`3xl`/`none`/`md`). Which side wins depends on emission order in the built
stylesheet, which cannot be read off the source.

Deciding it needs the production CSS: find the chunk carrying the `border-radius` utilities and
compare the byte offset of `.rounded-control` against the others. If the callers win, this is a
latent hazard to document and gate; if `rounded-control` wins, 126 loading skeletons are painting
a radius nobody asked for. **Do not sweep it until that is measured** — a blind fix would change
126 call sites' rendering on a guess.

The durable fix in either case is the one §9.11 took: make the radius a prop on the primitive, so
no caller's intent depends on stylesheet order. `cn()` in this repo is a plain join with no
tailwind-merge semantics, so it cannot resolve this for you.
---

## 10 · Fan-out audit, 2026-08-11 (five parallel auditors, cross-artifact technique)

Deliberately a **different technique** from every earlier pass, which used source grep and gate
scripts. This one compared what each registry *declares* against what the build *emits* and what
the database *actually enforces* — because every real defect found tonight lived in exactly that gap.

Fixed in this round: §10.1, §10.2, §10.5, §10.6, §10.7 and the `Skeleton`/`Card` collisions.
Everything below that is **not** marked FIXED is open, with the evidence needed to act.

### ✅ 10.1 — 🔴 Forged friendships (FIXED, PR #2089)
`friendships_update_addressee_accept` declared an explicit `WITH CHECK`, which **replaces** the
USING-fallback for the new row. Identity columns were unconstrained; any member holding a pending
incoming request could rewrite it into an accepted friendship with any victim, which opens a DM
channel because `lib/messages/actions.ts` reads that row through the service-role client.
Fixed with a `BEFORE UPDATE` trigger (RLS cannot reference `OLD`, so no policy can express it).

### ✅ 10.2 — 🟠 Six browser-reachable `SECURITY DEFINER` RPCs (FIXED, PR #2089)
`members_near` (directory enumeration, unbounded radius, no auth check — 7 rows to anon while
`profiles` correctly returned 0), `record_qr_scan` (unauthenticated write, caller-supplied
`p_profile`, no rate limit), `profile_zap_total`, `match_/similar_library_assets`,
`search_handles_public`. **The first revoke did not work** — Postgres grants EXECUTE to `PUBLIC`
by default, so revoking from `anon`/`authenticated` was a no-op for four of six. Both migrations
kept, in order, as the record.

### ✅ 10.5 — 🔴 A 12-seat SKU could sell 6 (FIXED, PR #2089)
`store_items.stock` meant REMAINING to the trigger and the UI, TOTAL to both purchase gates.
Effective capacity `ceil(N/2)`, refusing at sale 7 while the card read "6 remaining".

### ✅ 10.6 — 🔴 Swallowed DM failures (FIXED, PR #2089)
### ✅ 10.7 — ⚠️ Store rank gate failed OPEN on an unknown rank (FIXED, PR #2089)

### 📏 A note on 10.8, 10.10 and 10.11 — why these three are still open (2026-08-11)

All three are BUNDLE-SIZE findings, and all three need the same thing to land safely: a
route-level first-load measurement before and after. This session could not produce one, and the
reason is worth recording rather than working around.

`next build` in the agent container completes COMPILATION (client chunks are emitted, which is how
§10.19 was diagnosed and verified) but fails during page-data collection: `/discover/cities/[citySlug]`
reaches `createAdminClient()`, and the container has no `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`. Without a completed build there is no app-build-manifest, so chunks
cannot be attributed to routes — and a bundle fix whose effect cannot be measured is exactly the
kind of change that gets reported as a win and is not one. The `analyze` CI job is CodeQL, not
bundle analysis, so it offers no substitute.

**Deliberately NOT worked around by fetching production credentials into this container.** The
remaining blocker is a measurement environment, not the fixes themselves; each fix already has a
named pattern in-repo (`next/dynamic` for 10.8, a DSN gate for 10.10, and the dynamic-import-inside-
an-effect that `marketing-header.tsx` already applies for 10.11).

### 🔴 10.8 — OPEN — The app shell statically imports the entire admin module registry
**Measured, with the chain:** `app-shell.tsx:81` → `admin-bar.tsx:7` → `settings-panel.tsx:13` →
`components/admin/modules/module-map.tsx` (`'use client'`, 38 static imports, and it has **no
hooks, no handlers, no browser APIs** — a pure registry marked client). That reaches
`lib/journey-plans` → `lib/practices` → `lib/automations` → `lib/unsubscribe-tokens` → `crypto`,
pulling a **406 kB raw / 121 kB gzip** chunk of `crypto-browserify`/`stream-browserify` polyfills
onto **every authed page**, verified as a blocking `<script src>` in served HTML.

**Fix:** make `module-map` lazy (`next/dynamic` per module, resolved when the admin bar opens);
have `settings-panel` import module *ids*, not components. Add `import 'server-only'` to
`lib/journey-plans` and `lib/practices` so this class of leak fails the build. The repo already
uses that guard in 10+ libs.

### 🔴 10.9 — OPEN — `revalidate = 3600` is dead on 8 public `/discover` routes
Verified against `prerender-manifest.json`: 207 of 221 caching declarations match the shipped
disposition; the 8 that don't are all SEO-critical. Three index pages call `createClient()` →
`cookies()` purely to compute an `isAuthed` boolean, which kills ISR **and** adds an auth round
trip per crawl. Four detail routes simply lack `generateStaticParams` — the correlation is exact:
every `/discover/[param]` route that has it lands in `dynamicRoutes` and works.

`app/discover/layout.tsx:17-22` documents this exact bug and fixed **itself** with
`authMode="client"`. The layout was fixed; the pages were not. `lib/supabase/public.ts` exists,
is cookieless, and is documented for precisely this.

**🔴 DO NOT "just remove the auth read" — I checked, and it silently breaks sign-in destinations.**

That is the obvious fix and it is wrong. The `isAuthed` boolean feeds `communityHref`
(`lib/community-href.ts:10`), which returns either `/circles/x` or `/sign-in?next=/circles/x`. The
tempting argument is that `/circles/*` is in `PROTECTED_PATHS` anyway, so a bare link would be
bounced to sign-in regardless and the `?next=` is redundant. **It is not.**

`proxy.ts:172-173` builds its redirect as `request.nextUrl.clone()` then `signInUrl.pathname =
'/sign-in'`. It rewrites the pathname and **never sets `next`**, so the destination is gone. The
capture-on-arrival cookie at `:91` is *first-touch attribution* (`fq_ref`, campaign, referrer) —
not the post-sign-in destination. `communityHref` is the only thing preserving it.

So restoring ISR on the three index pages needs one of two real decisions, neither a drive-by:

| Option | Shape | Note |
| :--- | :--- | :--- |
| **(a)** Make the proxy set `next=` on its sign-in redirect | small diff, but changes where **every** signed-out deep-link lands across 122 protected routes | strictly better product behaviour — today a signed-out visitor deep-linking anywhere loses their destination, not just from `/discover` — but it is an auth-navigation change and wants the owner's eyes |
| **(b)** Resolve `isAuthed` client-side | the `authMode="client"` pattern `app/discover/layout.tsx` already uses | no auth-behaviour change, but the cards are Server Components today and the boolean threads through `components/discover/cards.tsx` |

The four **detail** routes (`circles/[id]`, `events/[slug]`, `events/organizer/[handle]`,
`journeys/[slug]`) are independent of all this — they simply lack `generateStaticParams` and can be
fixed on their own, without touching auth.

### 🔴 10.10 — OPEN — Sentry ships on all 385 routes whether or not a DSN is set
`instrumentation-client.ts:9` imports `@sentry/nextjs` at module scope. The file's comment says a
DSN-less deploy ships no Sentry payload — true of *network* traffic, false of *bytes*. ~150 kB of
a 233 kB baseline chunk, on every route including every preview. Gate the import behind
`NEXT_PUBLIC_SENTRY_DSN`.

### 🟠 10.11 — OPEN — `@supabase/supabase-js` (223 kB raw / 58 kB gz) on 122 public pages, for a switched-off feature
`support-chat-widget.tsx:19` statically imports `@/lib/supabase/client`, and the marketing, help
and discover layouts all import the widget. It is env-gated and **never rendered in this build** —
Next 16 emits script tags for the route's whole client manifest regardless.
`marketing-header.tsx:68-82` already documents and applies the correct fix (dynamic import inside
an effect) for exactly this reason. ~17% of `/discover`'s first-load JS.

### 🟡 10.12 — HALF DONE — the podcasts canonical is fixed; the `(main)` layout is not
✅ **The podcasts canonical is already fixed** — re-read 2026-08-11: the page's `generateMetadata`
now routes through `spaceProfileMetadata(slug, { segment: 'podcasts', … })` like the other tabs, so
it self-canonicals. This entry was stale; no work is owed.

🔴 **Still open:** `(main)/layout.tsx` reads auth during render, forcing dynamic on the
highest-value indexable routes in the repo. This is the same decision as §10.9 — it changes
signed-out navigation — and is deliberately left for the owner.

### ✅ 10.13 — Six of 36 `MANAGED_ROUTES` rows were inert (FIXED, 2026-08-11)
Three use a `_` placeholder (`/spaces/_/crm`) against an **exact-key** lookup in `mergeChrome`, so
they never match a live path. Three more point at redirect stubs (`/people`, `/connections`,
`/friends`) whose live targets (`/network*`) have no row at all. The operator sets a rail
override, the row confirms "Saved", and nothing changes. `page-chrome.test.ts` has no test that a
`MANAGED_ROUTES.route` is matchable at all.

### ✅ 10.14 — Event dates rendered in two timezones (FIXED, PR #2090)
`lib/time/zone.ts` fixes the convention (wall-clock kept as UTC parts) and the event page obeys it.
`lib/utils.ts` `formatEventDate`/`eventDateBadge` omit `timeZone`, so they resolve in the runtime's
zone — invisible on the server, wrong in the browser. A 6:00 AM Aug 15 event reads **"Thu, Aug 14"**
in the ⌘K overlay and **"Fri, Aug 15"** on the full search page and the event page itself.

### ⚠️ 10.15 — OPEN — §9.1 confirmed and understated
All 5 borders, 5 flairs and 4 titles have exactly one reader: a text chip in the Vault summary.
Worse, the **13 SKUs actually on today's shelf** carry `metadata = '{}'`, so `classifyRedemption`
routes every one to `pending` — including five whose copy promises a visible profile change
(`waveform-border`, `callsign-plate`, `animated-banner`, `custom-title-slot`, `s1-flair-set`).
No fulfillment queue exists in the operator surface. One correction to §9.1: the *receipt* does
appear on the profile via `lib/profile/awards.ts`; the *effect* never does.

### ❌ 10.16 — RETIRED FALSE — `robots.ts` has NOT drifted
**Measured with the gate's own parser, not by eye: 32 DISALLOW entries vs 17 PROTECTED_PATHS, and
the set of protected prefixes NOT covered by a robots rule is exactly `['/events']`** — which
`app/robots.ts` documents as deliberate and `proxy.ts` implements in code (`isPublicEventView`
exempts `/events` and `/events/<slug>` from the redirect, so no crawler is 307'd there).

Since `proxy.ts` only ever redirects on a `PROTECTED_PATHS` prefix match, and every such prefix is
covered, there is no route that 307s a compliant crawler. The "~30-48 routes" figure counted
individual app routes rather than the prefix rules that already cover them.

What was true: the parity was asserted only in a comment. It is now a test in
`scripts/check-seo.test.ts` that computes the uncovered set and pins it to `['/events']`, plus a
companion asserting the exemption still exists in `proxy.ts` — so the two can never be changed
apart. The claim was always checkable; it simply was not being checked.

### ✅ 10.17 — FAQ questions rendered with no heading element (FIXED, 2026-08-11)
`marketing-ui.tsx:374-384` wraps each question in a `<span>` inside `<summary>`. Ten pages emit
`FAQPage` JSON-LD over a DOM with zero heading structure, against `CONTENT-VOICE.md` §8a ("H2s are
the literal questions people ask"). The sibling `Steps` primitive already uses `<h3>`. One line,
and the highest-leverage AIO fix on the list.

### ✅ 10.18 — `eventSchema` hardcoded USD and never said sold out (FIXED, 2026-08-11)
`lib/jsonld.ts:190-193`. `events.currency` is a real per-event column that neither the schema nor
its two callers pass, and `availability` reflects only `is_cancelled`, never capacity — so the page
renders "full" while the structured data says `InStock`. **The only outright page-vs-schema
contradiction found**, on the entity type answer engines quote most. The correct implementation is
730 lines away in the same file (`:924`).

### ✅ 10.19 — 🔴 THE MAPS WERE BROKEN (FIXED + VERIFIED, 2026-08-11)

The finding asked: "either the warning is stale or the maps are broken; both are worth one check."
**The maps were broken.** Every keyless environment — local dev, previews, CI, self-host, and any
production deploy without `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — painted a blank cream rectangle
with the marker still drawn on top.

It hid behind a version claim that was never true. Three source comments and `.env.example` all
said the project was "pinned to MapLibre 5"; `package.json` has declared `^6.x` for this repo's
whole history (#2076 bumped 6.1.0 → 6.2.0). Because everyone believed v5, the v6 escape hatch that
was needed read as an inert one that must stay unset — and `lib/maps/provider.test.ts` **asserted
the empty value**, so a test was pinning the defect in place while passing.

**The mechanism, corrected.** The notes blamed `import.meta.url`. That hop is fine:

| Hop | Resolver | Result |
| :--- | :--- | :--- |
| bundled code → worker | Turbopack rewrites `new URL('./maplibre-gl-worker.mjs', import.meta.url)` to the hashed asset | ✅ `import.meta.url` appears **0** times in the shipped chunk |
| worker → its sibling | nothing: the emitted worker is a byte copy, so its own `import … from "./maplibre-gl-shared.mjs"` is never rewritten | 🔴 **404** — the file ships as `maplibre-gl-shared.<hash>.mjs` |

Measured in headless Chromium against a real `next build`, serving the actual output:
`worker onerror: load failed`, `404 /_next/static/media/maplibre-gl-shared.mjs`.

**The fix**, and why not a downgrade: `scripts/copy-maplibre-worker.mjs` self-hosts both files,
unhashed and adjacent, into `public/maplibre/`, which is the only thing that makes that relative
specifier resolve. Downgrading to v5 was rejected — package.json was never on 5, Dependabot would
re-bump it, and nothing in `components/maps` needs a v6 API (the whole surface is
Map/Marker/Popup/LngLatBounds/NavigationControl/GeolocateControl/GeoJSONSource). CSP needed no
change: `worker-src 'self' blob:` already covers a same-origin worker.

**Verified after the fix, same harness:** both files `200`, worker starts, zero 4xx.

Committed rather than gitignored, so a deploy whose build command skips lifecycle hooks still
ships a working worker; `scripts/copy-maplibre-worker.test.ts` then owns the staleness risk that
creates, and fails a Dependabot bump until the copy is refreshed. Full write-up: `docs/MAPS.md` §4a.

**The lesson worth keeping:** the audit's own note repeated the repo's version claim instead of
reading `package.json`, and nearly filed a real outage as a documentation nit. Both halves of an
"either/or" finding have to be checked against the running system, not against the prose.
