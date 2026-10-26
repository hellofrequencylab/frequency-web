-- Explicit purpose-specific Space aggregate observation permission; never public preferences.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table public.space_private_state add column if not exists discovery_consent jsonb;
do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.space_private_state'::regclass and conname='space_private_state_discovery_consent_object') then
    alter table public.space_private_state add constraint space_private_state_discovery_consent_object
      check (discovery_consent is null or (jsonb_typeof(discovery_consent)='object' and octet_length(discovery_consent::text)<=4096));
  end if;
end $$;
comment on column public.space_private_state.discovery_consent is 'Explicit discovery_coaching permission, issuer, expiry and revocation. Fresh Space editor authorization is required independently. Contains no provider credentials or public profile content.';
alter table public.space_private_state enable row level security;
revoke all on table public.space_private_state from public, anon, authenticated;
grant select, insert, update, delete on table public.space_private_state to service_role;
commit;
