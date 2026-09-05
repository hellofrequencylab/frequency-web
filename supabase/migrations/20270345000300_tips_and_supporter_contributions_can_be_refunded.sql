-- tips and supporter_contributions can carry a refund (scan two L2-07, ADR-1208).
--
-- THE GAP. charge.refunded reconciled ticket and commerce refunds only. A tip or a Supporter
-- contribution refunded from the Stripe dashboard kept its `succeeded` row and its ledger revenue,
-- because neither table could express a refund: the status check admits only
-- ('pending','succeeded','failed') and there is no refunded_at column
-- (20260609010000_tips.sql:25, 20261005000100_supporter_contributions.sql:28).
--
-- THE FIX. Widen the status check to include 'refunded' and add refunded_at on both tables. The
-- webhook's new recorders (lib/billing/tips.ts recordTipRefund, lib/billing/supporter.ts
-- recordSupporterContributionRefund) flip succeeded -> refunded, stamp refunded_at, and write the
-- reversing finance row; on a schema that cannot take the write they THROW so Stripe retries loudly
-- rather than acking a lost refund, which is why this migration must land with (or before) that code.
--
-- Additive and idempotent: the unnamed inline checks were auto-named <table>_status_check by Postgres;
-- both are dropped if present and re-created with the widened set. Existing rows all satisfy it.
--
-- Rollback: drop the two widened checks, re-add the three-value checks, drop the two columns. Only
-- do that after every 'refunded' row has been handled, or the re-add fails on the check.

begin;

alter table public.tips drop constraint if exists tips_status_check;
alter table public.tips
  add constraint tips_status_check check (status in ('pending','succeeded','failed','refunded'));
alter table public.tips add column if not exists refunded_at timestamptz;

alter table public.supporter_contributions drop constraint if exists supporter_contributions_status_check;
alter table public.supporter_contributions
  add constraint supporter_contributions_status_check check (status in ('pending','succeeded','failed','refunded'));
alter table public.supporter_contributions add column if not exists refunded_at timestamptz;

comment on column public.tips.refunded_at is 'Set when charge.refunded reconciles a full refund (lib/billing/tips.ts recordTipRefund).';
comment on column public.supporter_contributions.refunded_at is 'Set when charge.refunded reconciles a full refund (lib/billing/supporter.ts recordSupporterContributionRefund).';

commit;
