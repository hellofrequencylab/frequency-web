-- Tap to meet: two members who meet in person each earn Zaps for it (LIVE-946).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md section 6 for the program; this file
-- explains the schema, it does not track the work.
--
-- A web page cannot read or emit NFC on iOS, so true phone-to-phone NFC waits for the iOS app. The web
-- version: one member shows a 60-second code (a QR of /meet/<code>, or the same link on a sticker tag),
-- the other opens it signed in, and both are paid meetup_tap Zaps. The code never leaves the screen,
-- so both members are present.
--   • meet_codes: a code a member minted, with its expiry. A new one every minute; old ones stay as the
--     audit trail of who met whom through which code.
--   • meet_taps: one row per pair per week (a < b ordered, unique on the pair and the week start), so a
--     pair can earn once a week and a member three times a day (either side counts).
--   • meet_tap(): the one writer. Validates the code, refuses self, applies the two limits under one
--     advisory lock per pair, and returns who was met. The TypeScript side pays both members through
--     awardZapsForAction so the daily cap binds in award_zaps_atomic too.
--   • zap_config 'meetup_tap': 15 Zaps a meet, 45 a day.
--
-- Service role only on both tables. No money moves. No existing table changes.
--
-- Additive and idempotent. ROLLBACK:
--   drop function if exists public.meet_tap(text, uuid, date);
--   drop table if exists public.meet_taps;
--   drop table if exists public.meet_codes;
--   delete from public.zap_config where action_type = 'meetup_tap';

begin;

create table if not exists public.meet_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null check (code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index if not exists meet_codes_code_idx on public.meet_codes(code);
create index if not exists meet_codes_profile_idx on public.meet_codes(profile_id, created_at);
alter table public.meet_codes enable row level security;
revoke all on table public.meet_codes from public, anon, authenticated;
grant all on public.meet_codes to service_role;
comment on table public.meet_codes is 'LIVE-946 Tap to meet: a 60-second code one member shows another. Service role only; lib/meet writes it for the signed-in member.';

create table if not exists public.meet_taps (
  id uuid primary key default gen_random_uuid(),
  a_profile_id uuid not null references public.profiles(id) on delete cascade,
  b_profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  met_day date not null,
  code_id uuid references public.meet_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  check (a_profile_id < b_profile_id)
);
create unique index if not exists meet_taps_pair_week_idx on public.meet_taps(a_profile_id, b_profile_id, week_start);
create index if not exists meet_taps_a_day_idx on public.meet_taps(a_profile_id, met_day);
create index if not exists meet_taps_b_day_idx on public.meet_taps(b_profile_id, met_day);
create index if not exists meet_taps_code_id_idx on public.meet_taps(code_id) where code_id is not null;
alter table public.meet_taps enable row level security;
revoke all on table public.meet_taps from public, anon, authenticated;
grant all on public.meet_taps to service_role;
comment on table public.meet_taps is 'LIVE-946 Tap to meet: one row per pair per week, a < b. Written by meet_tap() only. Service role only.';

-- The one writer. Returns jsonb { ok, reason, other_profile_id }.
--   reason  'unknown' | 'expired' | 'self' | 'daily_cap' | 'already_this_week' (null when ok)
create or replace function public.meet_tap(
  _code    text,
  _profile uuid,
  _day     date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code   public.meet_codes%rowtype;
  v_a      uuid;
  v_b      uuid;
  v_week   date;
  v_today  integer;
begin
  select * into v_code from public.meet_codes where code = upper(coalesce(_code, ''));
  if v_code.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code.profile_id = _profile then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  v_a := least(v_code.profile_id, _profile);
  v_b := greatest(v_code.profile_id, _profile);
  v_week := date_trunc('week', _day)::date;

  -- One pair at a time: two taps on the same code at the same moment serialize here.
  perform pg_advisory_xact_lock(hashtextextended(v_a::text || ':' || v_b::text, 0));

  -- Three meets a day for either member, counted on the tapper's local day.
  select count(*) into v_today
  from public.meet_taps
  where met_day = _day and (a_profile_id in (v_a, v_b) or b_profile_id in (v_a, v_b));
  if v_today >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;

  insert into public.meet_taps (a_profile_id, b_profile_id, week_start, met_day, code_id)
  values (v_a, v_b, v_week, _day, v_code.id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_this_week', 'other_profile_id', v_code.profile_id);
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'other_profile_id', v_code.profile_id);
end;
$$;

comment on function public.meet_tap(text, uuid, date) is
  'LIVE-946 Tap to meet: record that the tapper met the member who minted the code, once per pair per week and three a day, under one advisory lock per pair. Called by lib/meet/store.ts through the service-role admin client only.';

revoke execute on function public.meet_tap(text, uuid, date) from public, anon, authenticated;
grant execute on function public.meet_tap(text, uuid, date) to service_role;

insert into public.zap_config (action_type, zaps_amount, daily_cap, description)
values ('meetup_tap', 15, 45, 'Met another member in person through Tap to meet (once per pair a week, three a day)')
on conflict (action_type) do nothing;

commit;
