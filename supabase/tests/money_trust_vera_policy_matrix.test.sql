-- pgTAP: THE DENY MATRIX for every money, trust and Vera table (HYG-100).
--
-- WHAT THIS PINS. For each table below, the commands listed are the ones a NON-SERVICE-ROLE
-- caller must be refused, and the refusal is structural: there is no permissive policy for that
-- command, so Postgres denies it to anon and to every authenticated caller alike, whatever the
-- application code believes. The complement is pinned too -- a command NOT listed must still have
-- a policy, because a money table that nobody can read any more is a feature going dark rather
-- than a table going safe.
--
-- WHY IT READS pg_policies AND NOT THE .sql FILES. scripts/check-rls-deny.mjs already asserts the
-- same matrix by replaying supabase/migrations as text, and it runs on every pull request. This
-- file is the half that a text scan cannot be: it reads what the database ACTUALLY ENDED UP WITH
-- after a fresh apply, so a policy created through `execute format(...)` inside a DO block, or a
-- migration that does not apply the way it reads, shows up here. ADR-1509's lesson in one line:
-- a probe that greps a .sql file passes perfectly against a migration no database can execute.
--
-- THIS FILE IS A DEFINITION GUARD. It proves no policy EXISTS for a denied command. That a real
-- stranger is really refused a real row is the behavioral half, and it lives next door in
-- money_trust_vera_deny.test.sql with seeded rows and two non-owner seats.
--
-- Runs via `supabase test db` (see README.md), NOT under vitest.

begin;
select plan(5);

-- The matrix. Kept as `('table', 'denied,commands')` pairs because scripts/check-rls-deny.mjs
-- PARSES THIS BLOCK and fails when it disagrees with scripts/rls-deny-surface.txt -- so the
-- static gate and this test cannot drift apart into two different opinions.
create temporary table _deny_matrix (tbl text primary key, denied text) on commit drop;

insert into _deny_matrix (tbl, denied) values
  -- money
  ('commerce_order_items',        'insert,update,delete'),
  ('commerce_orders',             'insert,update,delete'),
  ('commerce_products',           'insert,update,delete'),
  ('commerce_variants',           'insert,update,delete'),
  ('creator_tips',                'select,insert,update,delete'),
  ('entitlement_grants',          'insert,update,delete'),
  ('event_ticket_types',          'insert,update,delete'),
  ('event_tickets',               'insert,update,delete'),
  ('financial_transactions',      'select,insert,update,delete'),
  ('founding_members',            'select,insert,update,delete'),
  ('gem_config',                  'insert,update,delete'),
  ('gem_gifts',                   'insert,update,delete'),
  ('gem_transactions',            'insert,update,delete'),
  ('listing_offers',              'delete'),
  ('partner_redemptions',         'insert,update,delete'),
  ('pricing_stripe_prices',       'select,insert,update,delete'),
  ('profile_personas',            'insert,update,delete'),
  ('profiles',                    'insert,delete'),
  ('spaces',                      'insert,update,delete'),
  ('reward_grants',               'insert,update,delete'),
  ('space_benefit_redemptions',   'select,insert,update,delete'),
  ('space_billing_agreements',    'insert,update,delete'),
  ('space_donations',             'select,insert,update,delete'),
  ('space_memberships',           'insert,update,delete'),
  ('space_subscription_items',    'insert,update,delete'),
  ('space_ticket_rsvps',          'insert,update,delete'),
  ('store_redemptions',           'insert,update,delete'),
  ('stripe_webhook_events',       'select,insert,update,delete'),
  ('supporter_contributions',     'insert,update,delete'),
  ('tips',                        'insert,update,delete'),
  ('zap_config',                  'insert,update,delete'),
  ('zap_transactions',            'insert,update,delete'),
  -- trust
  ('admin_audit_log',             'insert,update,delete'),
  ('area_permissions',            'insert,update,delete'),
  ('beta_audit_log',              'select,insert,update,delete'),
  ('blocked_users',               'insert,update,delete'),
  ('capability_permissions',      'insert,update,delete'),
  ('marketplace_reports',         'update,delete'),
  ('reports',                     'delete'),
  ('space_standing',              'select,insert,update,delete'),
  ('team_members',                'select,insert,update,delete'),
  ('trust_scores',                'select,insert,update,delete'),
  ('trust_signals',               'select,insert,update,delete'),
  -- vera
  ('space_vera_changes',          'update,delete'),
  ('vera_autonomy_decisions',     'select,insert,update,delete'),
  ('vera_config',                 'select,insert,update,delete'),
  ('vera_dispatches',             'insert,update,delete');

-- ── 0. Non-vacuity. A matrix that failed to load asserts nothing, loudly and greenly. ──────────
select is(
  (select count(*) from _deny_matrix), 47::bigint,
  'the deny matrix loaded all 47 money / trust / Vera tables'
);

-- ── 1. Every table in the matrix is a real, live table. ────────────────────────────────────────
-- Without this, retiring a table would silently retire its deny coverage: pg_policies returns no
-- rows for a table that does not exist, so arm 2 would pass by absence.
select is_empty(
  $$ select tbl from _deny_matrix where to_regclass('public.' || tbl) is null $$,
  'every table in the deny matrix still exists'
);

-- ── 2. RLS is ON for every one of them. ────────────────────────────────────────────────────────
-- rls_enabled.test.sql asserts this for nine named tables. This is the same assertion over the
-- whole money / trust / Vera surface, and it is the precondition for arm 3 meaning anything: with
-- RLS off, "no policy for update" means "everybody may update".
select is_empty(
  $$ select m.tbl
       from _deny_matrix m
       join pg_class c on c.oid = to_regclass('public.' || m.tbl)
      where c.relrowsecurity is not true $$,
  'RLS is enabled on every money, trust and Vera table'
);

-- ── 3. THE DENY ARM. No permissive policy exists for any denied command. ───────────────────────
-- A RESTRICTIVE policy is not counted, and must not be: it can only narrow what a permissive
-- policy already allowed, so it can never open a denied command.
select is_empty(
  $$ select m.tbl || ' / ' || c.cmd
       from _deny_matrix m
       cross join lateral unnest(string_to_array(m.denied, ',')) as c(cmd)
      where m.denied <> ''
        and exists (
          select 1 from pg_policies p
           where p.schemaname = 'public'
             and p.tablename = m.tbl
             and p.permissive = 'PERMISSIVE'
             and lower(p.cmd) in (c.cmd, 'all')
        ) $$,
  'no money, trust or Vera table has a permissive policy on a command the matrix denies'
);

-- ── 4. THE COMPLEMENT ARM, which is why this fails BOTH ways. ──────────────────────────────────
-- A command the matrix does NOT deny must still be policied. Dropping the last read policy from
-- event_tickets would leave the table fail-closed and this suite green if only arm 3 existed --
-- and the member looking for their ticket would just see nothing, with no error to trace.
select is_empty(
  $$ select m.tbl || ' / ' || c.cmd
       from _deny_matrix m
       cross join lateral unnest(array['select','insert','update','delete']) as c(cmd)
      where not (c.cmd = any (string_to_array(m.denied, ',')))
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public'
             and p.tablename = m.tbl
             and p.permissive = 'PERMISSIVE'
             and lower(p.cmd) in (c.cmd, 'all')
        ) $$,
  'every command the matrix leaves allowed still has a permissive policy behind it'
);

select * from finish();
rollback;
