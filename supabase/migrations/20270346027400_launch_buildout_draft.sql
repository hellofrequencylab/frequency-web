-- Vera buildout draft (LIVE-1875). Where the draft Vera builds from a person's own words after the launch flow is saved:
-- one nullable jsonb on the launch row, {draft, mode, aiCalls, at}. aiCalls is the per-launch polish call count the cap reads.
-- The existing `steps` jsonb cannot hold it: it is capped at 16 KB, and lib/launch/state.ts normalizeSteps drops every key
-- that is not a step id, so the next step write would erase a draft kept there.
--
-- Additive and idempotent. No existing column changes. The owner policies on space_launch already cover the new column.
-- ROLLBACK: alter table public.space_launch drop column if exists buildout;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.space_launch add column if not exists buildout jsonb
  check (buildout is null or (jsonb_typeof(buildout) = 'object' and pg_column_size(buildout) <= 32768));

commit;
