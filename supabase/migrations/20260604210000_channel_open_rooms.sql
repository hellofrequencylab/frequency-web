-- =====================================================================
-- Phase B (COMMS-STRATEGY / ADR-088): "Channel = feed + open room".
--
-- Every topical Channel already has a feed (via tune-in reach). This adds
-- the second half: one always-on, open public room per Channel that anyone
-- can read — the home for "engage even if you're not in a related Circle".
--
-- Reuses the existing rooms/room_messages infrastructure (realtime, threads
-- via parent_id, triggers). A Channel room is a `rooms` row with a new
-- visibility = 'channel', scope_id = topical_channels.id, and no owner
-- (system-provisioned). Reads are open; writes stay service-role only —
-- the dispatch/room server action gates posting to tuned-in members
-- (topical_channel_memberships), the same way other room writes are gated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Allow visibility = 'channel' (robustly drop the inline check first)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.rooms'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%visibility%'
  loop
    execute format('alter table public.rooms drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.rooms
  add constraint rooms_visibility_check
  check (visibility in ('public', 'private', 'circle', 'hub', 'nexus', 'outpost', 'channel'));

-- ---------------------------------------------------------------------
-- 2. Channel rooms are system-owned: creator_id may be null for them.
--    Everything else still requires a creator.
-- ---------------------------------------------------------------------
alter table public.rooms alter column creator_id drop not null;
alter table public.rooms drop constraint if exists rooms_creator_required_check;
alter table public.rooms
  add constraint rooms_creator_required_check
  check (visibility = 'channel' or creator_id is not null);

-- Exactly one channel room per topical channel.
create unique index if not exists rooms_channel_scope_uidx
  on public.rooms (scope_id) where visibility = 'channel';

-- ---------------------------------------------------------------------
-- 3. Backfill: one open room per active topical channel (idempotent).
-- ---------------------------------------------------------------------
insert into public.rooms (name, description, visibility, scope_id)
select tc.name, tc.description, 'channel', tc.id
from public.topical_channels tc
where tc.is_active
  and not exists (
    select 1 from public.rooms r
    where r.visibility = 'channel' and r.scope_id = tc.id
  );

-- ---------------------------------------------------------------------
-- 4. Auto-provision a channel room whenever a new topical channel appears.
-- ---------------------------------------------------------------------
create or replace function provision_channel_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rooms (name, description, visibility, scope_id)
  values (new.name, new.description, 'channel', new.id)
  on conflict (scope_id) where visibility = 'channel' do nothing;
  return new;
end;
$$;

drop trigger if exists trg_provision_channel_room on public.topical_channels;
create trigger trg_provision_channel_room
  after insert on public.topical_channels
  for each row execute function provision_channel_room();

-- ---------------------------------------------------------------------
-- 5. RLS: open up reads for channel rooms (writes stay service-role only).
-- ---------------------------------------------------------------------
-- rooms: channel rooms are publicly discoverable like the other scoped tiers.
drop policy if exists "rooms_read_public_or_member" on public.rooms;
create policy "rooms_read_public_or_member"
  on public.rooms for select
  using (
    visibility = 'public'
    or visibility in ('circle', 'hub', 'nexus', 'outpost', 'channel')
    or am_room_member(id)
  );

-- room_messages: members as before, PLUS anyone may read a channel room's
-- messages (the "open room"). Posting is still service-role (gated app-side).
drop policy if exists "room_messages_read_members" on public.room_messages;
create policy "room_messages_read_members"
  on public.room_messages for select
  using (
    am_room_member(room_id)
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.visibility = 'channel'
    )
  );

-- room_members: channel-room rosters are visible like public rooms.
drop policy if exists "room_members_read" on public.room_members;
create policy "room_members_read"
  on public.room_members for select
  using (
    am_room_member(room_id)
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.visibility in ('public', 'channel')
    )
  );

-- =====================================================================
-- NOTE FOR THE APP LAYER (server action):
--   • To POST in a channel room, require the author to be tuned into the
--     channel (topical_channel_memberships) — enforce in the server action
--     before the service-role insert into room_messages.
--   • member_count on channel rooms stays 0 (no membership rows); show the
--     tune-in count from topical_channel_memberships instead.
--
-- VERIFICATION (after apply):
--   A. select count(*) from rooms where visibility='channel';  -- one per active channel
--   B. insert a new active topical_channel -> a channel room appears (trigger).
--   C. second insert of a room for the same channel -> blocked by unique index.
--   D. insert a non-channel room with null creator_id -> rejected.
-- =====================================================================
