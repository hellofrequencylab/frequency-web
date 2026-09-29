-- ============================================================================
-- THE NIGHTLY STORAGE COPY READS WHAT CHANGED (HYG-144, ADR-1636, 2026-09-29)
-- ============================================================================
--
-- THE GAP. Supabase's daily database backup carries the storage.objects ROWS and not
-- the files they describe ("Database backups do not include objects stored via the
-- Storage API", OWN-082's rehearsal). A lost bucket was lost. The owner ruled "Nightly
-- copy elsewhere" (OWN-084) and picked Cloudflare R2 as the second store.
--
-- THE FUNCTION. The copy job (app/api/cron/storage-backup, lib/backup/storage-copy.ts)
-- has to ask "which objects, in any bucket, changed after the last one I copied?". The
-- Storage API cannot answer that: its list call walks one folder of one bucket at a
-- time and has no changed-since filter. storage.objects can, but PostgREST exposes only
-- `public`, so the question is this one RPC.
--
--   * Every bucket, public and private, in one ordered walk. A bucket added next month
--     is covered the day it gets its first object, with no list to update.
--   * Keyset order on (coalesce(updated_at, created_at), id), strictly after the
--     caller's cursor, so a run resumes exactly where the last one stopped and an
--     object overwritten in place (upsert) moves past the cursor and is copied again.
--   * A five-minute settle window: an object whose timestamp is younger than that is
--     left for the next run, so an upload whose transaction commits a moment after a
--     later-stamped one cannot fall behind a cursor that already passed its timestamp.
--   * p_limit clamped to 1..1000; the job passes its per-run item budget.
--
-- SECURITY INVOKER, service_role only. The only caller is the cron's admin client, and
-- service_role already reads storage.objects (it bypasses RLS). Granting anon or
-- authenticated would publish every private object's path, so both are revoked by name
-- (ADR-959: a revoke from public alone leaves Supabase's per-role default grants).
--
-- COST. storage.objects is 526 rows today (OWN-082 rehearsal). The walk is a sort over
-- the table; no index is added because storage.objects belongs to the storage service
-- and an index there is not ours to manage. Revisit if the table passes ~100k rows.
--
-- Additive, idempotent (create or replace), safe to re-run. Rollback:
--   drop function if exists public.backup_storage_objects_since(timestamptz, uuid, integer);

create or replace function public.backup_storage_objects_since(
  p_after_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  bucket_id text,
  name text,
  changed_at timestamptz,
  size bigint,
  mimetype text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    o.id,
    o.bucket_id,
    o.name,
    coalesce(o.updated_at, o.created_at) as changed_at,
    case when jsonb_typeof(o.metadata -> 'size') = 'number' then (o.metadata ->> 'size')::bigint end as size,
    o.metadata ->> 'mimetype' as mimetype
  from storage.objects o
  where o.name is not null
    and coalesce(o.updated_at, o.created_at) < now() - interval '5 minutes'
    and (
      p_after_at is null
      or (coalesce(o.updated_at, o.created_at), o.id)
         > (p_after_at, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by coalesce(o.updated_at, o.created_at), o.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.backup_storage_objects_since(timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.backup_storage_objects_since(timestamptz, uuid, integer) to service_role;

comment on function public.backup_storage_objects_since(timestamptz, uuid, integer) is
  'Nightly storage copy (HYG-144, ADR-1636): storage objects in every bucket changed strictly after '
  'the (changed_at, id) cursor and at least five minutes old, oldest first, at most p_limit (1..1000). '
  'Service role only.';
