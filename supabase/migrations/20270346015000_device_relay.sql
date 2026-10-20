-- CyberUnicorn internet relay: a phone controls a registered device from any network (LIVE-1120, ADR-1870).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md section 8 "Internet relay" for the
-- contract; this file explains the schema, it does not track the work.
--
-- Both ends are CLIENTS of Supabase Realtime and meet on one private Broadcast channel per device,
--     device:<scanner_devices.id>
-- so neither the phone nor the device opens a port. The phone joins with its own member session;
-- the device joins with a 15 minute token minted by POST /api/v1/devices/realtime-token from its
-- X-Frequency-Device credential (lib/devices/relay.ts). Payloads stay on Realtime: nothing here
-- stores a command.
--
-- 1. public.device_relay_settings: one row per device that has relay settings. relay_enabled
--    defaults OFF, so a device is not reachable over the internet until a manager switches it on.
--    owner_profile_id links the device to a PERSON (the venue link is scanner_devices.space_id).
--    relay_allowed_cmds is the allow-list the token reply hands the device; cli.run can never be in
--    it (remote shell). Service role only: lib/devices/relay-store.ts gates every read and write.
-- 2. public.relay_manageable_devices(profile): THE rule for "who may manage a device", used by both
--    GET /api/v1/me/devices (service role) and the Realtime policy below, so the list the phone
--    shows and the channels it may join cannot drift. A profile manages a device when the device is
--    active AND the profile is its owner_profile_id, the owner of its Space, or an active admin of
--    its Space. Service role only (internal in scripts/function-grants.txt).
-- 3. Realtime authorization on realtime.messages (RLS on; the LIVE-671 member policy is untouched):
--    - a DEVICE token (role anon, claim frequency_kind = 'device', signed by the server with the
--      project JWT secret) may receive and send Broadcast and Presence on ITS OWN topic only, and
--      only while the device is active with the relay on. The token is role anon on purpose: it
--      reaches nothing in PostgREST a signed-out visitor could not, so a leaked device token is a
--      key to one channel, not a session. The unsigned anon key carries no frequency_kind claim.
--    - a MEMBER session (role authenticated) may receive and send on device:<id> only for a device
--      it manages (rule 2) whose relay is on.
--    Realtime checks these at join (and on token refresh), not per message, so the command
--    allow-list is enforced ON THE DEVICE from the list the token reply carries.
--
-- No money moves. No existing table changes. Additive and idempotent. ROLLBACK:
--   drop policy if exists "realtime: a device joins its own relay channel" on realtime.messages;
--   drop policy if exists "realtime: a device sends on its own relay channel" on realtime.messages;
--   drop policy if exists "realtime: a manager joins a device relay channel" on realtime.messages;
--   drop policy if exists "realtime: a manager sends on a device relay channel" on realtime.messages;
--   drop function if exists private.relay_device_may_join(text);
--   drop function if exists private.relay_member_may_join(text);
--   drop function if exists private.relay_topic_device(text);
--   drop function if exists public.relay_manageable_devices(uuid);
--   drop table if exists public.device_relay_settings;

begin;

create table if not exists public.device_relay_settings (
  device_id uuid primary key references public.scanner_devices(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  relay_enabled boolean not null default false,
  relay_allowed_cmds text[] not null default array[
    'system.status', 'apps.list', 'lightshow.state', 'lightshow.set',
    'led.set', 'led.mode', 'sound.tone', 'light.read', 'sensors.read', 'frequency.read_tag'
  ]::text[]
    check (cardinality(relay_allowed_cmds) <= 32 and not ('cli.run' = any(relay_allowed_cmds))),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists device_relay_settings_owner_idx
  on public.device_relay_settings(owner_profile_id) where owner_profile_id is not null;
create index if not exists device_relay_settings_updated_by_idx
  on public.device_relay_settings(updated_by) where updated_by is not null;
alter table public.device_relay_settings enable row level security;
revoke all on table public.device_relay_settings from public, anon, authenticated;
grant all on public.device_relay_settings to service_role;
comment on table public.device_relay_settings is 'LIVE-1120 internet relay: per-device relay switch (default off), the person who owns the device, and the command allow-list the device enforces. Service role only; lib/devices/relay-store.ts gates every read and write.';

-- THE manage rule (2). Security definer: it reads three service-only or RLS tables for one profile.
create or replace function public.relay_manageable_devices(p_profile_id uuid)
returns table (device_id uuid, space_id uuid, label text, relay_enabled boolean, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.space_id, d.label, coalesce(r.relay_enabled, false), d.last_seen_at
  from public.scanner_devices d
  left join public.device_relay_settings r on r.device_id = d.id
  where p_profile_id is not null
    and d.active
    and (
      r.owner_profile_id = p_profile_id
      or exists (select 1 from public.spaces s where s.id = d.space_id and s.owner_profile_id = p_profile_id)
      or exists (
        select 1 from public.space_members m
        where m.space_id = d.space_id and m.profile_id = p_profile_id and m.role = 'admin' and m.status = 'active'
      )
    );
$$;
revoke execute on function public.relay_manageable_devices(uuid) from public, anon, authenticated;
grant execute on function public.relay_manageable_devices(uuid) to service_role;

-- device:<uuid> -> the uuid, or null for any other topic. Never raises.
create or replace function private.relay_topic_device(p_topic text)
returns uuid
language sql
immutable
set search_path = pg_temp
as $$
  select case
    when p_topic ~ '^device:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 8)::uuid
  end;
$$;

-- A device token may join its own topic while the device is active and its relay is on.
create or replace function private.relay_device_may_join(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() ->> 'frequency_kind') = 'device', false)
    and private.relay_topic_device(p_topic) is not null
    and private.relay_topic_device(p_topic)::text = (auth.jwt() ->> 'device_id')
    and exists (
      select 1 from public.scanner_devices d
      join public.device_relay_settings r on r.device_id = d.id
      where d.id = private.relay_topic_device(p_topic) and d.active and r.relay_enabled
    );
$$;

-- A member may join device:<id> for a device they manage whose relay is on.
create or replace function private.relay_member_may_join(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.relay_topic_device(p_topic) is not null
    and exists (
      select 1 from public.relay_manageable_devices(private.get_my_profile_id()) m
      where m.device_id = private.relay_topic_device(p_topic) and m.relay_enabled
    );
$$;

-- Policy helpers run as the joining role; they are not reachable over PostgREST (private schema).
revoke execute on function private.relay_topic_device(text) from public, anon, authenticated;
revoke execute on function private.relay_device_may_join(text) from public, anon, authenticated;
revoke execute on function private.relay_member_may_join(text) from public, anon, authenticated;
grant execute on function private.relay_topic_device(text) to anon, authenticated, service_role;
grant execute on function private.relay_device_may_join(text) to anon, service_role;
grant execute on function private.relay_member_may_join(text) to authenticated, service_role;

drop policy if exists "realtime: a device joins its own relay channel" on realtime.messages;
create policy "realtime: a device joins its own relay channel"
  on realtime.messages for select to anon
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.relay_device_may_join((select realtime.topic())))
  );

drop policy if exists "realtime: a device sends on its own relay channel" on realtime.messages;
create policy "realtime: a device sends on its own relay channel"
  on realtime.messages for insert to anon
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.relay_device_may_join((select realtime.topic())))
  );

drop policy if exists "realtime: a manager joins a device relay channel" on realtime.messages;
create policy "realtime: a manager joins a device relay channel"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.relay_member_may_join((select realtime.topic())))
  );

drop policy if exists "realtime: a manager sends on a device relay channel" on realtime.messages;
create policy "realtime: a manager sends on a device relay channel"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.relay_member_may_join((select realtime.topic())))
  );

commit;
