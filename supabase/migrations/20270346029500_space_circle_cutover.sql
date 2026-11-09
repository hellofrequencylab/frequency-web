-- THE SPACE CIRCLE CUTOVER (ADR-1938, LIVE-2080).
--
-- Owner, 2026-11-03: a Space no longer has a built-in Circle; its Community wall (20270346028800) is
-- the Space's conversation now. This file retires the Space Circles without losing anything in them.
--
-- MEASURED ON PRODUCTION BEFORE WRITING (2026-11-04): 41 Space Circles (all forming or active);
-- 0 posts, 0 replies, 0 reactions in them; 38 roster rows, every one of them already the Space's
-- owner, team, a member or a follower (20270346028800 step 5 made the followers); 119 events placed
-- in a Space Circle (all public and published, none priced among the 22 that name no hosting Space);
-- 7 Royal Temple membership tiers linked to the Temple's Space Circle; 1 topic channel link. Two of the 41
-- are not a Space's conversation at all but a real founding Circle the Menswork program runs (Wildheart's
-- "The founding circle. Host training runs from here", cap 12, with its program channel; Hearts on Fire's
-- "The founding circle. Six to twelve men").
--
-- WHAT THIS FILE DOES (idempotent; a second run changes nothing):
--   0. THE GATE. Counts posts, events and roster rows tied to Space Circles first. If any post is
--      still placed in a Space Circle the file stops: posts move by hand, never silently.
--   1. Stops making new ones: drops spaces_ensure_space_circle (one Circle per new Space) and the two
--      roster triggers (space_memberships_enrol_space_circle, memberships_space_circle_optout).
--   2b. (runs first) Keeps the two founding Circles as ordinary topic Circles: is_space_primary off, the
--      topic cap (circles_cap_check: in-person 50, online 100) applied, everything else untouched. The
--      guard (circles_space_primary_guard) refuses an unmark by design, so it is switched off around that
--      one update and back on in the same transaction.
--   2. Re-keys every event placed in a Space Circle as a Space event, the shape the event builder
--      writes (app/(main)/events/actions.ts): scope_type 'public' + the host's nexus region (else the
--      top region, lib/events/event-drafts.ts resolveRegionScopeId) + space_id / host_space_id. The
--      tenancy and hosting columns are only FILLED when empty, never moved, so no ticket re-routes.
--      sync_event_scope_arc clears scope_circle_id and derives scope_region_id on the re-scope.
--   3. Unlinks membership tiers from a Space Circle (circle_id null). A Space member already reads
--      and posts on the wall (private.can_read_space_wall), so the tier keeps everything it gave.
--   4. Archives every Space Circle (status 'archived'). The row, its slug, its roster and its
--      channel link all stay: the slug is what the app 308s to /spaces/<slug>/community, and
--      archived is outside LISTABLE_CIRCLE_STATUS, so every reader drops it at once.
--      circles_space_primary_guard allows a status change; is_space_primary stays until LIVE-2081.
--   5. Checks the counts again: same roster rows, same events, no post lost.
--
-- WHAT IT DOES NOT DO: drop is_space_primary, ensure_space_circle, enrol_in_space_circle,
-- sync_space_circle_roster or space_circle_optouts (LIVE-2081 retires them with the types).
--
-- Rollback: recreate the three triggers from 20270345005600 and 20270345005800; update circles set
-- status = 'active' where is_space_primary (and is_space_primary = true on the two founding slugs, guard off); the event and tier changes are ordinary column values and
-- may be left (both shapes read correctly).

do $$
declare
  v_ids uuid[];
  v_posts bigint;
  v_events_before bigint;
  v_roster_before bigint;
  v_events_after bigint;
  v_roster_after bigint;
  v_top_region uuid;
begin
  -- ── 0. The gate ─────────────────────────────────────────────────────────────────────────────────
  -- Every Space Circle at the start, so the closing count reads the same rows whatever 2b unmarks.
  select coalesce(array_agg(id), '{}') into v_ids from public.circles where is_space_primary;

  select count(*) into v_posts
    from public.posts p
   where p.scope_id = any(v_ids) or p.scope_circle_id = any(v_ids);
  if v_posts > 0 then
    raise exception 'space_circle_cutover: % post(s) still live in a Space Circle; move them to the wall first', v_posts
      using errcode = 'P0001';
  end if;

  select count(*) into v_events_before from public.events;
  select count(*) into v_roster_before from public.memberships m where m.circle_id = any(v_ids);

  -- ── 2b. The founding Circles stay, as topic Circles ─────────────────────────────────────────────
  alter table public.circles disable trigger circles_space_primary_guard;
  update public.circles
     set is_space_primary = false,
         member_cap = least(member_cap, case when type = 'online' then 100 else 50 end)
   where is_space_primary
     and slug in ('wildheart-primary-circle', 'heart-on-fire');
  alter table public.circles enable trigger circles_space_primary_guard;

  -- ── 2. Events become Space events ───────────────────────────────────────────────────────────────
  select id into v_top_region from public.nexus_regions where parent_id is null order by depth asc, id asc limit 1;

  update public.events e
     set scope_type    = 'public',
         scope_id      = coalesce((select pr.nexus_region_id from public.profiles pr where pr.id = e.host_id), v_top_region),
         space_id      = coalesce(e.space_id, c.space_id),
         host_space_id = coalesce(e.host_space_id, c.space_id)
    from public.circles c
   where c.is_space_primary
     and e.scope_type in ('circle', 'group')
     and e.scope_id = c.id
     and coalesce((select pr.nexus_region_id from public.profiles pr where pr.id = e.host_id), v_top_region) is not null;

  -- An event that only CITES a Space Circle in its typed column (placement elsewhere) lets go of it.
  update public.events e
     set scope_circle_id = null
    from public.circles c
   where c.is_space_primary and e.scope_circle_id = c.id;

  -- ── 3. Tiers let go of the Space Circle ─────────────────────────────────────────────────────────
  update public.space_membership_tiers t
     set circle_id = null
    from public.circles c
   where c.is_space_primary and t.circle_id = c.id;

  -- ── 4. Archive ──────────────────────────────────────────────────────────────────────────────────
  update public.circles set status = 'archived' where is_space_primary and status is distinct from 'archived';

  -- ── 5. Nothing lost ─────────────────────────────────────────────────────────────────────────────
  select count(*) into v_events_after from public.events;
  select count(*) into v_roster_after from public.memberships m where m.circle_id = any(v_ids);
  if v_events_after <> v_events_before or v_roster_after <> v_roster_before then
    raise exception 'space_circle_cutover: counts moved (events % -> %, roster % -> %)',
      v_events_before, v_events_after, v_roster_before, v_roster_after
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.events e join public.circles c on c.id = e.scope_id
              where c.is_space_primary and e.scope_type in ('circle', 'group')) then
    raise exception 'space_circle_cutover: an event is still placed in a Space Circle' using errcode = 'P0001';
  end if;
end $$;

-- ── 1. Stop making Space Circles ──────────────────────────────────────────────────────────────────
drop trigger if exists spaces_ensure_space_circle on public.spaces;
drop trigger if exists space_memberships_enrol_space_circle on public.space_memberships;
drop trigger if exists memberships_space_circle_optout on public.memberships;
