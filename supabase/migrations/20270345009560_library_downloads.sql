-- THE LOOM DOWNLOAD RECORD (LIVE-578, ADR-1596; child 3 of PROG-D6 under ADR-1562).
--
-- Download in Loom Studio used to be a browser fetch of the public url: no policy was asked and
-- nothing was written down. Every download of a file-backed Loom asset now goes through one server
-- door, app/api/library/download/[id]/route.ts, which applies the asset's download_policy to the
-- caller (open, members, staff), writes ONE row here, and only then redirects to the file (a
-- one-minute signed URL for a protected original). A download that cannot be recorded is refused,
-- because the record is what the policy exists for.
--
-- APPEND ONLY, KEPT BY THE DATABASE. The shape is admin_audit_log's (20260608130000): the service
-- role writes, staff read, and there is NO insert, update or delete policy for any other caller.
-- The table grants say the same thing a second time: anon holds nothing, authenticated holds select
-- only. A record of who took an original that can be edited afterwards is not a record.
--
--   asset_id    on delete cascade: when the asset is deleted, its download history goes with it.
--   profile_id  on delete set null: a departed member does not take the record with them. Null also
--               means a signed-out visitor on an `open` asset, which is what `open` allows.
--   policy      the policy as it stood at the moment of the download, as text, so a later change
--               to the asset never rewrites what was true when the file left.
--
-- House style: additive + idempotent. Rollback: drop the table.

create table if not exists public.library_downloads (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references public.library_assets(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  policy      text not null,
  created_at  timestamptz not null default now()
);

comment on table public.library_downloads is
  'One row per download of a Loom asset through the download door (LIVE-578, ADR-1596). Append only: service-role insert, staff read, no update or delete policy.';
comment on column public.library_downloads.policy is
  'The asset download_policy (open | members | staff) at the moment of the download.';

create index if not exists library_downloads_asset_idx
  on public.library_downloads (asset_id, created_at desc);

create index if not exists library_downloads_profile_idx
  on public.library_downloads (profile_id) where profile_id is not null;

alter table public.library_downloads enable row level security;

-- Staff read the record (the same staff axis every audit table uses). Nobody else reads it.
drop policy if exists library_downloads_staff_read on public.library_downloads;
create policy library_downloads_staff_read on public.library_downloads
  for select to authenticated
  using ((select private.get_my_web_role()) in ('admin', 'janitor'));

-- On purpose: no insert, no update and no delete policy. The door writes through the service role,
-- after it has applied the policy; nothing rewrites or removes a row once it exists.

revoke all on table public.library_downloads from anon;
revoke insert, update, delete, truncate on table public.library_downloads from authenticated;
