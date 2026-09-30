-- =============================================================================
-- Two schema follow-ups that migration comments promised and nothing shipped (HYG-139, ADR-1692).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- 1. THE ONE-TO-ONE RULE ON CONVERSATIONS.
--    20260604220000_group_dms_to_private_rooms.sql moved every group conversation to a private
--    room and said: "A FOLLOW-UP migration adds the hard 1:1 invariant on conversations once this
--    backfill is verified in prod." None did. Every writer in the app (startConversation,
--    findOrCreateDirectConversation, the moderation warning in feed/report-actions) creates a
--    conversation and lands exactly two participants, so the rule has only ever been a habit of
--    the callers.
--
--    Measured in production on 2026-09-30 at 03:27Z by the orchestrator: 6 conversations, every
--    one with migrated_to_room_id null and name null, every one with exactly 2 distinct
--    participants, 6 distinct pairs, 0 self-pairs. conversation_room_migration no longer exists.
--    So the rule below holds for every row today and rejects none of them.
--
--    THE RULE, enforced by a BEFORE trigger on conversation_participants (a CHECK constraint
--    cannot count sibling rows):
--      a. a conversation holds at most TWO participants: a third insert, or an update that moves
--         a participant into a full conversation, is refused (SQLSTATE 23514,
--         conversation_is_one_to_one);
--      b. a conversation that moved to a room (migrated_to_room_id set) takes no new participant
--         (23514, conversation_migrated_to_room); it lives on as a room, so a new member belongs
--         in room_members;
--      c. the same person twice in one conversation is already refused by the primary key
--         (conversation_id, profile_id) from 20240103000000; the pgTAP file pins it.
--    Concurrency: the trigger takes a row lock on the parent conversation before it counts, so
--    two sessions each adding a second participant cannot both see one and land three. The lock is
--    FOR NO KEY UPDATE, which does not conflict with the FOR KEY SHARE the foreign key check
--    takes, and each count runs on a fresh READ COMMITTED snapshot after the lock is granted.
--    Leaving a conversation (the only delete path) is untouched: a thread may drop to one.
--    An update that changes only last_read_at does not fire it (UPDATE OF conversation_id,
--    profile_id), so the read-marker writes cost nothing.
--
-- 2. THE CO-STEWARD READ ON STEWARDSHIPS.
--    20260614100000_stewardships.sql shipped "own stewardships readable" (own edges + platform
--    staff) and said: "Scope-leader read of co-stewards is a follow-up (avoids a recursive
--    policy)." None shipped; the later stewardships migrations are a revoke on the trigger
--    function (20260926000000) and comments.
--
--    WHO A SCOPE LEADER IS, taken from the code that already decides it, not invented here:
--      * an ACTIVE stewardship edge on exactly that (scope_type, scope_id), whatever its role.
--        This is leadsScope() in lib/core/stewardship.ts ("one active edge on circle:<id> means
--        full circle leadership", lib/stewardships.ts) and stewardsScope() in
--        lib/messages/room-scope.ts;
--      * OR the place's leader column: circles.host_id, hubs.guide_id, nexuses.mentor_id. The
--        access resolver ORs the edge with this FK (lib/core/load-capabilities.ts, "recognizes a
--        scoped leader by edge as well as by the legacy leader FK"), and room-scope.ts does the
--        same through leadsPlace(). An outpost has no leader column, so it is the edge only.
--    A suspended edge does not make its holder a leader. A leader reads EVERY edge on the scope
--    they lead, suspended ones included, and nothing on any other scope: a hub guide does not
--    read the circles beneath the hub through this policy.
--
--    WHY A HELPER. A policy on stewardships that queries stewardships is the 42P17 cycle
--    ("infinite recursion detected in policy"). private.leads_scope() is SECURITY DEFINER, so its
--    lookup reads with RLS bypassed, and it lives in the private schema, which PostgREST does not
--    expose (ADR-847), so no browser can call it as an RPC. It returns a boolean about the caller
--    only, never an id, so it tells a caller nothing beyond their own standing.
--
--    ONE PERMISSIVE SELECT POLICY, as the house rule since 20261004000000 has it (the
--    multiple_permissive_policies advisor): the old policy is replaced by one that keeps both of
--    its arms verbatim in meaning and adds the leader arm. Read only: there is still no insert,
--    update or delete policy, so every write stays on the service role.
--
-- Idempotent: create or replace, drop ... if exists before each create. No table, column or FK is
-- added, so check:grants, check:fk-indexes and the types file are unchanged.
--
-- DOWN (reverse, in this order):
--   drop trigger if exists conversation_participants_one_to_one on public.conversation_participants;
--   drop function if exists public.enforce_conversation_one_to_one();
--   drop policy if exists "stewardships: own, co-steward and staff read" on public.stewardships;
--   create policy "own stewardships readable" on public.stewardships
--     for select using (
--       profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
--       or private.get_my_web_role() in ('admin', 'janitor')
--     );
--   drop function if exists private.leads_scope(text, uuid);
-- =============================================================================

-- ── 1. conversations are one-to-one ──────────────────────────────────────────────────────────

create or replace function public.enforce_conversation_one_to_one()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_migrated uuid;
  v_found    boolean;
  v_others   integer;
begin
  -- A last_read_at write never reaches here (the trigger is UPDATE OF conversation_id,
  -- profile_id), but an UPDATE that sets those columns to their own values would: let it through.
  if tg_op = 'UPDATE'
     and new.conversation_id = old.conversation_id
     and new.profile_id = old.profile_id then
    return new;
  end if;

  -- Serialize participant changes per conversation, so the count below cannot race.
  select c.migrated_to_room_id, true
    into v_migrated, v_found
    from public.conversations c
   where c.id = new.conversation_id
   for no key update;

  -- No such conversation: let the foreign key refuse it with its own error.
  if not coalesce(v_found, false) then
    return new;
  end if;

  if v_migrated is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'conversation_migrated_to_room',
      detail  = format('Conversation %s moved to room %s and takes no new participant.',
                       new.conversation_id, v_migrated),
      hint    = 'Add the member to room_members instead.';
  end if;

  -- Everyone else already in this conversation. On an UPDATE the row being moved is not one of
  -- them, so a participant re-pointed inside their own conversation is not counted twice.
  select count(*)
    into v_others
    from public.conversation_participants cp
   where cp.conversation_id = new.conversation_id
     and cp.profile_id <> new.profile_id
     and not (tg_op = 'UPDATE'
              and cp.conversation_id = old.conversation_id
              and cp.profile_id = old.profile_id);

  if v_others >= 2 then
    raise exception using
      errcode = 'check_violation',
      message = 'conversation_is_one_to_one',
      detail  = format('Conversation %s already has two participants.', new.conversation_id),
      hint    = 'A conversation is between two people. A group belongs in a private room.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_conversation_one_to_one() is
  'HYG-139 (ADR-1692): the hard one-to-one rule promised by 20260604220000. Refuses a third '
  'participant on a conversation (23514 conversation_is_one_to_one) and any new participant on a '
  'conversation that moved to a room (23514 conversation_migrated_to_room). Locks the parent '
  'conversation row first, so concurrent inserts cannot race past the count. Trigger only.';

-- A trigger handler: EXECUTE is irrelevant to firing it, so no browser role holds it
-- (the 20260926000000 pattern). Each role is named, because a revoke from PUBLIC alone does not
-- remove Supabase's explicit per-role default grants (ADR-959).
revoke execute on function public.enforce_conversation_one_to_one() from public, anon, authenticated;

drop trigger if exists conversation_participants_one_to_one on public.conversation_participants;
create trigger conversation_participants_one_to_one
  before insert or update of conversation_id, profile_id on public.conversation_participants
  for each row execute function public.enforce_conversation_one_to_one();

-- ── 2. scope leaders read their co-stewards ──────────────────────────────────────────────────

create or replace function private.leads_scope(p_scope_type text, p_scope_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  with me as (
    select p.id from public.profiles p where p.auth_user_id = (select auth.uid())
  )
  select
    exists (
      select 1
        from public.stewardships s
       where s.profile_id in (select id from me)
         and s.scope_type = p_scope_type
         and s.scope_id = p_scope_id
         and s.state = 'active'
    )
    or (p_scope_type = 'circle' and exists (
      select 1 from public.circles c
       where c.id = p_scope_id and c.host_id in (select id from me)))
    or (p_scope_type = 'hub' and exists (
      select 1 from public.hubs h
       where h.id = p_scope_id and h.guide_id in (select id from me)))
    or (p_scope_type = 'nexus' and exists (
      select 1 from public.nexuses n
       where n.id = p_scope_id and n.mentor_id in (select id from me)));
$$;

comment on function private.leads_scope(text, uuid) is
  'HYG-139 (ADR-1692): does the CALLER lead this scope? An active stewardship edge on exactly '
  '(scope_type, scope_id), any role (the SQL twin of leadsScope() in lib/core/stewardship.ts), or '
  'the place''s leader column (circles.host_id, hubs.guide_id, nexuses.mentor_id), which the '
  'access resolver ORs with the edge. SECURITY DEFINER so the stewardships read policy can ask '
  'without re-entering stewardships RLS (42P17). Returns a boolean about the caller only.';

-- A policy expression runs as the querying role, so authenticated keeps EXECUTE; anon never
-- needs it (the policy below is TO authenticated) and private is off the REST surface anyway.
revoke all on function private.leads_scope(text, uuid) from public, anon;
grant execute on function private.leads_scope(text, uuid) to authenticated;

drop policy if exists "own stewardships readable" on public.stewardships;
drop policy if exists "stewardships: own, co-steward and staff read" on public.stewardships;
create policy "stewardships: own, co-steward and staff read" on public.stewardships
  for select to authenticated
  using (
    profile_id in (select id from public.profiles where auth_user_id = (select auth.uid()))
    or (select private.get_my_web_role()) in ('admin', 'janitor')
    or private.leads_scope(scope_type, scope_id)
  );
