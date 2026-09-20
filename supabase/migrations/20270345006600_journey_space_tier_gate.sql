-- LIVE-411 / ADR-1467: gate a Journey to one Space membership tier.
--
-- FOCUS-MODEL Q5 asked for a fourth Journey audience: members of a named
-- tier. Events already carry this on event_ticket_types.space_tier_id
-- (ADR-823). Journeys only had private | unlisted | public.
--
-- Additive. Nullable. ON DELETE SET NULL so deleting a tier opens the
-- Journey again rather than blocking enrol. Partial index covers the
-- FK (SCAN-638 class). SAFE to re-run.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations
-- at version 20270345006600. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   drop index if exists public.journey_plans_space_tier_id_idx;
--   alter table public.journey_plans drop constraint if exists journey_plans_space_tier_id_fkey;
--   alter table public.journey_plans drop column if exists space_tier_id;

alter table public.journey_plans
  add column if not exists space_tier_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journey_plans_space_tier_id_fkey'
  ) then
    alter table public.journey_plans
      add constraint journey_plans_space_tier_id_fkey
      foreign key (space_tier_id)
      references public.space_membership_tiers (id)
      on delete set null;
  end if;
end $$;

create index if not exists journey_plans_space_tier_id_idx
  on public.journey_plans (space_tier_id)
  where space_tier_id is not null;

comment on column public.journey_plans.space_tier_id is
  'Optional Space membership tier that may enrol (LIVE-411, ADR-1467). Null = anyone who clears the other doors. The owning Space is journey_plans.space_id. Writers must confirm the tier belongs to that Space.';
