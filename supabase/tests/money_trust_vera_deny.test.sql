-- pgTAP BEHAVIORAL proof that the money, trust and Vera tables fail closed (HYG-100).
--
-- The sibling file money_trust_vera_policy_matrix.test.sql proves no POLICY EXISTS for a denied
-- command. That is a statement about the catalog. This file is the statement about the data: real
-- rows are seeded as postgres (which RLS does not bind), and then two seats that own none of them
-- -- a signed-out `anon` and a signed-in `authenticated` stranger -- are made to try. The whole
-- run is one transaction, rolled back at the end: nothing persists.
--
-- WHY BOTH FILES. A definition guard cannot see a policy whose predicate is wrong (a
-- `using (true)` has a policy and passes the matrix). A behavioral test cannot see a table nobody
-- remembered to seed. Together they are the pair the tests README asks for, and HYG-100 is the row
-- that asked for it: "prove RLS deny on money/trust/Vera", filed 2026-09-19 as a MANUAL audit
-- because a real deny needs a role that is not service_role. This is that audit, written down so
-- the database re-runs it on every migration instead of a person re-running it never.
--
-- WHAT A DENY LOOKS LIKE, and why the assertions are not all the same shape:
--   insert  -> throws 42501. An error, because the WITH CHECK of a command with no policy is
--              false and Postgres refuses the row.
--   update  -> ZERO ROWS, no error. The USING of a command with no policy admits nothing, so the
--   delete     statement succeeds having changed nothing. This is the dangerous half: code that
--              does not check the row count cannot tell "refused" from "already done", which is
--              exactly why each one is asserted with `is_empty(... returning ...)`.
--   select  -> zero rows, same reason.
--
-- ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT TEST: the GRANT baseline. A fresh local stack applies
-- migrations as postgres WITHOUT the hosted platform's `alter default privileges` grants to
-- anon/authenticated, so an assertion about who holds a table grant would read as green here for
-- a reason that has nothing to do with production (space_tenancy_walls.test.sql's header records
-- the same trap). The grants are therefore GRANTED BACK inside this transaction, which makes
-- every assertion below a statement about the POLICY and nothing else -- the strictly stronger
-- claim, because it holds even if a default-privilege grant is ever restored by accident.
-- scripts/table-grants.txt and `pnpm check:grants` are where the grant decision itself lives.
--
-- Runs via `supabase test db` (see README.md), NOT under vitest.
--
-- The roster below is READ BY scripts/check-rls-deny.mjs, which fails if this file seeds a table
-- that is not a classed money / trust / Vera table in scripts/rls-deny-surface.txt.
--
-- ROSTER BEGIN
--   financial_transactions
--   space_donations
--   tips
--   supporter_contributions
--   event_tickets
--   commerce_orders
--   space_billing_agreements
--   trust_scores
--   trust_signals
--   space_standing
--   vera_config
--   vera_autonomy_decisions
--   vera_dispatches
--   space_vera_changes
--   profiles
--   spaces
-- ROSTER END

begin;
select plan(85);

-- ── Fixture (seeded as postgres, which RLS does not bind) ───────────────────────────────────────
-- A owns everything: the Space, the ledger row, the ticket, the tip, the Vera dispatch.
-- B is a signed-in stranger: a real account, a real profile, and no relationship to any of it.

insert into auth.users (id, email) values
  ('00000000-0000-4000-a100-000000000001', 'deny-owner@test.local'),
  ('00000000-0000-4000-a100-000000000002', 'deny-stranger@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-a100-000000000001', 'Deny Owner', 'deny-owner'),
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-a100-000000000002', 'Deny Stranger', 'deny-stranger');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user now
-- has TWO and get_my_profile_id()'s scalar subquery would error with "more than one row". Keep
-- only the fixed-id profiles above (the idiom space_tenancy_walls.test.sql documents).
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a100-000000000001',
    '00000000-0000-4000-a100-000000000002')
  and id not in (
    '00000000-0000-4000-b100-000000000001',
    '00000000-0000-4000-b100-000000000002');

-- entities.key is constrained to foundation | labs and may already be seeded; reuse if present.
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c100-000000000001', 'deny-space', 'Deny Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b100-000000000001', 'active', 'network');

-- host_id stays null so the suspension trigger has no actor to check (guest_ticket_checkout's idiom).
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values ('00000000-0000-4000-d100-000000000001', 'Deny gathering', 'deny-gathering', 'public',
        '00000000-0000-4000-d100-0000000000aa', 'public', 'published',
        now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false);

-- ── The rows a stranger must never reach ────────────────────────────────────────────────────────

insert into public.financial_transactions (entity_id, revenue_type, profile_id, amount_cents, stripe_account_id)
values ((select id from public.entities where key = 'labs' limit 1), 'dues',
        '00000000-0000-4000-b100-000000000001', 2500, 'acct_deny_owner');

insert into public.space_donations (space_id, donor_profile_id, amount_cents)
values ('00000000-0000-4000-c100-000000000001', '00000000-0000-4000-b100-000000000001', 2500);

insert into public.tips (from_profile_id, to_profile_id, amount_cents)
values (null, '00000000-0000-4000-b100-000000000001', 500);

insert into public.supporter_contributions (profile_id, amount_cents)
values ('00000000-0000-4000-b100-000000000001', 1000);

insert into public.event_tickets (event_id, buyer_profile_id, amount_cents)
values ('00000000-0000-4000-d100-000000000001', '00000000-0000-4000-b100-000000000001', 2500);

insert into public.commerce_orders (buyer_profile_id, owner_kind, owner_profile_id, entity_id, amount_cents)
values ('00000000-0000-4000-b100-000000000001', 'profile', '00000000-0000-4000-b100-000000000001',
        (select id from public.entities where key = 'labs' limit 1), 2500);

insert into public.space_billing_agreements (space_id, plan, amount_cents, started_at, paid_through)
values ('00000000-0000-4000-c100-000000000001', 'business', 100000, current_date, current_date + 365);

insert into public.trust_scores (profile_id, context, score)
values ('00000000-0000-4000-b100-000000000001', 'global', 42);

insert into public.trust_signals (profile_id, source, signal_type, context, weight)
values ('00000000-0000-4000-b100-000000000001', 'moderation', 'report_upheld', 'global', 5);

insert into public.space_standing (space_id) values ('00000000-0000-4000-c100-000000000001');

-- vera_config is a singleton seeded by its own migration (20260603222533), so it is not inserted
-- here. Asserting it is present is part of the non-vacuity control below.

insert into public.vera_autonomy_decisions (category, outcome, breaker_reason)
values ('playbook_email', 'blocked', 'breaker_tripped');

insert into public.vera_dispatches (profile_id, day, kind, copy)
values ('00000000-0000-4000-b100-000000000001', current_date, 'nudge', 'A private nudge.');

insert into public.space_vera_changes (space_id, applied_by, steps)
values ('00000000-0000-4000-c100-000000000001', '00000000-0000-4000-b100-000000000001',
        '[{"change":"move","message":"Moved one gathering.","reverse":null,"reason":"seed"}]'::jsonb);

-- Fresh-stack grants (see the header). These make every assertion below a statement about the
-- POLICY rather than about a grant the local stack never had. profiles and events are granted
-- too because several policy predicates read them AS THE QUERYING ROLE.
grant select, insert, update, delete on
  public.financial_transactions, public.space_donations, public.tips,
  public.supporter_contributions, public.event_tickets, public.commerce_orders,
  public.space_billing_agreements, public.trust_scores, public.trust_signals,
  public.space_standing, public.vera_config, public.vera_autonomy_decisions,
  public.vera_dispatches, public.space_vera_changes, public.profiles, public.spaces
to anon, authenticated;
grant select on public.events to anon, authenticated;

-- ── 0. Non-vacuity. Every assertion below is "you see nothing"; a table nobody seeded would ─────
--       pass all of them and prove nothing at all.
select is_empty(
  $$ select t from (values
       ('financial_transactions',  (select count(*) from public.financial_transactions)),
       ('space_donations',         (select count(*) from public.space_donations)),
       ('tips',                    (select count(*) from public.tips)),
       ('supporter_contributions', (select count(*) from public.supporter_contributions)),
       ('event_tickets',           (select count(*) from public.event_tickets)),
       ('commerce_orders',         (select count(*) from public.commerce_orders)),
       ('space_billing_agreements',(select count(*) from public.space_billing_agreements)),
       ('trust_scores',            (select count(*) from public.trust_scores)),
       ('trust_signals',           (select count(*) from public.trust_signals)),
       ('space_standing',          (select count(*) from public.space_standing)),
       ('vera_config',             (select count(*) from public.vera_config)),
       ('vera_autonomy_decisions', (select count(*) from public.vera_autonomy_decisions)),
       ('vera_dispatches',         (select count(*) from public.vera_dispatches)),
       ('space_vera_changes',      (select count(*) from public.space_vera_changes))
     ) as v(t, n) where n = 0 $$,
  'every table under test holds at least one row, so "sees nothing" means something'
);

-- ── Seat 1: anon (a signed-out visitor holding the anon key) ────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select is_empty($$ select id from financial_transactions $$,   'anon reads no row of the money ledger');
select is_empty($$ select id from space_donations $$,          'anon reads no donation');
select is_empty($$ select id from tips $$,                     'anon reads no tip');
select is_empty($$ select id from supporter_contributions $$,  'anon reads no supporter contribution');
select is_empty($$ select id from event_tickets $$,            'anon reads no ticket');
select is_empty($$ select id from commerce_orders $$,          'anon reads no order');
select is_empty($$ select id from space_billing_agreements $$, 'anon reads no billing agreement');
select is_empty($$ select profile_id from trust_scores $$,     'anon reads no trust score');
select is_empty($$ select id from trust_signals $$,            'anon reads no trust signal');
select is_empty($$ select space_id from space_standing $$,     'anon reads no Space standing');
select is_empty($$ select id from vera_config $$,              'anon reads none of Vera''s config');
select is_empty($$ select id from vera_autonomy_decisions $$,  'anon reads none of Vera''s autonomy decisions');
select is_empty($$ select id from vera_dispatches $$,          'anon reads nobody''s Vera dispatch');
select is_empty($$ select id from space_vera_changes $$,       'anon reads no Vera change-log row');

-- ── Seat 2: an authenticated stranger (a real account that owns none of it) ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000002', 'role', 'authenticated')::text, true);

-- READ
select is_empty($$ select id from financial_transactions $$,   'a stranger reads no row of the money ledger');
select is_empty($$ select id from space_donations $$,          'a stranger reads no donation');
select is_empty($$ select id from tips $$,                     'a stranger reads no tip');
select is_empty($$ select id from supporter_contributions $$,  'a stranger reads no supporter contribution');
select is_empty($$ select id from event_tickets $$,            'a stranger reads no ticket');
select is_empty($$ select id from commerce_orders $$,          'a stranger reads no order');
select is_empty($$ select id from space_billing_agreements $$, 'a stranger reads no billing agreement');
select is_empty($$ select profile_id from trust_scores $$,     'a stranger reads nobody''s trust score');
select is_empty($$ select id from trust_signals $$,            'a stranger reads nobody''s trust signal');
select is_empty($$ select space_id from space_standing $$,     'a stranger reads no Space standing');
select is_empty($$ select id from vera_config $$,              'a stranger reads none of Vera''s config');
select is_empty($$ select id from vera_autonomy_decisions $$,  'a stranger reads none of Vera''s autonomy decisions');
select is_empty($$ select id from vera_dispatches $$,          'a stranger reads nobody else''s Vera dispatch');
select is_empty($$ select id from space_vera_changes $$,       'a stranger reads no Vera change-log row');

-- WRITE: insert. Every row below is otherwise VALID -- every not-null column filled, every check
-- constraint satisfied, every foreign key real -- so 42501 is the only thing that can refuse it.
-- A row that would fail a constraint anyway would "pass" this assertion for the wrong reason.
select throws_ok(
  $$ insert into financial_transactions (entity_id, revenue_type, amount_cents)
     values ((select id from entities where key = 'labs' limit 1), 'payout', 999999) $$,
  '42501', null, 'a stranger cannot write a row into the money ledger');
select throws_ok(
  $$ insert into space_donations (space_id, amount_cents)
     values ('00000000-0000-4000-c100-000000000001', 1) $$,
  '42501', null, 'a stranger cannot invent a donation');
select throws_ok(
  $$ insert into tips (to_profile_id, amount_cents)
     values ('00000000-0000-4000-b100-000000000002', 1) $$,
  '42501', null, 'a stranger cannot invent a tip to themselves');
select throws_ok(
  $$ insert into supporter_contributions (profile_id, amount_cents)
     values ('00000000-0000-4000-b100-000000000002', 1) $$,
  '42501', null, 'a stranger cannot invent a supporter contribution');
select throws_ok(
  $$ insert into event_tickets (event_id, buyer_profile_id, amount_cents)
     values ('00000000-0000-4000-d100-000000000001', '00000000-0000-4000-b100-000000000002', 1) $$,
  '42501', null, 'a stranger cannot mint themselves a ticket');
select throws_ok(
  $$ insert into commerce_orders (buyer_profile_id, owner_kind, owner_profile_id, entity_id, amount_cents)
     values ('00000000-0000-4000-b100-000000000002', 'profile', '00000000-0000-4000-b100-000000000002',
             (select id from entities where key = 'labs' limit 1), 1) $$,
  '42501', null, 'a stranger cannot write themselves an order');
select throws_ok(
  $$ insert into space_billing_agreements (space_id, plan, amount_cents, started_at, paid_through)
     values ('00000000-0000-4000-c100-000000000001', 'business', 1, current_date, current_date) $$,
  '42501', null, 'a stranger cannot write a billing agreement for a Space they do not own');
select throws_ok(
  $$ insert into trust_scores (profile_id, context, score)
     values ('00000000-0000-4000-b100-000000000002', 'marketplace', 100) $$,
  '42501', null, 'a stranger cannot award themselves a trust score');
select throws_ok(
  $$ insert into trust_signals (profile_id, source, signal_type, context, weight)
     values ('00000000-0000-4000-b100-000000000002', 'endorsement', 'self_dealt', 'global', 100) $$,
  '42501', null, 'a stranger cannot emit a trust signal');
select throws_ok(
  $$ insert into space_standing (space_id, standing_score)
     values ('00000000-0000-4000-c100-000000000001', 1) $$,
  '42501', null, 'a stranger cannot write a Space''s standing');
select throws_ok(
  $$ insert into vera_config (id, config) values ('singleton', '{"autonomy":"on"}'::jsonb) $$,
  '42501', null, 'a stranger cannot write Vera''s config');
select throws_ok(
  $$ insert into vera_autonomy_decisions (category, outcome) values ('intro_email', 'sent') $$,
  '42501', null, 'a stranger cannot write a Vera autonomy decision');
select throws_ok(
  $$ insert into vera_dispatches (profile_id, day, kind, copy)
     values ('00000000-0000-4000-b100-000000000002', current_date, 'nudge', 'Forged.') $$,
  '42501', null, 'a stranger cannot write a Vera dispatch');
select throws_ok(
  $$ insert into space_vera_changes (space_id, steps)
     values ('00000000-0000-4000-c100-000000000001', '[]'::jsonb) $$,
  '42501', null, 'a stranger cannot append to another Space''s Vera change log');

-- WRITE: update. These are the quiet ones -- no error is raised, the statement simply reaches no
-- row, so each is asserted on what it RETURNS rather than on whether it threw.
select is_empty(
  $$ update financial_transactions set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of the money ledger reaches zero rows');
select is_empty(
  $$ update space_donations set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of a donation reaches zero rows');
select is_empty(
  $$ update tips set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of a tip reaches zero rows');
select is_empty(
  $$ update supporter_contributions set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of a supporter contribution reaches zero rows');
select is_empty(
  $$ update event_tickets set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of a ticket reaches zero rows');
select is_empty(
  $$ update commerce_orders set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of an order reaches zero rows');
select is_empty(
  $$ update space_billing_agreements set amount_cents = 1 returning id $$,
  'a stranger''s rewrite of a billing agreement reaches zero rows');
select is_empty(
  $$ update trust_scores set score = 999 returning profile_id $$,
  'a stranger''s rewrite of a trust score reaches zero rows');
select is_empty(
  $$ update trust_signals set weight = 999 returning id $$,
  'a stranger''s rewrite of a trust signal reaches zero rows');
select is_empty(
  $$ update space_standing set standing_score = 1 returning space_id $$,
  'a stranger''s rewrite of a Space''s standing reaches zero rows');
select is_empty(
  $$ update vera_config set config = '{"autonomy":"on"}'::jsonb returning id $$,
  'a stranger''s rewrite of Vera''s config reaches zero rows');
select is_empty(
  $$ update vera_autonomy_decisions set outcome = 'sent' returning id $$,
  'a stranger''s rewrite of a Vera autonomy decision reaches zero rows');
select is_empty(
  $$ update vera_dispatches set copy = 'Forged.' returning id $$,
  'a stranger''s rewrite of a Vera dispatch reaches zero rows');
select is_empty(
  $$ update space_vera_changes set steps = '[]'::jsonb returning id $$,
  'a stranger''s rewrite of the Vera change log reaches zero rows');

-- WRITE: delete. Same quiet shape. A money row that can be deleted is a receipt that can be
-- disowned, and a trust row that can be deleted is a sanction that can be laundered.
select is_empty(
  $$ delete from financial_transactions returning id $$,
  'a stranger cannot delete a row of the money ledger');
select is_empty(
  $$ delete from space_donations returning id $$,
  'a stranger cannot delete a donation');
select is_empty(
  $$ delete from tips returning id $$,
  'a stranger cannot delete a tip');
select is_empty(
  $$ delete from supporter_contributions returning id $$,
  'a stranger cannot delete a supporter contribution');
select is_empty(
  $$ delete from event_tickets returning id $$,
  'a stranger cannot delete a ticket');
select is_empty(
  $$ delete from commerce_orders returning id $$,
  'a stranger cannot delete an order');
select is_empty(
  $$ delete from space_billing_agreements returning id $$,
  'a stranger cannot delete a billing agreement');
select is_empty(
  $$ delete from trust_scores returning profile_id $$,
  'a stranger cannot delete a trust score');
select is_empty(
  $$ delete from trust_signals returning id $$,
  'a stranger cannot delete a trust signal');
select is_empty(
  $$ delete from space_standing returning space_id $$,
  'a stranger cannot delete a Space''s standing');
select is_empty(
  $$ delete from vera_config returning id $$,
  'a stranger cannot delete Vera''s config');
select is_empty(
  $$ delete from vera_autonomy_decisions returning id $$,
  'a stranger cannot delete a Vera autonomy decision');
select is_empty(
  $$ delete from vera_dispatches returning id $$,
  'a stranger cannot delete a Vera dispatch');
select is_empty(
  $$ delete from space_vera_changes returning id $$,
  'a stranger cannot delete a Vera change-log row');

-- ── Seat 2, continued: the two PUBLICLY READABLE rows that carry money identifiers ──────────────
-- profiles.stripe_account_id is the Connect account a person's payouts land in; spaces
-- .stripe_customer_id is the customer a Space's plan is billed to. Both rows are meant to be read
-- (a directory is not a secret). The thing that must never happen is a stranger REPOINTING where
-- the money goes, so these two are asserted on writes only. Nothing here says who may READ those
-- columns -- that is a COLUMN grant, ADR-964, and it is not what this file measures.
select is_empty(
  $$ update profiles set stripe_account_id = 'acct_intruder'
      where id = '00000000-0000-4000-b100-000000000001' returning id $$,
  'a stranger cannot repoint another person''s Connect account');
select is_empty(
  $$ delete from profiles where id = '00000000-0000-4000-b100-000000000001' returning id $$,
  'a stranger cannot delete another person''s profile');
select is_empty(
  $$ update spaces set stripe_customer_id = 'cus_intruder'
      where id = '00000000-0000-4000-c100-000000000001' returning id $$,
  'a stranger cannot repoint a Space''s billing customer');
select is_empty(
  $$ delete from spaces where id = '00000000-0000-4000-c100-000000000001' returning id $$,
  'a stranger cannot delete a Space they do not own');

-- ── Seat 3: the OWNER. Positive controls, so "nobody sees anything" is ruled out. ───────────────
-- Every assertion above is satisfied by a table that is simply broken. These six are what make
-- the difference between "RLS denies the stranger" and "RLS denies everyone".
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000001', 'role', 'authenticated')::text, true);

select results_eq($$ select count(*)::int from tips $$, $$ values (1) $$,
  'the recipient sees their own tip');
select results_eq($$ select count(*)::int from event_tickets $$, $$ values (1) $$,
  'the buyer sees their own ticket');
select results_eq($$ select count(*)::int from supporter_contributions $$, $$ values (1) $$,
  'the contributor sees their own contribution');
select results_eq($$ select count(*)::int from commerce_orders $$, $$ values (1) $$,
  'the buyer sees their own order');
select results_eq($$ select count(*)::int from space_billing_agreements $$, $$ values (1) $$,
  'the Space''s owner sees their own billing agreement');
select results_eq($$ select count(*)::int from vera_dispatches $$, $$ values (1) $$,
  'the member sees their own Vera dispatch');

-- ── Seat 3, continued: THE APPEND-ONLY PROOF (PROG-CAL11 slice 3) ──────────────────────────────
-- space_vera_changes has a select policy and an insert policy and DELIBERATELY no update or
-- delete policy, so the record of what Vera did to a calendar cannot be edited or erased -- not by
-- a stranger (asserted above) and not by the team that wrote it either. An Undo is a NEW row
-- pointing at the one it reversed. These four arms are the ones that would go red the day someone
-- adds `for update` to that table "just to fix a typo".
select results_eq($$ select count(*)::int from space_vera_changes $$, $$ values (1) $$,
  'the Space''s own team reads its Vera change log');
select is_empty(
  $$ update space_vera_changes set steps = '[]'::jsonb returning id $$,
  'even the team that wrote the Vera change-log row cannot edit it');
select is_empty(
  $$ delete from space_vera_changes returning id $$,
  'even the team that wrote the Vera change-log row cannot delete it');
select lives_ok(
  $$ insert into space_vera_changes (space_id, steps)
     values ('00000000-0000-4000-c100-000000000001', '[]'::jsonb) $$,
  'the team CAN append a new Vera change-log row, which is how an Undo is recorded');

select * from finish();
rollback;
