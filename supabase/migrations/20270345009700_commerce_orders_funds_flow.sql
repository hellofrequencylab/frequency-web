-- THE ORDER SAYS WHICH FUNDS FLOW IT TOOK (LIVE-621, ADR-1576; PROG-D8 piece 1).
--
-- Every commerce order so far was a Stripe DESTINATION CHARGE: one PaymentIntent, one connected
-- account in transfer_data.destination, the money split as it landed. A cart from two sellers takes
-- the other shape, SEPARATE CHARGES AND TRANSFERS: the payment lands on the platform account with no
-- transfer_data and one transfer per seller follows (LIVE-622). A refund has to know which happened
-- to it, because unwinding a destination charge is reverse_transfer on ONE transfer and unwinding a
-- separate order is a reversal per transfer (LIVE-623). The row records it.
--
-- Two changes, both additive:
--   1. commerce_orders.funds_flow  text not null default 'destination' | 'separate'.
--   2. owner_kind admits 'split' for a separate order. A split order has no single seller, so both
--      owner ids and seller_stripe_account_id are null on it; its per-seller shares are derivable
--      from commerce_order_items through each product's owner until LIVE-622 persists them.
-- One CHECK ties the two together both ways: 'split' if and only if 'separate'. platform_fee_cents
-- on a split order is the SUM of the per-seller fees (the code computes it; the column is unchanged).
--
-- Versioned 20270345009700, not the 9600 the row named: 9600-9649 is the D7 lane's range.
-- Idempotent. Reversible:
--   alter table public.commerce_orders drop constraint if exists commerce_orders_funds_flow_owner_check;
--   alter table public.commerce_orders drop constraint if exists commerce_orders_split_has_no_seller_check;
--   alter table public.commerce_orders drop constraint if exists commerce_orders_owner_kind_check;
--   alter table public.commerce_orders add constraint commerce_orders_owner_kind_check
--     check (owner_kind in ('platform','profile','space'));
--   alter table public.commerce_orders drop column if exists funds_flow;

alter table public.commerce_orders
  add column if not exists funds_flow text not null default 'destination'
    check (funds_flow in ('destination', 'separate'));

comment on column public.commerce_orders.funds_flow is
  'Which Stripe funds flow this order took (ADR-1576): destination = one seller, transfer_data.destination on the PaymentIntent, the money split as it landed | separate = two or more sellers, a plain charge on the platform carrying transfer_group = this order id, one transfer per seller to follow (commerce_order_transfers, LIVE-622). A refund reverses one transfer or N by this value.';

-- owner_kind gains 'split'. The inline CHECK from 20260815000000 was named by Postgres as
-- <table>_<column>_check; drop and re-add under the same name so the reversal above is exact.
alter table public.commerce_orders drop constraint if exists commerce_orders_owner_kind_check;
alter table public.commerce_orders
  add constraint commerce_orders_owner_kind_check
  check (owner_kind in ('platform', 'profile', 'space', 'split'));

-- 'split' if and only if 'separate': a destination order always names one seller kind, and a
-- separate order never names one.
alter table public.commerce_orders drop constraint if exists commerce_orders_funds_flow_owner_check;
alter table public.commerce_orders
  add constraint commerce_orders_funds_flow_owner_check
  check ((owner_kind = 'split') = (funds_flow = 'separate'));

-- A split order has no single seller to name and no single destination to pay.
alter table public.commerce_orders drop constraint if exists commerce_orders_split_has_no_seller_check;
alter table public.commerce_orders
  add constraint commerce_orders_split_has_no_seller_check
  check (
    owner_kind <> 'split'
    or (owner_profile_id is null and owner_space_id is null and seller_stripe_account_id is null)
  );

comment on column public.commerce_orders.owner_kind is
  'The seller partition, denormalized from the product at purchase time: platform (the Frequency Store) | profile (a person) | space (a Space Shop) | split (ADR-1576: a separate-charges order paying more than one seller; owner ids null, shares in commerce_order_items by product owner, then commerce_order_transfers).';
