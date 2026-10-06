-- push_devices: where a native app build registers its push token (LIVE-720).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- push_subscriptions holds browser Web Push endpoints. A native build (Expo / React Native,
-- DEF-MOBILE) gets an Expo push token or a raw APNs device token instead, and had nowhere to put
-- it. One row per device token. A token is unique across the table: when a phone signs in as a
-- different member, the register endpoint moves the row to the new profile (lib/push-devices.ts),
-- so a token never notifies two people.
--
-- Access: a member reads and deletes their own rows; every write goes through the service role
-- in lib/push-devices.ts after /api/v1/push/devices has verified the caller, so there is no insert
-- or update policy. The sender reads with the service role after the send gate.
--
-- Additive and idempotent. REVERSIBLE: drop table public.push_devices.

create table if not exists public.push_devices (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android')),
  provider      text not null check (provider in ('expo', 'apns')),
  token         text not null unique check (char_length(token) between 8 and 4096),
  app_version   text check (app_version is null or char_length(app_version) <= 32),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table public.push_devices is
  'Native app push tokens, one row per device (LIVE-720). Service-role writes from lib/push-devices.ts; members read and delete their own.';

create index if not exists push_devices_profile_idx on public.push_devices (profile_id);

alter table public.push_devices enable row level security;

drop policy if exists push_devices_read_own on public.push_devices;
create policy push_devices_read_own on public.push_devices
  for select to authenticated
  using (profile_id = (select private.get_my_profile_id()));

drop policy if exists push_devices_delete_own on public.push_devices;
create policy push_devices_delete_own on public.push_devices
  for delete to authenticated
  using (profile_id = (select private.get_my_profile_id()));

revoke all on table public.push_devices from anon;
revoke insert, update, truncate on table public.push_devices from authenticated;
