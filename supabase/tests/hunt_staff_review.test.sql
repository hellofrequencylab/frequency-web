-- pgTAP guard for migration 20270346038000_hunt_staff_review.sql (FH-020S).
-- One session, one transaction: it proves a nonce is spent once, that a held claim resumes exactly
-- once after an authorised approval (a second approval and a second key both find it decided), that
-- a rejection and an override leave the right audit rows, and that an appeal opens once. It cannot
-- prove two live sessions race safely; the claim row lock, the run row lock and the nonce primary key
-- carry that.
begin;
select plan(23);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a020-000000000001', 'FH020 Player', 'fh020-p'),
  ('00000000-0000-4000-a020-000000000002', 'FH020 Staff', 'fh020-s');
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-a020-0000000000e1', 'fh020-venue', 'FH020 Venue', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-a020-000000000002', 'active', 'network');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a020-0000000000a1', 'fh020-one', '00000000-0000-4000-a020-000000000002');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a020-0000000000b1', '00000000-0000-4000-a020-0000000000a1', 1, 'published', 'hash-fh020', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a020-0000000000b1'
 where id = '00000000-0000-4000-a020-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a020-0000000000b1', '00000000-0000-4000-a020-0000000000a1', 'm1', 'Held', 'staff'),
  ('00000000-0000-4000-a020-0000000000b1', '00000000-0000-4000-a020-0000000000a1', 'm2', 'Rejected', 'staff'),
  ('00000000-0000-4000-a020-0000000000b1', '00000000-0000-4000-a020-0000000000a1', 'm3', 'Overridden', 'staff');
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a020-0000000000f1', '00000000-0000-4000-a020-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium) values
  ('00000000-0000-4000-a020-0000000000c1', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000f1', 'fh020-staff', 'staff');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a020-0000000000d1', '00000000-0000-4000-a020-0000000000a1',
   '00000000-0000-4000-a020-0000000000b1', '00000000-0000-4000-a020-000000000001');
insert into public.hunt_claims (id, hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id, state, assurance) values
  ('00000000-0000-4000-a020-0000000000aa', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000d1',
   '00000000-0000-4000-a020-0000000000b1', 'm1', '00000000-0000-4000-a020-000000000001', 'ev-1', 'needs_review', 'signed_node'),
  ('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000d1',
   '00000000-0000-4000-a020-0000000000b1', 'm2', '00000000-0000-4000-a020-000000000001', 'ev-2', 'needs_review', 'signed_node'),
  ('00000000-0000-4000-a020-0000000000ac', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000d1',
   '00000000-0000-4000-a020-0000000000b1', 'm3', '00000000-0000-4000-a020-000000000001', 'ev-3', 'rejected', 'signed_node');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hunt_staff_nonce_consume', 'hunt_claim_review', 'hunt_claim_appeal')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute any staff review function');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'hunt_staff_nonces' and grantee in ('anon', 'authenticated')),
  0, 'no browser role holds a grant on the nonce table');

-- Nonces: spent once.
select is(public.hunt_staff_nonce_consume('nonce-fh020-0001', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000c1',
  '00000000-0000-4000-a020-0000000000e1', '00000000-0000-4000-a020-0000000000d1', '00000000-0000-4000-a020-000000000002', now() + interval '2 minutes'),
  true, 'a fresh nonce is spent');
select is(public.hunt_staff_nonce_consume('nonce-fh020-0001', '00000000-0000-4000-a020-0000000000a1', '00000000-0000-4000-a020-0000000000c1',
  '00000000-0000-4000-a020-0000000000e1', '00000000-0000-4000-a020-0000000000d1', '00000000-0000-4000-a020-000000000002', now() + interval '2 minutes'),
  false, 'the same nonce cannot be spent twice');
select is((select count(*)::int from public.hunt_staff_nonces where nonce = 'nonce-fh020-0001'), 1, 'one row records the spend');

-- Held claim: an authorised approval resumes it exactly once.
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000aa', '00000000-0000-4000-a020-000000000002', 'approve', 'Staff saw the player', 'key-fh020-01', 'hash-fh020-review-01'))->>'result',
  'credited', 'an approval credits the held claim');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a020-0000000000d1' and mission_key = 'm1'), 1, 'one credit is written');
select is((select state from public.hunt_claims where id = '00000000-0000-4000-a020-0000000000aa'), 'accepted', 'the claim is accepted');
select is((select count(*)::int from public.hunt_outbox where semantic_key = 'credit:00000000-0000-4000-a020-0000000000d1:m1'), 1, 'one outbox row is written');
select is((select count(*)::int from public.hunt_audit where target_id = '00000000-0000-4000-a020-0000000000aa' and action = 'claim_review_approved'), 1, 'one audit row names the reviewer');
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000aa', '00000000-0000-4000-a020-000000000002', 'approve', 'Staff saw the player', 'key-fh020-01', 'hash-fh020-review-01'))->>'replayed',
  'true', 'the same key replays the answer');
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000aa', '00000000-0000-4000-a020-000000000002', 'approve', 'Again', 'key-fh020-02', 'hash-fh020-review-02'))->>'result',
  'already_decided', 'a second approval under a new key finds the claim decided');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a020-0000000000d1' and mission_key = 'm1'), 1, 'still one credit');
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000aa', '00000000-0000-4000-a020-000000000002', 'approve', 'Different', 'key-fh020-01', 'hash-fh020-review-99'))->>'result',
  'key_conflict', 'a reused key with another payload is a conflict');

-- Rejection, then the player appeals once.
select throws_ok(
  $$select public.hunt_claim_review('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-000000000002', 'reject', '  ', 'key-fh020-03', 'hash-fh020-review-03')$$,
  '22023', 'a rejection needs a reason', 'a rejection without a reason is refused');
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-000000000002', 'reject', 'Code was for another venue', 'key-fh020-04', 'hash-fh020-review-04'))->>'result',
  'rejected', 'a rejection closes the claim');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a020-0000000000d1' and mission_key = 'm2'), 0, 'a rejection credits nothing');
select is((public.hunt_claim_appeal('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-000000000001', 'I was there'))->>'result', 'opened', 'the player appeals');
select is((public.hunt_claim_appeal('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-000000000001', 'I was there'))->>'result', 'already_open', 'a second appeal is not a second case');
select is((public.hunt_claim_appeal('00000000-0000-4000-a020-0000000000ab', '00000000-0000-4000-a020-000000000002', 'Not mine'))->>'result', 'claim_not_found', 'another member cannot appeal it');

-- Override: needs a written reason, credits once, audited under its own name.
select throws_ok(
  $$select public.hunt_claim_review('00000000-0000-4000-a020-0000000000ac', '00000000-0000-4000-a020-000000000002', 'override', 'ok', 'key-fh020-05', 'hash-fh020-review-05')$$,
  '22023', 'an override needs a written reason of at least 10 characters', 'a thin override reason is refused');
select is(
  (public.hunt_claim_review('00000000-0000-4000-a020-0000000000ac', '00000000-0000-4000-a020-000000000002', 'override', 'Support confirmed the visit by phone', 'key-fh020-06', 'hash-fh020-review-06'))->>'result',
  'credited', 'an audited override credits a rejected claim');
select is((select count(*)::int from public.hunt_audit where target_id = '00000000-0000-4000-a020-0000000000ac' and action = 'claim_override'), 1, 'the override has its own audit row');

select * from finish();
rollback;
