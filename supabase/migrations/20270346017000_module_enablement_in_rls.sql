-- ============================================================================
-- APP PLATFORM A3 (PROG-A3): a Space's module on/off switch is enforced INSIDE RLS.
--
-- BEFORE. "Module enabled" lived only in the app: spaces.entitlements -> spaceFunctionEnabled()
-- (lib/spaces/functions.ts), read by menus and server actions. A Space that turned Events or
-- Circles off still had every row reachable through PostgREST with the publishable key, because no
-- policy read the key. A switch the database does not see is a menu preference, not a wall.
--
-- AFTER. Five content tables that already carry space_id and already have a Space-scoped
-- RESTRICTIVE select guard (20260711090000) gain a second one that asks the same question the app
-- asks. Restrictive policies AND with every permissive one, so this can only NARROW what a viewer
-- sees; it never widens a read.
--
--   table          function key (lib/spaces/functions.ts)
--   circles        circles
--   events         events
--   practices      practices
--   journey_plans  journeys
--   programs       program
--
-- THE RULE, mirrored from the app. Every function is universal and DEFAULT-ON: an absent key is ON.
-- Only an explicit `false` written by the operator turns one off (the app's own header says so:
-- "only an explicit `false` disables it"). The SQL reads exactly that and nothing wider, so a
-- malformed blob or a billing-managed key can never hide a Space's content by accident. A null
-- space_id (unpartitioned legacy rows) stays visible, like can_view_space_content.
--
-- WHO STILL SEES A DISABLED MODULE'S ROWS. The Space's own writers (owner, active editor,
-- moderator, admin: public.can_write_space_content) and platform staff, so an operator can still
-- open the module to export or turn it back on. Everyone else, including members and anon, gets
-- nothing, which is the point.
--
-- GRANTS. The helper lives in `private`, which PostgREST does not expose, and follows
-- private.can_see_circle: revoke from public AND the two roles in one statement (ADR-959), then
-- grant back to anon and authenticated because an RLS policy is evaluated as the invoking role.
-- Reversible: drop the five policies and the function.
-- ============================================================================

create or replace function private.space_function_enabled(p_space_id uuid, p_fn text)
returns boolean
language sql
stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- Unpartitioned rows (no owning space) stay visible.
    p_space_id is null
    -- Otherwise ON unless the owning Space carries an explicit `false` for this function key. A Space
    -- that does not exist yields no row, so the exists() is false and the guard hides the orphan only
    -- for the module test; can_view_space_content still decides Private-space visibility.
    or not exists (
      select 1 from public.spaces s
      where s.id = p_space_id
        and jsonb_typeof(s.entitlements) = 'object'
        and s.entitlements -> p_fn = 'false'::jsonb
    );
$$;

comment on function private.space_function_enabled(uuid, text) is
  'True unless the Space has switched the given function (module) off with an explicit false in spaces.entitlements. Mirrors spaceFunctionEnabled in lib/spaces/functions.ts: absent key is ON. Used by the *_module_enabled RESTRICTIVE select policies (PROG-A3).';

revoke all on function private.space_function_enabled(uuid, text) from public, anon, authenticated;
grant execute on function private.space_function_enabled(uuid, text) to anon, authenticated, service_role;

drop policy if exists circles_module_enabled on public.circles;
create policy circles_module_enabled on public.circles
  as restrictive for select
  using (private.space_function_enabled(space_id, 'circles') or public.can_write_space_content(space_id));

drop policy if exists events_module_enabled on public.events;
create policy events_module_enabled on public.events
  as restrictive for select
  using (private.space_function_enabled(space_id, 'events') or public.can_write_space_content(space_id));

drop policy if exists practices_module_enabled on public.practices;
create policy practices_module_enabled on public.practices
  as restrictive for select
  using (private.space_function_enabled(space_id, 'practices') or public.can_write_space_content(space_id));

drop policy if exists journey_plans_module_enabled on public.journey_plans;
create policy journey_plans_module_enabled on public.journey_plans
  as restrictive for select
  using (private.space_function_enabled(space_id, 'journeys') or public.can_write_space_content(space_id));

drop policy if exists programs_module_enabled on public.programs;
create policy programs_module_enabled on public.programs
  as restrictive for select
  using (private.space_function_enabled(space_id, 'program') or public.can_write_space_content(space_id));
