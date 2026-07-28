-- The circle_only read rule's region branch never matched anything (ADR-888).
--
-- Both the `events: status + visibility-aware read` policy and private.can_read_event() grant
-- crew a circle_only event through one of two disjuncts:
--
--     (scope_type = 'circle' and scope_id = any(get_my_circle_ids()))
--  or (scope_type = 'region' and scope_id = get_my_region_id())
--
-- NO WRITER HAS EVER EMITTED scope_type = 'region'. A region-scoped event is written as
-- scope_type = 'public' with scope_id = the region uuid - stated outright in the H1-1 typed-arc
-- migration (20260829000000, "a region-scoped event is scope_type='public'") and confirmed
-- against production: zero 'region' rows have ever existed. So the second disjunct is dead code
-- in a security policy, and its real-world effect was the OPPOSITE of its intent: a circle_only
-- event on a public/region scope matched NEITHER branch and was readable by its host and poster
-- alone, while remaining fully link-readable through the 'unlisted'... no - through nothing;
-- it simply vanished from every list for everyone else. That is how the 16 default-drifted
-- recurrence occurrences (ADR-884) disappeared rather than merely narrowing.
--
-- THE FIX is one word in each place: the region branch tests scope_type = 'public', which is the
-- value region-scoped events actually carry. Semantics restored to what the policy always meant:
-- circle_only + a circle scope -> that Circle's members (crew and up);
-- circle_only + a region scope -> crew of that region.
--
-- BLAST RADIUS, measured before applying: exactly ONE live row is circle_only on a public scope
-- (a past, already-finished occurrence deliberately left as the record of what happened, ADR-884),
-- and zero upcoming rows. No event becomes less visible; one past event becomes visible to the
-- crew of its region, which is what its visibility setting always claimed.
--
-- ALTER POLICY rewrites the USING expression in place (no drop window); the function is
-- CREATE OR REPLACE with its original SECURITY DEFINER + pinned search_path.

alter policy "events: status + visibility-aware read" on public.events
using (
  case
    when (status = 'draft'::text) then (
      (posted_by_profile_id = private.get_my_profile_id())
      or (host_id = private.get_my_profile_id())
      or (private.get_my_role() >= 'guide'::community_role)
    )
    else (
      (visibility = 'public'::text)
      or (visibility = 'unlisted'::text)
      or (host_id = private.get_my_profile_id())
      or (posted_by_profile_id = private.get_my_profile_id())
      or (
        (visibility = 'circle_only'::text)
        and (private.get_my_role() >= 'crew'::community_role)
        and (
          ((scope_type = 'circle'::text) and (scope_id = any (private.get_my_circle_ids())))
          or ((scope_type = 'public'::text) and (scope_id = private.get_my_region_id()))
        )
      )
    )
  end
);

create or replace function private.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'public'
        or e.visibility = 'unlisted'
        or e.host_id = get_my_profile_id()
        or (
          e.visibility = 'circle_only'
          and get_my_role() >= 'crew'::community_role
          and (
            (e.scope_type = 'circle' and e.scope_id = any (get_my_circle_ids()))
            or (e.scope_type = 'public' and e.scope_id = get_my_region_id())
          )
        )
      )
  );
$$;
