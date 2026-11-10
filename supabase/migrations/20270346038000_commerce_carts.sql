-- DEF-ETSY P5 slice 2: the persistent cart (one row per buyer).
--
-- lib/commerce/cart.ts is the cart model: lines of (product, variant, qty) and nothing else. It holds no
-- price and no seller on purpose, so this table does not either: a saved price goes stale, and checkout
-- (lib/commerce/checkout.ts, funds-flow.ts) reads both fresh from the product rows. The lines are stored
-- as one jsonb array and re-parsed on every read (parseCart drops anything malformed), so a bad write can
-- never turn into a charge.
--
--   * one cart per member: profile_id is the primary key
--   * lines must be a jsonb array of at most 50 entries (the MAX_LINES cap in the model)
--   * RLS: a member reads and writes only their own row. The application writes with the service role
--     after it has established the profile; the policies are the floor if a client ever reaches the table.
--
-- Guest carts stay in the browser and are merged in at sign-in (mergeCarts), so no anonymous row exists.
-- Additive and idempotent.

begin;

create table if not exists public.commerce_carts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 50),
  updated_at timestamptz not null default now()
);

alter table public.commerce_carts enable row level security;

drop policy if exists commerce_carts_owner_read on public.commerce_carts;
create policy commerce_carts_owner_read on public.commerce_carts
  for select to authenticated
  using (profile_id = get_my_profile_id());

drop policy if exists commerce_carts_owner_insert on public.commerce_carts;
create policy commerce_carts_owner_insert on public.commerce_carts
  for insert to authenticated
  with check (profile_id = get_my_profile_id());

drop policy if exists commerce_carts_owner_update on public.commerce_carts;
create policy commerce_carts_owner_update on public.commerce_carts
  for update to authenticated
  using (profile_id = get_my_profile_id())
  with check (profile_id = get_my_profile_id());

drop policy if exists commerce_carts_owner_delete on public.commerce_carts;
create policy commerce_carts_owner_delete on public.commerce_carts
  for delete to authenticated
  using (profile_id = get_my_profile_id());

commit;
