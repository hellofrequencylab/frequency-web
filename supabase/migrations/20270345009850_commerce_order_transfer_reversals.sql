-- A SPLIT REFUND REVERSES EACH SELLER'S TRANSFER PRO RATA (LIVE-623, ADR-1615; PROG-D8 piece 3).
--
-- commerce_order_transfers (20270345009800, LIVE-622) records what each seller of a split order is
-- paid. A refund of that order, full or partial, or a lost dispute on its charge, takes money back
-- from the buyer's side of the platform balance; each seller's share of it comes back by a Stripe
-- transfer reversal. This migration gives the ledger the three columns that needs and nothing else:
--
--   refund_reversal_cents  how much of this transfer the order's refunds say must come back,
--                          cumulative (a partial refund and its later top-up raise it; nothing
--                          lowers it), never more than the transfer itself. Written by the refund
--                          before any reversal is attempted, so a reversal that fails is still owed.
--   reversal_attempts      reversal attempts since the target last rose; the reconciler stops at
--                          the same ceiling it uses for transfers and logs the row as stuck.
--   reversal_owed_cents    GENERATED: target minus what Stripe says is already reversed
--                          (reversed_cents), never below zero. The reconciler's queue is
--                          "created and owed > 0", which PostgREST cannot express as a
--                          comparison of two columns, so the difference is a stored column.
--
-- and one new state:
--
--   cancelled  a transfer that was never made because the order was refunded in full first.
--              Nobody is paid and nothing is reversed. It carries refund_reversal_cents = the
--              whole amount, so if a transfer claimed just before the refund lands anyway, the
--              adopt path flips it to created with the whole amount owed and the reconciler
--              takes it back.
--
-- Additive, idempotent, and reversible:
--   drop index if exists public.commerce_order_transfers_reversal_due_idx;
--   alter table public.commerce_order_transfers
--     drop column if exists reversal_owed_cents, drop column if exists reversal_attempts,
--     drop column if exists refund_reversal_cents;
--   (and restore the four-state status check after deleting any cancelled rows)

alter table public.commerce_order_transfers
  add column if not exists refund_reversal_cents integer not null default 0,
  add column if not exists reversal_attempts integer not null default 0;

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_refund_reversal_cents_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_refund_reversal_cents_check
    check (refund_reversal_cents >= 0 and refund_reversal_cents <= amount_cents);

alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_reversal_attempts_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_reversal_attempts_check check (reversal_attempts >= 0);

alter table public.commerce_order_transfers
  add column if not exists reversal_owed_cents integer
    generated always as (greatest(refund_reversal_cents - reversed_cents, 0)) stored;

-- The status check gains 'cancelled'. The inline check of 20270345009800 is named by Postgres
-- <table>_<column>_check. created_has_id_check is unchanged: a cancelled row has no transfer id.
alter table public.commerce_order_transfers
  drop constraint if exists commerce_order_transfers_status_check;
alter table public.commerce_order_transfers
  add constraint commerce_order_transfers_status_check
    check (status in ('planned', 'created', 'failed', 'reversed', 'cancelled'));

comment on column public.commerce_order_transfers.refund_reversal_cents is
  'Cents of this transfer the order''s refunds (and lost disputes) say must come back to the platform, cumulative, pro rata to the seller''s share of the order gross (LIVE-623, ADR-1615). Only ever raised.';
comment on column public.commerce_order_transfers.reversal_owed_cents is
  'refund_reversal_cents minus reversed_cents, floored at zero: what a split refund still has to reverse. The reconciler retries created rows where this is above zero.';

-- The reconciler's reversal queue: created rows still owed, oldest touch first.
create index if not exists commerce_order_transfers_reversal_due_idx
  on public.commerce_order_transfers (updated_at)
  where status = 'created' and reversal_owed_cents > 0;
