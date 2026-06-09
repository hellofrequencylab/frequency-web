-- =============================================================================
-- Events: enforce `visibility` in RLS (BUILD-LIST P1)
--
-- WHY: 20260609230000_events_p0_capacity_visibility added events.visibility
-- ('public' | 'unlisted' | 'circle_only' | 'private') but the SELECT policy
-- ("events: crew+ read in scope") still only granted scope-membership reads —
-- the column was decorative. Safe while every event is circle_only (the default),
-- but it MUST be enforced before standalone/public events ship, or a future
-- "public" event would stay invisible and a "private" one would leak to its
-- whole circle.
--
-- DESIGN (one SELECT policy, additive disjuncts):
--   • public     → readable by anyone, including anon (discoverable; app decides
--                  what to list, RLS decides what is readable).
--   • unlisted   → readable by anyone WITH THE LINK. RLS-wise that is "readable";
--                  staying out of browse/index listings is app-level filtering
--                  (obscurity is the feature, not access control).
--   • circle_only→ unchanged from the old policy: crew+ within the event's scope
--                  (circle members via get_my_circle_ids(), region via
--                  get_my_region_id()).
--   • private    → the host only. Deliberately NOT "host + RSVPs": an RSVP
--                  subquery here would evaluate event_rsvps RLS inside events
--                  RLS (recursion risk), and invitee reads happen through
--                  server actions on the admin client anyway.
--   • The host always sees their own event regardless of visibility.
--
-- Writes (insert/update/delete policies) are untouched.
-- =============================================================================

drop policy if exists "events: crew+ read in scope" on public.events;
drop policy if exists "events: visibility-aware read" on public.events;

create policy "events: visibility-aware read"
  on public.events for select
  using (
    visibility = 'public'
    or visibility = 'unlisted'
    or host_id = get_my_profile_id()
    or (
      visibility = 'circle_only'
      and get_my_role() >= 'crew'::community_role
      and (
        (scope_type = 'circle' and scope_id = any (get_my_circle_ids()))
        or (scope_type = 'region' and scope_id = get_my_region_id())
      )
    )
  );

comment on policy "events: visibility-aware read" on public.events is
  'public/unlisted readable by anyone (listing exclusion for unlisted is app-level); circle_only stays scope-membership (crew+); private is host-only; hosts always see their own events.';
