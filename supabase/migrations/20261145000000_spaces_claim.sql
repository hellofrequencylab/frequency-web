-- Seeded Space claim spine. A seeded (demo) Space is materialized owned by the operator who seeded it
-- (business seeder → applyIntake sets owner_profile_id to the operator). This adds a one-time claim
-- token so an operator can send the real business owner a link that transfers the Space to them, mirroring
-- the Classifieds/Housing listing claim spine (lib/listing-seeder/claim.ts). Additive + idempotent.
--
-- On claim the owner column flips to the claimer, claimed_by/claimed_at stamp, and the token is nulled
-- (consumed) in one compare-and-set (see lib/spaces/claim.ts). No em/en dashes in any surfaced copy.

alter table public.spaces add column if not exists claim_token text;
alter table public.spaces add column if not exists claimed_at timestamptz;
alter table public.spaces
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null;

-- A token is unique while live (partial: nulls, the consumed/never-set state, do not collide).
create unique index if not exists spaces_claim_token_key
  on public.spaces (claim_token) where claim_token is not null;

comment on column public.spaces.claim_token is
  'One-time claim secret for a seeded Space. An operator (admin/janitor) shares /spaces/claim/<token>; the real owner claims it and ownership transfers to them. Nulled on claim. Written through lib/spaces/claim.ts.';

-- ROLLBACK:
--   drop index if exists public.spaces_claim_token_key;
--   alter table public.spaces drop column if exists claim_token, drop column if exists claimed_at, drop column if exists claimed_by;
