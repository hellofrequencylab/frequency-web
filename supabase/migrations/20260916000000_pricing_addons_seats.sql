-- Pricing & Value Ladder, Phase B (ADR-460, docs/PRICING-LADDER-PLAN.md §4/§5). The Stripe
-- subscription-item model for the collapsed ladder: a Space buys Pro as ONE subscription with MULTIPLE
-- items (a base item plus one price item per active add-on), nonprofit as a per-seat quantity item, and
-- organization as a single item. This migration adds the per-item reconciliation table the webhook
-- persists, plus the licensed-seat count on spaces, plus the per-item grandfathered LOCKED PRICE id
-- that holds a founding subscriber at their founding rate on renewal (generalizing
-- profiles.locked_price_id / ADR-363 to space items).
--
-- WHY IT IS SAFE REGARDLESS. Everything ships behind `billing_live` OFF (the master switch). While OFF,
-- the webhook reconcilers never run (no live Stripe), setSpaceAddons is a no-op, and featureAllowed
-- short-circuits to grant-all, so gating behavior cannot regress from this additive schema. The table
-- only starts to MATTER once billing goes live in a later phase. No existing column/table is altered in
-- a breaking way: spaces.seat_quantity is a new nullable-defaulted column; the rest is a new table.
--
-- HOUSE STYLE (mirrors 20260914000000_applications.sql + 20260915000000_pricing_plan_collapse.sql):
-- additive + idempotent (create table if not exists; add column if not exists; every policy guarded by
-- a drop). RLS on the new table. SECURITY: writes are service-mediated through the service role (the
-- signed Stripe webhook + the gated checkout); there is intentionally NO client insert/update/delete
-- policy, so a client can never forge a subscription item or a locked price. Two SELECT policies: STAFF
-- (web_role admin/janitor) read everything; a Space OWNER or active ADMIN reads their own Space's rows.
-- The auth/tenant subqueries are wrapped in (select ...) so they run once per statement, not per row
-- (Supabase RLS performance rule). No em or en dashes in any comment or string (CONTENT-VOICE).
-- Reached untyped from app code until lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply
-- path. Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- == Prerequisites already present (referenced, never recreated): public.spaces (with owner_profile_id,
--    plan, entitlements), public.space_members (space_id, profile_id, role, status), public.profiles,
--    set_updated_at() (20260608070000), get_my_web_role() (20260613000050, SECURITY DEFINER),
--    get_my_profile_id() (20240101000001, SECURITY DEFINER). All assumed by earlier migrations.

-- == 1. spaces.seat_quantity: licensed seats (Team + Nonprofit per-seat billing) ===================
-- The owner-set count of LICENSED seats the Space pays for (the v1 seat model: licensed, not
-- active-seat true-up, which is a v2 per ADR-458). Drives the quantity on the Team add-on item and the
-- Nonprofit seat item at checkout. Defaults to 0 (no paid seats); a free/Pro-no-team Space leaves it 0.
alter table public.spaces
  add column if not exists seat_quantity integer not null default 0;

comment on column public.spaces.seat_quantity is
  'Pricing ladder Phase B (ADR-460): count of LICENSED seats this Space pays for (Team add-on + Nonprofit per-seat). v1 licensed-seat model (active-seat true-up is v2). Defaults 0. Read untyped until lib/database.types.ts regenerates.';

-- == 2. space_subscription_items: one row per Stripe subscription ITEM on a Space =================
-- A Space's paid plan is ONE Stripe subscription with MULTIPLE items: a base item plus one item per
-- active add-on (and quantity items for seats). This table mirrors each item so the webhook can
-- set-to-target the billing namespace from the live item set and so the surface can read what is on.
--   item_key  in (base, marketing, ai, team, branding, nonprofit_seat, organization) - the catalog item.
--   status    the per-item lifecycle, mirroring the Stripe item/subscription status.
--   interval  month | year - which annual/monthly price this item is billed on.
--   quantity  for seat items (team, nonprofit_seat); 1 for non-seat items.
--   locked_price_id  the concrete Stripe price id CHARGED at first subscribe (the grandfathered
--                    founding price). Renewals + add-on toggles re-bill THIS id, not the current list
--                    price, so a founding subscriber keeps their rate until the subscription lapses.
create table if not exists public.space_subscription_items (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  -- Which catalog item this row tracks. Free text + CHECK so the catalog can extend with one ALTER.
  item_key    text not null
                check (item_key in ('base', 'marketing', 'ai', 'team', 'branding', 'nonprofit_seat', 'organization')),
  -- The Stripe subscription ITEM id (si_...), the per-item handle for proration + toggle-off.
  stripe_subscription_item_id text,
  -- The per-item lifecycle, mirroring the Stripe item/subscription status.
  status      text not null default 'active'
                check (status in ('active', 'trialing', 'past_due', 'canceled', 'pending')),
  -- 14-day per-item trial end (null once converted or for items with no trial).
  trial_ends_at timestamptz,
  -- Seat count for seat items (team, nonprofit_seat); 1 for non-seat items.
  quantity    integer not null default 1,
  -- Which price interval this item is billed on.
  interval    text not null default 'month'
                check (interval in ('month', 'year')),
  -- The grandfathered LOCKED price id (the founding Stripe price actually charged). Renewals re-bill it.
  locked_price_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One row per (space, item): a Space holds at most one of each catalog item. Re-subscribing updates
  -- the row in place (idempotent webhook upsert).
  unique (space_id, item_key)
);

-- The leading-column index for the tenant filter (every read filters space_id first).
create index if not exists space_subscription_items_space_idx
  on public.space_subscription_items (space_id);
-- The per-item lookup (which spaces hold a given add-on; the webhook set-to-target read).
create index if not exists space_subscription_items_item_idx
  on public.space_subscription_items (space_id, item_key);

comment on table public.space_subscription_items is
  'Pricing ladder Phase B (ADR-460): one row per Stripe subscription ITEM on a Space (Pro = base + one item per active add-on; nonprofit = a per-seat quantity item). item_key in (base/marketing/ai/team/branding/nonprofit_seat/organization). locked_price_id holds the grandfathered founding price re-billed on renewal. Service-role writes only (the signed webhook + gated checkout); staff read all, a Space owner/admin reads their own. See docs/PRICING.md.';
comment on column public.space_subscription_items.locked_price_id is
  'The concrete Stripe price id charged at first subscribe (the grandfathered founding price). Renewals + add-on toggles re-bill THIS id, not the current list price. Cleared when the subscription lapses. Generalizes profiles.locked_price_id (ADR-363) to space items.';

-- == 3. updated_at trigger ========================================================================
drop trigger if exists space_subscription_items_set_updated_at on public.space_subscription_items;
create trigger space_subscription_items_set_updated_at
  before update on public.space_subscription_items
  for each row execute function public.set_updated_at();

-- == 4. RLS: staff-read-all + owner/admin-read-own; writes service-role only ======================
alter table public.space_subscription_items enable row level security;

-- STAFF (web_role admin/janitor) read everything (the operator billing surface + the admin pricing
-- view). get_my_web_role() is the existing SECURITY DEFINER helper (20260613000050).
drop policy if exists "space_subscription_items: staff read" on public.space_subscription_items;
create policy "space_subscription_items: staff read"
  on public.space_subscription_items for select to authenticated
  using ((select public.get_my_web_role()) in ('admin', 'janitor'));

-- A Space OWNER or active ADMIN reads their own Space's rows (the per-Space billing settings surface).
-- The tenant subqueries are wrapped in (select ...) so they run once per statement, not per row.
drop policy if exists "space_subscription_items: owner or admin read" on public.space_subscription_items;
create policy "space_subscription_items: owner or admin read"
  on public.space_subscription_items for select to authenticated
  using (
    space_id in (
      select s.id from public.spaces s
      where s.owner_profile_id = (select public.get_my_profile_id())
    )
    or space_id in (
      select sm.space_id from public.space_members sm
      where sm.profile_id = (select public.get_my_profile_id())
        and sm.role = 'admin'
        and sm.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policy by design: writes are service-mediated (the signed Stripe webhook +
-- the gated checkout reconcile through the service role, which bypasses RLS). A client can never forge a
-- subscription item or a locked price.

-- == Rollback (hand-review aid) ===================================================================
-- This migration is additive + behavior-preserving while billing_live is OFF, so a rollback is rarely
-- needed. To reverse:
--   1. drop table if exists public.space_subscription_items;   -- (drops its policies + indexes + trigger)
--   2. alter table public.spaces drop column if exists seat_quantity;
