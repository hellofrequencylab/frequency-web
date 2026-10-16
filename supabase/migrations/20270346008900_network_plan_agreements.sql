-- SCAN-956 (owner ruling 2026-10-15): the Network plan joins the catalog as plan id `network`. One owner
-- running many groups (chapters), from $599/mo for ten chapters, quote only until its Stripe prices exist.
--
-- spaces.plan is plain text with no CHECK, so it already accepts `network`. The one place the database
-- refuses it is space_billing_agreements.plan: a quoted Network is billed by hand, through a manual
-- agreement (lib/billing/manual-agreements.ts, which accepts every SPACE_PLANS id but free), so the CHECK
-- must admit it.
--
-- Additive and idempotent: the CHECK only widens (every value it admitted before is still admitted), and
-- re-running it drops and re-adds the same constraint. No Stripe price and no pricing_settings row is
-- written here.

begin;

alter table public.space_billing_agreements
  drop constraint if exists space_billing_agreements_plan_check;
alter table public.space_billing_agreements
  add constraint space_billing_agreements_plan_check
  check (plan in ('business', 'nonprofit', 'independent', 'collective', 'nonprofit_collective', 'network'));

commit;
