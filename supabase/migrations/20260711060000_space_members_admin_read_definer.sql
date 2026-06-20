-- Harden the space_members admin-read RLS policy by replacing its self-recursive subquery with a
-- SECURITY DEFINER helper (the repo's ADR-056 pattern: DEFINER functions for restricted-join reads).
--
-- THE BUG: the old `space_members_read_for_space_admin` policy's USING clause selected FROM
-- space_members inside a policy ON space_members. Postgres re-applies the table's RLS to that inner
-- read, so a session-client SELECT on space_members would raise "infinite recursion detected in
-- policy for relation space_members". It never surfaced in production because the app reads
-- space_members exclusively through the service-role admin client (which bypasses RLS), so the
-- policy never fired. This makes a session-client read safe too (defense in depth) and folds in the
-- space owner (spaces.owner_profile_id), the implicit super-admin.
--
-- WHY DEFINER BREAKS THE RECURSION: a SECURITY DEFINER function runs as its owner (a table owner /
-- BYPASSRLS role), so its reads of spaces/space_members do NOT re-enter those tables' RLS. The
-- session GUCs are unchanged, so auth.uid() still resolves to the CALLER, preserving the check's
-- intent. search_path is pinned (advisor hygiene), and EXECUTE is limited to authenticated.

create or replace function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_profile_id = (select auth.uid())
  ) or exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.profile_id = (select auth.uid())
      and m.role = 'admin'
      and m.status = 'active'
  );
$$;

comment on function public.is_space_admin(uuid) is
  'True if the current auth.uid() is the owner or an active admin member of the given Space. SECURITY DEFINER so it reads spaces/space_members WITHOUT re-triggering their RLS (breaks the recursion in the space_members admin-read policy; ADR-056 pattern). Pinned search_path; EXECUTE limited to authenticated.';

revoke all on function public.is_space_admin(uuid) from public;
revoke all on function public.is_space_admin(uuid) from anon;
grant execute on function public.is_space_admin(uuid) to authenticated;

drop policy if exists space_members_read_for_space_admin on public.space_members;
create policy space_members_read_for_space_admin on public.space_members
  for select to authenticated
  using (public.is_space_admin(space_id));
