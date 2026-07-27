-- CIRCLE HANDOFF OFFERS (ADR-845). Completes the ADR-843 deferral: giving a Circle to another
-- person, which needs the other side to AGREE. Moving a Circle between places the actor already
-- runs stays immediate (lib/circles/transfer.ts); this table exists only for the case where the
-- destination is someone else, because a Circle carries members and cannot be pushed onto a person
-- who never accepted it.
--
-- Shape mirrors event_placement_requests (20261192 band): a pending row, a status, and a responder
-- stamp, so the audit trail reads the same way across the codebase.
--
-- ACCESS MODEL: RLS ENABLED with NO client policies, service-role only, exactly like
-- journey_drip_sends. Both sides of an offer are read and written through gated server actions
-- (lib/circles/handoff.ts), never from the client. scripts/rls-deny-all.txt records the posture.
--
-- ADDITIVE + IDEMPOTENT: a pure CREATE TABLE IF NOT EXISTS plus indexes. Touches no existing rows
-- and no existing object, so it is safe to re-run and trivially reversible (drop the table).

create table if not exists public.circle_transfer_offers (
  id                uuid primary key default gen_random_uuid(),
  circle_id         uuid not null references public.circles(id) on delete cascade,
  -- Who offered it, for the audit trail and so the offer can name its sender.
  from_profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- Who it is offered TO. They are the only one who may accept.
  to_profile_id     uuid not null references public.profiles(id) on delete cascade,
  -- The Space the Circle sat under when the offer was made, so a stale offer can be detected if the
  -- Circle moved on in the meantime. Null = it was already a personal circle.
  from_space_id     uuid references public.spaces(id) on delete set null,
  -- pending -> accepted | declined | cancelled. Free text (no enum) so a new state needs no type
  -- change; the code gates writes to this set.
  status            text not null default 'pending',
  created_at        timestamptz not null default now(),
  responded_at      timestamptz
);

comment on table public.circle_transfer_offers is
  'Circle handoff offers (ADR-845): one row per offer of a Circle to another person. A Circle carries members, so a handoff needs the recipient to accept. Service-role only: RLS ENABLED with NO policies; the only access path is lib/circles/handoff.ts.';
comment on column public.circle_transfer_offers.from_space_id is
  'The Space the Circle sat under when offered, so an offer that was overtaken by another move can be spotted and refused at accept time.';

-- AT MOST ONE PENDING OFFER PER CIRCLE. Partial, so answered offers stay as history while a second
-- live offer cannot exist. This is the race guard: two stewards offering the same Circle at once,
-- or a double-submit, collide here rather than creating two acceptable offers.
create unique index if not exists circle_transfer_offers_one_pending_idx
  on public.circle_transfer_offers (circle_id)
  where status = 'pending';

-- The recipient's inbox read: "offers waiting on me".
create index if not exists circle_transfer_offers_to_profile_idx
  on public.circle_transfer_offers (to_profile_id, status);

-- The sender's view on a circle's offer history.
create index if not exists circle_transfer_offers_circle_idx
  on public.circle_transfer_offers (circle_id, status);

alter table public.circle_transfer_offers enable row level security;
