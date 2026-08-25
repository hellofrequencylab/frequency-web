# Practice library — engineering spec

> The implementation detail behind [ADR-438](DECISIONS.md) and the phased plan in
> [BUILD-LIST.md](BUILD-LIST.md). Economy rules live in [REWARDS-ECONOMY.md](REWARDS-ECONOMY.md)
> §3a; names in [NAMING.md](NAMING.md); copy rules in [CONTENT-VOICE.md](CONTENT-VOICE.md).
> Code + `supabase/migrations/` are the source of truth; this doc is the design intent.

## 1. Goal

Turn the practice library from a ~200-item, staff-curated set into an **endlessly growing,
member-remixable library** across the four Pillars (Mind / Body / Spirit / Expression), where
points are **auto-valued and farm-proof** and every practice carries **one primary Pillar plus an
optional secondary** with an adjustable split. Sequence: **Scale → Clean → Grow → Autopilot.**

## 2. Data model

### 2.1 Already in place (verified on prod `azsqfeonabsbmemvddqd`, 2026-06-28)

`practices` (33 cols): `domain_id` (primary Pillar FK), `subcategory_id`, `weight_class`
(light/standard/heavy), `reward_zaps` (override), `timer_kind`, `duration_min`, `cadence`,
`status` (draft/pending/approved/rejected), `is_public`, `is_template`, `featured_at`, `slug`,
`space_id`, `focus_details` jsonb, `embedding vector(384)` (HNSW, **unpopulated 0/21**).
Taxonomy: `practice_subcategories` (21 seeded), `practice_tag_defs` + `practice_tags`
(canonical + folksonomy). Ranking: `practices_ranked` view (`logs_30d*3 + adopters*2 + logs_total`).
`practice_tiers` is **dropped** (do not reintroduce).

### 2.2 Phase 1 additions (DDL sketch — finalize in the migration)

```sql
alter table practices
  add column secondary_domain_id uuid references domains(id) on delete set null,
  add column primary_pct smallint not null default 75
    check (primary_pct between 50 and 100),
  add column remixed_from uuid references practices(id) on delete set null,
  add column root_practice_id uuid references practices(id) on delete set null,
  add column search_vector tsvector
    generated always as (
      to_tsvector('english',
        coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(body,''))
    ) stored,
  add constraint secondary_domain_distinct check (secondary_domain_id is distinct from domain_id);

create index practices_search_idx on practices using gin (search_vector);

-- status gains 'archived' (deprecate without delete; hidden from members, history kept)
alter table practices drop constraint practices_status_check;
alter table practices add constraint practices_status_check
  check (status in ('draft','pending','approved','rejected','archived'));
```

Notes: `secondary_pct` is derived (`100 - primary_pct`), never stored. Null `secondary_domain_id`
= 100% single-Pillar. `remixed_from` = direct parent; `root_practice_id` = lineage root (so a
remix tree is one indexed walk). Embeddings get a one-time backfill + on-write generation.

## 3. Auto-valuation — delivered at log time, not create time (ADR-442/443, [ADR-1131](DECISIONS.md))

**Creators never set point values.** This spec originally planned a create-time
`computePracticeReward(practice)` that derives `weight_class`/`reward_zaps` from structure.
**ADR-442/443 superseded it the next day with a stronger mechanism, which is what ships**
(ADR-1131 retired the function as a build item):

- **Create time (ADR-442):** the creator picks a tier; `setPractice` clamps it to what
  `duration_min` earns (`clampTierToDuration`, `lib/practices/tiers.ts`) — a 2-minute practice
  can never claim Heavy.
- **Log time (ADR-443):** a TIMED practice pays the tier its REAL engaged minutes reach
  (`achievedTier`: Light ≥ 3 / Standard ≥ 5 / Heavy ≥ 15; under Light is a 1-Zap partial). The
  creator's pick is only the recommendation and the quick-log fallback.
- The manual `reward_zaps` override remains a **staff-only, audited break-glass**
  (cadence-bound Quest/Journey values: Daily 10 · 3x-week 15 · Weekly 25, ADR-303 balance).

The log-time chokepoint (`logPractice`) freezes the grant onto `practice_logs.zaps_awarded`, and
since Phase 4 it freezes the Pillar-split snapshot beside it (§4). Constants tune via
`zap_config` (data, not code).

**Anti-farm closure.** Value is bound to required engaged time; the timer gate (log counts only at
≥95% of target) forces that time to be spent, so a 2-minute practice can never be "heavy" and
Zaps-per-real-minute stays flat. Stacks on existing gates: one-log/practice/day unique constraint,
25-distinct-practices/day cap, partial-log = 1 zap, Zaps non-spendable (5:1 Gem conversion at season
end), validated-creation requiring a distinct established validator.

## 4. Primary + secondary Pillar split

`domain_id` is the primary; `secondary_domain_id` + `primary_pct` (default 75, floor 50) give the
split. One slider, snaps to 75/25; the floor keeps the primary dominant ("one primary Pillar"
holds). **Function:** the split **attributes a log's earned Zaps across Pillars** for per-Pillar
progress (12 zaps at 75/25 → 9 primary, 3 secondary). It **never changes the wallet total** — so it
is not an inflation or farming lever. The columns shipped Phase 1; the **attribution ledger's
server half shipped in Phase 4** ([ADR-1131](DECISIONS.md)): `logPractice` freezes the split onto
the log row beside `zaps_awarded` (`practice_logs.pillar_id` / `secondary_pillar_id` /
`primary_pct`, migration `20270324000000`) so per-Pillar progress survives later re-categorization,
and `lib/practices/attribution.ts` owns the math (conservation: primary + secondary =
`zaps_awarded`, exactly; pre-freeze rows fall back to the practice's current split) plus the
`getMemberPillarZaps` read. Still to come: the authoring slider and the progress surfaces.

## 4a. Adoption is a commitment with a shape (ADR-920, 2026-08-03)

`member_practices` carries the full lifecycle now, not a permanent boolean:

| Column | Meaning |
|---|---|
| `source` | `self` (the member tapped Adopt) vs `journey` (enrollment wrote it) |
| `journey_plan_id` | Which Journey wrote a `journey` row (phase rollover retires exactly its own leg) |
| `term_weeks` | The commitment: presets 2 / 4 (default) / 8 ("makes it stick", ~66-day automaticity median); NULL = ongoing |
| `starts_on` / `ends_on` | The member-local window (same day framing as `practice_logs.logged_for`); `ends_on` inclusive |
| `retired_at` / `retired_reason` | The exit, with the why: `completed` / `phase_ended` / `dropped` / `swapped` |
| `cue` | The member's implementation intention ("After my morning coffee"), asked as "When will you do it?" — member copy never says "cue" |

The rules, each enforced in code and covered by tests (`lib/practices/adoption*.test.ts`):

- **The cap is a swap.** 5 active self adoptions (`ACTIVE_PRACTICE_CAP`); adopting a 6th offers
  a swap (`swapped`), never a wall, never data loss. Journey rows ride outside the cap.
- **Journeys are phase-scoped.** Enrolling adopts the current leg union the Anchor
  (`lib/journeys/leg-targets.ts`, one computation for enroll + Run start + the On Air reader).
  Rollover retires last week's rows (`phase_ended`) via the read-time reconcile
  (`syncJourneyAdoptionRows`); completion/leave/Run-end retire the rest; the completion
  celebration offers **Keep it** on the retired Anchor (convert to self, `convertJourneyRowToSelf`,
  guarded to retired journey rows only).
- **A term completes loudly.** The hourly `practice-lifecycle` cron retires past-`ends_on` self
  terms (`completed`) in the member's own calendar and sends the notice with the re-adopt door;
  the Sunday digest re-offers un-readopted completions ("Go again?") before the Monday
  fresh-start landmark. Ongoing rows quiet for 14 days get ONE "still keeping this?" note.
- **Reminders are member-shaped.** At most one a day, at the member's own habitual hour (mode of
  their log hours), through the `practice` notification category (in-app default-on, push
  opt-in, email off by design).

## 5. Search + faceting contract (Phase 1)

- **Hybrid retrieval RPC**: full-text (`search_vector` / GIN) + vector (`embedding` / HNSW) fused
  with Reciprocal Rank Fusion. No external engine — Postgres-native, ACID, tunable weights.
- **Keyset (cursor) pagination** replacing the `rankedPractices(limit = 200)` cap; server-side sort.
- **Facet query layer** returning rows + counts for: Pillar · Subcategory · Status · Weight ·
  Public/Template/Featured · Creator · Tag · computed (no image · no body · never logged · no
  Pillar · possible duplicate via `match_practices()`).

## 6. Phases + acceptance criteria

| Phase | Done when |
|---|---|
| **1 Scale** | Library lists/searches/filters/sorts/paginates server-side past 200 rows; bulk acts on the whole filtered set; `archived` works; split + lineage + `search_vector` columns live; embeddings backfilled + generated on write. |
| **2 Clean** | **Server + foundation shipped ([ADR-446](DECISIONS.md), migration `20260828000000` applied to prod):** `merge_practices` RPC re-points adoptions+logs onto the canonical (re-point, never delete) and `practice_slug_redirects` + a 301 fallback keep the old slug working; `listReviewQueue` (bulk approve/reject, near-dup flag; trust order inert until Phase 3); `computeQualityScore`/`needsAttention` over the `updated_at` freshness signal; `listAllTags`/`promoteTagToCanonical`/`mergeTags`; advisory Vera pre-screen. **In flight on the branch (⏳):** the operator UI for all four (review queue v2, "Needs attention" panel, merge, tag governance) plus the page-body conversion to block areas. |
| **3 Grow** | Remix trees + "most remixed" render from lineage; "Make it yours" prompts; operator remix levers; contributor recognition. |
| **4 Autopilot** | Valuation authority ✅ via ADR-442/443 (log-time achieved tier + server clamp; the create-time `computePracticeReward()` was retired, [ADR-1131](DECISIONS.md)); per-Pillar attribution ledger frozen at log time (server half shipped; slider + surfaces next); Vera curation (auto-tag/categorize/summarize/remix prompts) still open beyond the ADR-446 pre-screen; library-health dashboard ✅ (`/admin/content/practices/health`). |

## 7. Admin surface

**Shipped now (light rebuild, frontend-only):** the management table is lean — 8 columns
(checkbox · Practice + read-only weight chip · Creator · Usage · Status · Public · Feature · Manage).
The raw stat spread (adopters / total / added) folds into one **Usage** cell; **Weight** is a quiet
read-only chip (it becomes auto-computed); **Template** moved off the row into the bulk bar. Added a
search box, status filter, quick chips (Public · Template · Featured · Unset weight), a sort control
(all signals) with a direction toggle, and a "showing N of M" count. Master switch + select-all +
bulk now act on the **filtered** set (what you see is what you act on).

**Phase 1 replaces** the client-side filter/sort with the server facet + keyset layer (§5) and
recomposes on the Dashboard template with a facet rail and saved views.
