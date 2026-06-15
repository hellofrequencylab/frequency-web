-- pgTAP: RLS must be ENABLED on every security-critical table (ADR-275).
--
-- This is the seed of the DB-backed half of the authz harness. It runs against a real
-- Postgres with the migrations applied, via `supabase test db` (see README.md) — NOT under
-- vitest. A table that ships without row-level security is the exact class of mistake an
-- advisor sweep flags; this fails the build instead.
--
-- Extend this directory with per-ROLE policy tests (set_config('request.jwt.claims', …) then
-- assert anon/member/host can or can't read/write a given row) and RPC SECURITY DEFINER tests.

begin;
select plan(1);

select is(
  (
    select coalesce(bool_and(c.relrowsecurity), false)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any (array[
        'financial_transactions',
        'page_settings',
        'page_chrome_overrides',
        'trust_signals',
        'trust_scores',
        'ai_usage',
        'ai_member_context',
        'entities',
        'profile_personas'
      ])
  ),
  true,
  'RLS is enabled on every security-critical table present'
);

select * from finish();
rollback;
