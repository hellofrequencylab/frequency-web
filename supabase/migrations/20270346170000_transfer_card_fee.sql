-- THE CARD FEE ON A SPLIT SHARE (LIVE-2421, ADR-1978). Additive and idempotent.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────────
-- From the pass-through date (CARD_FEE_PASS_THROUGH_FROM, lib/billing/card-fee.ts) a seller bears the
-- card fee Stripe bills the platform. On a destination charge it rides in the application fee. A
-- split order (funds_flow 'separate') has no application fee: the charge lands on the platform and
-- each seller is paid by transfer from this ledger. So each share now carries its part of the one
-- card fee (allocated by gross at checkout, lib/commerce/funds-flow.ts withCardFeeShares), and its
-- transfer is that much less.
--
-- Every reader rebuilds a share's gross from its row (the seller's earnings, the sale email, the
-- refund's pro rata reversal in lib/commerce/split-refund.ts). Without a column for the card fee a
-- smaller transfer would read as a smaller sale, so the fee gets its own column and the gross is
-- amount_cents + platform_fee_cents + processing_fee_cents. platform_fee_cents stays Frequency's fee
-- alone, the revenue the finance ledger books.
--
-- Every existing row is a sale from before the pass-through date and carried no card fee: default 0
-- is the truth for each of them, so no backfill.

alter table public.commerce_order_transfers
  add column if not exists processing_fee_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'commerce_order_transfers_processing_fee_cents_check'
       and conrelid = 'public.commerce_order_transfers'::regclass
  ) then
    alter table public.commerce_order_transfers
      add constraint commerce_order_transfers_processing_fee_cents_check check (processing_fee_cents >= 0);
  end if;
end $$;

comment on column public.commerce_order_transfers.processing_fee_cents is
  'The card fee this seller''s share bore (LIVE-2421), kept back from the transfer like platform_fee_cents but never Frequency revenue. 0 on every share sold before the card fee pass-through date. The share''s gross is amount_cents + platform_fee_cents + processing_fee_cents.';
