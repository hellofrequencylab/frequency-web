-- ONE MENTIONS TABLE (LIVE-2524, hub plan 2026-11-24). A tag in a message ("@Sam can you take the
-- flyers", "#Spring sound bath") is stored as a reference by id at save time, never parsed on read:
-- the row is what notifies the person, what puts a "mentioned in" backlink on the item, and what a
-- later edit diffs against. Feed posts keep their own post_mentions table; every new message box
-- (Plan and to-do comments first, then rooms, DMs and item threads, LIVE-2525) writes here.
--
-- Ids, never names: the text carries the label at the time, the row carries the id, so a rename
-- never breaks the link and a reader always sees the current name.
--
-- WHO MAY READ: the author, the person tagged, and anyone who may write the Space the tag was made
-- in (the backlink on a Plan reads the Space's own rows). WHO MAY WRITE: the author, as themselves,
-- from a Space they may write. The server checks the tagged person can see the item before it
-- writes the row or sends a notice; RLS here is the floor under that check, not the check itself.
-- Policies call SECURITY DEFINER helpers only, so scripts/check-rls-recursion.mjs sees no edge out.
--
-- THE INBOX COLUMNS (LIVE-2526) ride the same file so the hub pays the main-first readiness review
-- once: a member may snooze a notice until a time or archive it. The existing "notifications: users
-- update own" policy already lets the recipient write their own rows, so no policy changes.
--
-- Additive and idempotent. APPLY AFTER MERGE, never before (docs/DATABASE.md), then the ledger
-- insert at this file's own version.
--
-- ROLLBACK:
--   drop table if exists public.mentions;
--   alter table public.notifications drop column if exists snoozed_until, drop column if exists archived_at;

create table if not exists public.mentions (
  id           uuid primary key default gen_random_uuid(),
  -- What the tag was written in.
  source_type  text not null check (source_type in ('plan_comment', 'room_message', 'direct_message', 'comms_message', 'item_thread')),
  source_id    uuid not null,
  -- What the tag points at: a person (@) or an item (#).
  target_type  text not null check (target_type in ('profile', 'plan', 'task', 'entry', 'event', 'deal', 'contact', 'space')),
  target_id    uuid not null,
  -- The Space the tag was made in, when it was made inside one. Null for a DM.
  space_id     uuid references public.spaces(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (source_type, source_id, target_type, target_id)
);

comment on table public.mentions is
  'Every @person and #item tag written in a message box, stored by id at save time (LIVE-2524). Drives the mention notice and the "mentioned in" backlink. Feed posts keep post_mentions.';
comment on column public.mentions.space_id is
  'The Space the tag was made in, or null for a direct message. Space writers read its rows for backlinks.';

create index if not exists mentions_target_idx on public.mentions (target_type, target_id, created_at desc);
create index if not exists mentions_source_idx on public.mentions (source_type, source_id);
create index if not exists mentions_space_idx on public.mentions (space_id) where space_id is not null;
create index if not exists mentions_created_by_idx on public.mentions (created_by);

alter table public.mentions enable row level security;

drop policy if exists mentions_read on public.mentions;
create policy mentions_read on public.mentions
  for select using (
    created_by = private.get_my_profile_id()
    or (target_type = 'profile' and target_id = private.get_my_profile_id())
    or (space_id is not null and private.can_write_space_content(space_id))
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists mentions_insert on public.mentions;
create policy mentions_insert on public.mentions
  for insert with check (
    created_by = private.get_my_profile_id()
    and (space_id is null or private.can_write_space_content(space_id))
  );

-- The author may withdraw their own tag (an edited or taken-back message). No update policy: a
-- tag is replaced by delete and insert, never rewritten.
drop policy if exists mentions_delete on public.mentions;
create policy mentions_delete on public.mentions
  for delete using (created_by = private.get_my_profile_id());

revoke all on table public.mentions from anon;

-- THE INBOX (LIVE-2526): snooze and archive on the recipient's own rows.
alter table public.notifications add column if not exists snoozed_until timestamptz;
alter table public.notifications add column if not exists archived_at timestamptz;

comment on column public.notifications.snoozed_until is
  'The recipient hid this notice until this time (LIVE-2526 Inbox). Null: not snoozed.';
comment on column public.notifications.archived_at is
  'The recipient marked this notice done (LIVE-2526 Inbox). Null: still in the Inbox.';

create index if not exists notifications_inbox_idx
  on public.notifications (recipient_id, created_at desc) where archived_at is null;
