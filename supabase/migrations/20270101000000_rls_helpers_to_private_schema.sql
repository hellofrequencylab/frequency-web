-- Move the RLS helper functions to a schema PostgREST does not expose (ADR-847).
--
-- THE PROBLEM. Eighteen SECURITY DEFINER helpers exist so RLS policies can answer "who is asking"
-- without recursing through the very tables being read. `get_my_profile_id()` alone is referenced by
-- policies on 61 tables. They must keep EXECUTE for `anon` and `authenticated`, because a policy
-- expression is evaluated as the QUERYING role, so revoking the grant would break reads across most
-- of the product. But because they live in `public`, PostgREST also publishes each one at
-- /rest/v1/rpc/<name>, where a browser can call a SECURITY DEFINER function directly. That is the
-- advisory, and a grant tweak cannot fix it: the grant is load-bearing.
--
-- THE FIX. PostgREST exposes SCHEMAS, not functions: only the schemas in its `db-schemas` setting are
-- reachable. Moving the helpers into a `private` schema removes them from the REST surface while
-- leaving the grants intact, so policies keep working unchanged.
--
-- WHY NO POLICY REWRITES. A policy expression is stored PARSED, and a function reference in it binds
-- by OID. `alter function ... set schema` changes the function's namespace, not its OID, so all 228
-- policies that call a helper follow it automatically with no DDL. Verified after the fact: 228 of
-- 369 policies now render with `private.` qualification, and no policy was touched.
--
-- WHY THE BODIES DO NEED REWRITING. A function BODY is stored as TEXT (`pg_proc.prosrc`), not parsed,
-- so it does NOT follow the move. Four helper bodies called a sibling helper as `public.is_space_member(...)`,
-- which would have started resolving to nothing the moment the sibling left `public`. Those are
-- rewritten below FROM `pg_get_functiondef` rather than hand-transcribed, so the body that lands is
-- the body that was there. `search_path` cannot save a hardcoded schema qualification, which is why
-- this step is separate from the one after it.
--
-- WHY search_path IS SET ANYWAY. Helpers that call a sibling UNQUALIFIED, and the seven public RPCs
-- that call a helper unqualified, resolve through `search_path`. Setting it to `public, private,
-- pg_temp` on exactly those functions keeps unqualified resolution working and pins it, so the
-- lookup never depends on the caller's session setting.
--
-- Applied to production 2026-07-27. Verified: 18 functions in `private`, 0 helpers left in `public`,
-- 0 dangling `public.<helper>(` references anywhere, and a smoke test run as `authenticated` returned
-- results byte-identical to the pre-change baseline (events 25, spaces 18, circles 3, posts 57).
--
-- REVERSIBLE: `alter function private.<name>(...) set schema public` per function, then re-run the
-- body rewrite in the opposite direction. Policies again follow by OID.

-- ── 1. The schema ────────────────────────────────────────────────────────────────────────────────

create schema if not exists private;

comment on schema private is
  'Server-internal SQL. PostgREST exposes only the schemas in its db-schemas setting, so nothing here is reachable over /rest/v1/rpc. Holds the SECURITY DEFINER helpers that RLS policies call: they need EXECUTE for anon/authenticated (policy expressions run as the querying role) but must never be directly callable. Do not put tables here.';

-- USAGE on the schema is required for a role to resolve a function inside it, even when EXECUTE on
-- the function is already granted. Without this every policy that calls a helper fails for anon.
grant usage on schema private to anon, authenticated, service_role;

-- ── 2. The move ──────────────────────────────────────────────────────────────────────────────────
-- Named explicitly (not "every SECURITY DEFINER function"): the 44 RPCs the app calls over REST must
-- STAY in public. This list is the audited set of policy-only helpers. `if exists` on the lookup makes
-- the migration re-runnable and safe on a baseline where a helper was never created.

do $$
declare
  helper text;
  sig text;
  helpers text[] := array[
    'am_participant', 'am_room_member', 'can_read_event', 'can_view_space_content',
    'can_write_space_content', 'event_id_for_post', 'get_my_circle_ids', 'get_my_hub_ids',
    'get_my_profile_id', 'get_my_region_id', 'get_my_role', 'get_my_tuned_channel_ids',
    'get_my_web_role', 'is_event_cohost', 'is_my_event', 'is_space_admin', 'is_space_member',
    'is_space_update_post'
  ];
begin
  foreach helper in array helpers loop
    for sig in
      select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = helper
    loop
      execute format('alter function %s set schema private', sig);
    end loop;
  end loop;
end $$;

-- ── 3. Repoint hardcoded `public.<helper>(` calls inside function bodies ─────────────────────────
-- Rewrites the function FROM ITS OWN CURRENT DEFINITION, so nothing is transcribed by hand and any
-- function added later that picked up the same habit is fixed by the same loop on replay.

do $$
declare
  f record;
  helper text;
  def text;
  helpers text[] := array[
    'am_participant', 'am_room_member', 'can_read_event', 'can_view_space_content',
    'can_write_space_content', 'event_id_for_post', 'get_my_circle_ids', 'get_my_hub_ids',
    'get_my_profile_id', 'get_my_region_id', 'get_my_role', 'get_my_tuned_channel_ids',
    'get_my_web_role', 'is_event_cohost', 'is_my_event', 'is_space_admin', 'is_space_member',
    'is_space_update_post'
  ];
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and exists (
        select 1 from unnest(helpers) h
        where p.prosrc like '%public.' || h || '(%'
      )
  loop
    def := pg_get_functiondef(f.oid);
    foreach helper in array helpers loop
      def := replace(def, 'public.' || helper || '(', 'private.' || helper || '(');
    end loop;
    execute def;
  end loop;
end $$;

-- ── 4. Pin search_path on everything that resolves a helper unqualified ─────────────────────────
-- The moved helpers themselves, plus the public RPCs that call one (ensure_calendar_token,
-- feed_for_viewer, funnel_rollup, get_my_group_ids, match_room_messages, scoped_feed_for_viewer,
-- visible_room_member_profiles). Derived by a word-boundary body match rather than a hand list, so
-- `get_my_role` does not match inside `get_my_web_role` and a future caller is covered on replay.

do $$
declare
  f record;
  pattern text;
begin
  select string_agg('\m' || h || '\M', '|') into pattern
  from unnest(array[
    'am_participant', 'am_room_member', 'can_read_event', 'can_view_space_content',
    'can_write_space_content', 'event_id_for_post', 'get_my_circle_ids', 'get_my_hub_ids',
    'get_my_profile_id', 'get_my_region_id', 'get_my_role', 'get_my_tuned_channel_ids',
    'get_my_web_role', 'is_event_cohost', 'is_my_event', 'is_space_admin', 'is_space_member',
    'is_space_update_post'
  ]) h;

  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' or (n.nspname = 'public' and p.prosrc ~ pattern))
      and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, private, pg_temp', f.sig);
  end loop;
end $$;
