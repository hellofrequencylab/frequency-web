-- =============================================================================
-- Lifetime rank — the locked, never-resetting peak (P2.6, ADR-037)
--
-- WHY: ranks were purely seasonal. `current_season_rank` advances with
-- `current_season_zaps` and is wiped to 'ghost' every reset_season(). The Vault
-- model (ADR-037, content/help/membership/the-vault.md) promises a *lifetime
-- rank* you "lock in" — the highest rank you've ever reached, which survives
-- season resets and is the durable endorsement on your Vault/profile.
--
-- WHAT: a monotonic `profiles.lifetime_rank` that only ever moves up. It tracks
-- the peak of `current_season_rank` automatically (in the zap trigger), is locked
-- from each season's final rank at reset (covering manual Luminary promotions the
-- auto-advance never sees), and is intentionally NOT cleared by reset_season().
--
-- The season_rank_enum is declared in ascending order
-- (ghost < runner < operative < agent < conduit < luminary), so GREATEST()/max()
-- on the enum give the correct "higher rank" — no ordinal lookup table needed.
-- =============================================================================

-- 1. The column. Monotonic peak; defaults to the floor rank.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lifetime_rank season_rank_enum NOT NULL DEFAULT 'ghost';

-- 2. Backfill from the present: the higher of the current season rank and the
--    best final_rank ever recorded in season_trophies (final_rank is stored as
--    text, sourced from current_season_rank::text, so the cast is safe).
UPDATE profiles p
SET lifetime_rank = GREATEST(
  p.current_season_rank,
  COALESCE(
    (SELECT max(t.final_rank::season_rank_enum)
       FROM season_trophies t
      WHERE t.profile_id = p.id),
    'ghost'::season_rank_enum
  )
);

-- 3. Keep lifetime_rank in lockstep with the peak: every zap transaction already
--    advances current_season_rank here; now also ratchet lifetime_rank up to it.
--    (Re-creates the ADR-139 trigger fn verbatim, plus the final lifetime bump.)
CREATE OR REPLACE FUNCTION after_zap_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.amount,
      lifetime_zaps       = lifetime_zaps + NEW.amount
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('agent', 'conduit', 'luminary')
         THEN 'agent'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('operative', 'agent', 'conduit', 'luminary')
         THEN 'operative'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('runner', 'operative', 'agent', 'conduit', 'luminary')
         THEN 'runner'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  -- Lock the lifetime peak (monotonic — GREATEST never lowers it).
  UPDATE profiles
  SET lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- 4. reset_season(): lock each player's lifetime_rank from their final season rank
--    BEFORE the season columns are wiped. The trigger keeps lifetime_rank current
--    for auto-advanced ranks, but Luminary is a manual admin promotion the trigger
--    never sees — this captures it. lifetime_rank is deliberately absent from the
--    reset SET below, so it persists across seasons.
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  active_season_num integer;
  r RECORD;
  conversion_rate numeric;
  converted integer;
  challenges_done integer;
begin
  select season_number into active_season_num from seasons where status = 'active' limit 1;
  if active_season_num is null then
    select coalesce(max(season), 0) + 1 into active_season_num from season_trophies;
  end if;

  for r in
    select id, current_season_rank, current_season_zaps, season_challenges_complete
    from profiles
    where current_season_zaps > 0
  loop
    conversion_rate := case r.current_season_rank::text
      when 'luminary'  then 1.0 / 1.5
      when 'conduit'   then 1.0 / 2.0
      when 'agent'     then 1.0 / 3.0
      when 'operative' then 1.0 / 4.0
      else                  1.0 / 5.0
    end;

    converted := floor(r.current_season_zaps * conversion_rate);

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    if converted > 0 then
      insert into gem_transactions (profile_id, action_type, amount, metadata)
      values (r.id, 'season_convert', converted,
        jsonb_build_object('season', active_season_num, 'rank', r.current_season_rank::text, 'zaps', r.current_season_zaps));
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season (covers manual Luminary).
  update profiles
  set lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  where true;

  update profiles
  set current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  where true;

  update streaks
  set current_count    = 0,
      last_activity_at = null,
      updated_at       = now()
  where true;

  delete from challenge_progress;

  -- Close the active season and open the next.
  update seasons set status = 'ended', ends_at = coalesce(ends_at, now())
  where status = 'active';
  insert into seasons (season_number, name, status, starts_at)
  values (active_season_num + 1, 'Season ' || (active_season_num + 1), 'active', now())
  on conflict (season_number) do nothing;
end;
$$;
