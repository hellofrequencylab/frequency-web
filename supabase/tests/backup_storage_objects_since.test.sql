-- THE NIGHTLY STORAGE COPY READS WHAT CHANGED (20270345010400_backup_storage_objects_since.sql
-- · HYG-144 · ADR-1693).
--
-- Proves, after a fresh apply, the contract lib/backup/storage-copy.ts relies on:
--   * every bucket in one walk, private ones included, oldest change first;
--   * strictly after the (changed_at, id) cursor, with a tie on the timestamp broken by id, so a
--     resumed run neither repeats nor skips an object;
--   * an object overwritten in place is dated by updated_at, so it comes back past the cursor;
--   * an object younger than the five-minute settle window waits for the next run;
--   * size and mimetype come from the object's metadata; the limit is clamped;
--   * SECURITY INVOKER, and only service_role may execute it (anon and authenticated would learn
--     every private path).
-- Fixture rows are dated 2001 and named hyg144/..., and every read filters on that prefix, so
-- whatever else the local database holds cannot move an assertion. One transaction, rolled back.

begin;
select plan(10);

insert into storage.buckets (id, name, public) values ('hyg144-new', 'hyg144-new', false)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, created_at, updated_at, metadata) values
  ('00000000-0000-4000-a144-000000000001', 'avatars', 'hyg144/a.png',
   '2001-01-01 00:00:01+00', '2001-01-01 00:00:01+00', '{"size": 1200, "mimetype": "image/png"}'),
  ('00000000-0000-4000-a144-000000000002', 'library-private', 'hyg144/b.jpg',
   '2001-01-01 00:00:02+00', '2001-01-01 00:00:02+00', '{"size": 3400, "mimetype": "image/jpeg"}'),
  ('00000000-0000-4000-a144-000000000003', 'hyg144-new', 'hyg144/c.webp',
   '2001-01-01 00:00:02+00', '2001-01-01 00:00:02+00', '{"mimetype": "image/webp"}'),
  -- created first, overwritten later: dated by the overwrite.
  ('00000000-0000-4000-a144-000000000004', 'posts', 'hyg144/d.gif',
   '2001-01-01 00:00:00+00', '2001-01-01 00:00:09+00', '{"size": 10}'),
  -- a minute old, so inside the five-minute settle window: not yet.
  ('00000000-0000-4000-a144-000000000005', 'posts', 'hyg144/e.gif',
   now() - interval '1 minute', now() - interval '1 minute', '{"size": 10}');

select results_eq(
  $$ select name from public.backup_storage_objects_since(null, null, 1000) where name like 'hyg144/%' $$,
  $$ values ('hyg144/a.png'::text), ('hyg144/b.jpg'), ('hyg144/c.webp'), ('hyg144/d.gif') $$,
  'no cursor: every bucket, the private and a brand-new one included, oldest change first, the settling object left out'
);

select results_eq(
  $$ select name from public.backup_storage_objects_since('2001-01-01 00:00:01+00', '00000000-0000-4000-a144-000000000001', 1000)
     where name like 'hyg144/%' $$,
  $$ values ('hyg144/b.jpg'::text), ('hyg144/c.webp'), ('hyg144/d.gif') $$,
  'strictly after the cursor: the object the cursor names is not read again'
);

select results_eq(
  $$ select name from public.backup_storage_objects_since('2001-01-01 00:00:02+00', '00000000-0000-4000-a144-000000000002', 1000)
     where name like 'hyg144/%' $$,
  $$ values ('hyg144/c.webp'::text), ('hyg144/d.gif') $$,
  'a tie on the timestamp is broken by id, so a resume neither repeats b nor skips c'
);

select is(
  (select changed_at from public.backup_storage_objects_since(null, null, 1000) where name = 'hyg144/d.gif'),
  '2001-01-01 00:00:09+00'::timestamptz,
  'an object overwritten in place is dated by updated_at, so it comes back past an older cursor'
);

select is_empty(
  $$ select 1 from public.backup_storage_objects_since(null, null, 1000) where name = 'hyg144/e.gif' $$,
  'an object inside the five-minute settle window waits for the next run'
);

select results_eq(
  $$ select size, mimetype from public.backup_storage_objects_since(null, null, 1000)
     where name in ('hyg144/a.png', 'hyg144/c.webp') order by name $$,
  $$ values (1200::bigint, 'image/png'::text), (null::bigint, 'image/webp'::text) $$,
  'size and mimetype come from metadata; a missing size is null, not an error'
);

select is(
  (select count(*)::int from public.backup_storage_objects_since(null, null, 0)),
  1,
  'a limit below one is clamped to one'
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.backup_storage_objects_since(timestamptz, uuid, integer)'::regprocedure),
  'SECURITY INVOKER: the function reads with its caller''s rights, never the owner''s'
);

select ok(
  not has_function_privilege('anon', 'public.backup_storage_objects_since(timestamptz, uuid, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.backup_storage_objects_since(timestamptz, uuid, integer)', 'EXECUTE'),
  'anon and authenticated cannot execute it: private object paths stay private'
);

select ok(
  has_function_privilege('service_role', 'public.backup_storage_objects_since(timestamptz, uuid, integer)', 'EXECUTE'),
  'service_role, the cron''s admin client, can execute it'
);

select * from finish();
rollback;
