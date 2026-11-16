-- pgTAP guard for migration 20270346075000_hunt_partner_state.sql (FH-029).
-- Proves: hunt_partners names the invited steward and stays service role only; a claim through a
-- placement whose venue has a partner row that is not in force (invited, withdrawn, suspended, revoked,
-- not yet effective) answers venue_not_active and writes nothing; credit earned before a withdrawal
-- stays and its command still replays as credited; a placement with no venue, and a venue with no
-- partner row, behave as before; a venue accepted again credits again; the grant stays service_role only.
-- The older guarantees of hunt_claim_apply are still proven by hunt_claim_apply.test.sql,
-- hunt_claim_progress_guard.test.sql and hunt_claim_hold.test.sql, which run against this definition.
begin;
select plan(22);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a029-000000000001', 'FH029 Player', 'fh029-p'),
  ('00000000-0000-4000-a029-000000000002', 'FH029 Steward', 'fh029-s');
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-a029-0000000000e1', 'fh029-venue-a', 'FH029 Venue A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-a029-000000000002', 'active', 'network'),
  ('00000000-0000-4000-a029-0000000000e2', 'fh029-venue-b', 'FH029 Venue B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-a029-000000000002', 'active', 'network'),
  ('00000000-0000-4000-a029-0000000000e3', 'fh029-venue-c', 'FH029 Venue C', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-a029-000000000002', 'active', 'network');
insert into public.hunts (id, slug, owner_profile_id) values ('00000000-0000-4000-a029-0000000000a1', 'fh029-one', '00000000-0000-4000-a029-000000000002');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 1, 'published', 'hash-fh029', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a029-0000000000b1' where id = '00000000-0000-4000-a029-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm1', 'Stop 1', 'signed_node'),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm2', 'Stop 2', 'signed_node'),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm3', 'Stop 3', 'signed_node'),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm4', 'Stop 4', 'signed_node'),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm5', 'Stop 5', 'signed_node');
insert into public.hunt_nodes (id, hunt_id) values ('00000000-0000-4000-a029-0000000000f1', '00000000-0000-4000-a029-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium, revoked_at) values
  ('00000000-0000-4000-a029-0000000000c1', '00000000-0000-4000-a029-0000000000a1', '00000000-0000-4000-a029-0000000000f1', 'fh029-live', 'qr', null);
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id, venue_space_id, evidence_policy) values
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm1', '00000000-0000-4000-a029-0000000000c1', '00000000-0000-4000-a029-0000000000e1', '{}'::jsonb),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm2', '00000000-0000-4000-a029-0000000000c1', '00000000-0000-4000-a029-0000000000e1', '{}'::jsonb),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm3', '00000000-0000-4000-a029-0000000000c1', '00000000-0000-4000-a029-0000000000e2', '{}'::jsonb),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm4', '00000000-0000-4000-a029-0000000000c1', null, '{}'::jsonb),
  ('00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-0000000000a1', 'm5', '00000000-0000-4000-a029-0000000000c1', '00000000-0000-4000-a029-0000000000e3', '{}'::jsonb);
insert into public.hunt_partners (hunt_id, space_id, status, invited_by, invitee_profile_id, accepted_by, effective_at, terms_version, permitted_roles) values
  ('00000000-0000-4000-a029-0000000000a1', '00000000-0000-4000-a029-0000000000e1', 'accepted', '00000000-0000-4000-a029-000000000002', '00000000-0000-4000-a029-000000000002', '00000000-0000-4000-a029-000000000002', now() - interval '1 hour', 'terms-fh029', '{operator}'),
  ('00000000-0000-4000-a029-0000000000a1', '00000000-0000-4000-a029-0000000000e2', 'invited', '00000000-0000-4000-a029-000000000002', '00000000-0000-4000-a029-000000000002', null, null, 'terms-fh029', '{operator}');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a029-0000000000d1', '00000000-0000-4000-a029-0000000000a1', '00000000-0000-4000-a029-0000000000b1', '00000000-0000-4000-a029-000000000001');

select is(
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'hunt_partners' and column_name = 'invitee_profile_id'),
  1, 'hunt_partners names the invited steward');
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'hunt_partners_invitee_idx'),
  1, 'the steward foreign key is indexed');
select is(
  (select has_table_privilege('authenticated', 'public.hunt_partners', 'select') or has_table_privilege('anon', 'public.hunt_partners', 'select')),
  false, 'hunt_partners stays closed to browser roles');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm1', '00000000-0000-4000-a029-0000000000c1', 'ev-01', 'signed_node', 'key-fh029-01', 'hash-fh029-request-01'))->>'result',
  'credited', 'an accepted partner venue credits');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm3', '00000000-0000-4000-a029-0000000000c1', 'ev-02', 'signed_node', 'key-fh029-02', 'hash-fh029-request-02'))->>'result',
  'venue_not_active', 'a venue that has not answered its invite gets no proof');
update public.hunt_partners set status = 'withdrawn', revoked_at = now() where hunt_id = '00000000-0000-4000-a029-0000000000a1' and space_id = '00000000-0000-4000-a029-0000000000e1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm2', '00000000-0000-4000-a029-0000000000c1', 'ev-03', 'signed_node', 'key-fh029-03', 'hash-fh029-request-03'))->>'result',
  'venue_not_active', 'a withdrawn venue blocks new proof');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a029-0000000000d1' and mission_key = 'm2'),
  0, 'the refusal writes no claim');
select is(
  (select count(*)::int from public.hunt_command_keys where actor_profile_id = '00000000-0000-4000-a029-000000000001' and idempotency_key = 'key-fh029-03'),
  0, 'the refusal stores no command key');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a029-0000000000d1' and mission_key = 'm1' and disposition = 'credited'),
  1, 'credit earned before the withdrawal stays');
select is(
  (select state from public.hunt_claims where run_id = '00000000-0000-4000-a029-0000000000d1' and mission_key = 'm1'),
  'accepted', 'the earlier claim is untouched');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm1', '00000000-0000-4000-a029-0000000000c1', 'ev-01', 'signed_node', 'key-fh029-01', 'hash-fh029-request-01'))->>'result',
  'credited', 'the earlier command still replays as credited');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm1', '00000000-0000-4000-a029-0000000000c1', 'ev-01', 'signed_node', 'key-fh029-01', 'hash-fh029-request-01'))->>'replayed',
  'true', 'and it is a replay, not a new credit');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a029-0000000000d1'),
  1, 'nothing new was credited while withdrawn');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm4', '00000000-0000-4000-a029-0000000000c1', 'ev-04', 'signed_node', 'key-fh029-04', 'hash-fh029-request-04'))->>'result',
  'credited', 'a placement with no venue is unchanged');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm5', '00000000-0000-4000-a029-0000000000c1', 'ev-05', 'signed_node', 'key-fh029-05', 'hash-fh029-request-05'))->>'result',
  'credited', 'a venue with no partner row is unchanged');
update public.hunt_partners set status = 'accepted', revoked_at = now() - interval '1 minute' where hunt_id = '00000000-0000-4000-a029-0000000000a1' and space_id = '00000000-0000-4000-a029-0000000000e1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm2', '00000000-0000-4000-a029-0000000000c1', 'ev-06', 'signed_node', 'key-fh029-06', 'hash-fh029-request-06'))->>'result',
  'venue_not_active', 'an accepted row with a past revocation is not in force');
update public.hunt_partners set status = 'accepted', revoked_at = null, effective_at = now() + interval '1 day' where hunt_id = '00000000-0000-4000-a029-0000000000a1' and space_id = '00000000-0000-4000-a029-0000000000e1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm2', '00000000-0000-4000-a029-0000000000c1', 'ev-07', 'signed_node', 'key-fh029-07', 'hash-fh029-request-07'))->>'result',
  'venue_not_active', 'an acceptance that is not yet effective is not in force');
update public.hunt_partners set status = 'suspended', revoked_at = now(), effective_at = now() - interval '1 day' where hunt_id = '00000000-0000-4000-a029-0000000000a1' and space_id = '00000000-0000-4000-a029-0000000000e1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm2', '00000000-0000-4000-a029-0000000000c1', 'ev-08', 'signed_node', 'key-fh029-08', 'hash-fh029-request-08'))->>'result',
  'venue_not_active', 'a suspended venue blocks new proof');
update public.hunt_partners set status = 'accepted', revoked_at = null, effective_at = now() - interval '1 minute' where hunt_id = '00000000-0000-4000-a029-0000000000a1' and space_id = '00000000-0000-4000-a029-0000000000e1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a029-000000000001', '00000000-0000-4000-a029-0000000000d1', 'm2', '00000000-0000-4000-a029-0000000000c1', 'ev-09', 'signed_node', 'key-fh029-09', 'hash-fh029-request-09'))->>'result',
  'credited', 'a venue accepted again credits again');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a029-0000000000d1'),
  4, 'four missions are credited in all');
select is(
  (select has_function_privilege('service_role', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')),
  true, 'service_role can execute hunt_claim_apply');
select is(
  (select has_function_privilege('authenticated', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute') or has_function_privilege('anon', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')),
  false, 'no browser role can execute hunt_claim_apply');

select * from finish();
rollback;
