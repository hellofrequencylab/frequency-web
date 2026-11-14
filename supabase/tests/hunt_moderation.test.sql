-- pgTAP guard for migration 20270346047000_hunt_moderation.sql (FH-018S).
-- One session, one transaction: it proves a report is taken once per person per Hunt, that a retry with
-- the same key replays one answer, that pause, resume and close make only the allowed moves (closed is
-- final), that close and resume resolve open reports while a pause leaves them open, and that no browser
-- role can execute either function.
begin;
select plan(18);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a018-000000000001', 'FH018 Reporter A', 'fh018-a'),
  ('00000000-0000-4000-a018-000000000002', 'FH018 Reporter B', 'fh018-b'),
  ('00000000-0000-4000-a018-000000000011', 'FH018 Operator', 'fh018-op');
insert into public.hunts (id, slug, owner_profile_id, visibility) values
  ('00000000-0000-4000-a018-0000000000a1', 'fh018-one', '00000000-0000-4000-a018-000000000011', 'public'),
  ('00000000-0000-4000-a018-0000000000a2', 'fh018-private', '00000000-0000-4000-a018-000000000011', 'private');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a018-0000000000b1', '00000000-0000-4000-a018-0000000000a1', 1, 'published', 'hash-fh018', now()),
  ('00000000-0000-4000-a018-0000000000b2', '00000000-0000-4000-a018-0000000000a2', 1, 'published', 'hash-fh018-2', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a018-0000000000b1' where id = '00000000-0000-4000-a018-0000000000a1';
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a018-0000000000b2' where id = '00000000-0000-4000-a018-0000000000a2';

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hunt_report_file', 'hunt_moderate')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute report or moderate');

select is((public.hunt_report_file('00000000-0000-4000-a018-000000000001', '00000000-0000-4000-a018-0000000000a1', 'unsafe', 'busy road', 'key-fh018-r1', 'hash-fh018-report-01'))->>'result', 'reported', 'A reports the Trail');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000001', '00000000-0000-4000-a018-0000000000a1', 'unsafe', 'busy road', 'key-fh018-r1', 'hash-fh018-report-01'))->>'replayed', 'true', 'the same key replays');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000001', '00000000-0000-4000-a018-0000000000a1', 'other', '', 'key-fh018-r1', 'hash-fh018-report-02'))->>'result', 'key_conflict', 'a reused key for another request is a conflict');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000001', '00000000-0000-4000-a018-0000000000a1', 'other', '', 'key-fh018-r2', 'hash-fh018-report-03'))->>'result', 'already_reported', 'a second report from A is not a second voice');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000002', '00000000-0000-4000-a018-0000000000a1', 'spam', '', 'key-fh018-r3', 'hash-fh018-report-04'))->>'result', 'bad_reason', 'an unknown reason is refused');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000002', '00000000-0000-4000-a018-0000000000a1', 'other', repeat('x', 1001), 'key-fh018-r4', 'hash-fh018-report-05'))->>'result', 'details_too_long', 'long details are refused');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000002', '00000000-0000-4000-a018-0000000000a2', 'unsafe', '', 'key-fh018-r5', 'hash-fh018-report-06'))->>'result', 'hunt_not_found', 'a private Hunt cannot be reported');
select is((public.hunt_report_file('00000000-0000-4000-a018-000000000002', '00000000-0000-4000-a018-0000000000a1', 'wrong_or_broken', '', 'key-fh018-r6', 'hash-fh018-report-07'))->>'result', 'reported', 'B reports the Trail');
select is((select count(*)::int from public.hunt_reports where hunt_id = '00000000-0000-4000-a018-0000000000a1' and state = 'open'), 2, 'two open reports');

select is((public.hunt_moderate('00000000-0000-4000-a018-000000000011', '00000000-0000-4000-a018-0000000000a1', 'resume', '', 'key-fh018-m1', 'hash-fh018-mod-01'))->>'result', 'not_allowed', 'a running Trail cannot be resumed');
select is((public.hunt_moderate('00000000-0000-4000-a018-000000000011', '00000000-0000-4000-a018-0000000000a1', 'pause', 'checking the road', 'key-fh018-m2', 'hash-fh018-mod-02'))->>'status', 'paused', 'pause moves live to paused');
select is((select count(*)::int from public.hunt_reports where hunt_id = '00000000-0000-4000-a018-0000000000a1' and state = 'open'), 2, 'a pause leaves the reports open');
select is((public.hunt_moderate('00000000-0000-4000-a018-000000000011', '00000000-0000-4000-a018-0000000000a1', 'resume', 'road is fine', 'key-fh018-m3', 'hash-fh018-mod-03'))->>'status', 'live', 'resume moves paused to live');
select is((select count(*)::int from public.hunt_reports where hunt_id = '00000000-0000-4000-a018-0000000000a1' and state = 'dismissed'), 2, 'resume dismisses the open reports');
select is((public.hunt_moderate('00000000-0000-4000-a018-000000000011', '00000000-0000-4000-a018-0000000000a1', 'close', 'done', 'key-fh018-m4', 'hash-fh018-mod-04'))->>'status', 'ended', 'close moves live to ended');
select is((public.hunt_moderate('00000000-0000-4000-a018-000000000011', '00000000-0000-4000-a018-0000000000a1', 'resume', '', 'key-fh018-m5', 'hash-fh018-mod-05'))->>'result', 'not_allowed', 'a closed Trail is never reopened');

select * from finish();
rollback;
