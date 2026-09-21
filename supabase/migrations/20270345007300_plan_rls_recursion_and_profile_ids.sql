-- THE PLAN SPINE HAS NEVER WORKED IN PRODUCTION. Two independent defects, both fixed here.
--
-- Found 2026-09-21 when the owner reported "The Plan could not be saved." on the Royal Temple
-- staff calendar. Measured at the same moment: space_plans held 0 rows, and the production
-- Postgres log carried `infinite recursion detected in policy for relation "space_plans"`
-- 134 times in the preceding 21 hours — roughly every 90 seconds, once per operator calendar
-- load. PROG-CAL2 through PROG-CAL8 are all marked done. None of them has ever run.
--
-- ── DEFECT 1: mutually recursive RLS (SQLSTATE 42P17) ───────────────────────────────────────
-- 20270345006700_space_plans.sql defines, in one file:
--   * space_plan_shares_read  USING ( exists (select 1 from public.space_plans  p where …) )
--   * space_plans_space_read  USING ( … or exists (select 1 from public.space_plan_shares s …) )
-- Reading either table applies the other's SELECT policy, which applies the first again.
-- Postgres detects the cycle at REWRITE time, so it fires no matter what the tables contain:
-- both being empty does not help, and neither does redeploying. The same cycle is in
-- space_plans_space_update and in the shares' own insert/update/delete policies.
--
-- It reaches the owner as a save failure rather than a read failure because
-- lib/calendar/plans-store.ts insert()s `.select(PLAN_COLS)`, and that RETURNING applies the
-- poisoned SELECT policy. The INSERT's WITH CHECK would have passed. The row is never written.
--
-- THE FIX: hoist each cross-table lookup into a SECURITY DEFINER helper in `private`. A definer
-- function reads with RLS bypassed, so the cycle is cut at exactly one point per direction while
-- every access rule is preserved verbatim. This is the same shape as private.can_write_space_content,
-- which the policies here already call for the host arm.
--
-- ── DEFECT 2: auth.uid() written into profiles FK columns ───────────────────────────────────
-- 20270345007000_create_penciled_plan.sql writes auth.uid() into space_plans.owner_profile_id,
-- space_plans.created_by and space_calendar_entries.created_by. All three reference
-- public.profiles(id), and in this database profiles.id is NEVER the auth user id — measured
-- 2026-09-21: 0 of 58 rows have id = auth_user_id. Every call was a guaranteed FK violation.
-- So even with defect 1 fixed, "Pencil in a date" would still fail 100% of the time.
-- private.get_my_profile_id() is the canonical translation and is used everywhere else.
--
-- These two are fixed together on purpose: fixing either alone leaves the feature still dead,
-- and shipping a "fix" that does not make the button work is how this got closed the first time.
--
-- House style: additive + idempotent. Rollback: restore the policy bodies from
-- 20270345006700 and the function body from 20270345007000.

-- ── Helpers that break the cycle ────────────────────────────────────────────────────────────

-- Reads space_plan_shares with RLS bypassed, so space_plans' policy never re-enters it.
-- The access rule is unchanged: an ACCEPTED share, and the caller may write the guest Space.
create or replace function private.plan_is_shared_with_me(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.space_plan_shares s
    where s.plan_id = p_plan_id
      and s.status = 'accepted'
      and private.can_write_space_content(s.guest_space_id)
  );
$$;

comment on function private.plan_is_shared_with_me(uuid) is
  'SECURITY DEFINER so space_plans RLS can ask about shares without re-entering space_plans RLS '
  '(the 42P17 cycle fixed 2026-09-21). Same rule as the inline subquery it replaces: an accepted '
  'share to a Space the caller may write.';

-- The other direction: the shares policies need "may the caller write this Plan's host Space"
-- without re-entering space_plans' policy.
--
-- 🔴 IT RETURNS A BOOLEAN, NOT THE SPACE ID, and that is a security choice rather than a style
-- one. A definer function that returned the id would hand any authenticated caller the owning
-- Space of any Plan UUID, with RLS bypassed — a small leak, but a real one, and granted to
-- everyone. A boolean answers only the question the policy actually asks, about the caller's
-- own permission. It also removes a null hazard for free: can_write_space_content() returns
-- TRUE for platform staff when handed NULL (its documented first branch), so a missing Plan fed
-- through an id-returning helper would have silently widened these policies to "any janitor".
-- Here a missing Plan makes the EXISTS false, which is the refusal we want.
create or replace function private.can_write_plan_host(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select exists (
    select 1
    from public.space_plans p
    where p.id = p_plan_id
      and private.can_write_space_content(p.space_id)
  );
$$;

comment on function private.can_write_plan_host(uuid) is
  'SECURITY DEFINER: may the caller write the host Space of this Plan? Lets space_plan_shares RLS '
  'ask without re-entering space_plans RLS (the 42P17 cycle fixed 2026-09-21). Returns a boolean '
  'rather than the Space id so it leaks nothing beyond the caller''s own permission, and so a '
  'missing Plan is a refusal instead of can_write_space_content(null), which is true for staff.';

revoke all on function private.plan_is_shared_with_me(uuid) from public, anon;
revoke all on function private.can_write_plan_host(uuid) from public, anon;
grant execute on function private.plan_is_shared_with_me(uuid) to authenticated;
grant execute on function private.can_write_plan_host(uuid) to authenticated;

-- ── space_plans: same rules, no cycle ───────────────────────────────────────────────────────

drop policy if exists space_plans_space_read on public.space_plans;
create policy space_plans_space_read on public.space_plans
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
    or private.plan_is_shared_with_me(id)
  );

drop policy if exists space_plans_space_update on public.space_plans;
create policy space_plans_space_update on public.space_plans
  for update
  using (
    private.can_write_space_content(space_id)
    or private.plan_is_shared_with_me(id)
  )
  with check (
    private.can_write_space_content(space_id)
    or private.plan_is_shared_with_me(id)
  );

-- ── space_plan_shares: same rules, no cycle ─────────────────────────────────────────────────
--
-- The host arm is can_write_plan_host(), whose EXISTS makes a missing Plan a refusal. See its
-- comment above for why it is a boolean and not an id.

drop policy if exists space_plan_shares_read on public.space_plan_shares;
create policy space_plan_shares_read on public.space_plan_shares
  for select using (
    private.can_write_plan_host(plan_id)
    or private.can_write_space_content(guest_space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plan_shares_insert on public.space_plan_shares;
create policy space_plan_shares_insert on public.space_plan_shares
  for insert with check (
    private.can_write_plan_host(plan_id)
  );

drop policy if exists space_plan_shares_update on public.space_plan_shares;
create policy space_plan_shares_update on public.space_plan_shares
  for update
  using (
    private.can_write_plan_host(plan_id)
    or private.can_write_space_content(guest_space_id)
  )
  with check (
    private.can_write_plan_host(plan_id)
    or private.can_write_space_content(guest_space_id)
  );

drop policy if exists space_plan_shares_delete on public.space_plan_shares;
create policy space_plan_shares_delete on public.space_plan_shares
  for delete using (
    private.can_write_plan_host(plan_id)
  );

-- ── create_penciled_plan: write profile ids, not auth user ids ──────────────────────────────

create or replace function public.create_penciled_plan(
  p_space_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text
)
returns table (plan_id uuid, entry_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_profile_id uuid := private.get_my_profile_id();
  v_plan_id uuid;
  v_entry_id uuid;
begin
  if v_title = '' or char_length(v_title) > 200 then
    raise exception 'invalid pencil title';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid pencil date';
  end if;
  if btrim(coalesce(p_time_zone, '')) = '' then
    raise exception 'invalid pencil time zone';
  end if;
  -- Refuse rather than write a null author. The columns are nullable (on delete set null keeps
  -- a Plan whose author left), but a CALLER with no profile is a broken session, not an
  -- anonymous one, and silently recording nobody would lose who penciled the date.
  if v_profile_id is null then
    raise exception 'no profile for the current user';
  end if;

  insert into public.space_plans (
    space_id, title, stage, target_kind, owner_profile_id, created_by
  )
  values (
    p_space_id, v_title, 'pencil', 'event', v_profile_id, v_profile_id
  )
  returning id into v_plan_id;

  insert into public.space_calendar_entries (
    space_id, kind, title, all_day, starts_at, ends_at, time_zone,
    status, blocks_time, visibility, stage, plan_id, created_by
  )
  values (
    p_space_id, 'pencil', v_title, true, p_starts_at, p_ends_at, p_time_zone,
    'tentative', false, 'team', 'pencil', v_plan_id, v_profile_id
  )
  returning id into v_entry_id;

  return query select v_plan_id, v_entry_id;
end;
$$;

revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from public;
revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from anon;
revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from authenticated;
grant execute on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) to authenticated;
