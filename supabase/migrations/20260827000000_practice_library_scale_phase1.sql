-- =============================================================================
-- Practice library at scale — Phase 1 "Scale it" foundation (ADR-438).
-- Full design: docs/PRACTICE-LIBRARY.md §2.2/§4/§5; economy detail REWARDS-ECONOMY §3a.
--
-- WHAT THIS DOES (schema only — no app behavior changes until the read/UI layers land):
--   1. Primary + secondary Pillar split columns (secondary_domain_id, primary_pct).
--      Columns ship now so per-Pillar data is correct from day one; the attribution
--      LEDGER that consumes them is Phase 4 (no wiring here).
--   2. Remix lineage columns (remixed_from = direct parent, root_practice_id = lineage
--      root) so a remix tree is one indexed walk. Populated by Phase 3's fork/claim;
--      no UI here.
--   3. search_vector tsvector (generated, GIN-indexed) over title/summary/body — the
--      full-text half of the Phase-1 hybrid retrieval (the vector half is the existing
--      embedding column; fusion lives in 20260827000100_practice_hybrid_search_rpc.sql).
--   4. The 'archived' lifecycle status (deprecate without delete; hidden from members,
--      history preserved). The archive bulk action (read layer) sets status='archived'
--      AND is_public=false, so the existing member reads (which gate on is_public=true)
--      never surface an archived practice — belt and suspenders.
--   5. FK covering indexes on the three new self/domain FKs (pre-empts the advisor's
--      unindexed_foreign_keys lint).
--   6. Recreates practices_ranked to EXPOSE the new columns (the view enumerates its
--      column list, so new table columns are otherwise invisible to the library reads).
--
-- WHAT THIS DOES NOT TOUCH: the log-time chokepoint (logPractice reads reward_zaps then
-- weight_class and freezes practice_logs.zaps_awarded) is unchanged — auto-valuation
-- (computePracticeReward) is Phase 4. weight_class / reward_zaps stay author/staff inputs.
--
-- IDEMPOTENT: every add/constraint/index/grant is guarded, so a re-apply (CLI after an
-- MCP apply) is a no-op. DO NOT apply blind to prod — apply on a Supabase branch, verify,
-- regenerate lib/database.types.ts, then merge (apply-on-merge gate, CHECKLIST). Until the
-- types are regenerated, lib/practices.ts reaches the new columns through its untyped admin
-- handle (ADR-246 untyped casts).
-- =============================================================================

-- 1 + 2 + 3. New columns (split · lineage · full-text vector).
alter table public.practices
  add column if not exists secondary_domain_id uuid references public.pillars(id) on delete set null,
  add column if not exists primary_pct smallint not null default 75,
  add column if not exists remixed_from uuid references public.practices(id) on delete set null,
  add column if not exists root_practice_id uuid references public.practices(id) on delete set null,
  add column if not exists search_vector tsvector
    generated always as (
      to_tsvector('english',
        coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body, ''))
    ) stored;

comment on column public.practices.secondary_domain_id is
  'Optional secondary Pillar (FK pillars). Null = single-Pillar (100% primary). With primary_pct, splits a log''s earned Zaps across Pillars for per-Pillar progress; never changes the wallet total (not an inflation lever). Attribution ledger is Phase 4.';
comment on column public.practices.primary_pct is
  'Primary Pillar share (50-100, default 75, snaps 75/25 in the UI). secondary_pct is DERIVED (100 - primary_pct), never stored. Floor 50 keeps the primary dominant ("one primary Pillar" holds).';
comment on column public.practices.remixed_from is
  'Direct remix parent (FK practices). Set by Phase 3 fork/claim. Null = original.';
comment on column public.practices.root_practice_id is
  'Lineage root (FK practices) so a remix tree is one indexed walk. Null = this row is the root.';
comment on column public.practices.search_vector is
  'Generated full-text index over title+summary+body. Half of the Phase-1 hybrid retrieval (the other half is embedding); fused via search_practices_hybrid() with Reciprocal Rank Fusion.';

-- Constraints (no IF NOT EXISTS for constraints — guard via catalog lookup).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'practices_primary_pct_range') then
    alter table public.practices
      add constraint practices_primary_pct_range check (primary_pct between 50 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'practices_secondary_domain_distinct') then
    alter table public.practices
      add constraint practices_secondary_domain_distinct
      check (secondary_domain_id is distinct from domain_id);
  end if;
end$$;

-- GIN index for the full-text half.
create index if not exists practices_search_idx on public.practices using gin (search_vector);

-- 4. 'archived' lifecycle status. Recreate the status CHECK with the new value.
alter table public.practices drop constraint if exists practices_status_check;
alter table public.practices
  add constraint practices_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'archived'));

-- 5. FK covering indexes on the three new FKs (advisor: unindexed_foreign_keys).
create index if not exists practices_secondary_domain_idx
  on public.practices (secondary_domain_id) where secondary_domain_id is not null;
create index if not exists practices_remixed_from_idx
  on public.practices (remixed_from) where remixed_from is not null;
create index if not exists practices_root_practice_idx
  on public.practices (root_practice_id) where root_practice_id is not null;

-- 6. Recreate practices_ranked to expose the new columns. The select list reproduces
--    the prior definition (20260718000000) EXACTLY, in order, then appends the four new
--    columns at the end — create-or-replace requires the leading columns to match. The
--    GENERATED uses_timer reads transparently; grants + security_invoker are preserved by
--    REPLACE but re-asserted below to be explicit (idempotent).
create or replace view public.practices_ranked as
  select
    p.id,
    p.title,
    p.description,
    p.created_by,
    p.is_public,
    p.created_at,
    p.is_demo,
    p.category,
    p.icon,
    p.summary,
    p.header_image,
    p.body,
    p.cadence,
    p.reward_zaps,
    p.reward_note,
    p.domain_id,
    p.status,
    p.reviewed_by,
    p.reviewed_at,
    p.subcategory_id,
    p.embedding,
    p.is_template,
    p.featured_at,
    p.weight_class,
    coalesce(a.adopters, 0::bigint) as adopters,
    coalesce(l.logs_30d, 0::bigint) as logs_30d,
    coalesce(l.logs_total, 0::bigint) as logs_total,
    coalesce(l.logs_30d, 0::bigint) * 3 + coalesce(a.adopters, 0::bigint) * 2 + coalesce(l.logs_total, 0::bigint) as score,
    p.focus_details,
    p.duration_min,
    p.uses_timer,
    p.secondary_domain_id,
    p.primary_pct,
    p.remixed_from,
    p.root_practice_id
  from practices p
    left join (
      select member_practices.practice_id, count(*) as adopters
      from member_practices
      where member_practices.active = true
      group by member_practices.practice_id
    ) a on a.practice_id = p.id
    left join (
      select practice_logs.practice_id,
        count(*) filter (where practice_logs.logged_for >= (current_date - 30)) as logs_30d,
        count(*) as logs_total
      from practice_logs
      group by practice_logs.practice_id
    ) l on l.practice_id = p.id;

alter view public.practices_ranked set (security_invoker = true);
revoke all on public.practices_ranked from anon, authenticated;
grant select on public.practices_ranked to service_role;
