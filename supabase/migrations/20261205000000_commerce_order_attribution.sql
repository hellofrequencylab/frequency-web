-- Order attribution for the differential take-rate (Phase 2, ADR-811 §A). Every commerce order records
-- WHERE the sale came from:
--   'self'    = the member's own booking / their own page (0% platform fee, ALWAYS — the hard promise),
--   'network' = the collective sourced the customer (referral / discovery / marketplace / cross-space
--               share) and the space plan's NETWORK take-rate applies (rate drops as the tier rises).
-- `attribution_ref` is an optional provenance tag (e.g. ref:<profileId>, src:referral, ep:marketplace)
-- that the Phase 5 "the network sourced you $X" receipt reads back.
--
-- BACK-COMPAT + SAFETY: NOT NULL DEFAULT 'self' backfills every existing order to the 0%-fee promise, so
-- nothing is ever retroactively charged a network rate. commerce_orders has RLS enabled with no client
-- write policy (20260815000000_commerce_core.sql), so these columns are reachable only through the gated
-- checkout server action; readers default to 'self' so the app works before this migration is applied and
-- before lib/database.types.ts is regenerated (ADR-246). Additive + idempotent. Reversible:
--   alter table public.commerce_orders drop column source, drop column attribution_ref;

alter table public.commerce_orders
  add column if not exists source text not null default 'self'
    check (source in ('self', 'network'));

alter table public.commerce_orders
  add column if not exists attribution_ref text;

comment on column public.commerce_orders.source is
  'Where this sale came from (ADR-811 §A): self = the operator''s own booking/page (0% platform fee, always) | network = the collective sourced the customer (referral/discovery/marketplace) and the tier network take-rate applies. Defaults to self (the 0%-fee promise).';
comment on column public.commerce_orders.attribution_ref is
  'Optional provenance tag for a network-sourced order (e.g. ref:<profileId> | src:referral | ep:marketplace), read back by the Phase 5 "network sourced you $X" receipt. Null for self orders.';
