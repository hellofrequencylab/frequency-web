-- MANUAL BILLING AGREEMENTS (ADR-872). The durable record of an OFF-STRIPE deal: a Space that
-- pays cash/check/transfer for a plan at a locked rate, on a real calendar. Stripe subscriptions
-- keep their state in space_subscription_items; a cash deal previously had NOWHERE to live and
-- nothing reminded anyone a payment was coming due. This table is the money memory; the plan
-- column on spaces stays the ACCESS authority (staff set it separately, exactly as today).
--
-- The reminder ladder (billing-renewals cron): 30 days out, 7 days out, and an overdue notice,
-- ONE of each per cycle, idempotent via the three *_sent_at stamps. Recording a payment extends
-- paid_through by one interval and clears the stamps (lib/billing/manual-agreements.ts).

-- == 1. The table =================================================================================
create table if not exists public.space_billing_agreements (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  -- The plan the deal buys. Mirrors the paid SpacePlan labels (lib/pricing/plans.ts); 'free'
  -- deliberately excluded (a free plan needs no money memory).
  plan          text not null
                  check (plan in ('business', 'collective', 'nonprofit', 'independent')),
  -- The renewal cadence the deal is settled on.
  interval      text not null default 'year'
                  check (interval in ('month', 'year')),
  -- What one interval costs, in cents (the LOCKED rate actually agreed, not the list price).
  amount_cents  bigint not null check (amount_cents >= 0),
  -- How the deal is settled.
  method        text not null default 'cash'
                  check (method in ('cash', 'check', 'transfer', 'other')),
  -- Short human framing of the locked rate, shown to the operator on their billing surface.
  label         text,
  -- The calendar (plain dates, UTC-day semantics): when the deal started and how far it is paid.
  started_at    date not null,
  paid_through  date not null,
  -- The reminder ladder's idempotency stamps: each touch fires ONCE per cycle; a payment clears
  -- all three so the next cycle re-arms.
  reminder_30_sent_at    timestamptz,
  reminder_7_sent_at     timestamptz,
  overdue_notice_sent_at timestamptz,
  -- Lifecycle: 'active' drives reminders and renders on the billing surface; 'canceled' /
  -- 'settled' are history (kept, never deleted, so the money memory survives the deal).
  status        text not null default 'active'
                  check (status in ('active', 'canceled', 'settled')),
  -- Free-form crew note (who paid, where the cash went, anything the row should remember).
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One ACTIVE agreement per Space (history rows are unlimited). The staff create path pre-checks
-- and this index settles the race.
create unique index if not exists space_billing_agreements_one_active_idx
  on public.space_billing_agreements (space_id)
  where status = 'active';

-- The tenant filter (owner surface + admin detail read by space).
create index if not exists space_billing_agreements_space_idx
  on public.space_billing_agreements (space_id);

-- The cron's batched due read: active agreements with paid_through inside the reminder horizon.
create index if not exists space_billing_agreements_due_idx
  on public.space_billing_agreements (paid_through)
  where status = 'active';

comment on table public.space_billing_agreements is
  'Manual (off-Stripe) billing agreements (ADR-872): a Space paying cash/check/transfer for a plan at a locked rate. The money memory ONLY; spaces.plan stays the access authority. The billing-renewals cron drives the 30d/7d/overdue reminder ladder off the *_sent_at stamps. Writes are service-role only (staff actions + the cron); staff read all, a Space owner/admin reads their own.';
comment on column public.space_billing_agreements.plan is
  'The paid SpacePlan the deal buys (business/collective/nonprofit/independent). Recorded for the receipt; access still rides spaces.plan.';
comment on column public.space_billing_agreements.interval is
  'The renewal cadence (month/year). recordManualPayment extends paid_through by exactly one of these.';
comment on column public.space_billing_agreements.amount_cents is
  'The LOCKED per-interval rate in cents, as agreed (e.g. the grandfathered 49000 for $490/year), not the list price.';
comment on column public.space_billing_agreements.method is
  'How the deal settles: cash, check, transfer, or other.';
comment on column public.space_billing_agreements.label is
  'Short operator-facing framing of the locked rate, e.g. ''Grandfathered at $49/mo, normally $79''.';
comment on column public.space_billing_agreements.started_at is
  'The date the agreement began (plain date, UTC-day semantics).';
comment on column public.space_billing_agreements.paid_through is
  'How far the Space is paid. The reminder ladder counts down to this date; a recorded payment extends it by one interval.';
comment on column public.space_billing_agreements.reminder_30_sent_at is
  'When the 30-day renewal reminder went out this cycle (null = not yet). Cleared by a recorded payment.';
comment on column public.space_billing_agreements.reminder_7_sent_at is
  'When the 7-day renewal reminder went out this cycle (null = not yet). Cleared by a recorded payment.';
comment on column public.space_billing_agreements.overdue_notice_sent_at is
  'When the overdue notice went out this cycle (null = not yet). Cleared by a recorded payment.';
comment on column public.space_billing_agreements.status is
  'active drives reminders and renders on the billing surface; canceled/settled are kept history.';
comment on column public.space_billing_agreements.note is
  'Free-form crew note about the deal.';

-- == 2. updated_at trigger ========================================================================
drop trigger if exists space_billing_agreements_set_updated_at on public.space_billing_agreements;
create trigger space_billing_agreements_set_updated_at
  before update on public.space_billing_agreements
  for each row execute function public.set_updated_at();

-- == 3. RLS: staff-read-all + owner/admin-read-own; writes service-role only ======================
-- Mirrors the sibling billing table space_billing_agreements sits beside (space_subscription_items,
-- migration 20260916000000): reads for the people who already see billing, no client write path.
-- The viewer helpers live in the PRIVATE schema (private.get_my_*), as every sibling policy calls them.
alter table public.space_billing_agreements enable row level security;

-- STAFF (web_role admin/janitor) read everything (the /admin/spaces detail + oversight).
drop policy if exists "space_billing_agreements: staff read" on public.space_billing_agreements;
create policy "space_billing_agreements: staff read"
  on public.space_billing_agreements for select to authenticated
  using ((select private.get_my_web_role()) in ('admin', 'janitor'));

-- A Space OWNER or active ADMIN reads their own Space's agreements (the billing settings surface).
-- The tenant subqueries are wrapped in (select ...) so they run once per statement, not per row.
drop policy if exists "space_billing_agreements: owner or admin read" on public.space_billing_agreements;
create policy "space_billing_agreements: owner or admin read"
  on public.space_billing_agreements for select to authenticated
  using (
    space_id in (
      select s.id from public.spaces s
      where s.owner_profile_id = (select private.get_my_profile_id())
    )
    or space_id in (
      select sm.space_id from public.space_members sm
      where sm.profile_id = (select private.get_my_profile_id())
        and sm.role = 'admin'
        and sm.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policy by design: writes are service-mediated (the janitor-gated staff
-- actions + the billing-renewals cron run through the service role, which bypasses RLS). A client
-- can never forge an agreement or move its own paid_through.

-- == Rollback (hand-review aid) ===================================================================
-- Additive and self-contained; to reverse:
--   drop table if exists public.space_billing_agreements;  -- (drops its policies + indexes + trigger)
