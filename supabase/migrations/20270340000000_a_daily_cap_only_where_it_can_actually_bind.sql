-- Daily caps on the Zap actions a member can trigger at will — and ONLY on the ones where a
-- cap can actually bind.
--
-- OWN-040 carried the item "set daily_cap on the circle_start (100 Zaps) and circle_activate
-- (40 Zaps) rows at /admin/gamification". A census of all 23 `zap_config` rows found the item
-- both too narrow and too broad, in different places.
--
-- ── TOO NARROW: the largest exposure was not on the list ───────────────────────────────────
-- `event_host` pays 60 Zaps from `app/(main)/events/actions.ts:462`, fired unconditionally at
-- the end of createEvent. Create an event, collect 60, repeat. It routes through
-- `awardZapsForAction`, so a cap binds. It is the single biggest self-triggerable payout in
-- the table and no row named it.
--
-- ── TOO BROAD: five of the eight "creation" actions must NOT get a cap ─────────────────────
-- `daily_cap` is read in exactly one place — `awardZapsForAction` (lib/zaps.ts), which passes
-- it to `award_zaps_atomic` (20270322000000). `awardZaps(profileId, amount, opts)` does not
-- read it and says so in its own header. So a cap set on an action whose only writer is
-- `awardZaps` gates NOTHING while showing as a configured throttle in /admin/gamification —
-- ADR-970's named failure, which is the exact defect 20270322000000 was written to repair.
-- Setting one here would re-commit it one table row over.
--
--   create_journey (100) · create_event (50) · create_practice (40)
--     Paid only by `awardValidatedCreation` (lib/rewards/creation.ts:250) on the `awardZaps`
--     path, so a cap is INERT. It would also be WEAKER than what is already there: the payout
--     requires a distinct, email-verified member who was not invited by the creator to
--     actually use the asset (`isEstablishedValidator`), and pays once per asset EVER via the
--     reward_grants rule_key `creation_validated:{type}:{id}`. That function's own header
--     states the design: "Uncapped (the validation gate is the throttle)."
--
--   entry_point_created (20)
--     Already capped in code at FIVE PER LIFETIME (`CREATE_REWARD_CAP`,
--     app/(main)/entry-points/actions.ts:28). 100 Zaps total, ever. A daily cap adds nothing.
--
--   practice_full_cycle (50)
--     Has no writer at all. The string appears in the seed, in ZAP_AMOUNTS, in a test, and in
--     lib/economy/ledger.ts:191 where it is labelled "(legacy)". Nothing awards it. A cap on a
--     row nothing writes is a gate that cannot fire, twice over.
--
-- ── SO: THREE ROWS, and the numbers come from what the action means ────────────────────────
--   circle_start      100 → cap 1. Its own seeded description reads "Founded a real circle —
--                                  the rarest, highest act of leadership." Founding two real
--                                  circles inside one UTC day is not that act.
--   event_host         60 → cap 2. Hosting is the point of the product, so the cap sits above
--                                  ordinary use and below a farming loop. Mirrors the existing
--                                  event_posted cap of 3, one lower because it pays 3x more.
--   circle_activate    40 → cap 2. Claiming is a real member act and legitimately repeats
--                                  (a crew member activating a small backlog), so 2 rather
--                                  than 1.
--
-- ⚠️ WHAT A CAP COSTS WHEN IT BINDS: `award_zaps_atomic` refuses the award and returns
-- capped=true. The underlying act still succeeds — the circle is founded, the event is
-- created. Only the Zap payout is withheld. Seeding a launch batch loses Zaps, not work.
--
-- Reversible: `update public.zap_config set daily_cap = null where action_type in (...)`.
-- No DDL. ADR-1157.

begin;

-- CONTROL, BEFORE. Captured as a difference base rather than an absolute, because an absolute
-- "nothing is capped" assertion is exactly the false control that failed db-tests on
-- 20270334000000 (ADR-1150): two rows already carry caps and always did.
create temp table _caps_before on commit drop as
select action_type, daily_cap
  from public.zap_config;

update public.zap_config set daily_cap = 1 where action_type = 'circle_start';
update public.zap_config set daily_cap = 2 where action_type = 'event_host';
update public.zap_config set daily_cap = 2 where action_type = 'circle_activate';

do $$
declare
  v_changed  integer;
  v_expected integer;
  v_missing  text;
begin
  -- 1. EXACTLY the three intended rows moved, and nothing else did.
  select count(*) into v_changed
    from public.zap_config c
    join _caps_before b using (action_type)
   where c.daily_cap is distinct from b.daily_cap;
  if v_changed <> 3 then
    raise exception 'daily_cap changed on % row(s), expected exactly 3', v_changed;
  end if;

  -- 2. The three carry the intended values (a count alone would pass if they moved wrongly).
  select count(*) into v_expected
    from public.zap_config
   where (action_type = 'circle_start'    and daily_cap = 1)
      or (action_type = 'event_host'      and daily_cap = 2)
      or (action_type = 'circle_activate' and daily_cap = 2);
  if v_expected <> 3 then
    raise exception 'expected 3 rows at their intended caps, found %', v_expected;
  end if;

  -- 3. BLAST RADIUS: the two caps that already existed are untouched. This is the arm that
  --    catches a mis-scoped UPDATE, which is the only way this migration could do damage.
  if exists (
    select 1 from public.zap_config c join _caps_before b using (action_type)
     where b.action_type in ('practice_logged', 'event_posted')
       and c.daily_cap is distinct from b.daily_cap
  ) then
    raise exception 'a pre-existing cap (practice_logged / event_posted) was modified';
  end if;

  -- 4. POSITIVE CONTROL for the reasoning above, not for the write: the five rows deliberately
  --    left uncapped must still be NULL. If a later change caps one of them, this migration's
  --    stated reasoning has been contradicted and the next fresh apply says so out loud.
  select string_agg(action_type, ', ') into v_missing
    from public.zap_config
   where action_type in ('create_journey', 'create_event', 'create_practice',
                         'entry_point_created', 'practice_full_cycle')
     and daily_cap is not null;
  if v_missing is not null then
    raise exception 'deliberately-uncapped action(s) now carry a cap: % — see this migration''s header before removing this control', v_missing;
  end if;
end $$;

commit;
