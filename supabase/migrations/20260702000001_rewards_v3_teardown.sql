-- Rewards Economy v3 (Season 1 clean rebuild) — TEARDOWN
--
-- Removes the retired gamification surface so the first season starts clean
-- (see ADR for Rewards Economy v3 and docs/REWARDS-ECONOMY.md). Cut features:
--   * peer "Witnessed" awards            -> drop witnessed_grants
--   * secret awards ("Quiet Ones")       -> delete is_secret achievements
--   * circle-collaborative (Co-op Pulse / Synchrony / Carrier Wave /
--     Circle Current)                    -> drop circle_awards,
--                                            circle_current_transactions,
--                                            circles.season_current
--   * Practice Shelf                     -> drop practice_streaks
--   * side quests                        -> delete is_side_quest achievements,
--                                            drop achievements.is_side_quest
-- Also drops the seasonal Gems counter (Gems are continuous now: lifetime_gems is
-- monotonic, spendable = lifetime_gems - SUM(redemptions)) and the retired
-- Luminary double-gate column (season_challenges_complete).
--
-- The reward_grants TABLE stays (it is the season-conversion + creation-reward
-- idempotency ledger). Daily streak, Amplitude, ranks, trophies, store all stay.
--
-- Safe data-wise: the dropped tables are empty in production; the dropped columns
-- hold only beta values that the S1 wipe clears anyway.

begin;

-- 1) Rewrite the three functions that reference the columns being dropped, so the
--    column drops below are clean.

-- 1a) Gems are continuous: only lifetime_gems (monotonic) moves on a gem grant.
create or replace function public.after_gem_transaction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update profiles
  set lifetime_gems = lifetime_gems + new.amount
  where id = new.profile_id;
  return new;
end;
$function$;

-- 1b) Self-edit guard: drop the checks for the two columns we remove.
create or replace function public.prevent_economy_self_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' and (
        new.current_season_zaps IS DISTINCT FROM old.current_season_zaps
     or new.lifetime_zaps        IS DISTINCT FROM old.lifetime_zaps
     or new.lifetime_gems        IS DISTINCT FROM old.lifetime_gems
     or new.current_season_rank  IS DISTINCT FROM old.current_season_rank
     or new.lifetime_rank        IS DISTINCT FROM old.lifetime_rank
     or new.is_active            IS DISTINCT FROM old.is_active
     or new.profile_border       IS DISTINCT FROM old.profile_border
     or new.profile_flair        IS DISTINCT FROM old.profile_flair
     or new.custom_title         IS DISTINCT FROM old.custom_title
     or new.profile_theme        IS DISTINCT FROM old.profile_theme
  ) then
    raise exception
      'economy, rank, status, and cosmetic columns cannot be modified by users - use server actions'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- 1c) Season reset: keep the flat 5:1 conversion, the season trophy, the Founding
--     Season stamp, the lifetime_rank lock, the streak reset and the season roll.
--     Drop every reference to current_season_gems, season_challenges_complete and
--     circles.season_current (all removed below).
create or replace function public.reset_season()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  active_season_num integer;
  season_start timestamptz;
  r record;
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
    select p.id, p.current_season_rank, p.current_season_zaps,
           exists (select 1 from practice_logs pl
                   where pl.profile_id = p.id and pl.created_at >= season_start) as practiced
    from profiles p
    where p.current_season_zaps > 0
       or exists (select 1 from practice_logs pl
                  where pl.profile_id = p.id and pl.created_at >= season_start)
  loop
    -- ZAP_TO_GEM_RATIO: flat 5:1 for everyone, floor division.
    converted := floor(r.current_season_zaps / 5.0);

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    -- Conversion, claim-then-pay (reward_grants is the idempotency backstop).
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

    -- Founding Season stamp (Season 1 only).
    if active_season_num = 1 and r.practiced then
      insert into user_achievements (profile_id, achievement_id)
      select r.id, a.id from achievements a where a.slug = 'season-one'
      on conflict do nothing;
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season.
  update profiles
  set lifetime_rank = greatest(lifetime_rank, current_season_rank)
  where true;

  -- Only season counters zero. Gems, Amplitude, trophies, awards, streaks-bank stay.
  update profiles
  set current_season_zaps = 0,
      current_season_rank = 'ghost'::season_rank_enum
  where true;

  update streaks
  set current_count    = 0,
      last_activity_at = null,
      updated_at       = now()
  where true;

  delete from challenge_progress;

  update seasons set status = 'ended', ends_at = coalesce(ends_at, now())
  where status = 'active';
  insert into seasons (season_number, name, status, starts_at)
  values (active_season_num + 1, 'Season ' || (active_season_num + 1), 'active', now())
  on conflict (season_number) do nothing;
end;
$function$;

-- 2) Drop the circle-collaborative ledger (table drop removes its trigger), then
--    its writer function.
drop table if exists public.circle_current_transactions cascade;
drop function if exists public.after_circle_current_transaction() cascade;

-- 3) Drop the other cut tables (empty in production).
drop table if exists public.circle_awards cascade;
drop table if exists public.witnessed_grants cascade;
drop table if exists public.practice_streaks cascade;

-- 4) Drop the retired columns.
alter table public.circles  drop column if exists season_current;
alter table public.profiles drop column if exists current_season_gems;
alter table public.profiles drop column if exists season_challenges_complete;

-- 5) Remove secret-award and side-quest achievements, then drop the side-quest flag.
delete from public.user_achievements ua
using public.achievements a
where ua.achievement_id = a.id
  and (a.is_secret = true or a.is_side_quest = true);

delete from public.achievements
where is_secret = true or is_side_quest = true;

alter table public.achievements drop column if exists is_side_quest;

commit;
