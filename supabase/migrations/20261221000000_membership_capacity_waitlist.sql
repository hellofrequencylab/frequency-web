-- MEMBERSHIP CAPACITY + WAITLIST (ADR-824). The owner directive: tiers need editable event
-- access, rewards, and a WAITLIST. This migration carries the waitlist half:
--
--   space_membership_tiers.capacity  — max ACTIVE members for the tier; NULL = unlimited.
--   space_membership_tiers.waitlist  — when true, a FULL tier takes waitlist joins instead of
--                                      closing (join records status 'waitlist'; the owner
--                                      promotes from the members console as spots open).
--   space_memberships.status         — gains 'waitlist' (active | waitlist | cancelled).
--
-- The one-ACTIVE partial unique index widens to one OPEN row (active OR waitlist) per
-- (space_id, member_profile_id): a member can't hold a membership and a waitlist spot at once,
-- can't double-waitlist, and a promotion (waitlist -> active) never conflicts because it flips
-- the same single open row. Cancelled rows stay excluded, so leaving and re-joining works.
--
-- Event access + rewards (benefits) need no schema: benefits already live on the tier, and event
-- access is the ADR-823 gate on event_ticket_types, now managed from the membership settings too.

alter table public.space_membership_tiers
  add column if not exists capacity integer check (capacity is null or capacity >= 0),
  add column if not exists waitlist boolean not null default false;

comment on column public.space_membership_tiers.capacity is
  'ADR-824: max ACTIVE members for this tier; NULL = unlimited. Enforced in joinTier (server) with the one-open index as the race guard.';
comment on column public.space_membership_tiers.waitlist is
  'ADR-824: when true, joining a FULL tier records a waitlist membership instead of refusing; the owner promotes as spots open.';

alter table public.space_memberships drop constraint if exists space_memberships_status_check;
alter table public.space_memberships
  add constraint space_memberships_status_check check (status in ('active', 'waitlist', 'cancelled'));

comment on column public.space_memberships.status is
  'active = the membership is live; waitlist = waiting on a spot (ADR-824); cancelled = ended (row retained for history, does not block re-joining).';

-- ONE-OPEN GUARD (replaces the one-ACTIVE guard): at most one active-or-waitlist row per
-- (space_id, member_profile_id). Safe replacement: the new index is strictly wider, and existing
-- rows are all 'active'/'cancelled', so it cannot fail to build on live data.
create unique index if not exists space_memberships_one_open_per_member
  on public.space_memberships (space_id, member_profile_id)
  where status in ('active', 'waitlist');
drop index if exists public.space_memberships_one_active_per_member;
