-- Shop & Marketplace rework, Phase 4 (ADR-593): bookable services — the seam that lets a
-- commerce_products service (product_kind='service') be booked against the Space's existing
-- availability calendar and paid through the existing commerce checkout (HOLD-FIRST deposit).
--
-- ┌─────────────────────────────────────────────────────────────────────────────────────────┐
-- │ ⚠️  DO NOT APPLY YET — APPLY THIS WHEN PAYMENTS ARE TURNED ON.                             │
-- │                                                                                           │
-- │ The whole bookable-services flow is gated behind commerce checkout, which is itself       │
-- │ double-gated OFF (Stripe keys + the `host_payouts_enabled` platform flag, ADR-178). No    │
-- │ code path writes a 'pending' booking or a booking↔order link until payouts are live, so    │
-- │ applying this migration before then adds unused columns/state with no benefit.            │
-- │                                                                                           │
-- │ APPLY IT AS PART OF ENABLING PAYMENTS, in this order:                                      │
-- │   1. Apply this migration (supabase db push, or apply_migration name 'bookable_services'). │
-- │   2. Regenerate lib/database.types.ts (ADR-246) — space_bookings gains order_id/product_id.│
-- │   3. Flip `host_payouts_enabled` (and configure Stripe) to turn payments on.               │
-- │ Until step 1 runs, createServiceBookingCheckout / the settle+refund booking hooks are      │
-- │ dormant (they no-op / fail soft), so the app runs correctly with this migration UNAPPLIED. │
-- └─────────────────────────────────────────────────────────────────────────────────────────┘
--
-- Idempotent + additive (IF NOT EXISTS / IF EXISTS throughout), so a re-run is a no-op.

-- 1. Link a booking to the commerce order that paid its deposit, and to the service product it books.
alter table public.space_bookings
  add column if not exists order_id   uuid references public.commerce_orders(id)   on delete set null,
  add column if not exists product_id uuid references public.commerce_products(id) on delete set null;

create index if not exists space_bookings_order_id_idx
  on public.space_bookings (order_id) where order_id is not null;

-- 2. Allow a 'pending' status (a HOLD placed at checkout, before the deposit settles). The old check
--    was `status in ('confirmed','cancelled')`; widen it. The default constraint name for the inline
--    column check is <table>_<column>_check.
alter table public.space_bookings drop constraint if exists space_bookings_status_check;
alter table public.space_bookings
  add constraint space_bookings_status_check check (status in ('confirmed', 'cancelled', 'pending'));

-- 3. Widen the anti-double-book guard so a PENDING hold also blocks the slot (not just confirmed),
--    so two buyers cannot both hold-then-pay the same slot. Was: WHERE status = 'confirmed'.
drop index if exists public.space_bookings_one_confirmed_per_slot;
create unique index if not exists space_bookings_one_active_per_slot
  on public.space_bookings (space_id, starts_at)
  where status in ('confirmed', 'pending');

-- 4. Backfill the booking join column: a Business Space's own service is booked against its own
--    availability calendar, so booking_space_id = owner_space_id. (New services set this on create;
--    this catches the Phase 3 backfilled offerings.) Only touches space-owned service products.
update public.commerce_products
  set booking_space_id = owner_space_id
  where owner_kind = 'space'
    and product_kind = 'service'
    and booking_space_id is null;
