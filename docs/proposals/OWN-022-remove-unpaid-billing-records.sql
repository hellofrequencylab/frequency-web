-- 🔴 A PROPOSAL, NOT A MIGRATION, AND NOT A SCHEMA CHANGE. Nothing below has been executed.
--
-- ⚠️ DO NOT MOVE THIS FILE TO supabase/migrations/. It is DML against operator state. Run it once
-- against production, verify, then delete this file.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
--
-- Owner instruction, 2026-08-19: *"Lumi is the only person who has paid. Remove the payment from
-- Audrey and Royal Temple. Remove founder badge from Audrey."*
--
-- `space_billing_agreements` holds THREE identical agreements — Collective, annual, $49000 cash,
-- started 2026-07-27, paid through 2027-07-27, all carrying the note "Founding Business. Paid $490
-- cash for the first year." All three were created at `2026-07-27 23:27:00.942371+00`, identical to
-- the microsecond, so one statement inserted all three. `founding_members` carries a matching trio,
-- all `kind='business' status='active' locked_rate_cents=4900`, every one stamped
-- `charged_at = 2026-07-27 23:20:46.131118+00` — again identical to the microsecond, and seven
-- minutes before the agreements.
--
-- Only Temple of Aset (IshAset Lumi) is real. The other two rows assert a payment that never
-- happened, which is why they are DELETED here rather than marked `canceled`/`lapsed`: those
-- statuses mean "this was true and then ended", and it was never true. Lumi's rows are untouched.
--
--   space_id                              slug            owner           keep?
--   cb611bac-7956-4652-9993-440c430d494b  templeofaset    IshAset Lumi    KEEP — the real customer
--   3321a92f-9e07-4fd9-976d-7aa6e9322b34  audrey-dewitt   Audrey DeWitt   remove agreement + badge
--   e4e224aa-966d-4cda-b748-e1209a633173  royaltemple     Meghan Riley    remove agreement ONLY
--
-- Verified against production (azsqfeonabsbmemvddqd) 2026-08-19.
--
--
-- ── 🔴 TWO THINGS THIS FILE DELIBERATELY DOES NOT DO. Both need an owner decision. ──────────────
--
-- 1. `spaces.plan` STAYS 'collective' for both Spaces. Measured today: 2 of 2 are still on the
--    Collective plan. Removing the payment record does not touch entitlements, so unless you also
--    drop them, Audrey DeWitt and Royal Temple keep the full Collective toolkit for free. That may
--    be exactly what you want (a comp). If it is not, add the step at the bottom.
--
-- 2. ROYAL TEMPLE KEEPS AN ACTIVE FOUNDER BADGE. You asked to remove the badge from Audrey only, so
--    this file removes Audrey's only. But Royal Temple's `founding_members` row will then read
--    `status='active'` with `charged_at` set and `card_on_file=false` — a row asserting a charge
--    that, by your own account, never happened, and `isActiveFoundingBusiness` will keep rendering
--    the Founding Business mark on the Space. If Royal Temple is a genuine founder who has not paid
--    yet, `status='reserved'` with `charged_at=NULL` is the honest shape (lib/founding/status.ts:
--    "'reserved' has NOT graduated: the spot is held and nothing has been charged"). Step 4 is
--    written and commented out for that. If Royal Temple should not be a founder at all, use the
--    same delete as Audrey.


-- ── STEP 1 · READ THE BEFORE STATE. Expect 3 agreements, 3 founding rows. ───────────────────────
select 'agreement' as kind, s.slug, a.status, a.amount_cents, a.paid_through::text as detail
  from space_billing_agreements a join spaces s on s.id = a.space_id
union all
select 'founding', s.slug, f.status, f.locked_rate_cents, f.charged_at::text
  from founding_members f join spaces s on s.id = f.space_id
order by kind, slug;


-- ── STEP 2 · REMOVE THE TWO AGREEMENTS THAT RECORD A PAYMENT NOBODY MADE. ───────────────────────
-- Scoped by slug, not by id, so it cannot touch Temple of Aset even if ids shift.
delete from space_billing_agreements
 where space_id in (select id from spaces where slug in ('audrey-dewitt', 'royaltemple'));
-- expect: DELETE 2


-- ── STEP 3 · REMOVE AUDREY'S FOUNDER BADGE. ────────────────────────────────────────────────────
delete from founding_members
 where kind = 'business'
   and space_id in (select id from spaces where slug = 'audrey-dewitt');
-- expect: DELETE 1


-- ── STEP 4 · OPTIONAL, PENDING YOUR DECISION — Royal Temple's founder row. ─────────────────────
-- (a) It is a real founder who simply has not paid: demote to reserved, clear the false charge.
--
--   update founding_members
--      set status = 'reserved', charged_at = null, updated_at = now()
--    where kind = 'business'
--      and space_id in (select id from spaces where slug = 'royaltemple');
--
-- (b) It should not be a founder at all: same delete as Audrey.
--
--   delete from founding_members
--    where kind = 'business'
--      and space_id in (select id from spaces where slug = 'royaltemple');


-- ── STEP 5 · OPTIONAL, PENDING YOUR DECISION — drop the free Collective entitlements. ──────────
-- Only if these two Spaces should NOT keep Collective. Check the plan column's allowed values
-- before running; 'free' is the baseline in lib/pricing/plans.ts SPACE_PLANS.
--
--   update spaces set plan = 'free'
--    where slug in ('audrey-dewitt', 'royaltemple');


-- ── STEP 6 · VERIFY. ───────────────────────────────────────────────────────────────────────────
-- Expect exactly ONE agreement (templeofaset) and, after step 3, founder rows for templeofaset and
-- royaltemple only — with royaltemple's shape matching whichever choice you made in step 4.
--
--   select 'agreement' as kind, s.slug, a.status
--     from space_billing_agreements a join spaces s on s.id = a.space_id
--   union all
--   select 'founding', s.slug, f.status
--     from founding_members f join spaces s on s.id = f.space_id
--   order by kind, slug;
