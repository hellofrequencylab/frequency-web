-- A membership tier carries its own yearly price, and a membership says which cadence it bought
-- (ADR-1374).
--
-- THE DEFECT. A space_membership_tiers row holds ONE price and ONE interval, so the only way to
-- offer a yearly plan was to publish a SECOND tier priced per year. Royal Temple did exactly that
-- and the member join surface stacked SEVEN cards for what is four memberships: four monthly tiers
-- and three yearly twins. Nothing joins a twin back to its monthly original, so a member reads
-- seven unrelated products, capacity and waitlist are counted per twin rather than per membership,
-- and an owner editing a price has to remember to edit two rows.
--
-- THE MECHANISM. price_cents stays exactly what it has always been, the MONTHLY price.
-- annual_price_cents is the OPTIONAL yearly alternative for the SAME tier, never a second tier:
-- null means this tier has no yearly option and is monthly only, which is the state every existing
-- row is in after this migration. So this is additive in the strict sense: no row changes meaning,
-- no twin is merged here, and an owner collapses their twins by setting the yearly price on the
-- monthly tier and retiring the duplicate.
--
-- space_memberships.billing_interval is the other half, and without it the tier change would be a
-- half-truth: once one tier can be bought two ways, a membership row that records only tier_id can
-- no longer say what the member is actually paying. It defaults to 'month', which is what every
-- existing membership is: the only yearly memberships today were bought on a yearly TWIN TIER, and
-- those rows keep pointing at that twin, whose own `interval` column still reads 'year'.
--
-- WHY A COLUMN AND NOT A PRICES TABLE. A prices table is the general answer and this is not a
-- general problem: the product offers two cadences, the join surface toggles between exactly two,
-- and Stripe's subscription takes one interval. A table would buy a third cadence nobody has asked
-- for at the cost of a join on every read of the join card.
--
-- RLS AND GRANTS, explicit. No policy change and no grant change on either table. Both columns sit
-- on tables whose policies already exist, and a price on a publicly readable tier row plus a
-- cadence on a row the member and the Space owner can already see gate nothing. The only writers
-- are setMembershipTiers, joinTier and the Stripe webhook reconciler, all on the service role.
--
-- ROLLBACK:
--   alter table public.space_membership_tiers drop constraint if exists space_membership_tiers_annual_price_nonneg;
--   alter table public.space_membership_tiers drop column if exists annual_price_cents;
--   alter table public.space_memberships drop constraint if exists space_memberships_billing_interval_check;
--   alter table public.space_memberships drop column if exists billing_interval;
-- The app half must roll back in the SAME deploy: lib/spaces/memberships.ts selects and writes both
-- columns by name and would fail with PGRST204 against a database without them.
--
-- House style: additive and idempotent (add column if not exists, and each CHECK dropped by name
-- before it is added, so a re-run is a no-op). No em or en dashes.

begin;

-- ── 1. The yearly price, beside the monthly one, on the SAME tier ───────────────────────────────

alter table public.space_membership_tiers
  add column if not exists annual_price_cents integer;

alter table public.space_membership_tiers
  drop constraint if exists space_membership_tiers_annual_price_nonneg;
alter table public.space_membership_tiers
  add constraint space_membership_tiers_annual_price_nonneg
  check (annual_price_cents is null or annual_price_cents >= 0);

comment on column public.space_membership_tiers.price_cents is
  'The MONTHLY price of this tier, in cents. Unchanged by ADR-1374: it was the price at whatever `interval` said before, and for every tier an operator publishes going forward it is the monthly figure. 0 means a free tier.';
comment on column public.space_membership_tiers.annual_price_cents is
  'The OPTIONAL yearly price of this SAME tier, in cents, and never a second tier (ADR-1374). null means this tier has no yearly option, so the member join surface keeps showing its monthly price under the yearly toggle and says plainly that it is monthly only. A tier with a value here is bought for that amount on a Stripe subscription with interval=year; price_cents remains the monthly alternative. 0 is not an offer and the app normalizes it back to null.';
comment on column public.space_membership_tiers.interval is
  'The cadence price_cents is charged at for a tier published BEFORE ADR-1374: month, year, or once. Still honored on read, so the yearly twins that exist today keep billing yearly. New tiers express a yearly option through annual_price_cents instead of a second row, and leave this at month.';

-- ── 2. What the member actually bought ──────────────────────────────────────────────────────────

alter table public.space_memberships
  add column if not exists billing_interval text not null default 'month';

alter table public.space_memberships
  drop constraint if exists space_memberships_billing_interval_check;
alter table public.space_memberships
  add constraint space_memberships_billing_interval_check
  check (billing_interval in ('month', 'year'));

comment on column public.space_memberships.billing_interval is
  'The cadence THIS membership is paying on: month or year (ADR-1374). Required because one tier can now be bought either way, so tier_id alone no longer says what the member pays. Written by joinTier from the cadence the member picked, and by the Stripe webhook reconciler from the subscription''s own recurring interval, which is the settled truth for a paid membership. Defaults to month, which is what every membership written before this column was.';

commit;
