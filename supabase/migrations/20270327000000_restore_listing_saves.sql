-- Restore public.listing_saves — the housing/marketplace save (heart) ledger.
--
-- 20260925000000_retire_orphaned_tables_and_functions.sql dropped this table on the claim
-- "0 code references (.from / .rpc)". That premise was false by the time it shipped (or the
-- feature landed right after): lib/listings/index.ts holds four live .from('listing_saves')
-- sites (saveListing / unsaveListing / listSavedListingIds / listSavedListings), wired to the
-- production UI through components/marketplace/save-listing-button.tsx and the /housing pages.
-- Every runtime path failed SAFE — the write discarded its error, the reads fell back to
-- "nothing saved" — so the heart appeared to work and reset on reload, and no gate noticed
-- (the saves tests mock the client). The 2026-08-25 meta-scan caught it by comparing code
-- table references against to_regclass in production.
--
-- Definition is verbatim from 20260815000100_listings_core_housing.sql (table + self RLS)
-- plus the covering index from 20260820000000 (FK-index sweep), with ONE update: the RLS
-- helper is schema-qualified as private.get_my_profile_id(), where the hardening pass moved
-- it after the original migration shipped (the unqualified name no longer resolves). Nothing
-- else referenced the table (the 20260925 drop cascaded no dependents), so restoring it is
-- purely additive.

create table if not exists public.listing_saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

alter table public.listing_saves enable row level security;

drop policy if exists listing_saves_self on public.listing_saves;
create policy listing_saves_self on public.listing_saves
  for all using (profile_id = private.get_my_profile_id())
  with check (profile_id = private.get_my_profile_id());

create index if not exists listing_saves_listing_id_idx on public.listing_saves (listing_id);
