-- EMAIL-071: the database refuses a direct message between two people when one blocked the other.
--
-- Before: the INSERT policy participants_send_messages on public.messages checked only that the
-- writer is a participant of the conversation and that sender_id is their own profile. sendMessage
-- checks isBlockedBetween in app code, but a member in a thread that existed before the block could
-- insert straight through PostgREST with their own session and reach the person who blocked them.
--
-- After: the same two checks, plus "no block in either direction between me and any other
-- participant of this conversation".
--
-- Why a SECURITY DEFINER helper and not public.is_blocked_between() inline: blocked_users RLS lets a
-- member read only the blocks THEY created. Evaluated as the sender, is_blocked_between(sender, other)
-- cannot see a row where the OTHER person blocked the sender, so it would answer false in exactly the
-- case that matters. The helper reads blocked_users as its owner. It takes only a conversation id and
-- resolves "me" from auth.uid(), so a caller learns nothing about blocks between other people, and
-- it answers false for anyone who is not a participant (the policy refuses them anyway).
--
-- Idempotent (create or replace; drop policy if exists then create). ROLLBACK: recreate
-- participants_send_messages without the third clause, then drop the helper.

begin;

create schema if not exists private;

create or replace function private.is_blocked_between_me_and_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
      from conversation_participants mine
      join profiles me on me.id = mine.profile_id
      join conversation_participants other
        on other.conversation_id = mine.conversation_id
       and other.profile_id <> mine.profile_id
      join blocked_users b
        on (b.blocker_id = me.id and b.blocked_id = other.profile_id)
        or (b.blocker_id = other.profile_id and b.blocked_id = me.id)
     where mine.conversation_id = p_conversation_id
       and me.auth_user_id = auth.uid()
  )
$$;

grant execute on function private.is_blocked_between_me_and_conversation(uuid) to anon, authenticated, service_role;

drop policy if exists "participants_send_messages" on public.messages;
create policy "participants_send_messages"
  on public.messages for insert
  with check (
    private.am_participant(conversation_id)
    and sender_id in (
      select profiles.id from public.profiles where profiles.auth_user_id = (select auth.uid())
    )
    and not private.is_blocked_between_me_and_conversation(conversation_id)
  );

commit;
