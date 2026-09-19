-- LIVE-228 / ADR-1436: Collective merges into Business at $49.
--
-- The six granted Collective Spaces (spaces.plan = 'collective') were never charged. The owner
-- ruled they grandfather at $49, which is now the Business list price with two seats included.
-- Read-time remap in lib/pricing/plans.ts LEGACY_PLAN_REMAP already resolves the old label; this
-- file rewrites stored rows so the column matches the live SPACE_PLANS set.
--
-- spaces.plan is plain text (no CHECK). space_billing_agreements.plan has a CHECK that still
-- named collective; drop and replace it after the rewrite.
--
-- Do not apply from a worktree. execute_sql + ledger stamp after merge (docs/DATABASE.md).

update public.spaces
set plan = 'business'
where plan = 'collective';

update public.space_billing_agreements
set plan = 'business'
where plan = 'collective';

alter table public.space_billing_agreements
  drop constraint if exists space_billing_agreements_plan_check;

alter table public.space_billing_agreements
  add constraint space_billing_agreements_plan_check
  check (plan in ('business', 'nonprofit', 'independent'));

-- Operator-editable Business row: $49/mo, $490/yr, no list-vs-founding split.
insert into public.pricing_settings (key, value)
values (
  'plan.business',
  '{"monthly_cents": 4900, "annual_cents": 49000}'::jsonb
)
on conflict (key) do update
set value = excluded.value;
