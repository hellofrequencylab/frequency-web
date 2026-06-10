# Naming Canon 2026 — Code & Schema Inventory (Phase 0)

**Branch:** `naming-canon-2026` · **Date:** 2026-06-10 · **Read-only inventory — no renames performed.**

**Scope:** `lib/**`, `app/**`, `components/**`, `supabase/migrations/**`, `*.test.ts`, `next.config.ts`, `package.json`, `vitest.config.ts`, `.github/**`.
**Excluded:** `docs/`, `content/`, `node_modules/`, `lib/database.types.ts` (generated). Counts via `rg -i -w` unless noted.

**Topline:** 4 retired terms are already at zero (✅ old status set, "The Drop", "Field Day", `quest_chains` tables — dropped 20260609104000). The heavy lifts are the **rank set** (runner/operative/agent — ~160 hits incl. enum + 5 RPC redefinitions + seeded achievements), the **tier set** (spark/current/deep — ~90 tier-sense hits incl. 4 check constraints + seed rows), **Circle Field** (~90 hits incl. table, trigger, column, RLS), **domains→pillars** (~67 hits incl. table + FK), and **arc→quest clock** (~40 hits incl. one seeded row).

Status legend: ✅ already at target · ⏳ rename pending · ⚠️ collision care needed · 🔴 load-bearing risk.

---

## 1. Retired terms

### 1.1 `spark` (tier value) ⏳⚠️

| Hits | Location | Class | Note |
|---|---|---|---|
| 14 | `lib/journey-tiers.ts:2–28` + `journey-tiers.test.ts` | rename | `IntensityTier = 'spark'\|'current'\|'deep'`, `INTENSITY_TIERS`, guard fn |
| 10 | `components/journey/tier-meta.ts:17–22`, `tier-control.tsx` | rename | `TIER_META`/`TIER_ORDER`, member-facing labels Spark ⚡ |
| 8 | `components/studio/journey/journey-sections.tsx:124–126`, `journey-builder.tsx:44,423` | rename | studio tier picker |
| 3 | `app/(main)/journeys/actions.ts:279`, `[slug]/actions.ts:16`, `[slug]/page.tsx:241` | rename | server actions validate tier strings |
| 9 | migrations `20260609101000:19,44`, `20260609101500:16,22,27,30,32` | 🔴 rename | `check (tier in ('spark','current','deep'))` ×4 constraints + column comments |
| 18 | migration `20260609103000` (seed) | 🔴 rename | seeded `practice_tiers`/`journey_plan_items` rows store tier text — needs data UPDATE |
| 3 | `lib/streak.ts:18`, `app/(main)/people/[handle]/page.tsx:38,210` | ambiguous | "Spark" as streak-day-3 / 50-zap profile milestone label — different sense from tier? |
| 6 | `lib/demo/engine.ts:485`, seeds `20260607070000`, `20240119000000` | keep/moot | "Creative Spark" content titles; quest-chain seeds live in tables dropped by `20260609104000` |

**Total (word):** 55 hits / 14 files.

### 1.2 `current` (AS A TIER ONLY) ⏳⚠️ → `adept`

| Hits | Location | Class | Note |
|---|---|---|---|
| ~30 | same tier files as §1.1, plus `lib/journey-plans.ts:491,689` (fallback tier), `20260609103000:26–139` (~20 seed rows) | rename | tier value `'current'` → `'adept'`; includes `default_tier`/`default_intensity_tier`/`tier_override` defaults `'current'` in `20260609101500:15` |
| 214 | `.current` refs across lib/app/components | KEEP | React `useRef`/JS `current` |
| ~25 | `current_season_zaps/_gems/_rank/_field` columns (migrations `20240118`, `20240120`, `20240304`, `20260607040000`, `20260608060000`, `20260610000000`) | KEEP (column prefix) | time-sense "this season" — **but** `current_season_field` renames for its `field` suffix (§1.11) |
| ~270 | `getCurrentSeason`, "current page", etc. | KEEP | plain English / time sense |

**Total (word):** 541 hits / 181 files; only the ~30 tier-value hits rename.

### 1.3 `deep` (tier) ⏳⚠️

| Hits | Location | Class | Note |
|---|---|---|---|
| ~28 | same tier files/constraints/seeds as §1.1 | rename | `'deep'` tier value + "Deep 🏔️" label |
| 16 | `app/globals.css:82–92,224,305,320`, `lib/season-ranks.ts:72` | KEEP | `--rank-*-deep` color-spectrum tokens — unrelated |
| 2 | `lib/traits/compute.ts:145`, `registry.ts:369` | ambiguous | behavioral band `idle/shallow/moderate/deep` — internal analytics, not the tier |
| ~10 | "Deep work block" practice content (`20260606130000:41–154`, `20260609103000:26`), `lib/rewards/rules.ts:64` "Deep engager" | keep | English/content sense |

**Total (word):** 113 hits / 32 files; ~28 rename.

### 1.4 `runner` (rank) ⏳⚠️

| Hits | Location | Class | Note |
|---|---|---|---|
| 12 | `lib/season-ranks.ts:21,33,42,55` + `season-ranks.test.ts:5–6` | rename | `SEASON_RANKS`, `RANK_LABELS`, `RANK_ORDER` |
| 22 | migrations `20240115` (enum decl :27 + remap :40s + recalc), `20240118:223–229,356`, `20260607040000:77–83`, `20260608060000:16,62–68`, `20260605120000:121`, `20260603000003` | 🔴 rename | `season_rank_enum` value, recalc-rank `NOT IN (...)` text lists redefined in 4 migrations, achievement seed `rank-runner` :356, demo seed |
| 8 | `lib/demo/engine.ts`, `lib/demo/generate.ts` | rename | TS rank literals for demo roster |
| 2 | `lib/page-editor/templates/the-quest.ts:100`, `app/(marketing)/the-quest/page.tsx:64` | rename | member-facing rank copy "Runner · Showing up" |
| 4 | `lib/nurture/runner.ts` (+ `schedule.ts/.test`, `store.ts`, `app/api/cron/nurture/route.ts`) | KEEP | nurture sequence *runner* (ADR-131) — not the rank |

**Total (word):** 48 / 17 files.

### 1.5 `operative` (rank) ⏳

Same shape as `runner` — all hits are rank-sense: `lib/season-ranks.ts(.test)`, `lib/member-progress.ts(.test):2`, `lib/demo/{engine,generate}.ts`, `lib/rewards/rules.test.ts`, rank copy in `the-quest` template :101 + marketing page, `app/globals.css:308` (doc comment), and migrations (`20240115`, `20240118`, `20240120`, `20240229`, `20260605100000:7` comment, `20260605120000`, `20260607040000`, `20260608060000`, `20260610000000`) incl. achievement seed `rank-operative` (`20240118:357`). **Total (word): 51 / 19 files — all rename.**

### 1.6 `agent` (RANK ONLY) ⏳⚠️ → `beacon`

| Hits | Location | Class | Note |
|---|---|---|---|
| ~55 | rank-sense: `lib/season-ranks.ts(.test)`, `lib/demo/engine.ts:188–302`, `lib/member-progress`, `lib/circles/challenges.ts`, the-quest copy, migrations enum/recalc/reset_season weights (`when 'agent' then 1.0/3.0` in `20240120:152`, `20240229:67`, `20260608060000:114`, `20260610000000:142`), achievement seed `{"rank":"agent"}` `20240118:358`, `20260605120000:121`, `20260608110000:5` comment | 🔴 rename | rank value → `beacon`; reset_season/recalc text lists are live RPC bodies |
| ~40 | AI sense: `lib/studio/agent.ts`, `lib/studio/winback.ts`, `lib/ai/vera/agent-claude.ts` (+imports in vera/onboarding components), `lib/comms/send-gate.ts`, `agent_actions` table (`20240225000000`), `lib/marketing/market-read.ts:9` | KEEP | AI agents / Vera (ADR-028) |
| ~10 | `User-Agent` headers (`app/opengraph-image.tsx:23`, help OG, `20260608030000:28`, push registration), `AGENTS.md` refs (`.github/workflows/docs-drift.yml:29`, `app/globals.css:261`), `20260609104000:26` comment | KEEP | unrelated senses |
| 5 | `components/support/admin-ticket-controls.tsx:19,25,116` | ambiguous | human support staff called "agents" — neither rank nor AI; rename to "staff"? |

**Total (word):** 110 / 41 files.

### 1.7 "Seasonal Quest" (phrasing) ⏳

`quests` table **is** the season instance (verified: `20260608010000_quests_container.sql` creates it; `lib/quests.ts` is the read layer; legacy engine dropped — ADR-152 ✅). Only the *phrasing* retires.

| Hits | Location | Class | Note |
|---|---|---|---|
| 2 | `components/studio/journey/journey-sections.tsx:369,386` | rename | StudioField label + empty-state copy |
| 2 | `lib/quests.ts:1,52` | rename | comments |
| 2 | `lib/journey-plans.ts:64,274` | rename | doc comments |
| 4 | `app/(main)/journeys/page.tsx:129,139`, `journeys/actions.ts:346`, `crew/quests/page.tsx:50` | rename | member-facing "Seasonal Quests" heading + empty state |
| 1 | `app/(main)/crew/journeys/page.tsx:4` | rename | comment |
| 4 | migrations `20260608010000:2,13,57`, `20260609103000:6,93` | 🔴 rename | **seed row** `name = 'Seasonal Quest'` (`20260608010000:57`) needs data UPDATE; rest are comments |

**Total:** ~17 / 10 files.

### 1.8 `static`/`tuned`/`locked`/`live` (AS THE OLD STATUS SET ONLY) ✅⚠️

**Zero hits as a status set.** `journey_plans`/`practices` status is already `'draft'/'pending'/'approved'/'rejected'` (`20260605120000:44,47`, `20260609102000:16–17`).

| Term | Verdict | Note |
|---|---|---|
| `static` (45 hits) | KEEP | all Next.js rendering (`force-static`, `generateStaticParams`) + English |
| `tuned` (~40 hits) | KEEP | canon "tune in": `get_my_tuned_channel_ids()` RPC + channel-follow UX |
| `locked` | KEEP | zero status-sense hits |
| `live` (412 hits) | KEEP | `location_mode='live'` (`20260604185000:34`, connections), market-read `basis:'live'`, "go live" English |
| `live` | ambiguous | `components/studio/journey/journey-builder.tsx:113,189,264` — local celebrate state `'live'\|'review'` for publish flow; confirm not a status-set remnant |

### 1.9 "The Drop" ✅

**Zero hits.** Only generic English ("dropdown", `admin/engagement/page.tsx:37` "The drop tells you where to focus" — funnel sense, KEEP). SQL `DROP` (144 statements in migrations) — KEEP.

### 1.10 `arc`/`arcs` (game clock) ⏳⚠️ → quest clock

| Hits | Location | Class | Note |
|---|---|---|---|
| 12 | `lib/journey-arc.ts` (file, "The Arc clock" ADR-197) + `journey-arc.test.ts:10` | rename | file rename + exported concept |
| 6 | `lib/journey-plans.ts:18,506,693`, `lib/journey-rewards.ts:53`, `lib/journey-page-config.ts:26` | rename | imports + "Arc clock" comments |
| 9 | `components/sidebar/game-stats-dock.tsx:21,99,162–176`, `right-sidebar.tsx:94–109` | rename | `arc` prop key in dock data |
| 3 | `lib/quest-icons.ts:34`, `components/journey/season-progress.tsx:5–6` | rename | icon key + comments |
| 3 | `lib/gems.ts:17`, `lib/engagement/currency.ts:35` | keep | `'quest_complete'` source key kept for historical continuity (per THE-QUEST.md) — comment mentions "Arc" |
| 1 | `supabase/migrations/20260605100000:29` | 🔴 rename | **seed row** description `'Finished a multi-step Arc.'` — data UPDATE |
| 3 | rename-history migrations `20260604000000`, `20260604170000`, `20260604180000` + `app/(main)/crew/arcs/page.tsx:3` redirect | keep | history + back-compat redirect |
| ~8 | geometry/English: `components/marketing/vector-art.tsx`, `season-progress.tsx:96` circular arc, `app/discover/events/*` "frequency arcs", `about` template "The arc", `vera-welcome.ts:36` "mid-arc", `marketing-ui.tsx:531`, `app/page.tsx:124` | KEEP | not the game term |

**Total (word):** 48 / 22 files.

### 1.11 `quest_chains` ✅ (tables dropped)

Engine physically dropped by `20260609104000_retire_quest_chains_engine.sql` (tables, `quest_outcomes()` RPC, seeds — CASCADE). The apply-order blocker named in that migration is resolved: `app/(main)/admin/quests/page.tsx:11` + `actions.ts:10` now only *mention* it in comments. Remaining 38 hits / 11 files = historical migrations (`20240119`, `20260604000000/180000`, `20260607050000/060000/070000`, `20260603180007`) + comments (`lib/analytics/outcomes.ts:8,72`). **Class: keep (history); optional comment cleanup.**

### 1.12 `bolts` ⏳

| Hits | Location | Class | Note |
|---|---|---|---|
| 3 | `components/layout/app-shell.tsx:854,1538–1539` | rename | member-facing `title="Bolts (this season)"` / `aria-label="Bolts this season"` — should say Zaps |
| 6 | `components/sidebar/demo-notice.tsx:8,41,57`, `components/onboarding/welcome-art.tsx:96`, `components/ui/demo-badge.tsx:5`, `20240121000000:137` | KEEP | "lightning bolt" describing the ⚡ glyph (incl. seeded flair description) |

### 1.13 "Field Day" ✅

**Zero hits.**

### 1.14 "the Field" / "Circle Field" (game term) ⏳🔴 → "Circle Current"

| Hits | Location | Class | Note |
|---|---|---|---|
| 31 | `supabase/migrations/20260610000000_circle_field.sql` | 🔴 rename | `circles.current_season_field` column, `circle_field_transactions` table + 3 indexes, `after_circle_field_transaction()` trigger fn + trigger, RLS policy `"circle_field_transactions: members or public read"`, `reset_season()` zeroing, ":113 how the Field was built" |
| 25 | `lib/events/circle-field.ts` | rename | file, `CIRCLE_FIELD_AWARD`, `CIRCLE_FIELD_CHALLENGE_AWARD`, inserts |
| 7 | `components/circles/circle-field-standing.tsx` | rename | member-facing widget |
| 9 | `app/(main)/circles/[slug]/page.tsx:307–335` (rail key `'field'` in `DEFAULT_RAIL_ORDER`), `circles/admin-actions.ts`, `app/(main)/events/actions.ts` (4) | rename | rail map key + callers |
| 5 | `lib/achievements.ts:443` (4), `lib/circles/challenges.ts` | rename | challenge → Circle Field credit |
| 9 | migrations `20260609230000:11,67` (`resonance_public` comment), `20260610030000:70–71` (index), `20260611000000` (6), `20260612010000:1` | rename | follow-on schema refs |
| 2 | `lib/season-ranks.ts:1` "The Field game system", `20240115...:2` "→ The Field" | rename | the game-system name itself |
| 1 | `20260603000006:10` "circle fields are returned" | KEEP | generic columns sense |
| ~300 | form/DB "field(s)" everywhere else | KEEP | generic |

**Total game-sense:** ~89 hits / 14 files. Canon target "circle current": **0 existing hits** — clean landing zone.

### 1.15 `chorus` ⏳ → co-op

`lib/journey-chorus.ts` (+`.test.ts`) — circle co-op completion, ADR-199; `components/journey/chorus-strip.tsx`; `lib/journey-page-config.ts:26` widget key; `app/(main)/journeys/[slug]/page.tsx` (2); `lib/journey-chorus.ts:1` already glosses it as "circle co-op completion". **22 word hits (~60 incl. camelCase identifiers) / 5 files — all rename.** Canon `co-op/coop`: 1 existing hit (that gloss).

### 1.16 `domains` (game taxonomy) ⏳🔴 → `pillars`

| Hits | Location | Class | Note |
|---|---|---|---|
| 16 | `supabase/migrations/20260604010000_channels_domains_taxonomy.sql` | 🔴 rename | `public.domains` table + seed of 4 rows, `topical_channels.domain_id` FK + index, RLS policy "domains: public read", header comment "Channels = the 4 Domains" |
| ~25 | follow-on schema: `20260604190000` (practices link), `20260606130000/140000/150000`, `20260607060000` (dropped table), `20260608010000`, `20260609103000`, `20260604030000`, `20260608130000`, `20260609230000` | rename | `domain_id` columns/joins |
| ~45 | app reads: `lib/pillars.ts` (8 — already *presents* domains as Pillars), `lib/practices.ts` (12), `lib/journey-plans.ts` (12), `lib/discover.ts` (13), `lib/frequency-signature-data.ts:39` (10), `app/(main)/channels/page.tsx` (36), `circles/page.tsx` (9), `practices/*`, `journeys/[slug]`, studio practice-builder, `lib/demo/engine.ts`, `lib/core/staff-roles.ts` (7), `lib/staff.ts` | rename | `domain_id`/`domains` identifiers; UI mostly already says Pillar |
| 1 | `next.config.ts:48` `includeSubDomains` | KEEP | HSTS header — only web/DNS sense in scope; **no custom-domain table exists** in page-editor/studio ✅ |

**Total (word):** 67 hits / 24 files.

### 1.17 `deshi`/`sempai`/`sensei` ✅ (history only)

18 hits / 2 files — `20240110000000_season_ranks_and_zaps.sql` (original enum) + `20240115000000_rename_season_ranks.sql` (remap). **KEEP — historical migrations; do not edit.**

### 1.18 "points" (member-facing for zaps/gems) ⏳⚠️

| Hits | Location | Class | Note |
|---|---|---|---|
| 1 | `app/(main)/practices/page.tsx:37` | rename | public meta description "This is where the points come from" |
| 1 | `lib/onboarding/beta-script.ts:12` | rename | onboarding copy "rack up points" |
| ~6 | "Vault points log": `lib/zaps.ts:82`, `lib/economy/ledger.ts:1`, `20260607040000:9`, `20260607050000:9` | rename | internal name for the earn-history surface |
| 2 | `20240101000000:216` ("earn points" — crew_tasks comment), `20240110000000:9` ("Rename points columns" — history) | keep | history/comments |
| ~175 | scroll-depth points, map/geometry points, "points at", loyalty-program persona copy (`lib/onboarding/personas.ts:102` — partner's own program), stall points analytics | KEEP | not the game currency |

---

## 2. New-rank collision guards (echo / signal / beacon)

No rank values `echo`/`signal`/`beacon` exist yet (0 enum hits). Existing identifier collisions — all fine as lowercase enum **data** values, listed for awareness:

| Identifier | Hits | Where | Verdict |
|---|---|---|---|
| `signal` | 347 (word) in lib/app/components | **brand color token family** `--signal/--signal-strong/--signal-bg` (`app/globals.css:52–57,141–142,203–206`) with **179 className uses** (`bg-signal-strong` etc.); `AbortSignal`/`ctrl.signal` (~10); "Live signal" UI (`market-read`) | ⚠️ fine as enum value; **display label "Signal" collides with the design-token vocabulary** — flag for design |
| `beacon` | 5 | `navigator.sendBeacon` (`components/analytics/track-provider.tsx:28–29`, `lib/analytics/observe.ts:52–53`) + comments | fine |
| `echo` | 0 in code | shell `echo` only in `.github/workflows/*` scripts | fine |
| `ghost` (stays a rank) | ~60 | rank sense everywhere **plus** shadcn Button `variant="ghost"` (`components/ui/button.tsx` + page-editor/marketing usages) | KEEP both; no enum conflict |

---

## 3. Canon terms — where they already exist

| Term | Hits / files | Where it lives | Note |
|---|---|---|---|
| quest / quests | 206 / 67 · 102 / 35 | `quests` table (`20260608010000`), `lib/quests.ts`, `lib/quest-icons.ts`, `/crew/quests`, the-quest marketing | ✅ = season instance (ADR-152 verified, §1.7); only "Seasonal Quest" phrasing retires |
| journey | 402 / 99 (+260 "journeys") | `journey_plans` spine, `lib/journey-*.ts`, `/journeys` | ✅ canonical since ADR-085 |
| practice | 791 / 182 | `practices` + `practice_tiers`, `lib/practices.ts`, `/practices` | ✅ |
| challenge | 111 / 31 (+118) | `season_challenges`, `lib/circles/challenges.ts`, `/crew/challenges` | ✅ |
| task / crew_tasks | 266 / 53 · 52 / 18 | `crew_tasks` table (`20240101`, seeds `20240120:201`), `lib/zaps.ts` award path | ✅ |
| pillar | 169 / 36 (+110) | `lib/pillars.ts`, UI copy, `20260607050000_seasonal_pillar_journeys` | ✅ exists; backing table still `domains` (§1.16) |
| co-op / coop | 1 | `lib/journey-chorus.ts:1` gloss | ⏳ target of chorus rename |
| "circle current" | **0** | — | ⏳ target of Circle Field rename; clean |
| vault / "vault store" | 72 / 29 · 2 | `/crew/store` ("Vault Store" title), `/vault` redirect, `lib/economy/ledger.ts`, nav/icons | ✅ |
| zap | 250 / 102 (+425 "zaps") | `zap_transactions`, `zap_config`, `lib/zaps.ts`, UI | ✅ |
| gem | 122 / 56 (+330 "gems") | `gems_economy`, `gem_store`, `lib/gems.ts` | ✅ |
| resonance | 50 / 20 | `20260609070000_connection_resonance.sql`, `lib/connections/resonance.ts`, `circles.resonance_public` | ✅ |
| orbit | 58 / 8 | `lib/connections/resonance.ts`, `app/(main)/friends/orbit-list.tsx` | ✅ |
| pulse | 44 / 31 | `lib/connections/pulse.ts`, `components/connections/connections-pulse.tsx`, rail panel key | ✅ (some hits are CSS `animate-pulse` — harmless) |
| "near miss" | 22 / 13 | `20260609070000`, `lib/connections/*`, `app/(main)/friends/near-misses.tsx` | ✅ |
| "frequency signature" | 23 / 5 | `lib/frequency-signature*.ts(x)`, profile page | ✅ |
| outpost | 50 / 18 | hierarchy layer (`20240102000000`: `outposts` table, Region→Outpost→Nexus→Hub→Circle), room visibility enum (`20240130000000:16`) | ✅ |
| lab | 151 / 32 | the-lab marketing template/page, density analytics | ✅ |
| channel | 522 / 109 | `topical_channels`, `/channels`, channel rooms | ✅ topical forum; ⚠️ **flag**: "Channels = the 4 Domains" framing at `20260604010000:1` and `lib/page-editor/templates/the-community.ts:63` ("Channels are the four domains…") conflates Channel with Pillar — needs copy decision in the domains→pillars rename |
| "tune in" | ~45 / 20 | `get_my_tuned_channel_ids()` RPC, `/channels` toggle, room post gate | ✅ |
| member / crew / host / guide / mentor | 1565 · 731 · 783 · 288 · 237 | `community_role` enum (`lib/core/roles.ts:10–36`), `membership_tier` `'crew'\|'supporter'` | ✅ note: role value `'crew'` retired (`20260612060000`) but kept in enum for order parity; "crew" canon = the paid TIER + `/crew` area |
| admin / janitor | 2508 · 361 | role rungs (`20240306000000_admin_role`), `lib/core/{roles,capabilities,access-matrix}.ts` | ✅ |
| ghost / conduit / luminary (ranks) | ~60 · ~50 · ~70 | `season_rank_enum`, `lib/season-ranks.ts` | ✅ stay |
| echo / signal / beacon (ranks) | 0 as ranks | — | ⏳ targets; collisions in §2 |

---

## 4. TOP RISKS

1. 🔴 **`season_rank_enum` order is load-bearing.** Lifetime rank (`20260608060000:16`) relies on enum declaration order via `GREATEST()`/`max()`; `lib/season-ranks.ts:50–55` mirrors it (`RANK_ORDER`) with a comment pinning the contract. Renames must use `ALTER TYPE … RENAME VALUE` (preserves order) — never drop/recreate.
2. 🔴 **`reset_season()` + recalc-rank RPCs embed rank TEXT.** Gem-conversion weights `when 'agent' then 1.0/3.0` and `NOT IN ('runner','operative','agent','conduit','luminary')` ladders are redefined across `20240110`, `20240115`, `20240118:211–229`, `20240120:152`, `20240229:67`, `20260607040000:66–83`, `20260608060000:62–114`, `20260610000000:142` (latest live body). The rename migration must re-issue the **current** function bodies with new values, not patch history.
3. 🔴 **Seeded data rows need UPDATEs, not just enum renames:** achievements `rank-runner/-operative/-agent/...` slugs, names, and `criteria` JSON `{"rank":"agent"}` (`20240118:356–360,391`); zap-action description `'Finished a multi-step Arc.'` (`20260605100000:29`); quests seed `name='Seasonal Quest'` (`20260608010000:57`); `practice_tiers` rows with `tier in ('spark','current','deep')` (`20260609101000` backfill + `20260609103000` seed); demo content (`lib/demo/engine.ts` rank literals run at generate time). `lib/achievements.ts:235–349` matches rank strings from DB rows at runtime → **code + data must flip atomically**.
4. 🔴 **Check constraints embed tier text** (`tier in ('spark','current','deep')` ×4: `20260609101000:19`, `20260609101500:16,22,27`). Live DB constraints must be dropped/re-created alongside a data UPDATE; columns also have `default 'current'`.
5. 🔴 **`community_role` enum order is load-bearing** for `get_my_role() >= '<rung>'` RLS comparisons (~60 policies; explicitly noted at `20260612060000:364`). Precedent set there: keep retired values in the enum for order parity, keep historical policy NAMES, change only behavior — follow the same pattern for rank renames.
6. ⚠️ **Circle Field rename touches a trigger + RLS + ledger table in one move:** `after_circle_field_transaction()` trigger is the single writer of `circles.current_season_field`; `reset_season()` zeroes it; policy name string `"circle_field_transactions: members or public read"` is referenced by future `drop policy if exists` patterns. Rename table/column/trigger/function together; `lib/database.types.ts` must be regenerated after.
7. ⚠️ **`domains` → `pillars` crosses an FK boundary:** `topical_channels.domain_id`, `practices`/`journey_plans` domain links, and the channels page's grouping logic (36 hits in `app/(main)/channels/page.tsx`). The view-shim pattern used by past renames (`20260604000000` quests→arcs created back-compat views + grants) is the proven path.
8. ⚠️ **Marketing/page-editor template seeds may live in DB rows** (`page_content`): `lib/page-editor/templates/the-quest.ts` rank copy is the coded fallback, but published page content is stored — renaming code labels won't fix already-published page rows.
9. ⚠️ **"Signal" rank label vs design tokens:** `--signal*` is the brand color family with 179 utility-class uses; rank palette classes are `bg-rank-*`. No technical clash, but member-facing "Signal" + `bg-signal-*` in the same codebase invites mistakes — name the rank's `RankKey` color mapping carefully.
10. ⚠️ **Historical migrations must not be edited** (drift): all old-name hits inside applied migrations (`deshi/sempai/sensei`, quest→arc→journey chain, `20240115` rank rename) stay as-is; new migrations only.

## 5. OPEN QUESTIONS

1. **Tier targets for `spark` and `deep`** — canon only specifies `current → adept`. What do `spark`/`deep` become (and their glyphs ⚡/🏔️)?
2. **Rank mapping confirmation** — by position, `runner → echo` and `operative → signal` (with `agent → beacon`)? Only `agent→beacon` is stated explicitly.
3. **"Spark" as streak/profile milestone label** (`lib/streak.ts:18`, `people/[handle]/page.tsx:38,210`) — same retired word, different mechanic. In or out of scope?
4. **`membership_tier` value `'crew'`** — "crew" is canon, the role value is retired; confirm the tier value and `/crew` route stay untouched.
5. **`'quest_complete'` engagement-source key** — kept for historical continuity per THE-QUEST.md; confirm it survives the arc→quest-clock rename (it already says "quest").
6. **Support staff called "agents"** (`components/support/admin-ticket-controls.tsx`) — neither rank nor AI; rename to "staff" while we're here, or leave?
7. **`traits` behavioral band value `'deep'`** (`lib/traits/registry.ts:369`) — internal analytics enum; exempt from the tier rename?
8. **Rail/widget string keys** — `'field'` in `app/(main)/circles/[slug]/page.tsx:335` and the dock's `arc` key: confirm none are persisted in user prefs/DB before renaming.
9. **`scripts/*.mts` and `proxy.ts`** were outside the stated scope; a spot-check of `scripts/` (help tooling) found no retired terms. Confirm they stay out of scope.
10. **"Circle Current" casing/format** — 0 existing hits; confirm `circle_current_transactions` / `current_season_current`?? — the column `current_season_field` renamed literally would yield `current_season_current` (awkward double). Proposed column name needed (e.g. `current_season_circle_current` vs `season_circle_current`).
11. **Channel-vs-Pillar copy** — `20260604010000:1` and `the-community.ts:63` describe Channels *as* the four Domains; decide the corrected framing (Channels live *under* Pillars?) as part of the domains→pillars rename.
12. **`lib/database.types.ts`** is generated and excluded here — regeneration is required after every schema rename; note for the rename phases' checklists.
