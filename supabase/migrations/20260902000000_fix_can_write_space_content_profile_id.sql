-- T0 slice-0 — fix the latent-broken can_write_space_content() RLS helper.
--
-- BUG (discovered 2026-06-29): the owner and member arms compared profiles.id-typed
-- columns (spaces.owner_profile_id, space_members.profile_id — both FK -> profiles.id)
-- directly to auth.uid() (the auth user id). In this schema profiles.id <> auth_user_id
-- (verified: 0 of 22 profiles match), so those arms NEVER matched a real caller:
--   • non-root spaces -> the *_space_writable_* policies were effectively deny-all
--     (masked today only because the app writes through the admin client / RLS bypass);
--   • the root arm was caller-INDEPENDENT (`s.type = 'root'`), so it returned true for
--     ANY authenticated caller -> root-space rows would be world-writable the moment a
--     dependent surface converged onto the session client.
--
-- The correct identity idiom in this codebase is get_my_profile_id()
-- ( = select id from profiles where auth_user_id = auth.uid() ), as already used by the
-- working member-facing policies (posts, event-host, is_space_member, …).
--
-- FIX:
--   • owner/member arms -> compare against get_my_profile_id();
--   • root + null-space arms -> gate to platform staff (get_my_web_role() in admin/janitor)
--     instead of being open to all. No table currently has a null space_id (all 0), and
--     nothing writes through this helper live yet, so this changes no current behavior —
--     it only makes future session-client convergence correct and safe.
--
-- Dependents re-pointed automatically (function body swap): the *_space_writable_*
-- INSERT/UPDATE/DELETE policies on circles, events, journey_plans, practices, programs.
-- Verified by a deterministic old-vs-new dry-run against prod data before applying:
--   owner->own = false->true · non-member->prac = false->false ·
--   non-staff->root = true->false (hole closed) · staff->root = true->true.
--
-- Reversible: re-running the prior definition restores the old body. Additive (no schema
-- change, no data change).

create or replace function public.can_write_space_content(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    -- platform-global (null space) and root-space content: staff only (was: open to all)
    (p_space_id is null and public.get_my_web_role() in ('admin', 'janitor'))
    or exists (
      select 1 from public.spaces s
      where s.id = p_space_id
        and s.type = 'root'
        and public.get_my_web_role() in ('admin', 'janitor')
    )
    -- the Space owner (was: owner_profile_id = auth.uid(), which never matched)
    or exists (
      select 1 from public.spaces s
      where s.id = p_space_id
        and s.owner_profile_id = public.get_my_profile_id()
    )
    -- an active editor/moderator/admin member (was: profile_id = auth.uid(), never matched)
    or exists (
      select 1 from public.space_members m
      where m.space_id = p_space_id
        and m.profile_id = public.get_my_profile_id()
        and m.status = 'active'
        and m.role in ('editor', 'moderator', 'admin')
    );
$function$;
