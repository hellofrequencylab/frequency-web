-- Owner-declared coaching context must never live in anon-readable spaces.preferences.
-- Additive only. Apply before enabling coach settings. No fallback to public storage.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table public.space_private_state
  add column if not exists coach_profile jsonb;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.space_private_state'::regclass
      and conname = 'space_private_state_coach_profile_object'
  ) then
    alter table public.space_private_state
      add constraint space_private_state_coach_profile_object
      check (coach_profile is null or (jsonb_typeof(coach_profile) = 'object' and octet_length(coach_profile::text) <= 32000));
  end if;
end
$$;
comment on column public.space_private_state.coach_profile is
  'Owner-declared audience, writing style, goals, examples and facts. Private to Space editors through authenticated server actions. Never publish or use as authorization.';
-- Preserve the table's existing service-only posture for this newly added column.
revoke all on table public.space_private_state from public, anon, authenticated;
grant select, insert, update, delete on table public.space_private_state to service_role;
commit;
