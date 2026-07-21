-- Collaborator spaces (ADR-799 §B / docs/SPACE-COLLABORATION-AND-SEATS.md §B). A space can host
-- COLLABORATOR spaces: separate businesses operating inside a venue/event (Royal Temple hosting
-- independent practitioners; a salon's chairs; a healing center's rooms). This is the FIRST space<->space
-- relationship in the schema (the only space<->space-ish table before it is space_follows, which is
-- space<->profile). The request->approve shape mirrors event_placement_requests (20261111000000): EITHER
-- side asks, the OTHER side's owner/admin approves; free to host. A host is just a `business` space, no
-- new SpaceType.
--
-- KEY STRUCTURAL DIFFERENCE from event_placement_requests: there, approval sets an EXTERNAL column
-- (events.space_id) and the row is just an audit of the ask. Here the ROW ITSELF is the relationship:
-- approval flips status to 'accepted' in place, and 'revoked' is a real terminal teardown state (there
-- is no external column to null). States: pending / accepted / declined / revoked (ADR-799 vocabulary).
--
-- ACCESS MODEL: RLS ENABLED, NO policies -> service-role only (identical to event_placement_requests +
-- space_follows). Every read/write goes through createAdminClient() behind server-side authz in
-- lib/spaces/collaborations.ts + collaborations-actions.ts: request gates on the INITIATING space's
-- owner/admin; approve/decline gate on the OTHER (non-initiating) side's owner/admin; revoke gates on
-- EITHER side. The admin client bypasses RLS, so those app-layer gates are the authority; absent a
-- policy, anon/authenticated are denied by default (fail-closed). Untyped handle until types regenerate
-- (ADR-246). Additive + idempotent. Reversible: drop table space_collaborations.

create table if not exists public.space_collaborations (
  id                    uuid        primary key default gen_random_uuid(),
  host_space_id         uuid        not null references public.spaces(id) on delete cascade,
  collaborator_space_id uuid        not null references public.spaces(id) on delete cascade,
  -- Which SIDE opened the request (either side may initiate; ADR-799). Always one of the two spaces
  -- above; the approver is an owner/admin of the OPPOSITE side.
  invited_by_space_id   uuid        not null references public.spaces(id),
  status                text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'declined', 'revoked')),
  requested_by          uuid        not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  responded_at          timestamptz,
  responded_by          uuid        references public.profiles(id),
  -- A space cannot collaborate with itself.
  constraint space_collab_distinct check (host_space_id <> collaborator_space_id),
  -- The initiator is one of the two parties, never a third space.
  constraint space_collab_initiator_is_party check (
    invited_by_space_id = host_space_id or invited_by_space_id = collaborator_space_id
  )
);

-- At most ONE non-terminal relationship per directed (host, collaborator) pair. A resolved
-- (declined/revoked) row is ignored by the partial predicate, so either side can always re-ask after a
-- decline or revoke, exactly the event_placement_requests re-ask rule, extended to also treat an
-- ACCEPTED row as blocking (you cannot re-request a live collaboration).
create unique index if not exists uniq_space_collab_active
  on public.space_collaborations (host_space_id, collaborator_space_id)
  where status in ('pending', 'accepted');

-- Approver / list inboxes: "collaborations where I am the host" and "...where I am the collaborator",
-- each filterable by status.
create index if not exists idx_space_collab_host_status
  on public.space_collaborations (host_space_id, status);
create index if not exists idx_space_collab_collaborator_status
  on public.space_collaborations (collaborator_space_id, status);

comment on table public.space_collaborations is
  'Space<->space collaborator relationship (ADR-799 B). One row per directed (host, collaborator) pair; either side initiates (invited_by_space_id), the other side owner/admin approves. States pending/accepted/declined/revoked; the row IS the relationship (approval has no external column). Free to host. Writes are service-role only via lib/spaces/collaborations.';

alter table public.space_collaborations enable row level security;
-- No policies by design (see header): access is service-role only, gated in the app layer.
