-- THE LOOM'S PRIVATE BUCKET (20270345009550_library_private_bucket.sql · LIVE-577 · ADR-1595).
--
-- Protected moves a Loom original into `library-private`. This file proves, after a fresh apply,
-- that the bucket is what the header says:
--   PRIVATE: public = false, so storage serves nothing over /object/public/, with the same size cap
--     and allowlist as library-media so a protect move never fails on a type the public side took.
--   NO BROWSER DOOR: no storage.objects policy names the bucket, every policy on storage.objects is
--     scoped by bucket_id (so none reaches this one by accident), RLS is on, and anon and a signed-in
--     member are both refused a write into it (42501).
--   NOTHING PUBLIC MOVED: library-media is still public, so every page image keeps its url.
-- One transaction, rolled back.

begin;
select plan(9);

select is(
  (select public from storage.buckets where id = 'library-private'),
  false,
  'library-private exists and is not public'
);

select is(
  (select file_size_limit from storage.buckets where id = 'library-private'),
  (select file_size_limit from storage.buckets where id = 'library-media'),
  'library-private takes the same 20 MB cap as library-media'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'library-private'),
  (select allowed_mime_types from storage.buckets where id = 'library-media'),
  'library-private takes the same type allowlist as library-media, so a protect move never fails on type'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%library-private%' $$,
  'no storage.objects policy names library-private: service role only, by decision'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not ilike '%bucket_id%' $$,
  'every storage.objects policy is scoped by bucket_id, so none reaches the private bucket by accident'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'row level security is on for storage.objects'
);

set local role anon;
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('library-private', 'probe/anon.png') $$,
  '42501',
  null,
  'anon cannot write an object into library-private'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a955-000000000001', 'role', 'authenticated')::text,
  true
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('library-private', 'probe/member.png') $$,
  '42501',
  null,
  'a signed-in member cannot write an object into library-private'
);
reset role;

select is(
  (select public from storage.buckets where id = 'library-media'),
  true,
  'library-media stays public: the shared library and every page image keep their urls'
);

select * from finish();
rollback;
