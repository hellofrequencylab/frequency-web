-- =============================================================================
-- Co-hosted Journeys: journey ↔ space shares (copies the event_space_shares model, 20261197000000)
--
-- WHAT: a Journey lives in ONE home Space (journey_plans.space_id). A journey_plan_space_shares row lets
-- that same Journey ALSO appear on ANOTHER Space as a co-host, without moving it. When 'accepted', the
-- Journey lists on the co-host Space (listJourneyPlansForSpace in lib/journey-plans.ts) and the public
-- Journey page credits it ("Co-hosted with <Space>", listJourneyCoHostSpaces) IN ADDITION to its home.
--
-- ─── THE CONTRACT ───────────────────────────────────────────────────────────────────────────────
-- A share is NECESSARY to appear on the co-host Space, never SUFFICIENT. Every reader that unions
-- accepted shares RE-APPLIES the Journey's OWN visibility gate (visibility <> 'private'), so a share
-- to Space B being 'accepted' never surfaces a private Journey, and flipping the Journey back to
-- private removes it from B at once. The gate is on the Journey's own row in the reader, not on the
-- share's status. A share is a credit and a listing only: it never grants edit or manage access, and
-- it never enters getJourneyCapabilities. pending, declined and revoked rows never render anywhere.
--
-- ACCESS MODEL: RLS ENABLED, NO POLICIES, service-role only (same posture as event_space_shares and
-- space_collaborations; listed in scripts/rls-deny-all.txt and `internal` in scripts/table-grants.txt).
-- Every read goes through the admin client in lib/journey-plans.ts. There is no owner UI to invite or
-- accept yet (a follow-up); the first share is written by SQL the owner runs.
--
-- Additive: one new table, no change to any existing table, no functions.
-- Reversible: drop table public.journey_plan_space_shares.
-- =============================================================================

begin;

create table if not exists public.journey_plan_space_shares (
  id                   uuid        primary key default gen_random_uuid(),
  plan_id              uuid        not null references public.journey_plans(id) on delete cascade,
  -- The co-host Space.
  space_id             uuid        not null references public.spaces(id)        on delete cascade,
  -- Which Space initiated (the Journey's home Space when it invites a co-host). Nullable.
  invited_by_space_id  uuid        references public.spaces(id)   on delete set null,
  requested_by         uuid        references public.profiles(id) on delete set null,
  status               text        not null default 'pending'
                                   check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  responded_by         uuid        references public.profiles(id) on delete set null
);

-- At most ONE active (pending|accepted) share per (journey, space). A declined or revoked row is ignored
-- by the partial predicate, so the pair can be re-shared later.
create unique index if not exists uniq_journey_plan_space_share_active
  on public.journey_plan_space_shares (plan_id, space_id)
  where status in ('pending', 'accepted');

-- The co-host Space's listing read: its accepted shares.
create index if not exists idx_journey_plan_space_share_space_accepted
  on public.journey_plan_space_shares (space_id)
  where status = 'accepted';

-- Covering index for the plan_id FK (the Journey page credit read + the cascade).
create index if not exists idx_journey_plan_space_share_plan_id
  on public.journey_plan_space_shares (plan_id);

-- The attribution keys (check:fk-indexes): partial, since most are null or few.
create index if not exists journey_plan_space_shares_invited_by_space_id_idx
  on public.journey_plan_space_shares (invited_by_space_id) where invited_by_space_id is not null;
create index if not exists journey_plan_space_shares_requested_by_idx
  on public.journey_plan_space_shares (requested_by) where requested_by is not null;
create index if not exists journey_plan_space_shares_responded_by_idx
  on public.journey_plan_space_shares (responded_by) where responded_by is not null;

alter table public.journey_plan_space_shares enable row level security;
-- No policies by design (see header): access is service-role only.
revoke all on table public.journey_plan_space_shares from anon, authenticated;

comment on table public.journey_plan_space_shares is
  'Co-hosted Journeys: an accepted row lists a Journey on a second Space and credits it on the Journey page. Necessary, never sufficient: the Journey''s own visibility still applies. Service role only.';

commit;
