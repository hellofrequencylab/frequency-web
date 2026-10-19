-- Regulars, phase 2: Hunts. Spaces running Regulars run a scavenger hunt together (LIVE-942, ADR-1781).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md for the program; this file explains the
-- schema, it does not track the work.
--
-- A hunt is hosted by one Space, invites other Spaces as stops, and runs for a calendar window. A member
-- who checks in at EVERY accepted stop inside the window (the ordinary Regulars stamp, LIVE-940) finishes
-- the hunt once and earns the host's completion reward, as a loyalty_rewards row the host hands out at
-- its counter, plus the hunt_complete Zaps. Nothing new is scanned: progress is read off loyalty_stamps.
--   • loyalty_hunts: the hunt (host, window, reward, status draft / live / ended).
--   • loyalty_hunt_stops: one row per invited Space; the host is a stop that is accepted from the start.
--   • loyalty_hunt_completions: one row per member per hunt, the exactly-once guard on the reward.
--   • loyalty_rewards.hunt_id: which hunt minted a reward, so the host roster can say so.
--   • loyalty_hunt_progress(): the one writer. For every live hunt the Space is a stop of, it counts the
--     member's stops in the window, mints the completion (and the reward) when every stop is done, and
--     returns the progress list, under the same per-(space, member) advisory lock loyalty_record_visit
--     holds, so two taps at the last stop earn one reward.
--   • zap_config 'hunt_complete': 100 Zaps, 100 a day.
--
-- Service role only on every table, like the three LIVE-940 tables. No money moves.
--
-- Additive and idempotent. ROLLBACK:
--   drop function if exists public.loyalty_hunt_progress(uuid, uuid, date);
--   alter table public.loyalty_rewards drop column if exists hunt_id;
--   drop table if exists public.loyalty_hunt_completions;
--   drop table if exists public.loyalty_hunt_stops;
--   drop table if exists public.loyalty_hunts;
--   delete from public.zap_config where action_type = 'hunt_complete';

begin;

create table if not exists public.loyalty_hunts (
  id uuid primary key default gen_random_uuid(),
  host_space_id uuid not null references public.spaces(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 500),
  starts_on date not null,
  ends_on date not null,
  reward_title text not null check (char_length(btrim(reward_title)) between 1 and 80),
  reward_value_cents integer not null default 0 check (reward_value_cents between 0 and 100000),
  reward_note text check (reward_note is null or char_length(reward_note) <= 280),
  status text not null default 'draft' check (status in ('draft','live','ended')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on - starts_on between 14 and 70)
);
create index if not exists loyalty_hunts_host_idx on public.loyalty_hunts(host_space_id, status);
create index if not exists loyalty_hunts_created_by_idx on public.loyalty_hunts(created_by) where created_by is not null;
alter table public.loyalty_hunts enable row level security;
revoke all on table public.loyalty_hunts from public, anon, authenticated;
grant all on public.loyalty_hunts to service_role;
comment on table public.loyalty_hunts is 'LIVE-942 Regulars hunts: one hunt hosted by a Space, a 2 to 10 week window, a completion reward. Service role only; lib/loyalty/hunt-store.ts writes it after the owner gate.';

create table if not exists public.loyalty_hunt_stops (
  hunt_id uuid not null references public.loyalty_hunts(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','accepted','declined')),
  position smallint not null default 0,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.profiles(id) on delete set null,
  primary key (hunt_id, space_id)
);
create index if not exists loyalty_hunt_stops_space_idx on public.loyalty_hunt_stops(space_id, status);
create index if not exists loyalty_hunt_stops_responded_by_idx on public.loyalty_hunt_stops(responded_by) where responded_by is not null;
alter table public.loyalty_hunt_stops enable row level security;
revoke all on table public.loyalty_hunt_stops from public, anon, authenticated;
grant all on public.loyalty_hunt_stops to service_role;
comment on table public.loyalty_hunt_stops is 'LIVE-942: a Space invited to a hunt; accepted stops count toward completion. The host is an accepted stop from the start. Service role only.';

create table if not exists public.loyalty_hunt_completions (
  hunt_id uuid not null references public.loyalty_hunts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  completed_on date not null,
  created_at timestamptz not null default now(),
  primary key (hunt_id, profile_id)
);
create index if not exists loyalty_hunt_completions_profile_idx on public.loyalty_hunt_completions(profile_id);
create index if not exists loyalty_hunt_completions_reward_idx on public.loyalty_hunt_completions(reward_id) where reward_id is not null;
alter table public.loyalty_hunt_completions enable row level security;
revoke all on table public.loyalty_hunt_completions from public, anon, authenticated;
grant all on public.loyalty_hunt_completions to service_role;
comment on table public.loyalty_hunt_completions is 'LIVE-942: one row per member per hunt, the exactly-once guard on the completion reward. Service role only.';

alter table public.loyalty_rewards add column if not exists hunt_id uuid references public.loyalty_hunts(id) on delete set null;
create index if not exists loyalty_rewards_hunt_idx on public.loyalty_rewards(hunt_id) where hunt_id is not null;

-- The one writer. Called by lib/loyalty/hunts-visit.ts after loyalty_record_visit stamped the day.
create or replace function public.loyalty_hunt_progress(
  _space   uuid,
  _profile uuid,
  _day     date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hunt    public.loyalty_hunts%rowtype;
  v_total   integer;
  v_done    integer;
  v_reward  public.loyalty_rewards%rowtype;
  v_code    text;
  v_out     jsonb := '[]'::jsonb;
  v_earned  boolean;
begin
  -- Same lock loyalty_record_visit holds, so a hunt completion serializes with the stamp that caused it.
  perform pg_advisory_xact_lock(hashtextextended(_space::text || ':' || _profile::text, 0));

  for v_hunt in
    select h.* from public.loyalty_hunts h
    join public.loyalty_hunt_stops st on st.hunt_id = h.id and st.space_id = _space and st.status = 'accepted'
    where h.status = 'live' and _day between h.starts_on and h.ends_on
    order by h.ends_on asc, h.id asc
  loop
    select count(*) into v_total from public.loyalty_hunt_stops where hunt_id = v_hunt.id and status = 'accepted';
    select count(*) into v_done
    from public.loyalty_hunt_stops st
    where st.hunt_id = v_hunt.id and st.status = 'accepted'
      and exists (
        select 1 from public.loyalty_stamps s
        where s.space_id = st.space_id and s.profile_id = _profile and s.kind = 'visit'
          and s.visit_day between v_hunt.starts_on and v_hunt.ends_on
      );
    v_earned := false;
    v_code := null;
    if v_total > 0 and v_done >= v_total
       and not exists (select 1 from public.loyalty_hunt_completions where hunt_id = v_hunt.id and profile_id = _profile) then
      loop
        v_code := upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=01IO', 'ABCDEF'), 1, 6));
        exit when not exists (select 1 from public.loyalty_rewards where space_id = v_hunt.host_space_id and code = v_code);
      end loop;
      insert into public.loyalty_rewards (space_id, profile_id, code, reward_title, reward_value_cents, hunt_id)
      values (v_hunt.host_space_id, _profile, v_code, v_hunt.reward_title, v_hunt.reward_value_cents, v_hunt.id)
      returning * into v_reward;
      insert into public.loyalty_hunt_completions (hunt_id, profile_id, reward_id, completed_on)
      values (v_hunt.id, _profile, v_reward.id, _day)
      on conflict do nothing;
      v_earned := true;
    end if;
    v_out := v_out || jsonb_build_object(
      'hunt_id', v_hunt.id, 'slug', v_hunt.slug, 'title', v_hunt.title,
      'host_space_id', v_hunt.host_space_id,
      'stops_done', v_done, 'stops_total', v_total,
      'completed', v_done >= v_total,
      'earned', v_earned, 'reward_code', v_code, 'reward_title', v_hunt.reward_title);
  end loop;

  return v_out;
end;
$$;

comment on function public.loyalty_hunt_progress(uuid, uuid, date) is
  'LIVE-942 Regulars hunts: after a stamp at a Space, count the member''s stops on every live hunt the Space belongs to, mint the completion reward once when every stop is done. Called by lib/loyalty/hunts-visit.ts through the service-role admin client only.';

revoke execute on function public.loyalty_hunt_progress(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.loyalty_hunt_progress(uuid, uuid, date) to service_role;

insert into public.zap_config (action_type, zaps_amount, daily_cap, description)
values ('hunt_complete', 100, 100, 'Finished a Regulars hunt: checked in at every stop inside the window')
on conflict (action_type) do nothing;

commit;
