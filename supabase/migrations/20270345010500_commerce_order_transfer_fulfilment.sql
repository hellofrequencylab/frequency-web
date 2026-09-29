-- EACH SELLER SENDS THEIR OWN SHARE OF A SPLIT ORDER (LIVE-705, ADR-1652).
--
-- A split order (commerce_orders.funds_flow = 'separate', owner_kind 'split') pays several sellers,
-- and each of them ships their own lines. commerce_orders carries ONE fulfillment_status, and the
-- writer (lib/commerce/fulfilment.ts) found an order through owner columns a split order leaves
-- empty, so no seller could move it at all. The seller's claim on a split order is already their row
-- in commerce_order_transfers (LIVE-622, ADR-1614; LIVE-624, ADR-1616), so that row now also
-- carries where THEIR share stands:
--
--   fulfillment_status  the same ladder and words as commerce_orders.fulfillment_status (none,
--                       pending, shipped, delivered, completed), forward only, moved by the writer
--                       with a compare-and-set on the step it read, so two sellers never race each
--                       other: each has their own row.
--   fulfilment          what the seller said about sending it: carrier, tracking, note and the
--                       shipped / delivered / completed times, the same record the writer keeps in
--                       commerce_orders.shipping.fulfilment for a single-seller order.
--
-- The ORDER's fulfillment_status stays the one the buyer and every earnings read already use: the
-- writer rolls it up to the least advanced share that has something to send, only ever forward, and
-- flips a paid order to fulfilled once every such share is delivered or complete.
--
-- Service role only, as the table already is (RLS on, no policy, no grant to anon or
-- authenticated). No new index: every read is by order_id (the unique key's leading column) or id.
--
-- Additive, idempotent, and reversible:
--   alter table public.commerce_order_transfers
--     drop column if exists fulfilment, drop column if exists fulfillment_status;

alter table public.commerce_order_transfers
  add column if not exists fulfillment_status text not null default 'none',
  add column if not exists fulfilment jsonb;

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_fulfillment_status_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_fulfillment_status_check
    check (fulfillment_status in ('none', 'pending', 'shipped', 'delivered', 'completed'));

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_fulfilment_object_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_fulfilment_object_check
    check (fulfilment is null or jsonb_typeof(fulfilment) = 'object');

comment on column public.commerce_order_transfers.fulfillment_status is
  'Where THIS seller''s share of a split order stands on the fulfilment ladder (LIVE-705, ADR-1652). Forward only. commerce_orders.fulfillment_status is the roll-up: the least advanced share with something to send.';
comment on column public.commerce_order_transfers.fulfilment is
  'This seller''s carrier, tracking, note and step times for their share, the record commerce_orders.shipping.fulfilment holds for a single-seller order (LIVE-705, ADR-1652).';
