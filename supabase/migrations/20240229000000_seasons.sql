-- =====================================================================
-- Seasons: give seasons a first-class identity. They were implicit (numbered
-- by counting season_trophies, with no name/dates/status). This adds a seasons
-- table and reworks reset_season() to source the season number from the active
-- season, then close it and open the next. The conversion + trophy + reset
-- logic is unchanged from the gems-economy migration. Powers a proper season
-- UI (ROADMAP P2.10 / DEVELOPMENT-MAP Stage A).
-- =====================================================================

create table if not exists seasons (
  id            uuid primary key default gen_random_uuid(),
  season_number integer unique not null,
  name          text not null,
  theme         text,
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,                       -- null = open-ended until reset
  status        text not null default 'active',    -- upcoming | active | ended
  created_at    timestamptz not null default now()
);

-- At most one active season at a time.
create unique index if not exists seasons_one_active
  on seasons (status) where status = 'active';

alter table seasons enable row level security;
create policy "seasons: public read" on seasons for select using (true);

-- Seed the current (active) season, numbered to follow any existing trophy
-- seasons, so the first reset after this migration is numbered correctly.
insert into seasons (season_number, name, status, starts_at)
select coalesce(max(season), 0) + 1,
       'Season ' || (coalesce(max(season), 0) + 1),
       'active', now()
from season_trophies
where not exists (select 1 from seasons where status = 'active')
on conflict (season_number) do nothing;

-- Rework reset_season: source the number from the active season (fallback:
-- trophies + 1), mint/convert/reset exactly as before, then close the active
-- season and open the next.
create or replace function reset_season()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
