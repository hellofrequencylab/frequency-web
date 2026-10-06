-- space_domain_purchases: a domain a Space bought inside Frequency (LIVE-781).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- The Domain section's "Buy a new domain" method. The Space pays through Stripe (Vercel's at-cost price
-- plus the operator's markup, one yearly price); only after Stripe confirms the payment does the server
-- buy the domain on Frequency's Vercel team, attach it to the project and bind it to the Space
-- (lib/sites/domain-purchase.ts). One row per checkout. The row is also the renewal record: the Space
-- pays renewals, so `renews_at`, `renewal_price_cents`, `auto_renew` and the Stripe customer are what
-- the renewal charge (LIVE-786) reads.
--
-- Status: pending (checkout open) -> purchasing (payment confirmed, the settle claimed the row; the
-- claim is one conditional update, which is what makes a retried webhook unable to buy twice) ->
-- ordered (Vercel accepted the order) -> registered (Vercel completed it). Off the happy path: failed
-- (Vercel refused and the refund did not land), refunded (Vercel refused and the Space was refunded),
-- abandoned (the checkout expired unpaid).
--
-- `registrant` holds the contact the domain is registered to (the Space's person, so the domain is
-- theirs) only between checkout and the Vercel order; the settle and the abandon both clear it.
--
-- Access: service role only. The checkout writes it behind the Space editor gate, the Stripe webhook
-- settles it, and nothing client-side reads it, so RLS is on with no policy (scripts/rls-deny-all.txt)
-- and both client roles are revoked (scripts/table-grants.txt: internal).
--
-- Seeds the two operator controls in the existing kv stores, both inert: `domain_markup` at the code
-- default ($3 a year, in cents) and `domain_purchase_enabled` OFF. ON CONFLICT DO NOTHING so a value an
-- operator has already set is never clobbered.
--
-- Additive and idempotent. REVERSIBLE: drop table public.space_domain_purchases; delete the two seed
-- rows (pricing_settings key 'domain_markup', platform_flags key 'domain_purchase_enabled').

create table if not exists public.space_domain_purchases (
  id                         uuid primary key default gen_random_uuid(),
  space_id                   uuid not null references public.spaces(id) on delete cascade,
  domain                     text not null check (char_length(domain) between 3 and 253),
  years                      integer not null default 1 check (years between 1 and 10),
  vercel_price_cents         integer not null check (vercel_price_cents >= 0),
  markup_cents               integer not null check (markup_cents >= 0),
  price_cents                integer not null check (price_cents = vercel_price_cents + markup_cents),
  renewal_price_cents        integer check (renewal_price_cents is null or renewal_price_cents >= 0),
  currency                   text not null default 'usd' check (currency = lower(currency) and char_length(currency) = 3),
  status                     text not null default 'pending'
                               check (status in ('pending', 'purchasing', 'ordered', 'registered', 'failed', 'refunded', 'abandoned')),
  failure_reason             text check (failure_reason is null or char_length(failure_reason) <= 200),
  registrant                 jsonb,
  auto_renew                 boolean not null default false,
  vercel_order_id            text,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  stripe_customer_id         text,
  paid_at                    timestamptz,
  purchased_at               timestamptz,
  renews_at                  timestamptz,
  refunded_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table public.space_domain_purchases is
  'Domains a Space bought inside Frequency, and their renewal record (LIVE-781). Service role only: lib/sites/domain-purchase.ts writes and settles it.';

-- The FK, and the Space's purchases newest first.
create index if not exists space_domain_purchases_space_idx
  on public.space_domain_purchases (space_id, created_at desc);

-- The renewal charge reads the live domains by renewal date.
create index if not exists space_domain_purchases_renews_idx
  on public.space_domain_purchases (renews_at)
  where status in ('ordered', 'registered');

-- A domain is bought once: at most one live purchase per name.
create unique index if not exists space_domain_purchases_live_domain_uniq
  on public.space_domain_purchases (domain)
  where status in ('purchasing', 'ordered', 'registered');

alter table public.space_domain_purchases enable row level security;

-- Supabase's default privileges grant anon and authenticated on every new table, and revoking from
-- public does not remove them (ADR-959). Service role only.
revoke all on table public.space_domain_purchases from anon, authenticated;

-- ── The operator controls (inert seeds) ──────────────────────────────────────────────────────────────
insert into public.pricing_settings (key, value)
values ('domain_markup', '{"cents": 300}'::jsonb)
on conflict (key) do nothing;

insert into public.platform_flags (key, value)
values ('domain_purchase_enabled', false)
on conflict (key) do nothing;
