-- public.beta_referrals is dropped: the contest it existed for was ruled out (SCAN-511, ADR-1155).
--
-- ✅ WHY THIS IS A SECOND MIGRATION AND NOT PART OF SCAN-510. The repo's own sequencing rule, stated
-- in 20260925000000's header about commerce_variants: "drop the write + column, deploy, THEN drop the
-- table". Dropping a table in the same change that removes its callers is the exact shape ADR-1144
-- was written about — there, a drop and its code moved out of step and a feature silently never
-- worked for a month.
--
-- ✅ PRECONDITION CHECKED, NOT ASSUMED. SCAN-510's removal shipped in #2297 and its PRODUCTION
-- deployment is READY (verified 2026-08-25 against the Vercel deployment list, target=production,
-- ref=main). So no running code can reference this table by the time the drop lands.
--
-- ✅ NOTHING IS LOST. `select count(*) from public.beta_referrals` returned **0** immediately before
-- this migration was written, and 0 `beta_contest.*` rows sat on reward_grants when the owner made
-- the ruling. There is no data to export, which is why the owner's "export then drop" option was
-- moot rather than declined.
--
-- ⚠️ WHAT THE TABLE WAS. One row per ACTIVATED referral, deduped by a UNIQUE invitee_profile_id —
-- the anti-gaming lock of a beta contest gated behind `platform_flags.beta_referral_contest`, which
-- defaulted FALSE and was never turned on. Service-role only, RLS enabled with no client policies.
-- So this table never held a row in production and was never reachable from a browser.
--
-- ⚠️ THE TYPES BLOCK GOES WITH IT. lib/database.types.ts is REGENERATED from production in the same
-- change rather than hand-edited, because a hand-edit there rots (HYG-031 exists for exactly that).
--
-- ROLLBACK: re-create from 20261123000000. There is no data to restore.

begin;

drop table if exists public.beta_referrals;

do $$
begin
  -- NEGATIVE: the table is gone.
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'beta_referrals'
  ) then
    raise exception 'public.beta_referrals still exists after the drop';
  end if;

  -- POSITIVE: the ledger the contest ALSO wrote to is untouched. `reward_grants` is a shared table
  -- that long predates the contest and carries every other reward in the product; a drop that took
  -- it would be catastrophic and silent. Asserting it survives is the cheap way to prove the blast
  -- radius was exactly one table.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'reward_grants'
  ) then
    raise exception 'reward_grants is gone - the drop took more than the contest table';
  end if;
end $$;

commit;
