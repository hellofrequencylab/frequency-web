-- profiles.meta gets its second write primitive: a merge INSIDE a shared key (LIVE-171, ADR-1235).
--
-- THE RESIDUAL. Migration 20270345000900 gave every profiles.meta writer a server-side merge of
-- its own TOP-LEVEL key, and named one thing it did not close: the `spotlight` key is written by
-- six writers (the janitor toggle, reset and force-unpublish; the owner's publish, enable, theme
-- and background; the importer's demo dressing) and the `tour` key by two, and each of them read
-- the sub-object, changed one field and sent the whole sub-object back. `||` replaces a nested
-- object at its top-level key, so an owner setting a theme and a janitor unpublishing in the same
-- second still lost one of the two writes, one level down from the race 0900 closed.
--
-- THE FIX. A sibling that takes a PATH: `merge_profile_meta_path(profile, '{spotlight}', patch)`
-- merges `patch` into the object AT that path, under the row lock, so each writer sends only the
-- field it owns (`{"published": false}`, `{"theme": {...}}`) and never a sibling field it read a
-- moment ago. Two concurrent path merges of different fields both survive for the same reason two
-- top-level merges do: the second reads the row as the first left it.
--
-- WHY A SIBLING AND NOT A FOURTH ARGUMENT ON merge_profile_meta. Adding a defaulted parameter is
-- a new signature, and `create or replace` cannot change one; that means a drop, which resets the
-- ACL (scripts/check-function-grants.mjs, "DROP RESETS THE VERDICT") and leaves two overloads
-- PostgREST cannot choose between if the drop is ever missed. A new function is additive and
-- idempotent, touches none of the thirty existing call sites, and carries its own explicit grants.
--
-- WHY THE LOCK AND NOT A SINGLE jsonb_set EXPRESSION. `jsonb_set` creates only the LAST key of a
-- path; when a parent is missing it returns its input UNCHANGED and raises nothing. A path merge
-- that could silently write nothing is the invisible regression this repo's rules forbid, so the
-- function takes the row lock, materialises every missing ancestor as `{}`, and merges under that
-- lock. `select ... for update` is what makes the read-compute-write atomic: a second caller
-- blocks on the lock and then reads the merged row.
--
-- THE MERGE AT THE PATH IS SHALLOW, like its sibling: a nested object inside the patch replaces
-- the field whole. A writer that needs to merge two levels down passes a two-element path.
--
-- Authorization is the same rule as the siblings, inside the function: the service role may write
-- any profile; a signed-in member only the profile whose auth_user_id is their own auth.uid();
-- everyone else is refused with 42501. No column allowlist here: the mirror columns belong to the
-- streak writers, which own a top-level key and keep using merge_profile_meta.
--
-- Additive and idempotent: create or replace, no table change. Grants are role-explicit and both
-- revokes name the role (ADR-959).
--
-- Rollback: drop function if exists public.merge_profile_meta_path(uuid, text[], jsonb);
--           and revert the eight callers in lib/profiles/meta.ts's history to the whole-key merge.
--           Between the two, every spotlight and tour write fails loudly (42883), which is the
--           safer of the two broken states.

begin;

create or replace function public.merge_profile_meta_path(
  p_profile_id uuid,
  p_path text[],
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_sub jsonb;
  v_depth integer := coalesce(array_length(p_path, 1), 0);
  i integer;
begin
  if p_profile_id is null then
    raise exception 'merge_profile_meta_path: profile id is required' using errcode = '22023';
  end if;
  if v_depth = 0 then
    raise exception 'merge_profile_meta_path: path must name at least one key' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_path) as k where k is null or k = '') then
    raise exception 'merge_profile_meta_path: path keys must be non-empty' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_profile_meta_path: patch must be a JSON object' using errcode = '22023';
  end if;

  -- The service role (admin client) may write any profile. A signed-in member may write only the
  -- profile whose auth_user_id is their own auth.uid(). auth.uid() cannot be forged by the caller.
  if auth.role() is distinct from 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.auth_user_id = auth.uid()
    ) then
      raise exception 'merge_profile_meta_path: not your profile' using errcode = '42501';
    end if;
  end if;

  -- Take the row lock FIRST, then compute against the row as the lock hands it over. This is the
  -- whole reason the function is not one UPDATE expression: see the header.
  select coalesce(meta, '{}'::jsonb) into v_meta
    from public.profiles
   where id = p_profile_id
     for update;
  if not found then
    raise exception 'merge_profile_meta_path: profile not found' using errcode = 'P0002';
  end if;

  -- Every ancestor must be an object or jsonb_set silently writes nothing. A missing or non-object
  -- ancestor is materialised as {} (a scalar sitting where a sub-object belongs is not a value any
  -- reader of these keys can use, so replacing it is the honest outcome).
  for i in 1 .. v_depth - 1 loop
    if jsonb_typeof(v_meta #> p_path[1:i]) is distinct from 'object' then
      v_meta := jsonb_set(v_meta, p_path[1:i], '{}'::jsonb, true);
    end if;
  end loop;

  v_sub := v_meta #> p_path;
  if v_sub is null or jsonb_typeof(v_sub) <> 'object' then
    v_sub := '{}'::jsonb;
  end if;
  v_meta := jsonb_set(v_meta, p_path, v_sub || p_patch, true);

  update public.profiles
     set meta = v_meta
   where id = p_profile_id;

  return v_meta;
end;
$$;

comment on function public.merge_profile_meta_path(uuid, text[], jsonb) is
  'Shallow merge of p_patch into the object at p_path inside profiles.meta, under the row lock, returning the merged meta. For keys several writers share (spotlight, tour): each writer sends only the field it owns (lib/profiles/meta.ts mergeProfileMetaPath). Caller must be the service role or the profile''s own auth user.';

-- Role-explicit grants (ADR-959). Signed-in members call it through the session client for their
-- own row (the function checks), the admin client calls it as service_role. anon never.
revoke all on function public.merge_profile_meta_path(uuid, text[], jsonb) from public, anon, authenticated;
grant execute on function public.merge_profile_meta_path(uuid, text[], jsonb) to authenticated, service_role;

commit;
