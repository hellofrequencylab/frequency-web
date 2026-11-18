-- PROG-E5 item 1: one key-scoped, revision-guarded write for a Space page's draft, shared by the staff canvas and
-- the Space page builder. Owner approval: Daniel, 2026-11-18.
--
-- THE GAP. Two writers save the same draft, spaces.preferences.profileLayoutDraft, and neither sets only that key.
-- The Space page builder's autosave (saveSpaceProfileLayout) reads the whole preferences blob, changes the draft
-- and writes the whole blob back. The canvas (PROG-E5B, writeSpacePreferencesAtRevision) compares its counter at
-- preferences.profileLayoutDraftRevision inside the update, but still replaces the whole blob, so any other key
-- saved between its read and its write is reverted (SCAN-833). And the builder never moves the counter, so a
-- canvas tab on an old revision can only notice a builder save through a fingerprint compared before the write,
-- not in it.
--
-- THE FIX. save_space_profile_draft(p_actor, p_space_id, p_draft, p_expected) locks the Space row, checks that
-- p_actor may manage the Space, compares the counter when p_expected is given, then sets ONLY the draft key (a
-- null draft removes it) and moves the counter by one, in one statement under that lock. Every other key is left
-- exactly as stored. The canvas passes the revision its tab loaded; the builder passes null (it holds no
-- revision) and still moves the counter, so a canvas tab behind a builder save is refused in the write itself.
--
-- WHO MAY WRITE (checked here as well as in the server action, which keeps resolveSpaceManageAccess): the
-- mirror of getSpaceCapabilities' canEditProfile (lib/spaces/entitlements.ts):
--   the Space owner; an active member with role editor, moderator or admin; platform staff (profiles.web_role
--   admin or janitor); a central admin of the Space's Network parent who is an active admin of that parent,
--   while the parent is a live Network and the Space is one of its chapters (lib/collective/network-tools.ts
--   centralAdminReachesChapter, networkToolsOpen, isNetworkChapter).
-- Anyone else gets {"status":"forbidden"} and nothing is written.
--
-- RETURNS jsonb: {"status":"written","revision":n} | {"status":"stale","revision":stored} |
-- {"status":"forbidden"} | {"status":"missing"}. Bad arguments raise 22023.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version 20270346120000. Do not
-- apply_migration. Do not db push. Until it is applied the server falls back to the old writers (the RPC is
-- absent, PGRST202), exactly as before this migration.
--
-- ROLLBACK:
--   drop function if exists public.save_space_profile_draft(uuid, uuid, jsonb, bigint);
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name (ADR-959). No em or en
-- dashes. pgTAP: supabase/tests/save_space_profile_draft.test.sql.

begin;

create or replace function public.save_space_profile_draft(
  p_actor uuid,
  p_space_id uuid,
  p_draft jsonb,
  p_expected bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space public.spaces%rowtype;
  v_raw text;
  v_stored bigint;
  v_next bigint;
  v_allowed boolean;
begin
  if p_actor is null or p_space_id is null then
    raise exception 'save_space_profile_draft: an actor and a Space are required' using errcode = '22023';
  end if;
  if p_draft is not null and jsonb_typeof(p_draft) <> 'object' then
    raise exception 'save_space_profile_draft: the draft must be a JSON object or null' using errcode = '22023';
  end if;
  if p_expected is not null and p_expected < 0 then
    raise exception 'save_space_profile_draft: the expected revision cannot be negative' using errcode = '22023';
  end if;

  -- The row lock makes the access check, the compare and the write one decision.
  select * into v_space from public.spaces s where s.id = p_space_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- The explicit manage-access check (see the header for the rule it mirrors).
  v_allowed :=
    v_space.owner_profile_id = p_actor
    or exists (
      select 1 from public.space_members m
       where m.space_id = p_space_id
         and m.profile_id = p_actor
         and m.status = 'active'
         and m.role in ('editor', 'moderator', 'admin')
    )
    or exists (
      select 1 from public.profiles p
       where p.id = p_actor
         and p.web_role in ('admin', 'janitor')
    )
    or exists (
      select 1
        from public.network_central_admins n
        join public.spaces parent on parent.id = n.parent_space_id
        join public.space_members pm on pm.space_id = parent.id and pm.profile_id = p_actor
       where n.profile_id = p_actor
         and n.parent_space_id = v_space.parent_id
         and parent.id <> v_space.id
         and parent.plan = 'network'
         and parent.status = 'active'
         and parent.type is distinct from 'root'
         and parent.parent_id is null
         and parent.owner_profile_id is not null
         and v_space.owner_profile_id = parent.owner_profile_id
         and v_space.status = 'active'
         and v_space.type is distinct from 'root'
         and pm.status = 'active'
         and pm.role = 'admin'
    );
  if not coalesce(v_allowed, false) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- The counter as the canvas reads it (readCanvasDocument): a positive whole number, otherwise 0.
  v_raw := v_space.preferences ->> 'profileLayoutDraftRevision';
  v_stored := case when v_raw ~ '^[0-9]{1,15}$' then v_raw::bigint else 0 end;
  if p_expected is not null and p_expected <> v_stored then
    return jsonb_build_object('status', 'stale', 'revision', v_stored);
  end if;
  v_next := v_stored + 1;

  update public.spaces s
     set preferences = (
           case
             when p_draft is null then coalesce(s.preferences, '{}'::jsonb) - 'profileLayoutDraft'
             else coalesce(s.preferences, '{}'::jsonb) || jsonb_build_object('profileLayoutDraft', p_draft)
           end
         ) || jsonb_build_object('profileLayoutDraftRevision', v_next)
   where s.id = p_space_id;

  return jsonb_build_object('status', 'written', 'revision', v_next);
end;
$$;

comment on function public.save_space_profile_draft(uuid, uuid, jsonb, bigint) is
  'PROG-E5. The one write of a Space page draft (preferences.profileLayoutDraft) for the canvas and the Space page builder: checks the actor may manage the Space, compares preferences.profileLayoutDraftRevision when an expected revision is given, sets only the draft key (null removes it) and moves the counter, under a row lock. service_role only: callers are the gated server actions through the admin client.';

revoke all on function public.save_space_profile_draft(uuid, uuid, jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.save_space_profile_draft(uuid, uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_space_profile_draft(uuid, uuid, jsonb, bigint) to service_role;

commit;
