-- Regulars, phase 3: the psychology layer (LIVE-943, ADR-1782). See docs/BUILD-BACKLOG.json for status
-- and docs/LOYALTY.md for the program; this file explains the schema, it does not track the work.
--
-- One column and one rewritten writer:
--   • space_loyalty_programs.surprise_odds: 0 or 10. At 10, one check-in in ten earns a second stamp
--     ("surprise"), the odds printed on the card. Never a wheel; the odds are stated and small.
--   • loyalty_record_visit(): the same writer as LIVE-940 with the surprise roll added after the visit
--     stamp lands, and `visit_days` (the member's visit days at this Space, newest first, 120 days) in
--     the reply so the TypeScript side can read the Regular badge (three visits in a rolling 30 days)
--     and the weekly streak without a second query. Same advisory lock, same reward minting.
--
-- The Regular badge and the streak are COMPUTED from stamps, never stored, so they lapse quietly.
--
-- Additive and idempotent. ROLLBACK:
--   alter table public.space_loyalty_programs drop column if exists surprise_odds;
--   (re-run the LIVE-940 create or replace of loyalty_record_visit to drop the surprise roll)

begin;

alter table public.space_loyalty_programs
  add column if not exists surprise_odds smallint not null default 10 check (surprise_odds in (0, 10));

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
  v_surprise boolean := false;
  v_count    integer;
  v_reward   public.loyalty_rewards%rowtype;
  v_code     text;
  v_days     jsonb;
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

  -- The surprise stamp (LIVE-943): one visit in ten, only on a visit that wrote its stamp, and only
  -- when the owner left the odds on. Stated on the card; never a wheel.
  if v_stamped and coalesce(_kind, 'visit') = 'visit' and v_program.surprise_odds = 10 and random() < 0.1 then
    insert into public.loyalty_stamps (space_id, profile_id, visit_day, kind)
    values (_space, _profile, _day, 'surprise')
    on conflict do nothing;
    v_surprise := found;
  end if;

  select coalesce(jsonb_agg(d order by d desc), '[]'::jsonb) into v_days
  from (
    select distinct visit_day as d from public.loyalty_stamps
    where space_id = _space and profile_id = _profile and kind = 'visit' and visit_day > _day - 120
  ) v;

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
    return jsonb_build_object('stamped', v_stamped, 'surprise', v_surprise, 'stamps', v_count, 'required', v_program.stamps_required,
      'earned', true, 'reward_code', v_reward.code, 'reward_title', v_reward.reward_title, 'visit_days', v_days);
  end if;

  return jsonb_build_object('stamped', v_stamped, 'surprise', v_surprise, 'stamps', v_count, 'required', v_program.stamps_required,
    'earned', false, 'visit_days', v_days);
end;
$$;

comment on function public.loyalty_record_visit(uuid, uuid, date, text) is
  'LIVE-940 / LIVE-943 Regulars: stamp a member''s card at a Space for a local day, roll the stated surprise stamp, mint the reward when the card is full, under one advisory lock per (space, member). Called by lib/loyalty/visit.ts through the service-role admin client only.';

revoke execute on function public.loyalty_record_visit(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.loyalty_record_visit(uuid, uuid, date, text) to service_role;

commit;
