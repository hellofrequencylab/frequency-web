-- =============================================================================
-- Commerce core — products, variants, orders, order items (ADR-39X, draft)
--
-- Labs entity. The ONE storefront engine behind three owner kinds:
--   platform  → first-party Frequency Shop (merch / retreats / events)
--   profile   → Maker market (an individual member sells)
--   space     → a Space's storefront (the paid upgrade)
-- and four product kinds: physical · digital · service · booking · ticket.
--
-- Reuses the EXISTING money rails — no new pricing system:
--   • Stripe Connect destination charges + application fee
--     (lib/billing/fees.ts: spaceTakeRateCents(gross, plan) / platformFeeCents)
--   • financial_transactions ledger, entity-tagged (ADR-246)
--   • idempotent Stripe webhooks via stripe_webhook_events
--   • the per-sale rake = the Space plan take rate in pricing_settings.take_rate
-- Mirrors the tips (ADR-176) + event_tickets (ADR-177) destination-charge idiom:
-- a UNIQUE stripe_checkout_session_id is the exactly-once key; writes go through
-- the service-role admin client behind app-code authz (capability resolver),
-- so there are no client write policies.
--
-- Connect-only verticals (General goods, Housing) do NOT use these tables — see
-- 20260815000100_listings_core_housing.sql.
-- =============================================================================

-- ── Products ────────────────────────────────────────────────────────────────
create table if not exists public.commerce_products (
  id                uuid primary key default gen_random_uuid(),
  -- Owner partition: exactly one of platform / profile / space (see check below).
  owner_kind        text not null check (owner_kind in ('platform','profile','space')),
  owner_profile_id  uuid references public.profiles(id) on delete cascade,
  owner_space_id    uuid references public.spaces(id) on delete cascade,
  entity_id         uuid not null references public.entities(id),
  -- What is being sold + which surface it belongs to.
  product_kind      text not null default 'physical'
                      check (product_kind in ('physical','digital','service','booking','ticket')),
  vertical          text not null default 'shop'
                      check (vertical in ('shop','maker','service')),
  title             text not null,
  description       text,
  images            text[] not null default '{}',
  price_cents       integer not null check (price_cents >= 0),
  currency          text not null default 'usd',
  -- Inventory: null = untracked/unlimited; >= 0 = tracked stock (decremented on paid).
  stock             integer check (stock is null or stock >= 0),
  category          text,
  status            text not null default 'draft'
                      check (status in ('draft','active','sold_out','archived')),
  -- For service/booking kinds: the Space whose availability/booking substrate is used.
  booking_space_id  uuid references public.spaces(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint commerce_products_owner_chk check (
    (owner_kind = 'platform' and owner_profile_id is null and owner_space_id is null) or
    (owner_kind = 'profile'  and owner_profile_id is not null and owner_space_id is null) or
    (owner_kind = 'space'    and owner_space_id is not null)
  )
);

create index if not exists commerce_products_active_idx
  on public.commerce_products (status, created_at desc);
create index if not exists commerce_products_space_idx
  on public.commerce_products (owner_space_id) where owner_space_id is not null;
create index if not exists commerce_products_profile_idx
  on public.commerce_products (owner_profile_id) where owner_profile_id is not null;
create index if not exists commerce_products_vertical_idx
  on public.commerce_products (vertical, status);
create index if not exists commerce_products_demo_idx
  on public.commerce_products (is_demo) where is_demo;

create trigger trg_commerce_products_updated_at
  before update on public.commerce_products
  for each row execute function set_updated_at();

alter table public.commerce_products enable row level security;

drop policy if exists commerce_products_read on public.commerce_products;
create policy commerce_products_read on public.commerce_products
  for select using (
    status = 'active'
    or owner_profile_id = get_my_profile_id()
    or (owner_space_id is not null and public.is_space_member(owner_space_id))
  );
-- Writes via service-role admin client behind app authz (commerce.product.manage).
-- No client insert/update/delete policy by design.

comment on table public.commerce_products is
  'Storefront catalog for the commerce core. owner_kind partitions platform/profile/space; one engine, three sellers. Rake + charge handled by lib/billing (destination charge + application fee). ADR-39X.';

-- ── Variants (optional; makers with size/option SKUs) ────────────────────────
create table if not exists public.commerce_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.commerce_products(id) on delete cascade,
  name        text not null,
  sku         text,
  price_cents integer check (price_cents is null or price_cents >= 0), -- null = inherit product
  stock       integer check (stock is null or stock >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists commerce_variants_product_idx on public.commerce_variants (product_id);

alter table public.commerce_variants enable row level security;
drop policy if exists commerce_variants_read on public.commerce_variants;
create policy commerce_variants_read on public.commerce_variants
  for select using (
    exists (
      select 1 from public.commerce_products p
      where p.id = product_id
        and (p.status = 'active'
             or p.owner_profile_id = get_my_profile_id()
             or (p.owner_space_id is not null and public.is_space_member(p.owner_space_id)))
    )
  );

-- ── Orders (one row per checkout; destination-charge bookkeeping) ─────────────
create table if not exists public.commerce_orders (
  id                uuid primary key default gen_random_uuid(),
  buyer_profile_id  uuid references public.profiles(id) on delete set null,
  -- Seller partition, denormalized from the product at purchase time.
  owner_kind        text not null check (owner_kind in ('platform','profile','space')),
  owner_profile_id  uuid references public.profiles(id) on delete set null,
  owner_space_id    uuid references public.spaces(id) on delete set null,
  entity_id         uuid not null references public.entities(id),
  amount_cents      integer not null check (amount_cents > 0),
  -- The platform's cut (application_fee_amount). Floored so the seller is never short.
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  currency          text not null default 'usd',
  status            text not null default 'pending'
                      check (status in ('pending','paid','fulfilled','cancelled','refunded','failed')),
  fulfillment_status text not null default 'none'
                      check (fulfillment_status in ('none','pending','shipped','delivered','completed')),
  shipping          jsonb not null default '{}'::jsonb,  -- address/tracking snapshot for physical goods
  -- Connect destination-charge bookkeeping (same idiom as tips / event_tickets).
  seller_stripe_account_id   text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  refunded_at       timestamptz
);

-- Exactly-once: the checkout session is the idempotency key (matches tips/tickets).
create unique index if not exists commerce_orders_checkout_session_idx
  on public.commerce_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists commerce_orders_buyer_idx
  on public.commerce_orders (buyer_profile_id, created_at desc);
create index if not exists commerce_orders_space_idx
  on public.commerce_orders (owner_space_id, created_at desc) where owner_space_id is not null;
create index if not exists commerce_orders_profile_idx
  on public.commerce_orders (owner_profile_id, created_at desc) where owner_profile_id is not null;

alter table public.commerce_orders enable row level security;

drop policy if exists commerce_orders_read on public.commerce_orders;
create policy commerce_orders_read on public.commerce_orders
  for select using (
    buyer_profile_id = get_my_profile_id()
    or owner_profile_id = get_my_profile_id()
    or (owner_space_id is not null and public.is_space_member(owner_space_id))
  );
-- Writes (create/settle/refund) via service-role behind the Stripe webhook +
-- checkout server action. No client write policy.

comment on table public.commerce_orders is
  'One row per checkout. platform_fee_cents = the platform application fee; seller gross settles to seller_stripe_account_id (destination charge). The platform fee is recorded to financial_transactions as labs/commerce. ADR-39X.';

-- ── Order items ──────────────────────────────────────────────────────────────
create table if not exists public.commerce_order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.commerce_orders(id) on delete cascade,
  product_id     uuid references public.commerce_products(id) on delete set null,
  variant_id     uuid references public.commerce_variants(id) on delete set null,
  title          text not null,            -- snapshot at purchase
  qty            integer not null default 1 check (qty > 0),
  unit_cents     integer not null check (unit_cents >= 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  created_at     timestamptz not null default now()
);
create index if not exists commerce_order_items_order_idx on public.commerce_order_items (order_id);

alter table public.commerce_order_items enable row level security;
drop policy if exists commerce_order_items_read on public.commerce_order_items;
create policy commerce_order_items_read on public.commerce_order_items
  for select using (
    exists (
      select 1 from public.commerce_orders o
      where o.id = order_id
        and (o.buyer_profile_id = get_my_profile_id()
             or o.owner_profile_id = get_my_profile_id()
             or (o.owner_space_id is not null and public.is_space_member(o.owner_space_id)))
    )
  );
