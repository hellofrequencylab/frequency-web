-- Nine covering indexes for the foreign keys the calendar sprint added without one (HYG-127, ADR-1543).
--
-- MEASURED 2026-09-28 on production: the performance advisor reports NINE unindexed foreign keys,
-- up from ZERO on 2026-09-19, every one on a table the LIVE-508 to LIVE-536 sprint created or
-- extended. Re-derived from pg_constraint against pg_index before this was written, not read off
-- the advisor: each of the nine has a FK constraint and no index that LEADS with the column.
--
-- 🔴 WHY IT MATTERS. A FK without a covering index makes every DELETE or UPDATE of the referenced
-- row scan the referencing table to check the constraint. Seven of the nine reference `profiles`,
-- so a profile delete (account deletion is a hard delete, lib/account.ts) now scans four calendar
-- tables in turn. `space_plans.playbook_id` and `space_plan_shares.guest_space_id` are the same
-- shape against `space_plan_playbooks` and `spaces`.
--
-- ⚠️ THIRD RECURRENCE. SCAN-638 (20270345006400) took the count to zero on 2026-09-19; the sweep
-- before it did the same; each time the next tables brought it back. This file is the sweep the
-- owner ruled on 2026-09-28. The convention half, a source guard that fails a pull request adding
-- a FK with no index, is HYG-128 and is not here: a fourth sweep on its own would be the same
-- mistake with a later date.
--
-- SHAPE, copied from 20270345006400 and 20270318000000: a nullable attribution column gets a
-- PARTIAL index (`where <col> is not null`), because the rows that carry NULL are never the ones a
-- referential check or an attribution lookup asks for, and the index stays small. The one NOT NULL
-- column, `space_plan_shares.guest_space_id`, gets a full index. Every statement is
-- `create index if not exists`, so this is additive, idempotent, and safe to re-run.
--
-- 🔴 APPLIED TO PRODUCTION BY execute_sql, then an explicit ledger row at this file's own version,
-- once db-tests has replayed it on a fresh database and before the pull request merges, because
-- check:migrations reads the live ledger and a repo file with no ledger row is red (ADR-1111).
-- Never `db push`, never `apply_migration` (docs/DATABASE.md).
--
-- ROLLBACK:
--   drop index if exists public.space_calendar_entries_removed_by_idx;
--   drop index if exists public.space_calendar_private_feeds_created_by_idx;
--   drop index if exists public.space_plan_playbooks_created_by_idx;
--   drop index if exists public.space_plan_shares_guest_space_id_idx;
--   drop index if exists public.space_plan_shares_requested_by_idx;
--   drop index if exists public.space_plan_shares_responded_by_idx;
--   drop index if exists public.space_plans_created_by_idx;
--   drop index if exists public.space_plans_owner_profile_id_idx;
--   drop index if exists public.space_plans_playbook_id_idx;

begin;

-- profiles ← who removed a calendar entry (LIVE-536 tombstone, 20270345008600)
create index if not exists space_calendar_entries_removed_by_idx
  on public.space_calendar_entries (removed_by)
  where removed_by is not null;

-- profiles ← who minted a private calendar feed
create index if not exists space_calendar_private_feeds_created_by_idx
  on public.space_calendar_private_feeds (created_by)
  where created_by is not null;

-- profiles ← who authored a playbook
create index if not exists space_plan_playbooks_created_by_idx
  on public.space_plan_playbooks (created_by)
  where created_by is not null;

-- spaces ← the guest Space a plan is shared with (NOT NULL: every share names its guest)
create index if not exists space_plan_shares_guest_space_id_idx
  on public.space_plan_shares (guest_space_id);

-- profiles ← who asked for the share, who answered it
create index if not exists space_plan_shares_requested_by_idx
  on public.space_plan_shares (requested_by)
  where requested_by is not null;

create index if not exists space_plan_shares_responded_by_idx
  on public.space_plan_shares (responded_by)
  where responded_by is not null;

-- profiles ← who created a plan, who owns it
create index if not exists space_plans_created_by_idx
  on public.space_plans (created_by)
  where created_by is not null;

create index if not exists space_plans_owner_profile_id_idx
  on public.space_plans (owner_profile_id)
  where owner_profile_id is not null;

-- space_plan_playbooks ← the playbook a plan was built from
create index if not exists space_plans_playbook_id_idx
  on public.space_plans (playbook_id)
  where playbook_id is not null;

-- PROVE IT AGAINST THE CATALOG, not the statement list. The question the advisor asks is "does an
-- index LEAD with this FK column", so that is the question asked here, on every one of the nine,
-- after the statements above ran. A typo in a column name would be caught by Postgres; an index on
-- the wrong table, or one whose first key is another column, would not, and this would.
do $$
declare
  v_missing text;
begin
  select string_agg(t.tbl || '.' || t.col, ', ' order by t.tbl, t.col)
    into v_missing
    from (values
      ('space_calendar_entries', 'removed_by'),
      ('space_calendar_private_feeds', 'created_by'),
      ('space_plan_playbooks', 'created_by'),
      ('space_plan_shares', 'guest_space_id'),
      ('space_plan_shares', 'requested_by'),
      ('space_plan_shares', 'responded_by'),
      ('space_plans', 'created_by'),
      ('space_plans', 'owner_profile_id'),
      ('space_plans', 'playbook_id')
    ) as t(tbl, col)
   where not exists (
     select 1
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
      where n.nspname = 'public'
        and c.relname = t.tbl
        and a.attname = t.col
   );
  if v_missing is not null then
    raise exception 'HYG-127: no index leads with %, so a delete of the referenced row still scans the table', v_missing;
  end if;
end $$;

commit;
