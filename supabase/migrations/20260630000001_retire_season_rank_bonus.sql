-- =============================================================================
-- Retire the season-end final-rank Gem bonus (Quest completion model).
--
-- The Quest moved from Zap-threshold ranks to completion-based ranks. The old
-- season-close "final-rank bonus" (echo 10 / signal 25 / beacon 50 / conduit 100
-- / luminary 250) no longer maps to anything: those rank names were dropped in
-- 20260628010000_quest_completion_model.sql, so the CASE in reset_season() already
-- matches nothing and pays 0. This migration removes the dead block so the
-- function is honest about what it does.
--
-- KEPT: the flat 5:1 Zap→Gem conversion at season close (ZAP_TO_GEM_RATIO = 5),
-- the season trophy stamp, lifetime-rank peak lock, counter resets, and season
-- rollover. Only the rank-bonus computation + grant are removed.
--
-- Body carried verbatim from 20260614200000_rewards_economy_v2.sql §10 minus the
-- `rank_bonus` variable and its grant block.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  active_season_num integer;
  season_start timestamptz;
  r RECORD;
  converted integer;
  challenges_done integer;
begin
  select season_number, starts_at into active_season_num, season_start
  from seasons where status = 'active' limit 1;
  if active_season_num is null then
    select coalesce(max(season), 0) + 1 into active_season_num from season_trophies;
  end if;
  if season_start is null then
    season_start := now() - interval '13 weeks';
  end if;

  for r in
    select p.id, p.current_season_rank, p.current_season_zaps, p.season_challenges_complete,
           exists (select 1 from practice_logs pl
                   where pl.profile_id = p.id and pl.created_at >= season_start) as practiced
    from profiles p
    where p.current_season_zaps > 0
       or exists (select 1 from practice_logs pl
                  where pl.profile_id = p.id and pl.created_at >= season_start)
  loop
    -- ZAP_TO_GEM_RATIO (Quest completion model): flat 5:1 for everyone, floor division.
    converted := floor(r.current_season_zaps / 5.0);

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    -- Season trophy (final rank + season Zaps stamped) for everyone who played.
    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    -- Conversion, claim-then-pay (reward_grants is the idempotency backstop, ADR-168).
    if converted > 0 then
      begin
        insert into reward_grants (rule_key, profile_id, reward_kind, amount, detail)
        values ('season:' || active_season_num || ':convert', r.id, 'gems', converted,
                'Season ' || active_season_num || ' Zap conversion (5:1)');
        insert into gem_transactions (profile_id, action_type, amount, metadata)
        values (r.id, 'season_convert', converted,
          jsonb_build_object('season', active_season_num, 'rank', r.current_season_rank::text,
                             'zaps', r.current_season_zaps, 'rate', '5:1'));
      exception when unique_violation then null;
      end;
    end if;

    -- (Final-rank Gem bonus retired — completion model: rank carries no season-end purse.)

    -- Founding Season stamp (Season 1 only): the manual 'season-one' achievement.
    if active_season_num = 1 and r.practiced then
      insert into user_achievements (profile_id, achievement_id)
      select r.id, a.id from achievements a where a.slug = 'season-one'
      on conflict do nothing;
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season.
  update profiles
  set lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  where true;

  -- Amplitude, Gems, Awards, trophies, Practice Shelf untouched — only season
  -- counters zero.
  update profiles
  set current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  where true;

  -- Circle Current is per-season (the ledger is permanent history and stays).
  update circles
  set season_current = 0
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

-- ── DOWN (reversible) ──────────────────────────────────────────────────────────
-- Re-run 20260614200000_rewards_economy_v2.sql §10 to restore the rank-bonus block
-- (it pays 0 anyway under the 4-value enum, so this DOWN is cosmetic).
