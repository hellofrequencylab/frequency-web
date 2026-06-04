-- =====================================================================
-- Phase B (COMMS-STRATEGY / ADR-088): DM becomes strictly 1:1; existing
-- group conversations move to private rooms ("private chat room = group
-- message").
--
-- Strategy: conversations (1:1 + group today) → conversations is 1:1 only;
-- every group thread becomes a `rooms` row (visibility='private') with its
-- members and messages copied over. This migration is REVERSIBLE:
--   • nothing is deleted — source conversations/messages stay intact;
--   • a mapping table records conversation→room;
--   • conversations.migrated_to_room_id marks what moved (the app filters on
--     it and treats migrated threads as rooms).
-- The hard "conversations must be 1:1" constraint is intentionally a LATER
-- migration, applied only after this backfill is verified in prod.
--
-- A group is any conversation with created_by set, a name, or >2 participants
-- (1:1 threads have exactly 2 participants and no name/creator).
-- =====================================================================

-- Reversible mapping + marker.
create table if not exists conversation_room_migration (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  room_id         uuid not null references rooms(id) on delete cascade,
  migrated_at     timestamptz not null default now()
);

alter table conversations
  add column if not exists migrated_to_room_id uuid references rooms(id);

do $$
declare
  g       record;
  new_room uuid;
  creator  uuid;
begin
  for g in
    select c.id, c.name, c.created_by, c.created_at
    from conversations c
    where c.migrated_to_room_id is null
      and (
            c.created_by is not null
         or c.name is not null
         or (select count(*) from conversation_participants cp where cp.conversation_id = c.id) > 2
      )
  loop
    -- Owner = explicit creator, else the earliest participant.
    creator := coalesce(
      g.created_by,
      (select cp.profile_id
         from conversation_participants cp
        where cp.conversation_id = g.id
        order by cp.joined_at asc nulls last
        limit 1)
    );
    -- Degenerate conversation with no participants — skip (leave intact).
    if creator is null then
      continue;
    end if;

    insert into rooms (name, visibility, creator_id, created_at)
    values (coalesce(nullif(trim(g.name), ''), 'Group chat'), 'private', creator, g.created_at)
    returning id into new_room;

    -- Members (preserve read state; creator becomes room admin).
    insert into room_members (room_id, profile_id, is_admin, last_read_at, joined_at)
    select new_room, cp.profile_id, (cp.profile_id = creator), cp.last_read_at, coalesce(cp.joined_at, now())
    from conversation_participants cp
    where cp.conversation_id = g.id
    on conflict (room_id, profile_id) do nothing;

    -- Messages in chronological order (sender → author).
    insert into room_messages (room_id, author_id, body, created_at)
    select new_room, m.sender_id, m.body, m.created_at
    from messages m
    where m.conversation_id = g.id
    order by m.created_at asc;

    -- last_message_at: set explicitly (trigger only tracks the last row inserted).
    update rooms
      set last_message_at = (select max(created_at) from room_messages where room_id = new_room)
      where id = new_room;

    insert into conversation_room_migration (conversation_id, room_id) values (g.id, new_room);
    update conversations set migrated_to_room_id = new_room where id = g.id;
  end loop;
end $$;

-- =====================================================================
-- NOTE FOR THE APP LAYER:
--   • Stop creating group conversations; the group-create path is removed and
--     "new group" becomes "new private room".
--   • The inbox filters out conversations where migrated_to_room_id is not null
--     (they now live as rooms) and shows only true 1:1 threads.
--   • A FOLLOW-UP migration adds the hard 1:1 invariant on conversations once
--     this backfill is verified in prod.
--
-- REVERSAL (if ever needed): delete from room_messages/room_members/rooms for
--   the mapped room_ids, null out conversations.migrated_to_room_id, truncate
--   conversation_room_migration. Source DM data is untouched.
--
-- VERIFICATION (after apply):
--   A. every group conversation has a migrated_to_room_id and a mapping row;
--   B. per thread: count(messages) == count(room_messages) for its room;
--   C. 1:1 conversations are untouched (migrated_to_room_id is null);
--   D. each new room's member_count == its participant count; last_message_at
--      == max(message.created_at).
-- =====================================================================
