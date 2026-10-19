-- Regulars: a Space with a physical location runs a stamp card on its door check-in (LIVE-940, ADR-1780).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md for the program; this file explains the
-- schema, it does not track the work.
--
-- A check-in at the Space's signed code (nodes.kind='checkin') already lands once per member per
-- local day in engagement_events and captures (lib/engagement/capture.ts, LIVE-654). This migration
-- adds what a loyalty program needs on top of that tap and nothing else:
--   • space_loyalty_programs: one row per Space. The owner names the reward, prices it, picks how many
--     stamps fill the card and how many welcome stamps a new card starts with.
--   • loyalty_stamps: one row per member per Space per local day per kind. The unique index is the
--     second guard behind the engagement ledger, so a retry can never stamp twice.
--   • loyalty_rewards: an earned reward with its counter code and a snapshot of the title and value,
--     so a later price change never rewrites a reward already earned.
--   • loyalty_record_visit(): the one writer. It stamps, counts the open card, mints a reward when the
--     card is full and returns the card state, all under one advisory lock per (space, member), so two
--     taps at the same moment earn one reward (the SCAN-841 lesson, not repeated).
--   • zap_config 'space_checkin': 25 Zaps a visit, 75 a day. The TypeScript side pays it through
--     awardZapsForAction, so the cap binds in award_zaps_atomic.
--
-- Service role only on every table (the server actions do their own checks, like collective_partners).
-- No money moves. No existing table changes.
--
-- Additive and idempotent. ROLLBACK:
--   drop function if exists public.loyalty_record_visit(uuid, uuid, date, text);
--   drop table if exists public.loyalty_rewards;
--   drop table if exists public.loyalty_stamps;
--   drop table if exists public.space_loyalty_programs;
--   delete from public.zap_config where action_type = 'space_checkin';

begin;

create table if not exists public.space_loyalty_programs (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  status text not null default 'off' check (status in ('off','on')),
  stamps_required smallint not null default 6 check (stamps_required between 3 and 12),
  welcome_stamps smallint not null default 1 check (welcome_stamps between 0 and 2),
  reward_title text not null default '' check (char_length(reward_title) <= 80),
  reward_value_cents integer not null default 0 check (reward_value_cents between 0 and 100000),
  reward_note text check (reward_note is null or char_length(reward_note) <= 280),
  geofence boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'off' or char_length(btrim(reward_title)) > 0)
);
create index if not exists space_loyalty_programs_updated_by_idx on public.space_loyalty_programs(updated_by) where updated_by is not null;
alter table public.space_loyalty_programs enable row level security;
revoke all on table public.space_loyalty_programs from public, anon, authenticated;
grant all on public.space_loyalty_programs to service_role;
comment on table public.space_loyalty_programs is 'LIVE-940 Regulars: one stamp-card program per Space. Service role only; lib/loyalty writes it after the owner gate.';

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visit_day date not null,
  kind text not null default 'visit' check (kind in ('visit','welcome','surprise','hunt')),
  reward_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists loyalty_stamps_once_idx on public.loyalty_stamps(space_id, profile_id, visit_day, kind);
create index if not exists loyalty_stamps_card_idx on public.loyalty_stamps(space_id, profile_id, reward_id, created_at);
create index if not exists loyalty_stamps_profile_idx on public.loyalty_stamps(profile_id);
create index if not exists loyalty_stamps_reward_id_idx on public.loyalty_stamps(reward_id) where reward_id is not null;
alter table public.loyalty_stamps enable row level security;
revoke all on table public.loyalty_stamps from public, anon, authenticated;
grant all on public.loyalty_stamps to service_role;
comment on table public.loyalty_stamps is 'LIVE-940 Regulars: one stamp per member per Space per local day per kind. reward_id is set when the stamp was spent on a full card. Service role only.';

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  reward_title text not null,
  reward_value_cents integer not null default 0,
  earned_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists loyalty_rewards_code_idx on public.loyalty_rewards(space_id, code);
create index if not exists loyalty_rewards_space_open_idx on public.loyalty_rewards(space_id, earned_at) where redeemed_at is null;
create index if not exists loyalty_rewards_profile_idx on public.loyalty_rewards(profile_id, earned_at);
create index if not exists loyalty_rewards_redeemed_by_idx on public.loyalty_rewards(redeemed_by) where redeemed_by is not null;
alter table public.loyalty_rewards enable row level security;
revoke all on table public.loyalty_rewards from public, anon, authenticated;
grant all on public.loyalty_rewards to service_role;
comment on table public.loyalty_rewards is 'LIVE-940 Regulars: a reward earned by a full card, shown to the member as a six-character code and handed out by the owner. Title and value are a snapshot. Service role only.';

alter table public.loyalty_stamps
  drop constraint if exists loyalty_stamps_reward_id_fkey;
alter table public.loyalty_stamps
  add constraint loyalty_stamps_reward_id_fkey foreign key (reward_id) references public.loyalty_rewards(id) on delete set null;

-- The one writer. Returns jsonb { stamped, stamps, required, earned, reward_code, reward_title }.
--   stamped      whether this call added a visit stamp (false on a same-day retry)
--   stamps       stamps on the OPEN card after this call (0..required-1 once a reward was minted)
--   earned       whether this call filled the card and minted a reward
create or replace function public.loyalty_record_visit(
  _space   uuid,
  _profile uuid,
  _day     date,
  _kind    text default 'visit'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program  public.space_loyalty_programs%rowtype;
  v_stamped  boolean := false;
  v_count    integer;
  v_reward   public.loyalty_rewards%rowtype;
  v_code     text;
begin
  select * into v_program from public.space_loyalty_programs where space_id = _space;
  if v_program.space_id is null or v_program.status <> 'on' then
    return jsonb_build_object('stamped', false, 'stamps', 0, 'required', 0, 'earned', false);
  end if;

  -- One card at a time per (space, member): two taps at the same moment serialize here.
  perform pg_advisory_xact_lock(hashtextextended(_space::text || ':' || _profile::text, 0));

  -- A first card starts with the welcome stamps, dated the day before so they never collide with
  -- the visit stamp of the same day.
  if v_program.welcome_stamps > 0
     and not exists (select 1 from public.loyalty_stamps where space_id = _space and profile_id = _profile) then
    insert into public.loyalty_stamps (space_id, profile_id, visit_day, kind)
    select _space, _profile, _day - 1, 'welcome'
    on conflict do nothing;
    if v_program.welcome_stamps = 2 then
      insert into public.loyalty_stamps (space_id, profile_id, visit_day, kind)
      values (_space, _profile, _day - 2, 'welcome')
      on conflict do nothing;
    end if;
  end if;

  insert into public.loyalty_stamps (space_id, profile_id, visit_day, kind)
  values (_space, _profile, _day, coalesce(_kind, 'visit'))
  on conflict do nothing;
  v_stamped := found;

  select count(*) into v_count
  from public.loyalty_stamps
  where space_id = _space and profile_id = _profile and reward_id is null;

  if v_count >= v_program.stamps_required then
    -- Six characters from an unambiguous alphabet; retry on the rare collision within the Space.
    loop
      v_code := upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=01IO', 'ABCDEF'), 1, 6));
      exit when not exists (select 1 from public.loyalty_rewards where space_id = _space and code = v_code);
    end loop;
    insert into public.loyalty_rewards (space_id, profile_id, code, reward_title, reward_value_cents)
    values (_space, _profile, v_code, v_program.reward_title, v_program.reward_value_cents)
    returning * into v_reward;
    -- Spend the oldest stamps_required open stamps on this reward; any extra stays on the next card.
    update public.loyalty_stamps s set reward_id = v_reward.id
    where s.id in (
      select id from public.loyalty_stamps
      where space_id = _space and profile_id = _profile and reward_id is null
      order by created_at asc, id asc
      limit v_program.stamps_required
    );
    v_count := v_count - v_program.stamps_required;
    return jsonb_build_object('stamped', v_stamped, 'stamps', v_count, 'required', v_program.stamps_required,
      'earned', true, 'reward_code', v_reward.code, 'reward_title', v_reward.reward_title);
  end if;

  return jsonb_build_object('stamped', v_stamped, 'stamps', v_count, 'required', v_program.stamps_required, 'earned', false);
end;
$$;

comment on function public.loyalty_record_visit(uuid, uuid, date, text) is
  'LIVE-940 Regulars: stamp a member''s card at a Space for a local day, mint the reward when the card is full, under one advisory lock per (space, member). Called by lib/loyalty/visit.ts through the service-role admin client only.';

revoke execute on function public.loyalty_record_visit(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.loyalty_record_visit(uuid, uuid, date, text) to service_role;

insert into public.zap_config (action_type, zaps_amount, daily_cap, description)
values ('space_checkin', 25, 75, 'Checked in at a Space running Regulars (one a day per Space, three Spaces a day)')
on conflict (action_type) do nothing;

commit;
