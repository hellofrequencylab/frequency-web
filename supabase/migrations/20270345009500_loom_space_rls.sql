-- THE LOOM GETS A DATABASE WALL (LIVE-570 · child 5 of PROG-D5 · ADR-1594).
--
-- Until this file, library_assets, library_collections, library_collection_items and
-- library_versions were RLS-on with NO policy (20260919000000, 20260920000000) and every grant
-- revoked from anon and authenticated (20270218000000). Every read and write went through
-- createAdminClient(), so the only thing between one Space and another Space's private images
-- was a `.eq('space_id', …)` in a server action. This file writes the wall into the database.
--
-- WHO READS:
--   * library_assets: the Space's own people (private.is_space_member: the owner or an ACTIVE
--     space_members seat, any role, the staff ladder the calendar and feed tables use), any
--     row with visibility = 'public' for any signed-in caller (the shared library, the same OR
--     lib/library/store.ts already runs), and platform staff (web_role admin or janitor).
--   * library_collections: the Space's own people and platform staff.
--   * library_collection_items and library_versions follow their PARENT's Space: the parent row
--     is read through a subquery, so its own policy applies there too. A version of a public
--     asset is still team-only; public shares the picture, not its edit history.
--
-- WHO WRITES: private.can_write_space_content(space_id), the helper every other Space-owned
-- content table uses (owner, active editor/moderator/admin, staff on the root Space) and whose
-- identity fix 20260902000000 is pinned by supabase/tests/can_write_space_content.test.sql.
-- An insert is signed: created_by is null or the caller's own profile. A collection item may
-- only point at an asset the caller can already read, so a collection cannot be used to probe
-- another Space's private asset ids.
--
-- A VERSION IS A RECORD: insert only. No UPDATE or DELETE policy, and no UPDATE or DELETE
-- grant either, so a client refusal does not rest on one lock. The is_current flip in
-- lib/library/versions.ts stays on the service role (LIVE-571 decides its client shape).
--
-- NOT HERE: library_styles stays deny-all (it holds Recraft style ids no client should read);
-- library_renditions and library_usages were dropped by 20260925000000.
-- storage.objects policies are PROG-D6. Moving the Space Loom reads onto the session client is
-- LIVE-571, which this unblocks: until then the app behaves exactly as before, because every
-- caller is still the service role and the service role bypasses RLS.
--
-- No policy body reads spaces or space_members directly; both go through SECURITY DEFINER
-- helpers in `private`, so check:rls-recursion sees only child-to-parent edges and no cycle.
-- Every foreign key a policy leans on is already indexed (check:fk-indexes).
--
-- APPLY AFTER MERGE, never before (docs/DATABASE.md): execute_sql for this DDL, then the
-- ledger insert at this file's own version (20270345009500, loom_space_rls).
--
-- ROLLBACK (restores the deny-all posture exactly):
--   drop policy if exists library_assets_space_read on public.library_assets;
--   drop policy if exists library_assets_space_insert on public.library_assets;
--   drop policy if exists library_assets_space_update on public.library_assets;
--   drop policy if exists library_assets_space_delete on public.library_assets;
--   drop policy if exists library_collections_space_read on public.library_collections;
--   drop policy if exists library_collections_space_insert on public.library_collections;
--   drop policy if exists library_collections_space_update on public.library_collections;
--   drop policy if exists library_collections_space_delete on public.library_collections;
--   drop policy if exists library_collection_items_space_read on public.library_collection_items;
--   drop policy if exists library_collection_items_space_insert on public.library_collection_items;
--   drop policy if exists library_collection_items_space_update on public.library_collection_items;
--   drop policy if exists library_collection_items_space_delete on public.library_collection_items;
--   drop policy if exists library_versions_space_read on public.library_versions;
--   drop policy if exists library_versions_space_insert on public.library_versions;
--   revoke all on table public.library_assets, public.library_collections,
--     public.library_collection_items, public.library_versions from anon, authenticated;

-- ── library_assets ──────────────────────────────────────────────────────────────────────────────

drop policy if exists library_assets_space_read on public.library_assets;
create policy library_assets_space_read on public.library_assets
  for select to authenticated
  using (
    private.is_space_member(space_id)
    or visibility = 'public'
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists library_assets_space_insert on public.library_assets;
create policy library_assets_space_insert on public.library_assets
  for insert to authenticated
  with check (
    private.can_write_space_content(space_id)
    and (created_by is null or created_by = private.get_my_profile_id())
  );

drop policy if exists library_assets_space_update on public.library_assets;
create policy library_assets_space_update on public.library_assets
  for update to authenticated
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists library_assets_space_delete on public.library_assets;
create policy library_assets_space_delete on public.library_assets
  for delete to authenticated
  using (private.can_write_space_content(space_id));

-- ── library_collections ─────────────────────────────────────────────────────────────────────────

drop policy if exists library_collections_space_read on public.library_collections;
create policy library_collections_space_read on public.library_collections
  for select to authenticated
  using (
    private.is_space_member(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists library_collections_space_insert on public.library_collections;
create policy library_collections_space_insert on public.library_collections
  for insert to authenticated
  with check (
    private.can_write_space_content(space_id)
    and (created_by is null or created_by = private.get_my_profile_id())
  );

drop policy if exists library_collections_space_update on public.library_collections;
create policy library_collections_space_update on public.library_collections
  for update to authenticated
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists library_collections_space_delete on public.library_collections;
create policy library_collections_space_delete on public.library_collections
  for delete to authenticated
  using (private.can_write_space_content(space_id));

-- ── library_collection_items (follow the collection's Space) ────────────────────────────────────

drop policy if exists library_collection_items_space_read on public.library_collection_items;
create policy library_collection_items_space_read on public.library_collection_items
  for select to authenticated
  using (
    exists (
      select 1 from public.library_collections c
      where c.id = library_collection_items.collection_id
    )
  );

drop policy if exists library_collection_items_space_insert on public.library_collection_items;
create policy library_collection_items_space_insert on public.library_collection_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.library_collections c
      where c.id = library_collection_items.collection_id
        and private.can_write_space_content(c.space_id)
    )
    and exists (
      select 1 from public.library_assets a
      where a.id = library_collection_items.asset_id
    )
  );

drop policy if exists library_collection_items_space_update on public.library_collection_items;
create policy library_collection_items_space_update on public.library_collection_items
  for update to authenticated
  using (
    exists (
      select 1 from public.library_collections c
      where c.id = library_collection_items.collection_id
        and private.can_write_space_content(c.space_id)
    )
  )
  with check (
    exists (
      select 1 from public.library_collections c
      where c.id = library_collection_items.collection_id
        and private.can_write_space_content(c.space_id)
    )
    and exists (
      select 1 from public.library_assets a
      where a.id = library_collection_items.asset_id
    )
  );

drop policy if exists library_collection_items_space_delete on public.library_collection_items;
create policy library_collection_items_space_delete on public.library_collection_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.library_collections c
      where c.id = library_collection_items.collection_id
        and private.can_write_space_content(c.space_id)
    )
  );

-- ── library_versions (follow the asset's Space; insert only) ────────────────────────────────────

drop policy if exists library_versions_space_read on public.library_versions;
create policy library_versions_space_read on public.library_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.library_assets a
      where a.id = library_versions.asset_id
        and (
          private.is_space_member(a.space_id)
          or private.get_my_web_role() in ('admin', 'janitor')
        )
    )
  );

drop policy if exists library_versions_space_insert on public.library_versions;
create policy library_versions_space_insert on public.library_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.library_assets a
      where a.id = library_versions.asset_id
        and private.can_write_space_content(a.space_id)
    )
    and (created_by is null or created_by = private.get_my_profile_id())
  );

-- No update policy and no delete policy on library_versions: see the header.

-- ── Grants: the first lock, sized to the policies ───────────────────────────────────────────────
-- 20270218000000 revoked everything from both roles while these tables were deny-all. A policy
-- with no grant behind it is inert, so signed-in callers get exactly the commands a policy
-- exists for. anon gets nothing, restated here so this file reads whole.

revoke all on table public.library_assets from anon;
revoke all on table public.library_collections from anon;
revoke all on table public.library_collection_items from anon;
revoke all on table public.library_versions from anon;

grant select, insert, update, delete on table public.library_assets to authenticated;
grant select, insert, update, delete on table public.library_collections to authenticated;
grant select, insert, update, delete on table public.library_collection_items to authenticated;
revoke update, delete, truncate on table public.library_versions from authenticated;
grant select, insert on table public.library_versions to authenticated;

comment on table public.library_versions is
  'Non-destructive edit history for a library_assets master; is_current marks the live version. '
  'Read by the asset''s Space team and platform staff; inserted by its writers; never updated or '
  'deleted by a client (no policy, no grant). ADR-480, ADR-1594.';
