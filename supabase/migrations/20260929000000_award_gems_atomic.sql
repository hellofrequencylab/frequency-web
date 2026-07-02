-- Phase C1: close the awardGems daily-cap race with an atomic RPC.
--
-- lib/gems.ts awardGems counted today's gem_transactions for an action, then inserted — a
-- classic count-then-insert race: N concurrent awards at cap-1 all read the same count and all
-- insert, over-paying past daily_cap. This RPC serializes per (profile, action) with an
-- advisory xact lock (same model as gift_gems_atomic, 20260726000000) so the count + insert are
-- atomic. Day boundary is UTC, matching the prior JS logic.
--
-- Returns jsonb { awarded, capped }. SECURITY DEFINER + pinned search_path; callable only by
-- service_role (awardGems runs behind app-code authz via the admin client).

create or replace function public.award_gems_atomic(
  _profile    uuid,
  _action     text,
  _amount     integer,
  _daily_cap  integer,
  _metadata   jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count     integer;
  v_day_start timestamptz := (date_trunc('day', (now() at time zone 'UTC')) at time zone 'UTC');
begin
  if _amount is null or _amount <= 0 then
    return jsonb_build_object('awarded', false, 'capped', false);
  end if;

  -- Serialize awards for this (profile, action): concurrent calls block here until the holder
  -- commits, so the count below sees their insert and the cap can't be exceeded.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _action, 0));

  if _daily_cap is not null then
    select count(*) into v_count
    from public.gem_transactions
    where profile_id = _profile and action_type = _action and created_at >= v_day_start;

    if v_count >= _daily_cap then
      return jsonb_build_object('awarded', false, 'capped', true);
    end if;
  end if;

  insert into public.gem_transactions (profile_id, action_type, amount, metadata)
  values (_profile, _action, _amount, coalesce(_metadata, '{}'::jsonb));

  return jsonb_build_object('awarded', true, 'capped', false);
end;
$$;

-- Lock to service_role only. Supabase's default privileges grant EXECUTE to anon +
-- authenticated on new public functions, so revoke from those explicitly (not just public).
revoke all on function public.award_gems_atomic(uuid, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.award_gems_atomic(uuid, text, integer, integer, jsonb) to service_role;
