-- 0001_resonance_init — the isolated namespace for the Resonance app.
--
-- ISOLATION CONTRACT (see ../../docs/ISOLATION.md), enforced for every future migration:
--   * EVERYTHING this app owns lives in schema `resonance`.
--   * NO object in `resonance` may hold a foreign key into `public`, `auth`, or
--     any other schema. User identity is stored as a plain uuid (the host /
--     Frequency user id, or this app's own auth id) with no cross-schema FK.
--   * Breakout later = `pg_dump -n resonance` -> restore into a new project ->
--     repoint env vars -> `DROP SCHEMA resonance CASCADE` here. Nothing to untangle.
--
-- This migration creates ONLY the container + shared conventions. Feature tables
-- (worlds, venues, room_state, ...) arrive in their own build sections.

create schema if not exists resonance;

comment on schema resonance is
  'Standalone embeddable hangout world (codename Resonance). Self-contained: no '
  'foreign keys leave this schema. Lift out with `pg_dump -n resonance`.';

-- Deny by default. This app is reached only through its own trusted server
-- (service role), never via PostgREST anon/authenticated on the shared project.
revoke all on schema resonance from public;
grant usage on schema resonance to service_role;

-- Shared utility: the standard updated_at trigger every future table will use.
create or replace function resonance.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Federated-identity helper. When a request carries a host-issued JWT, this
-- reads the external user id from the `sub` claim. No FK, no join to auth.users:
-- the id is a value this app trusts because the token is signed. Future RLS
-- policies use it if/when the schema is ever exposed beyond the trusted server.
create or replace function resonance.current_external_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

-- Keep the deny-by-default posture for anything created here later.
alter default privileges in schema resonance revoke all on tables from public;
alter default privileges in schema resonance grant all on tables to service_role;
alter default privileges in schema resonance grant all on sequences to service_role;
alter default privileges in schema resonance grant all on functions to service_role;
