-- MEMBERSHIP-LINKED TICKET ACCESS (ADR-823). A Collective can sell a membership to its Space
-- (space_membership_tiers / space_memberships) that includes access to its events: a ticket tier
-- can now be restricted to ACTIVE members of the event's hosting Space (events.host_space_id,
-- ADR-819), optionally to one specific membership tier.
--
--   space_members_only  — when true, only a buyer with an ACTIVE space_memberships row in the
--                         event's hosting Space may buy/claim this tier (enforced server-side in
--                         createTicketCheckout; UI shows a lock + a join pointer).
--   space_tier_id       — narrows the gate to ONE membership tier (e.g. "Studio Members" get the
--                         included weekly-event ticket; "Community" does not). NULL = any active
--                         membership qualifies. ON DELETE SET NULL: the membership-tier editor is
--                         replace-set (delete + reinsert, lib/spaces/memberships.ts), so a removed
--                         tier degrades this gate to "any active member" instead of orphaning a
--                         dangling id or blocking sales outright (fail-open to the WIDER members
--                         gate, never to the public).
--
-- Distinct from the existing member_only column, which gates on the PLATFORM membership
-- (profiles.membership_tier, Crew+). Both may be set; both are enforced.

alter table public.event_ticket_types
  add column if not exists space_members_only boolean not null default false,
  add column if not exists space_tier_id uuid references public.space_membership_tiers(id) on delete set null;

comment on column public.event_ticket_types.space_members_only is
  'ADR-823: only active members of the event''s hosting Space (space_memberships) may buy this tier.';
comment on column public.event_ticket_types.space_tier_id is
  'ADR-823: narrows space_members_only to one space_membership_tiers row; NULL = any active membership.';

-- The FK is queried on delete (set null scan) and never filtered on hot paths; a partial index
-- keeps the lookup cheap without taxing the common (NULL) case.
create index if not exists event_ticket_types_space_tier_id_idx
  on public.event_ticket_types (space_tier_id)
  where space_tier_id is not null;
