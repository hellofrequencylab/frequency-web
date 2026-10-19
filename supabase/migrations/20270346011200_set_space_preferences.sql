-- SCAN-833: a website editor save and a Space settings save cannot undo each other through the
-- shared preferences blob.
--
-- THE GAP. writeSpacePreferences and the menu, logo, sky-marker and website style writers read
-- the whole spaces.preferences blob, change one key, and write the whole blob back with no lock.
-- An editor autosave (save_website_editor, which writes the websiteEditor public stub into the
-- same blob) landing between that read and write is reverted, and the editor then reports
-- 'Someone saved a newer draft'. saveWebsiteStyle guarded its whole-blob write on the
-- websiteEditor revision, so it could still revert a concurrent menu, logo or sky-marker save.
--
-- THE FIX. One key-scoped writer, set_space_preferences(p_space_id, p_patch): every top-level key
-- in the patch is set in place with a jsonb merge inside one UPDATE, a null value deletes its key,
-- and every key the patch does not name is left exactly as it is. The writers that used to
-- replace the blob now send only the keys they own. websiteEditor and programOverview are refused
-- here because save_website_editor and space_private_state own them (SCAN-827).
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346011200. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   drop function if exists public.set_space_preferences(uuid, jsonb);
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name (ADR-959).
-- No em or en dashes. pgTAP: supabase/tests/set_space_preferences.test.sql.

begin;

create or replace function public.set_space_preferences(p_space_id uuid, p_patch jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_set jsonb;
  v_drop text[];
  v_found boolean;
begin
  if p_space_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'set_space_preferences: the patch must be a JSON object' using errcode = '22023';
  end if;
  if p_patch ? 'websiteEditor' or p_patch ? 'programOverview' then
    raise exception 'set_space_preferences: websiteEditor and programOverview are written by save_website_editor and space_private_state' using errcode = '22023';
  end if;

  -- Keys with a JSON null are deletions; every other key is set in place.
  v_drop := (select coalesce(array_agg(e.key), '{}'::text[])
               from jsonb_each(p_patch) e where e.value = 'null'::jsonb);
  v_set := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
              from jsonb_each(p_patch) e where e.value <> 'null'::jsonb);

  update public.spaces s
     set preferences = (coalesce(s.preferences, '{}'::jsonb) - v_drop) || v_set
   where s.id = p_space_id;
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

comment on function public.set_space_preferences(uuid, jsonb) is
  'SCAN-833. Key-scoped write to spaces.preferences: each top-level key in the patch is set in one UPDATE, a JSON null deletes its key, and every other key is untouched, so a concurrent save_website_editor stub write is never reverted. websiteEditor and programOverview are refused (SCAN-827 owns them). service_role only: callers are the gated server actions through the admin client.';

revoke all on function public.set_space_preferences(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_space_preferences(uuid, jsonb) to service_role;

commit;
