-- ============================================================================
-- DELETE THE TWO INERT ONBOARDING FLAGS AND THE EMPTY WALKTHROUGH DRAFT
-- (LIVE-260, owner ruling 2026-09-21, ADR-1513)
-- ============================================================================
--
-- THE STATE. `platform_flags.auto_popups_enabled` and `platform_flags.next_steps_enabled`
-- were seeded false by 20270345000400_seed_missing_platform_flags.sql as the kill
-- switches on two onboarding engines. LIVE-240 (2026-09-09) deleted both engines
-- and both readers: lib/onboarding/flags.ts is gone, and the nextStepsEnabled read
-- in lib/onboarding/status.ts is gone. Nothing under app/, lib/ or components/
-- reads either key (lib/platform-flags.test.ts records the same; LIVE-260's probe
-- re-checks it on every run). Each row renders in the admin flag console as a
-- switch an operator can flip, and flipping it does nothing at all. That is the
-- "mechanism outlives what it described" shape ADR-1083 records, and the same
-- cleanup 20270345001800 did for beta_referral_contest.
--
-- THE RULING. The owner ruled on 2026-09-21: delete the two rows, LEAVE the
-- 'onboarding-next-steps' walkthrough inactive, and the empty 'new-walkthrough'
-- draft may go too. This file does exactly that and nothing else. It activates
-- nothing. The code default checklist (photo, Circle, Event, host) keeps
-- rendering, which is the model.
--
-- THE WALKTHROUGH DELETE IS GUARDED BY CONTENT, NOT BY NAME. The draft is deleted
-- only if its slug is 'new-walkthrough' AND its steps array is empty. If an
-- operator has since put a slide into it, the row is authored work and this
-- file leaves it alone. Absent rows delete nothing, so a fresh replay (where no
-- migration ever seeded either walkthrough row) is a no-op here.
--
-- Idempotent, safe to re-run. platform_flag_events is untouched: it is the
-- history, and a live row for a deleted engine is state, not history. No grants
-- change: platform_flags stays service-role only and walkthrough keeps its
-- existing policies. No function is created or dropped, so
-- scripts/function-grants.txt is unchanged. No em or en dashes in this file.
-- ============================================================================

begin;

delete from public.platform_flags
 where key in (
   'auto_popups_enabled',
   'next_steps_enabled'
 );

delete from public.walkthrough
 where slug = 'new-walkthrough'
   and jsonb_typeof(steps) = 'array'
   and jsonb_array_length(steps) = 0;

do $$
begin
  -- NEGATIVE: both inert switches are gone.
  if exists (
    select 1 from public.platform_flags
     where key in ('auto_popups_enabled', 'next_steps_enabled')
  ) then
    raise exception 'an inert onboarding flag survived the delete';
  end if;

  -- NEGATIVE: an empty draft named new-walkthrough is gone.
  if exists (
    select 1 from public.walkthrough
     where slug = 'new-walkthrough'
       and jsonb_typeof(steps) = 'array'
       and jsonb_array_length(steps) = 0
  ) then
    raise exception 'the empty new-walkthrough draft survived the delete';
  end if;

  -- POSITIVE: the blast radius was exactly those keys. The six sibling keys the
  -- same seed file inserted are still read by lib/platform-flags.ts; a lost
  -- where-clause would take them, and this notices.
  if (
    select count(*) from public.platform_flags
     where key in (
       'referrals_enabled', 'sms_enabled', 'vera_autonomy_enabled',
       'vera_breaker_armed', 'host_payouts_enabled', 'chat_dm_routes_retired'
     )
  ) <> 6 then
    raise exception 'a live platform flag is gone - the delete took more than the two inert keys';
  end if;

  -- POSITIVE: the audit ledger is untouched.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'platform_flag_events'
  ) then
    raise exception 'platform_flag_events is gone - the cleanup took the audit ledger';
  end if;

  -- POSITIVE: the walkthrough table is still here for the row the ruling keeps.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'walkthrough'
  ) then
    raise exception 'walkthrough is gone - the cleanup took the table';
  end if;
end $$;

commit;

-- ROLLBACK. Re-run the two rows of the seed in
-- 20270345000400_seed_missing_platform_flags.sql. Both seeded false and nothing
-- reads them, so a rollback restores rows that change no behaviour. The empty
-- draft has no seed to restore; recreate it at /admin/walkthroughs if wanted.
