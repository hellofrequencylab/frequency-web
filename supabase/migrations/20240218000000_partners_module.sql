-- Phase 3: Partners / businesses module (docs/ENGAGEMENT-ARCHITECTURE.md §4).
--
-- A geolocated directory of aligned local businesses. Members find them on the
-- map, bump an NFC plaque / scan a QR (a node with partner_id) to unlock a member
-- discount and earn zaps. Additive; requires PostGIS (20240214000000). After
-- applying, regenerate types: `npx supabase gen types typescript --linked > lib/database.types.ts`.

create table if not exists public.partners (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  description        text,
  category           text,
  location           geography(Point, 4326),
  address            text,
  city               text,
  website            text,
  contact_profile_id uuid references public.profiles(id) on delete set null,
  status             text not null default 'pending',  -- pending | active | inactive
  created_at         timestamptz not null default now()
);
create index if not exists partners_location_gix on public.partners using gist (location);
create index if not exists partners_status_idx on public.partners (status);

create table if not exists public.partner_offers (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  title        text not null,
  description  text,
  member_terms text,                                   -- e.g. "10% off for members"
  active       boolean not null default true,
  valid_until  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists partner_offers_partner_idx on public.partner_offers (partner_id);

create table if not exists public.partner_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  offer_id            uuid references public.partner_offers(id) on delete set null,
  partner_id          uuid not null references public.partners(id) on delete cascade,
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  source              text,                            -- nfc | qr | manual
  engagement_event_id uuid references public.engagement_events(id) on delete set null,
  redeemed_at         timestamptz not null default now()
);
create index if not exists partner_redemptions_profile_idx on public.partner_redemptions (profile_id, redeemed_at desc);
create index if not exists partner_redemptions_partner_idx on public.partner_redemptions (partner_id);

-- Link a physical node (NFC plaque / QR) to the business it belongs to.
alter table public.nodes
  add column if not exists partner_id uuid references public.partners(id) on delete set null;

alter table public.partners enable row level security;
alter table public.partner_offers enable row level security;
alter table public.partner_redemptions enable row level security;

-- Directory + offers are publicly discoverable when active (supports the map /
-- discover layer). Redemptions are private (read-own). All writes go through the
-- service role (owner / janitor server actions).
create policy "partners: read active"
  on public.partners for select using (status = 'active');
create policy "partner_offers: read active"
  on public.partner_offers for select using (active = true);
create policy "partner_redemptions: read own"
  on public.partner_redemptions for select
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

comment on table public.partners is
  'Aligned local businesses (geolocated directory). An NFC plaque / QR is a node with partner_id. See docs/ENGAGEMENT-ARCHITECTURE.md.';
comment on table public.partner_offers is 'Member discounts/offers from a partner.';
comment on table public.partner_redemptions is 'Log of member offer redemptions (read-own).';
