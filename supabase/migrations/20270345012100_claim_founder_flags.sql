-- ============================================================================
-- FOUNDER REWARDS ARE CLAIMED UNDER THE ROW LOCK (SCAN-759, 2026-10-05)
-- ============================================================================
--
-- THE GAP. claimFounderRewards read profiles.meta->founder with no lock, decided which tasks
-- were newly rewarded, stamped the flags through merge_profile_meta, and paid. merge_profile_meta
-- only merges under its lock and never reports whether a key was already set, so N overlapping
-- calls all read rewarded = [] first, each stamped the same flags, and each paid.
--
-- THE FUNCTION. One compare-and-set: SELECT ... FOR UPDATE on the profile row, compute the tasks
-- not yet in the stored list and whether the badge is new, write the union back, and return
-- exactly what THIS call added. A concurrent call waits on the lock, then finds nothing to add.
--
-- SECURITY DEFINER, service_role only (the pattern of award_gems_atomic, 20270345001200): the
-- only caller is the server action's admin client, and the function writes profiles.meta.
--
-- Additive, idempotent (create or replace), safe to re-run. Rollback:
--   drop function if exists public.claim_founder_flags(uuid, text[], boolean);

create or replace function public.claim_founder_flags(
  p_profile uuid,
  p_tasks text[],
  p_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
  v_founder jsonb;
  v_rewarded jsonb;
  v_badge boolean;
  v_added text[] := '{}';
  v_task text;
  v_completing boolean := false;
begin
  select coalesce(meta, '{}'::jsonb) into v_meta
  from public.profiles
  where id = p_profile
  for update;
  if not found then
    return jsonb_build_object('added', to_jsonb(v_added), 'completing', false);
  end if;

  v_founder := coalesce(v_meta -> 'founder', '{}'::jsonb);
  v_rewarded := coalesce(v_founder -> 'rewarded', '[]'::jsonb);
  if jsonb_typeof(v_rewarded) <> 'array' then v_rewarded := '[]'::jsonb; end if;
  v_badge := coalesce((v_founder ->> 'badge')::boolean, false);

  foreach v_task in array coalesce(p_tasks, '{}') loop
    if not (v_rewarded ? v_task) then
      v_added := array_append(v_added, v_task);
      v_rewarded := v_rewarded || to_jsonb(v_task);
    end if;
  end loop;

  if p_complete and not v_badge then
    v_completing := true;
    v_badge := true;
  end if;

  if array_length(v_added, 1) is not null or v_completing then
    update public.profiles
    set meta = v_meta || jsonb_build_object(
      'founder', v_founder || jsonb_build_object('rewarded', v_rewarded, 'badge', v_badge)
    )
    where id = p_profile;
  end if;

  return jsonb_build_object('added', to_jsonb(v_added), 'completing', v_completing);
end;
$$;

revoke all on function public.claim_founder_flags(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.claim_founder_flags(uuid, text[], boolean) to service_role;

comment on function public.claim_founder_flags(uuid, text[], boolean) is
  'Compare-and-set the founder first-week flags under the profile row lock; returns {added, completing} for THIS call only (SCAN-759). service_role only.';
