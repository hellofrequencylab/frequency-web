-- =============================================================================
-- search_handles_public honours the directory visibility controls (SCAN-766).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- The handle / name typeahead behind app/api/search-handles/route.ts (the composer mention
-- picker, dock chat, group DM, room invite and cohost manager all call it) was still the
-- 20260616120000 body: SECURITY DEFINER, so profile RLS does not apply, and a WHERE of
-- is_active plus a prefix ILIKE. SCAN-546 (ADR-1203) taught six member listings to honour
-- "Show me in the Community directory" (profiles.directory_visible) and Ghost mode
-- (profiles.ghost_mode), the two controls whose copy promises invisibility to discovery, but
-- this function was not among them, so a member who switched either on was still found by name
-- in every picker, and q = '_' or '%' plus prefix paging listed every active member six at a time.
--
-- THE CHANGE, same return shape, same grants (authenticated + service_role, never anon or public):
--   1. p.directory_visible IS NOT FALSE AND p.ghost_mode IS NOT TRUE, mirroring listedAtAll() in
--      lib/connections/directory-visibility.ts.
--   2. An ACCEPTED connection of the caller stays pickable regardless (friendships is canonically
--      ordered: user_a_id = least, user_b_id = greatest), so hiding from the directory does not
--      break messaging the people you already chose. The caller is the session's profile
--      (auth_user_id = auth.uid()); under service_role auth.uid() is null and the clause is simply
--      false, which fails closed to the visibility rule.
--   3. LIKE metacharacters in q are escaped before the trailing percent is appended, so '_' and
--      '%' search for those characters rather than acting as wildcards.
-- =============================================================================

create or replace function public.search_handles_public(q text)
returns table (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text
)
language sql stable security definer
set search_path = public
as $$
  with viewer as (
    select p.id from public.profiles p where p.auth_user_id = auth.uid()
  ),
  term as (
    select replace(replace(replace(coalesce(q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as prefix
  )
  select p.id, p.handle, p.display_name, p.avatar_url
  from   public.profiles p
  where  p.is_active = true
    and  (p.handle ilike (select prefix from term) or p.display_name ilike (select prefix from term))
    and  (
      (p.directory_visible is not false and p.ghost_mode is not true)
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and f.user_a_id = least(p.id, (select id from viewer))
          and f.user_b_id = greatest(p.id, (select id from viewer))
      )
    )
  order by p.display_name
  limit 6;
$$;

-- CREATE OR REPLACE keeps the existing grants, but state them so the file is correct standalone
-- under a replay: the browser user client calls it, anon and PUBLIC never (20270221000200).
revoke execute on function public.search_handles_public(text) from public, anon;
grant execute on function public.search_handles_public(text) to authenticated, service_role;
