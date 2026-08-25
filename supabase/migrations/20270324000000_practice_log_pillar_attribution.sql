-- Per-Pillar Zap attribution ledger: the log-time freeze (Practice Library Phase 4,
-- ADR-1131; the practices-side split columns shipped Phase 1, 20260827000000).
--
-- practice_logs.zaps_awarded already freezes the wallet grant at log time, because the live
-- config can drift between log and un-log. The Pillar SPLIT can drift the same way (a curator
-- re-balances a practice long after its logs), so the attribution freezes beside the amount:
-- logPractice snapshots the practice's primary/secondary Pillar + primary_pct onto the log row
-- in the same best-effort write as zaps_awarded. Per-Pillar progress is then an exact,
-- append-only ledger read (lib/practices/attribution.ts). The split only DIVIDES zaps_awarded
-- across Pillars -- it never adds to it, so the wallet total is untouched (no inflation lever,
-- per the ADR-438 lock).
--
-- Columns are nullable on purpose: rows that predate this freeze carry NULL, and the reader
-- falls back to the practice's CURRENT split for them (stated where the fallback lives).

alter table public.practice_logs
  add column if not exists pillar_id uuid references public.pillars(id) on delete set null,
  add column if not exists secondary_pillar_id uuid references public.pillars(id) on delete set null,
  add column if not exists primary_pct smallint;

comment on column public.practice_logs.pillar_id is
  'Primary Pillar at log time (snapshot of practices.domain_id). Frozen beside zaps_awarded so per-Pillar attribution survives later re-categorization. NULL = pre-freeze row or the practice had no Pillar; the reader falls back to the practice''s current split.';
comment on column public.practice_logs.secondary_pillar_id is
  'Secondary Pillar at log time (snapshot of practices.secondary_domain_id). NULL = single-Pillar (100% primary).';
comment on column public.practice_logs.primary_pct is
  'Primary share at log time, normalized (50-100; 100 when no secondary). secondary share is DERIVED (100 - primary_pct), never stored. The split divides zaps_awarded; it never changes it.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'practice_logs_primary_pct_range') then
    alter table public.practice_logs
      add constraint practice_logs_primary_pct_range
      check (primary_pct is null or primary_pct between 50 and 100);
  end if;
  -- NOT `is distinct from`: that form is FALSE (a violation) when both sides are null, and
  -- both ARE null on every pre-freeze row and on every no-Pillar practice.
  if not exists (select 1 from pg_constraint where conname = 'practice_logs_secondary_pillar_distinct') then
    alter table public.practice_logs
      add constraint practice_logs_secondary_pillar_distinct
      check (secondary_pillar_id is null or secondary_pillar_id <> pillar_id);
  end if;
end $$;

-- FK covering indexes (the advisor-sweep convention, 20270318000000), partial because the
-- columns are null on legacy rows and secondary is null for every single-Pillar practice.
create index if not exists practice_logs_pillar_id_idx
  on public.practice_logs (pillar_id) where pillar_id is not null;
create index if not exists practice_logs_secondary_pillar_id_idx
  on public.practice_logs (secondary_pillar_id) where secondary_pillar_id is not null;
