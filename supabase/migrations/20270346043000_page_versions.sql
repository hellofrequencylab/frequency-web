-- PROG-E0 task 5+6 (docs/EDITOR-E0.md section 3): immutable page versions, and publish as a pointer swap.
--
-- Today publishing a page is one upsert that writes `data` and `published_data` to the same value, so the
-- previous published document is gone. This adds:
--
--   * public.page_versions: one immutable row per publish (the document as a tree, never CRDT state), numbered
--     1, 2, 3 per page. Service role only, like `pages` itself: RLS on with no policy, and no grant to
--     anon or authenticated, so a version is never more reachable than the table it versions.
--   * pages.published_version_id: the pointer to the live version. Rollback is one row update.
--   * publish_page_version(): the atomic writer. It locks the page (or creates it), takes the next revision,
--     inserts the version and swaps the pointer in ONE statement block, so two publishes can never share a
--     revision and a reader never sees a pointer with no version. `data` and `published_data` are still
--     dual-written for one release, so nothing that reads them has to move.
--   * revert_page_to_version(): points the live page at an older version (published_data follows).
--
-- Nothing calls these until the app is deployed and EDITOR_CANVAS is on. Additive and idempotent.

begin;

create table if not exists public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  revision integer not null check (revision >= 1),
  data jsonb not null,
  title text,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists page_versions_page_revision_key on public.page_versions (page_id, revision);
create index if not exists page_versions_page_created_idx on public.page_versions (page_id, created_at desc);
create index if not exists page_versions_space_idx on public.page_versions (space_id);
create index if not exists page_versions_created_by_idx on public.page_versions (created_by);

alter table public.page_versions enable row level security;
revoke all on table public.page_versions from anon, authenticated;

alter table public.pages
  add column if not exists published_version_id uuid references public.page_versions(id) on delete set null;
create index if not exists pages_published_version_idx on public.pages (published_version_id);

-- Publish: upsert the page, take the next revision under the page row lock, insert the immutable version,
-- swap the pointer, and dual-write published_data. Returns the new version's id and revision.
create or replace function public.publish_page_version(
  p_space_id uuid,
  p_slug text,
  p_title text,
  p_data jsonb,
  p_by uuid default null,
  p_note text default null
) returns table (version_id uuid, revision integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_page uuid;
  v_rev integer;
  v_ver uuid;
begin
  insert into public.pages (space_id, slug, title, data, status, updated_by, updated_at)
  values (p_space_id, p_slug, p_title, p_data, 'draft', p_by, now())
  on conflict (space_id, slug) do nothing;

  -- The row lock is what serializes concurrent publishes of one page.
  select id into v_page from public.pages where space_id = p_space_id and slug = p_slug for update;

  select coalesce(max(pv.revision), 0) + 1 into v_rev from public.page_versions pv where pv.page_id = v_page;

  insert into public.page_versions (page_id, space_id, revision, data, title, note, created_by)
  values (v_page, p_space_id, v_rev, p_data, p_title, p_note, p_by)
  returning id into v_ver;

  update public.pages
     set data = p_data,
         published_data = p_data,
         published_version_id = v_ver,
         title = p_title,
         status = 'published',
         published_at = now(),
         updated_at = now(),
         updated_by = p_by
   where id = v_page;

  return query select v_ver, v_rev;
end;
$$;

-- Revert: one pointer swap. The version must belong to the page. The draft (`data`) is left alone.
create or replace function public.revert_page_to_version(
  p_space_id uuid,
  p_slug text,
  p_version_id uuid,
  p_by uuid default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_page uuid;
  v_doc jsonb;
  v_rev integer;
begin
  select id into v_page from public.pages where space_id = p_space_id and slug = p_slug for update;
  if v_page is null then
    raise exception 'page not found' using errcode = 'P0002';
  end if;

  select pv.data, pv.revision into v_doc, v_rev
    from public.page_versions pv where pv.id = p_version_id and pv.page_id = v_page;
  if v_doc is null then
    raise exception 'version not found for this page' using errcode = 'P0002';
  end if;

  update public.pages
     set published_version_id = p_version_id,
         published_data = v_doc,
         status = 'published',
         published_at = now(),
         updated_at = now(),
         updated_by = p_by
   where id = v_page;

  return v_rev;
end;
$$;

revoke all on function public.publish_page_version(uuid, text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.revert_page_to_version(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_page_version(uuid, text, text, jsonb, uuid, text) to service_role;
grant execute on function public.revert_page_to_version(uuid, text, uuid, uuid) to service_role;

commit;
