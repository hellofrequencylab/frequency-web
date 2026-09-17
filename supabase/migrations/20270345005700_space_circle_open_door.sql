-- ── THE SPACE CIRCLE'S DOOR: OPEN, AND OUT OF THE DIRECTORY (ADR-1393) ───────────────────────────
--
-- ADR-1391 gave every Space a Space Circle and defaulted its door to `space_paid_members` — the
-- Space's ACTIVE paying members. Measured against production on 2026-09-17, that door admitted
-- ONE PERSON on the whole platform: there is exactly one active `space_memberships` row across all
-- 21 Space Circles. The Space's own team seats and its followers were locked out of the Space's own
-- communications hub, which is the one thing the Space Circle exists to be.
--
-- OWNER RULING, 2026-09-17: *"The Space Circle is designed to be the communications hub for the
-- Circle Community. The space owner can set it to open or closed depending on their model. Let's
-- make all space circles public, but not listed in the directory. Owners can choose to leave it
-- open to anyone who follows the space to comment, or make it membership gated."*
--
-- SO THE DEFAULT IS THE TWO-AXIS SHAPE THE MODEL ALREADY HAD A NAME FOR, and it is not a new
-- mechanism: `canSeeCircle` (lib/circles/visibility.ts) has always said that an UNLISTED OPEN
-- Circle "still resolves by direct link". That is precisely "public, but not listed":
--
--   access   = 'open'  (AXIS 2, the door)      anyone who reaches it may join and post
--   unlisted = true    (AXIS 1, discovery)     absent from /circles, the map, search and the sitemap
--
-- The Space's own Circles tab is NOT discovery and must keep showing it — a Space that cannot reach
-- its own hub from its own profile has no hub. That carve lives in `listPublicSpaceCircles`
-- (lib/circles/store.ts), not here, because it is a read rule rather than a stored fact.
--
-- 🔴 WHY `unlisted` IS WRITTEN EXPLICITLY AND NOT LEFT TO THE COLUMN DEFAULT. `circles.unlisted`
-- DEFAULTS TO FALSE. Every Space Circle in production reads `true` today, so something other than
-- the default put it there, and a row created by this function tomorrow would come out LISTED while
-- the 21 rows created yesterday are not. Two cohorts of Space Circle with opposite discovery
-- behaviour is the kind of drift that is invisible until a Space's private hub turns up in the
-- public directory. Naming the value removes the question.
--
-- That risk is not hypothetical here: `LIVE-373` records that ONE new public Circle appearing in
-- production broke four blocking visual baselines on every open branch. Twenty-one of them arriving
-- at once, unasked, is the same failure at scale.
--
-- REVERSIBILITY. Restore the `'space_paid_members'` literal in `ensure_space_circle` and, if the
-- doors must go back too: `update public.circles set access = 'space_paid_members'
-- where is_space_primary;`. The backfill below is an ordinary column update with no schema change.

-- ── 1. New Space Circles open, and stay out of the directory ─────────────────────────────────────
create or replace function public.ensure_space_circle(p_space_id uuid, p_status group_status)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_space record;
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
begin
  select id into v_existing from public.circles where space_id = p_space_id and is_space_primary;
  if v_existing is not null then
    return v_existing;
  end if;

  select s.id, s.slug, s.type, coalesce(nullif(s.brand_name, ''), s.name) as label, s.owner_profile_id
    into v_space
    from public.spaces s where s.id = p_space_id;
  if v_space.id is null or v_space.type = 'root' then
    return null;
  end if;

  v_base := coalesce(nullif(v_space.slug, ''), 'space') ;
  v_slug := v_base;
  while exists (select 1 from public.circles where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := case when v_n = 2 then v_base || '-circle' else v_base || '-circle-' || v_n end;
  end loop;

  -- access 'open' + unlisted true: reachable and joinable by anyone who has the link, absent from
  -- every discovery surface. Both written explicitly (see the header note on the column default).
  insert into public.circles (name, slug, type, member_cap, member_count, status, host_id, space_id,
                              access, unlisted, is_space_primary)
  values (left(v_space.label, 120), v_slug, 'in-person', 300, 0, p_status, v_space.owner_profile_id, p_space_id,
          'open', true, true)
  returning id into v_id;

  insert into public.circle_profiles (circle_id) values (v_id) on conflict do nothing;

  if v_space.owner_profile_id is not null then
    insert into public.memberships (profile_id, circle_id, status, volunteer_role)
    values (v_space.owner_profile_id, v_id, 'active', 'host')
    on conflict (profile_id, circle_id) do nothing;
  end if;

  return v_id;
end
$$;

comment on function public.ensure_space_circle(uuid, group_status) is
  'Create the Space Circle for a Space that has none (ADR-1391). Open door, unlisted (ADR-1393). Idempotent. Service role and triggers only.';

revoke execute on function public.ensure_space_circle(uuid, group_status) from public, anon, authenticated;

-- ── 2. The 21 that already exist ─────────────────────────────────────────────────────────────────
-- A blanket update, because the ruling is blanket ("make all space circles public"). Nothing is
-- being overridden: every Space Circle in production still carries the ADR-1391 default, because
-- the feature shipped on 2026-09-16 and no owner has opened its settings since.
update public.circles
   set access = 'open', unlisted = true
 where is_space_primary
   and (access is distinct from 'open' or unlisted is distinct from true);

-- ── 3. Turn the twenty that are off ON (owner ruling, 2026-09-17) ────────────────────────────────
--
-- ADR-1391's backfill deliberately created every existing Space's Circle `inactive`, on the owner's
-- ruling that day ("existing Spaces off, new Spaces on"). The owner reversed it on 2026-09-17, in
-- the same pass that opened the doors, and the reversal is the point of the pass: an open door on a
-- room nobody can reach is not a hub. Twenty of the twenty-one were off and had never been switched
-- on by anyone, so nothing an operator chose is being overridden.
--
-- 'active', not 'forming'. `forming` is the lifecycle of a Circle still gathering its first people,
-- and `ensure_space_circle` already creates a NEW Space's Circle 'active'; leaving the backfilled
-- twenty on a different rung would mean two cohorts of Space Circle wearing different status pills
-- for no reason a member could see.
--
-- 🔴 `archived` IS NOT TOUCHED. It is a Space Circle whose Space was wound down, and reviving one
-- here would republish a room its owner closed. Only `inactive` — the value the ADR-1391 backfill
-- wrote and the value the On/Off switch writes — is moved.
--
-- REVERSIBILITY: `update public.circles set status = 'inactive' where is_space_primary;`
update public.circles
   set status = 'active'
 where is_space_primary
   and status = 'inactive';
