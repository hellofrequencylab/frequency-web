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
--   * service role only: RLS on with no policy, and no grant to anon or authenticated. The application
--     reads and writes with the service role after it has established the profile from the session.
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

-- Service role only, like the other commerce ledgers: no client policy, and the default grants are
-- revoked so a signed-in caller cannot reach the table with the anon key either.
revoke all on table public.commerce_carts from anon, authenticated;

commit;
