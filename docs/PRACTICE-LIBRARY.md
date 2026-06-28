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

## 3. Auto-valuation — `computePracticeReward(practice)`

Pure, server-side, runs on every create/update. **Creators never set point values.**

```
computePracticeReward(p): { weight_class, reward_zaps | null }
  intensity = deriveIntensity(p.timer_kind, p.duration_min, p.modality)
    light    ← timer_kind = 'none' (log-it) OR duration_min < 5      → 8 zaps
    standard ← timed 5–14 min                                        → 12 zaps
    heavy    ← timed ≥ 15 min OR high-demand movement                → 15 zaps
  weight_class = intensity
  reward_zaps  = cadence-bound (Quest/Journey) ? cadenceValue(p.cadence) : null
                 // cadenceValue: Daily 10 · 3x-week 15 · Weekly 25 (ADR-303 balance)
```

The log-time chokepoint (`logPractice`, `lib/practices.ts:1546–1595`) is **unchanged** — it reads
`reward_zaps` then `weight_class` and freezes the grant onto `practice_logs.zaps_awarded`. We only
turn those two fields from inputs into computed outputs. The free-form `weight_class` pick and the
manual `reward_zaps` override remain as a **staff-only, audited break-glass**. Constants tune via
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
is not an inflation or farming lever. The per-Pillar attribution ledger is **Phase 4**; the columns
ship Phase 1 so data is correct from day one.

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
| **2 Clean** | Review queue triages in bulk with near-dup flagging; dedup/merge redirects adoptions+logs and keeps a slug redirect; quality score drives "Needs attention"; tag promote/merge works. |
| **3 Grow** | Remix trees + "most remixed" render from lineage; "Make it yours" prompts; operator remix levers; contributor recognition. |
| **4 Autopilot** | `computePracticeReward()` is the valuation authority; per-Pillar attribution ledger live; Vera auto-tags/categorizes/voice-checks; library-health dashboard (coverage gaps by Pillar/subcategory). |

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
