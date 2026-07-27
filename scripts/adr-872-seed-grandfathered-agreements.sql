-- ADR-872: seed the three grandfathered manual billing agreements (founder mandate, 2026-07-27).
-- Run ONCE against production by an operator, AFTER migration 20270114000000_space_billing_agreements
-- is applied. Idempotent: the ON CONFLICT rides the one-active-per-space partial unique index, so a
-- re-run (or a space that already has an active agreement) no-ops instead of duplicating.
--
-- The deal: three Spaces paid $490 CASH for a year of the Collective plan, grandfathered at
-- $49/month · $490/year (list is $79/month). Their spaces.plan is ALREADY 'collective' (set by the
-- main session); this records the money memory and arms the renewal reminder ladder
-- (30 days out / 7 days out / overdue, app/api/cron/billing-renewals).
--
-- Verify first (expect the three spaces, no active agreements yet):
--   select s.id, s.name, s.plan, a.id as agreement_id
--     from public.spaces s
--     left join public.space_billing_agreements a
--       on a.space_id = s.id and a.status = 'active'
--    where s.id in ('3321a92f-9e07-4fd9-976d-7aa6e9322b34',
--                   'cb611bac-7956-4652-9993-440c430d494b',
--                   'e4e224aa-966d-4cda-b748-e1209a633173');

insert into public.space_billing_agreements
  (space_id, plan, interval, amount_cents, method, label, started_at, paid_through, status)
values
  -- Audrey DeWitt
  ('3321a92f-9e07-4fd9-976d-7aa6e9322b34', 'collective', 'year', 49000, 'cash',
   'Grandfathered at $49/mo ($490/yr), normally $79', date '2026-07-27', date '2027-07-27', 'active'),
  -- Temple of Aset
  ('cb611bac-7956-4652-9993-440c430d494b', 'collective', 'year', 49000, 'cash',
   'Grandfathered at $49/mo ($490/yr), normally $79', date '2026-07-27', date '2027-07-27', 'active'),
  -- Royal Temple
  ('e4e224aa-966d-4cda-b748-e1209a633173', 'collective', 'year', 49000, 'cash',
   'Grandfathered at $49/mo ($490/yr), normally $79', date '2026-07-27', date '2027-07-27', 'active')
on conflict (space_id) where status = 'active' do nothing;

-- Verify after (expect three rows, paid through 2027-07-27):
--   select space_id, plan, interval, amount_cents, method, paid_through, status
--     from public.space_billing_agreements
--    where status = 'active'
--    order by created_at desc;
