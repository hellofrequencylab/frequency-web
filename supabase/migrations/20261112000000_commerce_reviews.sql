-- Phase 8 (Trust & Safety) — product/listing reviews + member-facing disputes (ADR-597).
--
-- WRITTEN, NOT APPLIED. Apply when this PR merges, then regenerate lib/database.types.ts:
--   supabase db push   (or the migration runner)
--   supabase gen types typescript --linked > lib/database.types.ts
-- Until then the data layer (lib/commerce/reviews.ts, lib/commerce/disputes.ts) reads
-- these tables through the untyped admin client behind app-code authz, matching how the
-- reports + event-placement work handled a not-yet-typed table.
--
-- Additive + reversible: two new tables, no changes to existing rows. Both mirror the
-- established repo conventions — space_reviews (rating + body + status moderation +
-- one-per-author upsert key + public-read gated on the parent) and marketplace_reports
-- (a triage queue read by operators through the service-role client).

-- ── 1. commerce_reviews ─────────────────────────────────────────────────────────
-- A member's 1-5 star rating + optional note on a commerce product (a Market listing or a
-- Space Shop item). One review per buyer per product (upsert key). verified_purchase marks
-- a review left by someone with a settled order for the product; today, with payments OFF,
-- any signed-in member may review and the flag defaults false (TODO: once payments are on,
-- gate reviews on a real order/booking and set verified_purchase = true — see
-- lib/commerce/reviews.ts hasPurchasedProduct()).
create table if not exists public.commerce_reviews (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.commerce_products(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  rating             smallint not null check (rating between 1 and 5),
  body               text not null default '',
  verified_purchase  boolean not null default false,
  status             text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (product_id, reviewer_profile_id)   -- one review per buyer per product (upsert key)
);

create index if not exists idx_commerce_reviews_product_visible
  on public.commerce_reviews (product_id, created_at desc);

alter table public.commerce_reviews enable row level security;

-- Public read: a visible review on an ACTIVE product (drafts/archived never expose reviews).
drop policy if exists commerce_reviews_public_read on public.commerce_reviews;
create policy commerce_reviews_public_read on public.commerce_reviews
  for select
  using (
    status = 'visible'
    and exists (
      select 1 from public.commerce_products p
      where p.id = commerce_reviews.product_id
        and p.status = 'active'
    )
  );

-- Member self-authored insert: the reviewer MUST equal the caller (unforgeable), matching
-- space_reviews_member_insert / marketplace_reports_insert.
drop policy if exists commerce_reviews_member_insert on public.commerce_reviews;
create policy commerce_reviews_member_insert on public.commerce_reviews
  for insert
  with check (reviewer_profile_id = public.get_my_profile_id());

-- Author revises their own review; operators moderate (hide) via the service-role client, so
-- there is deliberately no operator UPDATE policy here (the /admin path bypasses RLS).
drop policy if exists commerce_reviews_author_update on public.commerce_reviews;
create policy commerce_reviews_author_update on public.commerce_reviews
  for update
  using (reviewer_profile_id = public.get_my_profile_id())
  with check (reviewer_profile_id = public.get_my_profile_id());

drop policy if exists commerce_reviews_author_delete on public.commerce_reviews;
create policy commerce_reviews_author_delete on public.commerce_reviews
  for delete
  using (reviewer_profile_id = public.get_my_profile_id());

comment on table public.commerce_reviews is
  'Product/listing-level reviews (ADR-597, Phase 8). 1-5 stars + optional body, one per buyer per product. verified_purchase is set once payments are on and the reviewer has a settled order; today it defaults false. Operators moderate (hide) through the service-role client.';

-- ── 2. commerce_disputes ────────────────────────────────────────────────────────
-- A buyer opens a dispute/refund request on their own order. It lands in an operator +
-- seller queue that resolves it (approve refund -> refundCommerceOrder when payments are on,
-- else record the resolution). Mirrors marketplace_reports as a triage queue; the difference
-- is that a dispute is scoped to an ORDER (money) and can settle to a refund.
create table if not exists public.commerce_disputes (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.commerce_orders(id) on delete cascade,
  opener_profile_id  uuid references public.profiles(id) on delete set null,
  reason             text not null,
  detail             text,
  -- open -> reviewing -> resolved_refund | resolved_denied ; cancelled = buyer withdrew.
  status             text not null default 'open'
                       check (status in ('open', 'reviewing', 'resolved_refund', 'resolved_denied', 'cancelled')),
  resolution_note    text,
  resolved_by        uuid references public.profiles(id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_commerce_disputes_status
  on public.commerce_disputes (status, created_at desc);
create index if not exists idx_commerce_disputes_order
  on public.commerce_disputes (order_id);
-- At most one live (open/reviewing) dispute per order; a resolved one may be reopened as a new row.
create unique index if not exists uniq_commerce_disputes_live_per_order
  on public.commerce_disputes (order_id)
  where status in ('open', 'reviewing');

alter table public.commerce_disputes enable row level security;

-- The buyer opens a dispute only on an order that is theirs (defense in depth; the action
-- also checks). opener = the caller AND the order's buyer_profile_id = the caller.
drop policy if exists commerce_disputes_buyer_insert on public.commerce_disputes;
create policy commerce_disputes_buyer_insert on public.commerce_disputes
  for insert
  with check (
    opener_profile_id = public.get_my_profile_id()
    and exists (
      select 1 from public.commerce_orders o
      where o.id = commerce_disputes.order_id
        and o.buyer_profile_id = public.get_my_profile_id()
    )
  );

-- The buyer reads their own disputes; the seller reads disputes on orders they sold (profile
-- seller or a member of the owning Space). Operators read/triage via the service-role client.
drop policy if exists commerce_disputes_party_read on public.commerce_disputes;
create policy commerce_disputes_party_read on public.commerce_disputes
  for select
  using (
    opener_profile_id = public.get_my_profile_id()
    or exists (
      select 1 from public.commerce_orders o
      where o.id = commerce_disputes.order_id
        and (
          o.owner_profile_id = public.get_my_profile_id()
          or (o.owner_space_id is not null and public.is_space_member(o.owner_space_id))
        )
    )
  );

-- The buyer may cancel (withdraw) their own dispute; every other transition is operator-only
-- through the service-role client (no seller/self resolve-to-refund from the client).
drop policy if exists commerce_disputes_buyer_update on public.commerce_disputes;
create policy commerce_disputes_buyer_update on public.commerce_disputes
  for update
  using (opener_profile_id = public.get_my_profile_id())
  with check (opener_profile_id = public.get_my_profile_id());

comment on table public.commerce_disputes is
  'Member-facing order disputes / refund requests (ADR-597, Phase 8). A buyer opens one on their order; operators (and the seller, read-only) see it in a queue and resolve it. Approving a refund calls refundCommerceOrder when payments are on; with payments OFF the resolution is recorded and no money moves.';
