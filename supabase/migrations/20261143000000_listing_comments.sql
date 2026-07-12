-- Marketplace listing Q&A comments (shared listing detail page). Additive + idempotent, safe to re-run.
--
-- One POLYMORPHIC comment feed under EVERY marketplace listing detail page — Classifieds
-- (market_listings), Housing/General (listings), and Market/Shop (commerce_products) — so a
-- prospective buyer can ask a question in the open and the seller can post additional info.
-- Modelled on the marketplace_reports precedent (one triage/queue table keyed by a target_kind
-- discriminator + target_id, read/written through the service-role client behind app-code authz),
-- and on the market_listings RLS style (get_my_profile_id() ownership, get_my_web_role() staff).
--
-- WRITTEN, NOT APPLIED. Apply when this PR merges, then (optionally) regenerate the DB types:
--   supabase gen types typescript --linked > lib/database.types.ts
-- Until then lib/marketplace/listing-comments.ts + listing-qna-actions.ts reach this table through
-- the untyped admin client (repo convention — same as market_listings / listings / commerce_*).
--
-- No em or en dashes in any surfaced copy. This is a data migration; nothing here is member-visible.

create table if not exists public.listing_comments (
  id           uuid primary key default gen_random_uuid(),
  -- Which listing table the comment hangs off. Mirrors marketplace_reports.target_kind.
  target_kind  text not null check (target_kind in ('market_listing','listing','product')),
  target_id    uuid not null,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (length(trim(body)) > 0),
  image_url    text,
  created_at   timestamptz not null default now()
);

-- Newest-first feed lookups scoped to one listing.
create index if not exists listing_comments_target_idx
  on public.listing_comments (target_kind, target_id, created_at desc);

alter table public.listing_comments enable row level security;

-- Public read: a listing Q&A thread is open, the same as the listing it hangs off (the service-role
-- reader gates non-active listings in app code; a comment never leaks more than the public listing).
drop policy if exists listing_comments_select on public.listing_comments;
create policy listing_comments_select on public.listing_comments
  for select using (true);

-- Insert: any signed-in member, and only ever as themselves (unforgeable author — matches
-- commerce_reviews / marketplace_reports). The service-role client bypasses this.
drop policy if exists listing_comments_insert on public.listing_comments;
create policy listing_comments_insert on public.listing_comments
  for insert to authenticated
  with check (profile_id = public.get_my_profile_id());

-- Delete: the comment author, OR the owner of the listing the comment hangs off (moderating their
-- own listing's thread), OR platform staff. The owner branch resolves polymorphically per target_kind.
drop policy if exists listing_comments_delete on public.listing_comments;
create policy listing_comments_delete on public.listing_comments
  for delete to authenticated
  using (
    profile_id = public.get_my_profile_id()
    or public.get_my_web_role() in ('admin','janitor')
    or (
      target_kind = 'market_listing' and exists (
        select 1 from public.market_listings m
        where m.id = listing_comments.target_id and m.author_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'listing' and exists (
        select 1 from public.listings l
        where l.id = listing_comments.target_id and l.owner_profile_id = public.get_my_profile_id()
      )
    )
    or (
      target_kind = 'product' and exists (
        select 1 from public.commerce_products p
        where p.id = listing_comments.target_id and p.owner_profile_id = public.get_my_profile_id()
      )
    )
  );

comment on table public.listing_comments is
  'Polymorphic Q&A comments under a marketplace listing detail page (Classifieds market_listings, Housing/General listings, Market commerce_products), keyed by target_kind + target_id like marketplace_reports. Public read; any member inserts as themselves; author/listing-owner/staff delete. Written through the gated actions in lib/marketplace/listing-qna-actions.ts.';

-- ROLLBACK:
--   drop table if exists public.listing_comments;
