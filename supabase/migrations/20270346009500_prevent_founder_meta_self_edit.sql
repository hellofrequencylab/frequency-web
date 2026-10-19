-- A member could wipe profiles.meta.founder and reclaim the first-week Gems (SCAN-845).
--
-- THE DEFECT. claim_founder_flags (20270345013100, SCAN-759) is a compare-and-set under the
-- row lock, so two tabs cannot double-pay. The once-only record still lives in
-- profiles.meta.founder.rewarded and .badge. The "profiles: self update" policy lets a
-- member PATCH their own meta, and prevent_economy_self_edit guards the economy columns,
-- not a jsonb key. merge_profile_meta and remove_profile_meta_keys are granted to
-- authenticated and will replace or drop the founder key. awardGems for action
-- 'achievement' has no daily cap. So: PATCH meta.founder={} (or merge / remove the key),
-- then claimFounderRewards, pays the per-task and completion Gems again.
--
-- THE FIX. A BEFORE UPDATE trigger refuses a change to meta->'founder' unless the caller
-- is service_role. The JWT role is what matters (auth.role()), not current_user: the
-- write paths include SECURITY DEFINER RPCs owned by postgres (merge_profile_meta,
-- remove_profile_meta_keys, claim_founder_flags), and a current_user check would see the
-- owner and exempt every write. claim_founder_flags still stamps: it is called through
-- the admin client. Other meta keys stay member-writable.
--
-- AUTHORIZATION. Trigger function, never an RPC. Grants are role-explicit and both
-- revokes name the role (ADR-959).
--
-- Additive and idempotent: create or replace plus drop/create trigger, no table change.
--
-- Rollback: drop trigger if exists prevent_founder_meta_self_edit on public.profiles;
--           drop function if exists public.prevent_founder_meta_self_edit();

begin;

create or replace function public.prevent_founder_meta_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role'
     and (new.meta -> 'founder') is distinct from (old.meta -> 'founder') then
    raise exception 'founder once-only record cannot be modified by users'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.prevent_founder_meta_self_edit() is
  'BEFORE UPDATE on profiles: refuses a change to meta.founder unless the caller is service_role, so a member cannot wipe the first-week record and reclaim the Gems (SCAN-845). Trigger only; not an RPC.';

drop trigger if exists prevent_founder_meta_self_edit on public.profiles;
create trigger prevent_founder_meta_self_edit
  before update on public.profiles
  for each row
  execute function public.prevent_founder_meta_self_edit();

revoke all on function public.prevent_founder_meta_self_edit() from public, anon, authenticated;
revoke execute on function public.prevent_founder_meta_self_edit() from public, anon, authenticated;

commit;
