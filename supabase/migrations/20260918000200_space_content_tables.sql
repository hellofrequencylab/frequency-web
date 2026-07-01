-- Space CONTENT tables (Puck content blocks, Phase 2, ADR-476/472 follow-on). Three additive,
-- idempotent tables backing the new dynamic Space landing blocks. Each is FREE content framing, not
-- an entitlement: none changes what a Space can DO, and no gate reads them. They store the operator's
-- brand posts, member reviews, and operator FAQ for a Space's public landing.
--
--   1. public.space_updates  - the brand's blog-style posts (title, body, image, status, published_at).
--                              Member INTERACTION (reactions + comments) is NOT re-implemented here: an
--                              Update links to a public.posts row via post_id, and members react through
--                              public.post_reactions(post_id) and comment through public.posts(parent_id),
--                              exactly the existing feed system. That anchor post carries
--                              post_type = 'space_update' (companion enum migration 20260918000100).
--   2. public.space_reviews  - member reviews of the Space (rating 1..5 + short body + author). A member
--                              inserts their OWN review (author = the caller); the operator moderates
--                              (hide) via status. The block shows an average + the latest few.
--   3. public.space_faqs     - operator Q and A entries (question, answer, position) rendered as an
--                              accordion. Grows into a KB later; kept simple now.
--
-- HOUSE STYLE (mirrors 20260914000000_applications.sql + 20260917000000_space_modes.sql): additive +
-- idempotent (create table / policy / index IF NOT EXISTS), RLS enabled, public-read gated on the
-- parent Space being ACTIVE and not Private (mirroring the spaces_read_active policy), operator-write
-- gated on the existing can_write_space_content(space_id) helper (owner / admin / editor / moderator,
-- resolved via get_my_profile_id(); see 20260902000000). Member self-authored review insert gates on
-- get_my_profile_id(). No em or en dashes in any comment or string (CONTENT-VOICE). Reached untyped
-- from app code until lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- (Do NOT hand-edit lib/database.types.ts.)
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply
-- path. Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- == Prerequisites already present (referenced, never recreated): public.spaces (id, status,
--    visibility, owner_profile_id), public.profiles (id), public.posts (id), and the RLS helpers
--    public.can_write_space_content(uuid) (20260902000000), public.get_my_profile_id(),
--    public.is_space_member(uuid). The 'space_update' post_type value is added in the companion
--    migration 20260918000100 (a new enum value cannot be used in the same transaction it is added).

-- A shared predicate expressed inline per policy (kept as a comment, not a function, so this file
-- adds no new helper): a child row is publicly readable when its parent Space exists, is ACTIVE, and
-- is not Private (or the caller is a member of that Private Space). This matches spaces_read_active.

-- =================================================================================================
-- 1. space_updates -- the brand's blog-style posts
-- =================================================================================================
create table if not exists public.space_updates (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  author_profile_id  uuid references public.profiles(id) on delete set null,
  title              text not null default '',
  body               text not null default '',
  image_url          text,
  -- The interaction anchor: the public.posts row members react + comment on. Nullable so an Update
  -- can exist before its anchor is created; ON DELETE SET NULL so removing the anchor never removes
  -- the Update. Reactions ride public.post_reactions(post_id); comments ride public.posts(parent_id).
  post_id            uuid references public.posts(id) on delete set null,
  status             text not null default 'published' check (status in ('draft', 'published', 'hidden')),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.space_updates is
  'Puck content blocks Phase 2 (ADR-476/472): a Space brand''s blog-style posts for its public landing (SpaceUpdates block). Member interaction reuses the existing feed reactions + comments system via post_id (an anchor public.posts row with post_type = space_update); this table never duplicates that plumbing. Public-read when published AND the Space is active; operator-write (can_write_space_content).';

create index if not exists idx_space_updates_space_published
  on public.space_updates (space_id, published_at desc);

alter table public.space_updates enable row level security;

-- Public read: a PUBLISHED update on an ACTIVE, non-Private Space (or a Private Space the caller is a
-- member of). Draft/hidden updates are never publicly readable; the operator reads them through the
-- service-role admin client in the manage surface.
drop policy if exists space_updates_public_read on public.space_updates;
create policy space_updates_public_read on public.space_updates
  for select
  using (
    status = 'published'
    and exists (
      select 1 from public.spaces s
      where s.id = space_updates.space_id
        and s.status = 'active'
        and (s.visibility is distinct from 'private' or public.is_space_member(s.id))
    )
  );

-- Operator write (insert / update / delete): owner / admin / editor / moderator of the Space, via the
-- existing content-write helper (resolved by get_my_profile_id()).
drop policy if exists space_updates_operator_insert on public.space_updates;
create policy space_updates_operator_insert on public.space_updates
  for insert
  with check (public.can_write_space_content(space_id));

drop policy if exists space_updates_operator_update on public.space_updates;
create policy space_updates_operator_update on public.space_updates
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists space_updates_operator_delete on public.space_updates;
create policy space_updates_operator_delete on public.space_updates
  for delete
  using (public.can_write_space_content(space_id));

-- =================================================================================================
-- 2. space_reviews -- member reviews of the Space
-- =================================================================================================
create table if not exists public.space_reviews (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  author_profile_id  uuid not null references public.profiles(id) on delete cascade,
  rating             smallint not null check (rating between 1 and 5),
  body               text not null default '',
  status             text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at         timestamptz not null default now(),
  -- One review per member per Space; a re-submit updates the existing row (upsert on this key).
  unique (space_id, author_profile_id)
);

comment on table public.space_reviews is
  'Puck content blocks Phase 2 (ADR-476/472): member reviews of a Space (rating 1..5 + short body) for its public landing (SpaceReviews block). A member inserts their OWN review (author = the caller); the operator moderates by hiding (status). Public-read (visible) when the Space is active; the block is on/off simply by placement.';

create index if not exists idx_space_reviews_space_visible
  on public.space_reviews (space_id, created_at desc);

alter table public.space_reviews enable row level security;

-- Public read: a VISIBLE review on an ACTIVE, non-Private Space (or a Private Space the caller is a
-- member of). Hidden reviews are read by the operator through the admin client only.
drop policy if exists space_reviews_public_read on public.space_reviews;
create policy space_reviews_public_read on public.space_reviews
  for select
  using (
    status = 'visible'
    and exists (
      select 1 from public.spaces s
      where s.id = space_reviews.space_id
        and s.status = 'active'
        and (s.visibility is distinct from 'private' or public.is_space_member(s.id))
    )
  );

-- Member self-authored insert: the author MUST be the caller (author_profile_id = get_my_profile_id()),
-- so a member can only write their OWN review, never one attributed to someone else. The one-per-Space
-- unique key stops duplicate spam. The Space owner is NOT blocked at the DB layer here; the server
-- action gates "a member, not the owner" (deliverable) so an operator cannot seed their own proof.
drop policy if exists space_reviews_member_insert on public.space_reviews;
create policy space_reviews_member_insert on public.space_reviews
  for insert
  with check (author_profile_id = public.get_my_profile_id());

-- A member edits their OWN review; the operator may moderate (hide) any review on their Space.
drop policy if exists space_reviews_author_or_operator_update on public.space_reviews;
create policy space_reviews_author_or_operator_update on public.space_reviews
  for update
  using (author_profile_id = public.get_my_profile_id() or public.can_write_space_content(space_id))
  with check (author_profile_id = public.get_my_profile_id() or public.can_write_space_content(space_id));

-- A member deletes their OWN review; the operator may remove any review on their Space.
drop policy if exists space_reviews_author_or_operator_delete on public.space_reviews;
create policy space_reviews_author_or_operator_delete on public.space_reviews
  for delete
  using (author_profile_id = public.get_my_profile_id() or public.can_write_space_content(space_id));

-- =================================================================================================
-- 3. space_faqs -- operator Q and A entries
-- =================================================================================================
create table if not exists public.space_faqs (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  question    text not null default '',
  answer      text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.space_faqs is
  'Puck content blocks Phase 2 (ADR-476/472): operator Q and A entries for a Space landing (SpaceFAQ block), rendered as an accordion and ordered by position. Public-read when the Space is active; operator-write (can_write_space_content). Grows into a KB later; simple now.';

create index if not exists idx_space_faqs_space_position
  on public.space_faqs (space_id, position);

alter table public.space_faqs enable row level security;

-- Public read: any FAQ on an ACTIVE, non-Private Space (or a Private Space the caller is a member of).
drop policy if exists space_faqs_public_read on public.space_faqs;
create policy space_faqs_public_read on public.space_faqs
  for select
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_faqs.space_id
        and s.status = 'active'
        and (s.visibility is distinct from 'private' or public.is_space_member(s.id))
    )
  );

drop policy if exists space_faqs_operator_insert on public.space_faqs;
create policy space_faqs_operator_insert on public.space_faqs
  for insert
  with check (public.can_write_space_content(space_id));

drop policy if exists space_faqs_operator_update on public.space_faqs;
create policy space_faqs_operator_update on public.space_faqs
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists space_faqs_operator_delete on public.space_faqs;
create policy space_faqs_operator_delete on public.space_faqs
  for delete
  using (public.can_write_space_content(space_id));

-- == Rollback (hand-review aid) ===================================================================
-- All three tables are additive; no existing table, policy, or column is altered. To reverse (drops
-- the tables and every policy + index on them via CASCADE):
--   1. drop table if exists public.space_faqs cascade;
--   2. drop table if exists public.space_reviews cascade;
--   3. drop table if exists public.space_updates cascade;
-- The 'space_update' post_type enum value (companion migration 20260918000100) is inert once these
-- tables are gone (nothing writes it); leaving it in place is harmless.
