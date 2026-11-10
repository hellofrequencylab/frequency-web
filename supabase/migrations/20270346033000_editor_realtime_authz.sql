-- Editor realtime authorization (PROG-E0 task 18). See docs/BUILD-BACKLOG.json for status and
-- docs/EDITOR-ARCHITECTURE.md for the program; this file explains the schema, it does not track work.
--
-- Collaborative page editing travels over ONE private Broadcast channel per entity,
--     editor:<kind>:<uuid>
-- (lib/editor-crdt/channel.ts is the shared definition of that name). realtime.messages has RLS on,
-- so a private channel is joinable only through a policy. This migration adds the policy and its one
-- helper:
--
--   private.editor_may_join(topic): true when the caller may write the entity behind the topic.
--   - kind 'space' and kind 'site' resolve to a spaces row (a Site resolves the same rows as a Space,
--     lib/entity-blocks/site-kind.test.ts), and the rule is private.can_write_space_content(id):
--     the Space owner, an active moderator or admin member, or platform staff for a root Space. The SAME rule the
--     page writes use, so a person who may not save the page cannot join the room that edits it.
--   - kinds 'member' and 'email' are NOT admitted yet: they fail closed until their own rule lands.
--   - anything that is not editor:<kind>:<uuid> fails closed, including a malformed uuid.
--
-- Realtime checks the policy at join (and on token refresh), not per message. Presence and cursors
-- are ephemeral and never stored; a joined peer's updates are re-validated at the snapshot boundary
-- (lib/editor-crdt/snapshot.ts) before anything is persisted.
--
-- No table changes. Additive and idempotent. Existing realtime policies are untouched. ROLLBACK:
--   drop policy if exists "realtime: an editor joins an entity editing channel" on realtime.messages;
--   drop policy if exists "realtime: an editor sends on an entity editing channel" on realtime.messages;
--   drop function if exists private.editor_may_join(text);
--   drop function if exists private.editor_topic_entity(text);

begin;

-- editor:<kind>:<uuid> -> the uuid, only for the two kinds admitted today; null otherwise.
create or replace function private.editor_topic_entity(p_topic text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_topic ~ '^editor:(space|site):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(p_topic from '[0-9a-f-]{36}$')::uuid
    else null
  end;
$$;

create or replace function private.editor_may_join(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.editor_topic_entity(p_topic) is not null
    and private.can_write_space_content(private.editor_topic_entity(p_topic));
$$;

-- Policy helpers run as the joining role; they are not reachable over PostgREST (private schema).
revoke execute on function private.editor_topic_entity(text) from public, anon, authenticated;
revoke execute on function private.editor_may_join(text) from public, anon, authenticated;
grant execute on function private.editor_topic_entity(text) to authenticated, service_role;
grant execute on function private.editor_may_join(text) to authenticated, service_role;

drop policy if exists "realtime: an editor joins an entity editing channel" on realtime.messages;
create policy "realtime: an editor joins an entity editing channel"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.editor_may_join((select realtime.topic())))
  );

drop policy if exists "realtime: an editor sends on an entity editing channel" on realtime.messages;
create policy "realtime: an editor sends on an entity editing channel"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.editor_may_join((select realtime.topic())))
  );

commit;
