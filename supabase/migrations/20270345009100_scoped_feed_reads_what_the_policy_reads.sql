-- scoped_feed_for_viewer admits the cluster announcement the posts policy admits (LIVE-335, ADR-1546).
--
-- 🔴 THE GAP, and it is between two readers that are supposed to agree. 20270345007700 (ADR-1514)
-- gave the ONE `posts` SELECT policy a fourth disjunct on its `cluster` branch:
-- private.is_member_of_circle_space(scope_id), so a Space member who joined none of the Space's
-- Circles reads the announcements the Space publishes through them. That was the finding LIVE-335
-- filed: lib/feed/community-board.ts reached those posts on the SERVICE ROLE because the policy
-- could not express them. The policy can now. The feed RPCs cannot, because they were never
-- updated: `scoped_feed_for_viewer` still admits a `cluster` post only to a member of the Circle,
-- its hub, or its tuned channel. So a session-client read of `posts` and a call to the RPC over
-- the same scope ids return DIFFERENT rows for the same member. A definer function that says
-- less than the policy is not a leak; it is a second, older copy of the rule, and two copies of
-- one rule are how ADR-1514's arm gets lost the next time someone retypes the body.
--
-- ✅ WHAT CHANGES. The cluster branch of `scoped_feed_for_viewer` gains the identical disjunct,
-- `private.is_member_of_circle_space(p.scope_id)`, and nothing else moves: same signature, same
-- return type, same ordering and cap, same demo gate, same discoverability gate. The helper is
-- SECURITY DEFINER in `private` and already executable by authenticated (20270345007700), and it
-- answers false for anon, which this function never serves anyway.
--
-- ⚠️ WHY THIS RPC AND NOT feed_for_viewer. `feed_for_viewer` is the home stream, unscoped, and
-- widening what it carries is a product decision about what home says first (ADR-1294). The scoped
-- RPC is asked about explicit Circle ids by a caller that already resolved them, which is exactly
-- the board's question and the Circle wall's. The home stream is untouched.
--
-- 🔴 WHY THE BOARD NEEDS THE RPC AT ALL, once the policy admits the rows. The board also names the
-- author, and the `profiles` read policy admits another member's row only in the reader's own
-- region. 58 of 59 profiles carry no region, so under the session client a plain member reads
-- exactly one profile: their own. Every author line on the platform therefore comes through a
-- definer function or the service role; this RPC is the definer function the feed already uses
-- for the same shape (`author` jsonb). Widening `profiles` is a privacy decision and not this row.
--
-- GRANTS RE-DERIVED, NOT COPIED (the 20270338000000 hazard): scripts/function-grants.txt records
-- `authenticated` for this function and the verdict is unchanged, so the pair below restates it
-- from zero, role-explicit (ADR-959). `create or replace` keeps the ACL, so this changes nothing.
--
-- PROVED BY supabase/tests/feed_rls_space_scope.test.sql (pgTAP, db-tests), which now asks the RPC
-- the same three questions it asks the policy for the staff seat and the outsider.
--
-- ROLLBACK: re-run the definition in 20270227000000_circle_privacy.sql (the previous body).

begin;

create or replace function public.scoped_feed_for_viewer(
  _scope_ids uuid[],
  _sort      text    default 'relevant',
  _limit     integer default 30
)
returns table (
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb
)
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier, 'is_system', a.is_system) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and p.scope_id = any(_scope_ids)
    and private.post_scope_discoverable(p.scope_id)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )
               -- LIVE-335 / ADR-1514: a member of the Space that OWNS the Circle reads the Space's
               -- announcements there. The same disjunct the posts policy carries; a definer copy of
               -- the rule says exactly what the policy says, or it is a second rule.
               or private.is_member_of_circle_space(p.scope_id)))
      or p.is_demo
    )
  order by case when _sort = 'relevant' then p.engagement_score end desc nulls last, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

revoke all on function public.scoped_feed_for_viewer(uuid[], text, integer) from public, anon;
grant execute on function public.scoped_feed_for_viewer(uuid[], text, integer) to authenticated;

-- CATALOG PROOF, cheap and honest: the live body names the helper, and the grants are the verdict.
-- The behavioural half (the staff seat reads the announcement through the RPC, the outsider does
-- not) is pgTAP's, because it needs seats.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'scoped_feed_for_viewer';
  if v_def is null or v_def not like '%private.is_member_of_circle_space(p.scope_id)%' then
    raise exception 'scoped_feed_for_viewer does not carry the Space-member cluster arm the posts policy carries';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'scoped_feed_for_viewer'
       and privilege_type = 'EXECUTE' and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'scoped_feed_for_viewer became anon-executable; the verdict is authenticated';
  end if;
end $$;

commit;
