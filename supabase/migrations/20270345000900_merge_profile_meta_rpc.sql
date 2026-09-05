-- profiles.meta gets one write primitive: a server-side key merge (scan two L6-09 and L5-06).
--
-- THE DEFECT. `profiles.meta` is one jsonb column that many writers rewrote WHOLE from a stale
-- read: `select meta`, spread it, set one key, `update profiles set meta = <the whole blob>`. No
-- version check, no jsonb_set. Two writers interleaving for one member (the daily check-in on app
-- load and recordPracticeStreak on a practice log, in the same second) meant the second write
-- carried the first writer's key as it was BEFORE the first write, and that key was silently lost:
-- a practice-streak day reverted while `current_streak` stayed bumped, a walkthrough stamp gone, a
-- check-in date gone (and the Gem paid again on the next load).
--
-- THE FIX. Writers no longer send the blob. They send ONLY the key(s) they own and the database
-- merges them under the row lock: `meta = coalesce(meta, '{}') || p_patch`. Two concurrent merges
-- of different keys both survive, because each UPDATE reads the row as the other left it.
--
-- THIS IS A SHALLOW, TOP-LEVEL MERGE. `||` replaces a nested object at its top-level key; it does
-- not recurse. That is what every writer needs, because each writer owns its own top-level key
-- (practiceStreak, walkthroughs, daily_checkin_date, progressStage, amplitudeLevelSeen,
-- lastSeenJourneyCompletionId, leaderboardOptOut, chores, founder, onboarding, tour, entityGrid,
-- acquisition, persona, personas, beta, headerFocal, avatarFocal, headerOverlayStyle,
-- headerOverlayColor, spotlight). A writer that patches INSIDE another writer's key is a bug in the
-- writer, not a reason to deepen this merge: it would re-open the lost-update this closes, one level
-- down. The one key several writers share is `spotlight` (owner publish, owner theme, owner
-- background, janitor toggle and reset); they read the sub-object and replace it whole, so an
-- owner and a janitor writing it in the same second can still race INSIDE that key. Named as a
-- residual in the lane report rather than papered over here.
--
-- AUTHORIZATION, inside the function, because SECURITY DEFINER bypasses RLS and the grant is the
-- only other lock: the caller must be the service role (the admin client, which today performs
-- most of these writes) or the signed-in owner of the profile (auth.uid() equals the profile's
-- auth_user_id: the settings, tour and induction writers run under the member's session). Anyone
-- else is refused with 42501. The optional p_columns argument carries the two top-level mirror
-- columns the streak writers set in the same statement (current_streak, longest_streak) and NOTHING
-- else: it is an allowlist, not a generic column writer, so this RPC can never become a way to set
-- an economy or cosmetic column (those stay behind prevent_economy_self_edit and the service role).
--
-- `remove_profile_meta_keys` is the sibling for the three settings writers that DELETE a key when
-- the value is the default (header focus, avatar focus, header overlay). `||` cannot delete; `-`
-- can.
--
-- Additive and idempotent: create or replace, no table change. Grants are role-explicit and both
-- revokes name the role (ADR-959): `revoke ... from public` leaves the per-role grants Supabase's
-- ALTER DEFAULT PRIVILEGES creates, and `revoke ... from anon` leaves the PUBLIC pseudo-role grant.
--
-- Rollback: drop function if exists public.merge_profile_meta(uuid, jsonb, jsonb);
--           drop function if exists public.remove_profile_meta_keys(uuid, text[]);
--           and revert lib/profiles/meta.ts plus its callers to the read-modify-write they replaced.
--           Doing only the first half leaves every meta writer failing loudly rather than clobbering,
--           which is the safer of the two broken states.

begin;

create or replace function public.merge_profile_meta(
  p_profile_id uuid,
  p_patch jsonb,
  p_columns jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_bad_column text;
  v_columns jsonb := case when p_columns is null or jsonb_typeof(p_columns) = 'null' then null else p_columns end;
begin
  if p_profile_id is null then
    raise exception 'merge_profile_meta: profile id is required' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_profile_meta: patch must be a JSON object' using errcode = '22023';
  end if;

  -- The service role (admin client) may write any profile. A signed-in member may write only the
  -- profile whose auth_user_id is their own auth.uid(). auth.uid() cannot be forged by the caller.
  if auth.role() is distinct from 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.auth_user_id = auth.uid()
    ) then
      raise exception 'merge_profile_meta: not your profile' using errcode = '42501';
    end if;
  end if;

  if v_columns is not null then
    if jsonb_typeof(v_columns) <> 'object' then
      raise exception 'merge_profile_meta: columns must be a JSON object' using errcode = '22023';
    end if;
    select k into v_bad_column
      from jsonb_object_keys(v_columns) as k
     where k not in ('current_streak', 'longest_streak')
     limit 1;
    if v_bad_column is not null then
      raise exception 'merge_profile_meta: column not allowed: %', v_bad_column using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set meta = coalesce(meta, '{}'::jsonb) || p_patch,
         current_streak = case
           when v_columns ? 'current_streak' then (v_columns ->> 'current_streak')::integer
           else current_streak end,
         longest_streak = case
           when v_columns ? 'longest_streak' then (v_columns ->> 'longest_streak')::integer
           else longest_streak end
   where id = p_profile_id
   returning meta into v_meta;

  if not found then
    raise exception 'merge_profile_meta: profile not found' using errcode = 'P0002';
  end if;

  return v_meta;
end;
$$;

comment on function public.merge_profile_meta(uuid, jsonb, jsonb) is
  'Shallow top-level merge of p_patch into profiles.meta under the row lock, returning the merged meta. Each writer sends only the key it owns (lib/profiles/meta.ts). Caller must be the service role or the profile''s own auth user. p_columns may carry current_streak and longest_streak only.';

create or replace function public.remove_profile_meta_keys(
  p_profile_id uuid,
  p_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
begin
  if p_profile_id is null then
    raise exception 'remove_profile_meta_keys: profile id is required' using errcode = '22023';
  end if;
  if p_keys is null or array_length(p_keys, 1) is null then
    raise exception 'remove_profile_meta_keys: at least one key is required' using errcode = '22023';
  end if;

  if auth.role() is distinct from 'service_role' then
    if auth.uid() is null or not exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.auth_user_id = auth.uid()
    ) then
      raise exception 'remove_profile_meta_keys: not your profile' using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set meta = coalesce(meta, '{}'::jsonb) - p_keys
   where id = p_profile_id
   returning meta into v_meta;

  if not found then
    raise exception 'remove_profile_meta_keys: profile not found' using errcode = 'P0002';
  end if;

  return v_meta;
end;
$$;

comment on function public.remove_profile_meta_keys(uuid, text[]) is
  'Removes top-level keys from profiles.meta under the row lock, returning the result. The delete half of merge_profile_meta, for writers that drop a key at its default. Same authorization.';

-- Role-explicit grants (ADR-959). Signed-in members call both through the session client for
-- their own row (the function checks), the admin client calls them as service_role. anon never.
revoke all on function public.merge_profile_meta(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.merge_profile_meta(uuid, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.remove_profile_meta_keys(uuid, text[]) from public, anon, authenticated;
grant execute on function public.remove_profile_meta_keys(uuid, text[]) to authenticated, service_role;

commit;
