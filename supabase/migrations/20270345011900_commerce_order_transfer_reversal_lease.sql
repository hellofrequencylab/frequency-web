-- A SPLIT REVERSAL THAT STRIPE REFUSES ONCE CAN BE RETRIED, AND TWO REFUNDS CANNOT REVERSE ONE
-- SELLER TWICE (SCAN-649; on LIVE-623 / ADR-1615).
--
-- lib/commerce/split-refund.ts reverseTransferRow had two latent defects, both found by the scan-six
-- read of the 2026-09-28..30 merges and both real only once split orders refund:
--
--   1. THE SAVED ERROR. Every retry reused the key transfer-reversal:<row>:<from>-<to>, and from/to
--      do not move while nothing lands. Stripe answers a reused key with the stored result of the
--      first request for about 24 hours, errors included, so a seller whose balance was empty once
--      got the same stored refusal on every retry until the reconciler hit its ceiling (~4 h) and
--      logged the row stuck forever: the platform carried that seller's share of the refund.
--   2. THE CLAIM RESET. Raising the target wrote reversal_attempts = 0, which undid the compare-and-
--      set claim of a worker already calling Stripe for the old target. A second refund then claimed
--      the row, read amount_reversed before the first reversal landed, and reversed 0 -> T2 under a
--      different key: T1 + T2 left the seller.
--
-- Three columns fix both without touching the counter the claim is built on:
--
--   reversal_refusals        deterministic Stripe refusals so far. Part of the idempotency key once
--                            above zero, so the retry after a refusal is a NEW request and not the
--                            stored error. A network failure does not bump it: there the fixed key is
--                            what dedupes a request that may have gone through.
--   reversal_lease_until     a worker that claimed the row holds it until this instant; another
--                            worker skips the row while the lease stands, whatever the counter says.
--                            Default epoch = free. A worker that dies mid-flight frees it by time.
--   reversal_attempt_floor   the value of reversal_attempts when the target last rose. The budget is
--                            counted from here, so a bigger refund gets fresh attempts WITHOUT the
--                            counter ever going back (the claim's compare-and-set stays valid).
--   reversal_attempts_since_target  GENERATED: attempts - floor, which is what the reconciler
--                            compares against its ceiling. PostgREST cannot compare two columns.
--
-- Additive, idempotent, and reversible:
--   drop index if exists public.commerce_order_transfers_reversal_lease_idx;
--   alter table public.commerce_order_transfers
--     drop column if exists reversal_attempts_since_target, drop column if exists reversal_attempt_floor,
--     drop column if exists reversal_lease_until, drop column if exists reversal_refusals;

alter table public.commerce_order_transfers
  add column if not exists reversal_refusals integer not null default 0,
  add column if not exists reversal_lease_until timestamptz not null default 'epoch',
  add column if not exists reversal_attempt_floor integer not null default 0;

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_reversal_refusals_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_reversal_refusals_check check (reversal_refusals >= 0);

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_reversal_attempt_floor_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_reversal_attempt_floor_check
    check (reversal_attempt_floor >= 0 and reversal_attempt_floor <= reversal_attempts);

alter table public.commerce_order_transfers
  add column if not exists reversal_attempts_since_target integer
    generated always as (reversal_attempts - reversal_attempt_floor) stored;

comment on column public.commerce_order_transfers.reversal_refusals is
  'Deterministic Stripe refusals of this row''s reversal so far (SCAN-649). Above zero it is part of the reversal idempotency key, so a retry is a new request and not Stripe''s stored error. Never bumped by a network failure.';
comment on column public.commerce_order_transfers.reversal_lease_until is
  'The worker that claimed this row for a reversal holds it until this instant; others skip it meanwhile (SCAN-649). Epoch means free.';
comment on column public.commerce_order_transfers.reversal_attempt_floor is
  'reversal_attempts when the refund target last rose. Attempts are budgeted from here, so the counter never goes back and the compare-and-set claim stays valid (SCAN-649).';
comment on column public.commerce_order_transfers.reversal_attempts_since_target is
  'reversal_attempts minus reversal_attempt_floor: the attempts the reconciler weighs against its ceiling.';
