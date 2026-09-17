-- SELLING A JOURNEY (ADR-1397). A Journey becomes purchasable by attaching a commerce_products row
-- to it, and enrolment becomes the thing that purchase grants.
--
-- WHY. Owner, 2026-09-17: "help me figure out a best practice way to sell journeys. I want to sell
-- Heart on Fire for $444 in the main marketplace, or through the Daniel Tyack space and Royal Temple."
--
-- THE SHAPE, and why it is this shape. Every incumbent that sells one program through several
-- storefronts (Eventbrite, Maven, Circle) keeps ONE canonical record and ONE seat pool, and treats a
-- storefront as PRESENTATION + ATTRIBUTION rather than a copy. Duplicating the product duplicates the
-- seat counter, which on a 12-seat cohort means an oversell. So:
--   · ONE commerce_products row per Journey (the partial unique index below enforces it),
--   · `market_published` already decides "main Market vs only my Shop" -- no new concept,
--   · `commerce_orders.source` + `attribution_ref` already carry which storefront sold it,
--   · seats stay on journey_plans.enroll_cap, which is the ONE pool every path counts against.
--
-- 🔴 THE ENROLMENT IS THE GRANT, so it needs provenance. `journey_enrollments.order_id` is what lets a
-- refund find the enrolment it paid for. Without it a refund moves money back and leaves the access
-- standing, which is the failure mode worth designing out rather than discovering.
--
-- House style: additive + idempotent (SAFE to re-run). Rollback: alter table public.journey_enrollments
-- drop column order_id; drop index commerce_products_one_live_per_journey; alter table
-- public.commerce_products drop column journey_plan_id; restore commerce_products_product_kind_check
-- from 20260815000000_commerce_core.sql.

-- ── 1. The sixth product kind ────────────────────────────────────────────────────────────────────
-- 'journey' joins physical/digital/service/booking/ticket. It is NOT 'program': `program` is already
-- taken by the Chapters feature (lib/spaces/functions.ts key 'program', a Channel with a Chapter
-- blueprint), and NAMING.md's hierarchy word for this thing is Journey.
alter table public.commerce_products drop constraint if exists commerce_products_product_kind_check;
alter table public.commerce_products
  add constraint commerce_products_product_kind_check check (
    product_kind = any (array['physical'::text, 'digital'::text, 'service'::text, 'booking'::text,
                              'ticket'::text, 'journey'::text])
  );

-- ── 2. The link, as a real column rather than a metadata key ─────────────────────────────────────
-- `booking_space_id` is the precedent: a per-kind link that the reader joins on gets a column, while
-- per-kind CONFIG lives in metadata.<kind>. A refund has to find the enrolment from the order, and a
-- join beats digging a uuid out of jsonb.
alter table public.commerce_products
  add column if not exists journey_plan_id uuid references public.journey_plans(id) on delete cascade;

comment on column public.commerce_products.journey_plan_id is
  'The Journey this product sells (ADR-1397). Set for product_kind = journey, null otherwise.';

-- A kind that names no Journey, or a Journey named by a kind that is not journey, is a row nothing
-- can fulfil. Refuse it here rather than at the till.
alter table public.commerce_products drop constraint if exists commerce_products_journey_link_chk;
alter table public.commerce_products
  add constraint commerce_products_journey_link_chk check (
    (product_kind = 'journey' and journey_plan_id is not null)
    or (product_kind <> 'journey' and journey_plan_id is null)
  );

-- ONE sellable product per Journey: the canonical-record rule, enforced. Archived rows are exempt so a
-- Journey can be re-priced by archiving the old row and writing a new one.
create unique index if not exists commerce_products_one_live_per_journey
  on public.commerce_products (journey_plan_id)
  where journey_plan_id is not null and status <> 'archived';

create index if not exists commerce_products_journey_plan_idx
  on public.commerce_products (journey_plan_id) where journey_plan_id is not null;

-- ── 3. The enrolment learns where it came from ───────────────────────────────────────────────────
alter table public.journey_enrollments
  add column if not exists order_id uuid references public.commerce_orders(id) on delete set null;

comment on column public.journey_enrollments.order_id is
  'The paid order that granted this enrolment (ADR-1397). Null for a free enrolment. A refund revokes by this key.';

create index if not exists journey_enrollments_order_idx
  on public.journey_enrollments (order_id) where order_id is not null;
