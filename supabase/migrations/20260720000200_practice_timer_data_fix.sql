-- =============================================================================
-- Practice-timer redesign, schema 3/3: route the seeded demo practices to the
-- right timer + Mindless mode (data fix; WEBSITE-CHANGES-PLAN practice-timer redesign).
--
-- WHY: the seeded demo practices (20260629000000_seed_season_1_stretch,
-- 20260616000000_seed_shine_season, 20260607070000_seed_starter_content) carry a
-- timer_kind seeded from the old binary uses_timer, but none carry a Mindless MODE or a
-- Movement config. This wires each demo practice to the timer + mode its content implies,
-- so the redesigned launcher opens the right flavour. Matched by SLUG (the title-derived
-- canonical key from 20260627010000_practice_slugs); every update is GUARDED so a re-apply
-- is a clean no-op and a missing slug is simply skipped.
--
-- timer_kind / mindless_mode / movement_config are reached on the public.practices table
-- directly here (SQL, not the typed client), so no untyped-cast concern applies in-migration.
-- =============================================================================

-- 1. Motion → the Movement timer (a walk block; movement_config carries the mode).
update public.practices
  set timer_kind = 'movement'::public.practice_timer_kind,
      movement_config = '{"mode":"walk"}'::jsonb,
      mindless_mode = null
  where slug = 'daily-walk'
    and (timer_kind is distinct from 'movement'::public.practice_timer_kind
         or movement_config is distinct from '{"mode":"walk"}'::jsonb
         or mindless_mode is not null);

-- morning-movement: a short generic movement block — Walk fits its "stretch, walk, flow"
-- intent and is the gentlest default (the author can switch to Strength in the editor).
update public.practices
  set timer_kind = 'movement'::public.practice_timer_kind,
      movement_config = '{"mode":"walk"}'::jsonb,
      mindless_mode = null
  where slug = 'morning-movement'
    and (timer_kind is distinct from 'movement'::public.practice_timer_kind
         or movement_config is distinct from '{"mode":"walk"}'::jsonb
         or mindless_mode is not null);

-- 2. Stillness sits → the Mindless timer in 'stillness' mode.
update public.practices
  set timer_kind = 'mindless'::public.practice_timer_kind,
      mindless_mode = 'stillness'::public.practice_mindless_mode,
      movement_config = null
  where slug in ('morning-stillness', 'nature-witnessing', 'deep-listening')
    and (timer_kind is distinct from 'mindless'::public.practice_timer_kind
         or mindless_mode is distinct from 'stillness'::public.practice_mindless_mode
         or movement_config is not null);

-- 3. Journaling → the Mindless timer in 'journal' mode.
update public.practices
  set timer_kind = 'mindless'::public.practice_timer_kind,
      mindless_mode = 'journal'::public.practice_mindless_mode,
      movement_config = null
  where slug in ('signal-journal', 'voice-journal', 'write-something')
    and (timer_kind is distinct from 'mindless'::public.practice_timer_kind
         or mindless_mode is distinct from 'journal'::public.practice_mindless_mode
         or movement_config is not null);

-- 4. Reach-out / action → no timer, logged as a 'log' Mindless flavour (one-tap Log it).
update public.practices
  set timer_kind = 'none'::public.practice_timer_kind,
      mindless_mode = 'log'::public.practice_mindless_mode,
      movement_config = null
  where slug in ('one-small-reach', 'act-of-service')
    and (timer_kind is distinct from 'none'::public.practice_timer_kind
         or mindless_mode is distinct from 'log'::public.practice_mindless_mode
         or movement_config is not null);

-- 5. Backfill: any Mindless practice still missing a mode gets one derived from its Pillar
--    (mind → meditate, spirit → stillness, everything else → meditate), mirroring
--    lib/practices.pillarTimerDefault so the stored value matches the read-time default.
--    Joined to public.pillars by domain_id (the Pillar FK; see 20260613000010).
update public.practices p
  set mindless_mode = case
        when pl.slug = 'mind' then 'meditate'::public.practice_mindless_mode
        when pl.slug = 'spirit' then 'stillness'::public.practice_mindless_mode
        else 'meditate'::public.practice_mindless_mode
      end
  from public.pillars pl
  where p.domain_id = pl.id
    and p.timer_kind = 'mindless'::public.practice_timer_kind
    and p.mindless_mode is null;

-- A Mindless practice with NO Pillar at all still needs a sensible mode (the read-time
-- default for a null Pillar is 'meditate'); set it so the launcher always has a flavour.
update public.practices
  set mindless_mode = 'meditate'::public.practice_mindless_mode
  where timer_kind = 'mindless'::public.practice_timer_kind
    and mindless_mode is null
    and domain_id is null;

-- 6. A sensible default length where a timed practice has none, so the timer can seed.
update public.practices
  set duration_min = 5
  where duration_min is null
    and timer_kind <> 'none'::public.practice_timer_kind;
