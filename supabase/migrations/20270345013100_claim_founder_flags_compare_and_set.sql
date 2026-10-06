-- Claiming the founder rewards from two tabs at once paid the member the Gems twice (SCAN-759).
--
-- THE DEFECT. app/(main)/founder/founder-actions.ts read profiles.meta with no lock, decided from
-- that snapshot which founder tasks were "newly rewarded" and whether the set was "completing",
-- stamped the flags through merge_profile_meta, then paid awardGems. The stamp-first order only
-- protects against a LOST stamp: merge_profile_meta does `meta || patch` under the row lock and
-- never reports whether the key was already set, so N overlapping calls all read rewarded=[]
-- before any stamp lands, each writes the same stamp, each succeeds, and each pays. Nothing
-- downstream catches it: the achievement gem_config has no daily cap, award_gems_atomic inserts
-- with no dedup key, and only the badge insert has a unique constraint. It is a server action
-- anyone can post directly, so two tabs or five parallel posts the moment the tasks complete
-- each paid PER_TASK_GEMS x tasks plus the completion bonus.
--
-- THE FIX. The stamp becomes a compare-and-set. This RPC selects the profile row FOR UPDATE,
-- computes `added` (the tasks the caller reports done MINUS the ones already in
-- meta.founder.rewarded) and `completing` (the caller reports the set complete AND the badge is
-- not yet stamped), writes the union back under that lock, and RETURNS {added, completing}. The
-- caller pays only what the database says it just claimed. Two overlapping calls serialize on the
-- row lock: the second reads the first's stamp and gets added=[] and completing=false, so it pays
-- nothing. A call that adds nothing writes nothing.
--
-- Only the `founder` top-level key is touched, with the same shallow `||` merge as
-- merge_profile_meta, so no other writer's key is clobbered (the row lock makes the read-then-write
-- of that one key safe here, where merge_profile_meta's `meta || patch` cannot be, because the
-- decision depends on the stored value).
--
-- AUTHORIZATION. Service role only, inside the function AND by grant (as award_gems_atomic,
-- 20270345001200): the member's session never calls this, the server action does through the admin
-- client after it has established the caller. Grants are role-explicit and both revokes name the
-- role (ADR-959).
--
-- Additive and idempotent: create or replace, no table change.
--
-- Rollback: drop function if exists public.claim_founder_flags(uuid, text[], boolean);
--           and revert app/(main)/founder/founder-actions.ts to the merge_profile_meta stamp,
--           which re-opens the double pay.

begin;

create or replace function public.claim_founder_flags(
  p_profile_id uuid,
  p_tasks text[],
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_founder jsonb;
  v_rewarded jsonb;
  v_badge boolean;
  v_added text[];
  v_completing boolean;
begin
  if p_profile_id is null then
    raise exception 'claim_founder_flags: profile id is required' using errcode = '22023';
  end if;

  if auth.role() is distinct from 'service_role' then
    raise exception 'claim_founder_flags: service role only' using errcode = '42501';
  end if;

  -- The lock. Every decision below is made against the row as it is NOW, and nobody else can
  -- change it until this transaction ends.
  select coalesce(meta, '{}'::jsonb) into v_meta
    from public.profiles
   where id = p_profile_id
     for update;

  if not found then
    raise exception 'claim_founder_flags: profile not found' using errcode = 'P0002';
  end if;

  v_founder := case when jsonb_typeof(v_meta -> 'founder') = 'object' then v_meta -> 'founder' else '{}'::jsonb end;
  v_rewarded := case when jsonb_typeof(v_founder -> 'rewarded') = 'array' then v_founder -> 'rewarded' else '[]'::jsonb end;
  v_badge := coalesce((v_founder -> 'badge') = 'true'::jsonb, false);

  -- The tasks not yet stamped, in the caller's order, each once.
  select coalesce(array_agg(t order by ord), '{}'::text[]) into v_added
    from (
      select distinct on (t) t, ord
        from unnest(coalesce(p_tasks, '{}'::text[])) with ordinality as u(t, ord)
       where t is not null and t <> '' and not (v_rewarded ? t)
       order by t, ord
    ) s;

  v_completing := coalesce(p_complete, false) and not v_badge;

  if coalesce(array_length(v_added, 1), 0) = 0 and not v_completing then
    return jsonb_build_object('added', '[]'::jsonb, 'completing', false);
  end if;

  v_founder := v_founder || jsonb_build_object(
    'rewarded', v_rewarded || to_jsonb(v_added),
    'badge', v_badge or v_completing
  );

  update public.profiles
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('founder', v_founder)
   where id = p_profile_id;

  return jsonb_build_object('added', to_jsonb(v_added), 'completing', v_completing);
end;
$$;

comment on function public.claim_founder_flags(uuid, text[], boolean) is
  'Compare-and-set for profiles.meta.founder under the row lock: stamps the tasks in p_tasks not yet rewarded (and the badge when p_complete and not yet stamped) and returns {added, completing}, the exact set this call claimed. The caller pays Gems for that set only, so overlapping claims cannot double-pay (SCAN-759). Service role only.';

-- Role-explicit grants (ADR-959). The server action calls this through the admin client only.
revoke all on function public.claim_founder_flags(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.claim_founder_flags(uuid, text[], boolean) to service_role;

commit;
