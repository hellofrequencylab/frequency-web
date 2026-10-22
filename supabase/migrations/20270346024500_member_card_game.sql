-- MEMBER CARDS x THE GAME (LIVE-1282, ADR-1874). See docs/BUILD-BACKLOG.json for status and
-- docs/LOYALTY.md "Member cards" for the program; this file explains the schema, it does not track
-- the work. Pairs with lib/member-cards/rewards.ts (the payer) and lib/achievements.ts (the
-- 'card_connects' / 'card_swaps' criteria).
--
-- A member card is in-person by definition, so everything it pays is Zaps (docs/NAMING.md).
--   • Card connect: a signed-in member taps another member's card. This is ONE WAY OF MEETING, not a
--     second economy: it writes the same meet_taps row Tap to meet writes (a < b, unique on the pair
--     and the ISO week), marked via = 'card', and pays the same 'meetup_tap' Zaps to both. So a pair
--     that met by code this week cannot be paid again by card, and the three-a-day limit counts both
--     ways together. card_meet() is the card twin of meet_tap(): same advisory lock per pair, same
--     limits, same jsonb reply, no code.
--   • Card swap: someone pressed Swap contacts on a member's card. Pays the OWNER 'card_swap' Zaps,
--     5 a swap and 25 a day (five swaps). A swap can come from a signed-out phone, so it cannot be
--     deduped per person; the daily cap in award_zaps_atomic is the guard.
--   • Three achievements: First Tap (1 card connect), Card Shark (10), Open Door (25 paid swaps).
--     card_connects counts meet_taps rows with via = 'card' on either side; card_swaps counts the
--     member's card_swap ledger rows, so only capped, paid swaps move it (five a day at most).
--
-- Service role only. No money moves.
--
-- Additive and idempotent. ROLLBACK:
--   delete from public.achievements where slug in ('card-first-tap', 'card-shark', 'card-open-door');
--   delete from public.zap_config where action_type = 'card_swap';
--   drop function if exists public.card_meet(uuid, uuid, date);
--   alter table public.meet_taps drop column if exists via;

begin;

alter table public.meet_taps add column if not exists via text not null default 'code';
alter table public.meet_taps drop constraint if exists meet_taps_via_check;
alter table public.meet_taps add constraint meet_taps_via_check check (via in ('code', 'card'));
create index if not exists meet_taps_a_card_idx on public.meet_taps(a_profile_id) where via = 'card';
create index if not exists meet_taps_b_card_idx on public.meet_taps(b_profile_id) where via = 'card';
comment on column public.meet_taps.via is 'LIVE-1282: how the pair met. code = Tap to meet (meet_tap), card = a member card tap (card_meet).';

-- The card writer. Returns jsonb { ok, reason, other_profile_id }, the meet_tap() shape.
--   reason  'self' | 'daily_cap' | 'already_this_week' (null when ok)
create or replace function public.card_meet(
  _tapper uuid,
  _owner  uuid,
  _day    date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a      uuid;
  v_b      uuid;
  v_week   date;
  v_today  integer;
begin
  if _tapper is null or _owner is null or _day is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if _tapper = _owner then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  v_a := least(_tapper, _owner);
  v_b := greatest(_tapper, _owner);
  v_week := date_trunc('week', _day)::date;

  -- The same lock key meet_tap() takes, so a code meet and a card meet of one pair serialize.
  perform pg_advisory_xact_lock(hashtextextended(v_a::text || ':' || v_b::text, 0));

  -- Three meets a day, counted across both ways of meeting, on the tapper's day.
  select count(*) into v_today
  from public.meet_taps
  where met_day = _day and (a_profile_id in (v_a, v_b) or b_profile_id in (v_a, v_b));
  if v_today >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap', 'other_profile_id', _owner);
  end if;

  insert into public.meet_taps (a_profile_id, b_profile_id, week_start, met_day, code_id, via)
  values (v_a, v_b, v_week, _day, null, 'card')
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_this_week', 'other_profile_id', _owner);
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'other_profile_id', _owner);
end;
$$;

comment on function public.card_meet(uuid, uuid, date) is
  'LIVE-1282 member cards: record that the tapper met the card owner, into meet_taps (via card), once per pair per ISO week and three meets a day across Tap to meet and cards, under the meet_tap() pair lock. Called by lib/member-cards/rewards.ts through the service-role admin client only.';

revoke execute on function public.card_meet(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.card_meet(uuid, uuid, date) to service_role;

insert into public.zap_config (action_type, zaps_amount, daily_cap, description)
values ('card_swap', 5, 25, 'Someone swapped contacts with you from your member card (five a day)')
on conflict (action_type) do nothing;

-- The card achievements. category 'social'; zaps_reward is the one-time milestone bonus, paid in Zaps
-- (lib/engagement/currency.ts lists card_connects and card_swaps as real-world criteria).
insert into public.achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, is_secret, sort_order)
values
  ('card-first-tap', 'First Tap',  'Met another member by tapping a member card.',   'users',          'social', 'bronze', '{"type":"card_connects","count":1}',  10, false, 63),
  ('card-shark',     'Card Shark', 'Met 10 members through member card taps.',        'link',           'social', 'silver', '{"type":"card_connects","count":10}', 50, false, 64),
  ('card-open-door', 'Open Door',  'Swapped contacts with 25 people from your card.', 'message-circle', 'social', 'silver', '{"type":"card_swaps","count":25}',    25, false, 65)
on conflict (slug) do nothing;

commit;
