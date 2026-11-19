-- DEF-ETSY P3 slice 1: seller shipping profiles for the Market (owner approved 2026-11-18).
--
-- A shipping profile is how one seller ships: a name, how long they take to send an order (processing
-- days), and a short table of rates by place. A listing points at one profile, so a seller sets a rate
-- once and reuses it across listings. The rates are stored as one jsonb array and re-parsed on every read
-- (lib/commerce/shipping-profiles.ts parseShippingRates drops anything malformed), the same way the
-- persistent cart stores its lines, so a bad write can never turn into a charge.
--
--   * the owner partition mirrors commerce_products exactly (platform / profile / space), so a profile
--     belongs to the same seller identity as the listings that use it
--   * rates: a jsonb array of at most 50 entries, each { region, firstCents, additionalCents } where
--     region is an ISO-3166 alpha-2 code or '*' for everywhere else
--   * commerce_products.shipping_profile_id: nullable, set null when the profile is deleted, so a listing
--     never loses its row with its profile. A listing with no profile quotes no shipping (today's behaviour).
--   * service role only, like commerce_carts and the other commerce ledgers: RLS on with no policy, and no
--     grant to anon or authenticated. The Shop console writes through the service role after its Space
--     manage gate (resolveSpaceManageAccess + the shop function gate), and the cart reads with the service
--     role after it has established the buyer from the session. Both sit behind COMMERCE_CART_ENABLED.
--
-- Additive and idempotent. Nothing is dropped.

begin;

create table if not exists public.commerce_shipping_profiles (
  id                  uuid primary key default gen_random_uuid(),
  owner_kind          text not null check (owner_kind in ('platform','profile','space')),
  owner_profile_id    uuid references public.profiles(id) on delete cascade,
  owner_space_id      uuid references public.spaces(id) on delete cascade,
  name                text not null check (char_length(btrim(name)) between 1 and 80),
  currency            text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  processing_days_min integer not null default 1 check (processing_days_min between 0 and 60),
  processing_days_max integer not null default 3 check (processing_days_max between 0 and 60),
  rates               jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(rates) = 'array' and jsonb_array_length(rates) <= 50),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint commerce_shipping_profiles_owner_chk check (
    (owner_kind = 'platform' and owner_profile_id is null and owner_space_id is null) or
    (owner_kind = 'profile'  and owner_profile_id is not null and owner_space_id is null) or
    (owner_kind = 'space'    and owner_space_id is not null)
  ),
  constraint commerce_shipping_profiles_processing_chk check (processing_days_min <= processing_days_max)
);

create index if not exists commerce_shipping_profiles_space_idx
  on public.commerce_shipping_profiles (owner_space_id) where owner_space_id is not null;
create index if not exists commerce_shipping_profiles_profile_idx
  on public.commerce_shipping_profiles (owner_profile_id) where owner_profile_id is not null;

drop trigger if exists trg_commerce_shipping_profiles_updated_at on public.commerce_shipping_profiles;
create trigger trg_commerce_shipping_profiles_updated_at
  before update on public.commerce_shipping_profiles
  for each row execute function set_updated_at();

alter table public.commerce_shipping_profiles enable row level security;

-- Service role only: no client policy, and the default grants are revoked so a signed-in caller cannot
-- reach the table with the anon key either.
revoke all on table public.commerce_shipping_profiles from anon, authenticated;

comment on table public.commerce_shipping_profiles is
  'DEF-ETSY P3: a seller shipping profile (processing days + rates by region). Service role only; written by the Shop console behind its Space manage gate, read by the cart. Rates re-parsed on read by lib/commerce/shipping-profiles.ts.';

-- The listing side: which profile a listing ships with.
alter table public.commerce_products
  add column if not exists shipping_profile_id uuid
    references public.commerce_shipping_profiles(id) on delete set null;

create index if not exists commerce_products_shipping_profile_idx
  on public.commerce_products (shipping_profile_id) where shipping_profile_id is not null;

commit;
