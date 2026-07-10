-- "Where does this event live" — event placement requests (request → steward approval).
--
-- An event host can ASK to place their event under a Space or a Circle. The placement does
-- not go live until a steward of that target (a Space owner/admin, or a Circle host) APPROVES
-- it. On approval the app sets events.space_id (for a Space) or events.scope_circle_id (for a
-- Circle) — that column is what actually makes the event show up under the entity. Until then
-- the request sits 'pending'; a steward may also 'decline' it.
--
-- One request row = one ask. A host can re-ask a target only when no PENDING request for that
-- (event, target) already exists (the partial unique indexes below enforce this); a resolved
-- (approved/declined) request never blocks a fresh ask.
--
-- ACCESS MODEL — no RLS policies, service-role only. Every read/write in the app goes through
-- the service-role admin client (createAdminClient) behind server-side authorization: the
-- request/clear actions gate on event.editSettings (host/cohost), and approve/decline gate on
-- the target's steward capability (getSpaceCapabilities / getCircleCapabilities). This mirrors
-- the events admin-action convention ("the admin client bypasses RLS, so these gates are the
-- authority"). RLS is still ENABLED so that, absent a policy, anon/authenticated clients are
-- denied by default (fail-closed) — nothing reaches this table except the service role.
--
-- Reversible: drop table event_placement_requests.

create table if not exists public.event_placement_requests (
  id            uuid        primary key default gen_random_uuid(),
  event_id      uuid        not null references public.events(id)   on delete cascade,
  target_type   text        not null check (target_type in ('space', 'circle')),
  space_id      uuid        references public.spaces(id)  on delete cascade,
  circle_id     uuid        references public.circles(id) on delete cascade,
  requested_by  uuid        not null references public.profiles(id),
  status        text        not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  responded_by  uuid        references public.profiles(id),
  -- Exactly one of space_id / circle_id is set, and it matches target_type.
  constraint event_placement_target_matches check (
    (target_type = 'space'  and space_id  is not null and circle_id is null) or
    (target_type = 'circle' and circle_id is not null and space_id  is null)
  )
);

-- At most ONE pending request per (event, target). A resolved request is ignored by the
-- partial predicate, so a host can always re-ask after a decline.
create unique index if not exists uniq_event_placement_pending_space
  on public.event_placement_requests (event_id, space_id)
  where status = 'pending' and space_id is not null;

create unique index if not exists uniq_event_placement_pending_circle
  on public.event_placement_requests (event_id, circle_id)
  where status = 'pending' and circle_id is not null;

-- Approver inbox: pending requests for a given Space / Circle, newest first.
create index if not exists idx_event_placement_space_status
  on public.event_placement_requests (space_id, status);

create index if not exists idx_event_placement_circle_status
  on public.event_placement_requests (circle_id, status);

-- Covering index for the FK the approver-notify / audit paths join on.
create index if not exists idx_event_placement_event_id
  on public.event_placement_requests (event_id);

alter table public.event_placement_requests enable row level security;
-- No policies by design (see header): access is service-role only, gated in the app layer.
