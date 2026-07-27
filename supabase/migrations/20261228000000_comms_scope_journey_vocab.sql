-- COMMS SCOPE SPINE: + 'journey' (ADR-838, extending ADR-827/ADR-831 vocabulary).
--
-- Journeys join the scope spine so the lane-3 launch/campaign surfaces can stamp a Journey's
-- comms the same way events/circles/campaigns already do: a conversation or timeline touch born
-- from a Journey launch carries scope_kind='journey', scope_id=<journey_plans.id>. Same rules as
-- the original vocabulary (20261226_comms_scope_spine): scope NARROWS WITHIN the space_id
-- tenancy lane, scope_id stays a bare polymorphic uuid (no FK, mirrors subject_id), and the
-- paired-null CHECKs + partial scope indexes from that migration already cover the new value —
-- this migration ONLY widens the two scope_kind vocabulary CHECKs.
--
-- DRAFT — for owner approval; do not apply to prod without it. Nothing writes
-- scope_kind='journey' until this applies: the ADR-838 write-path stamping ships dormant and
-- the launch surface must not go live before this migration lands.
--
-- IDEMPOTENT: each do-block drops the named constraint only when it exists WITHOUT 'journey'
-- in its definition, then re-adds the widened set only when the name is absent — so a re-run,
-- or a run against a baseline where 20261226 never applied, is safe. No backfill (no legacy
-- journey-scoped metadata convention exists yet).

-- ── comms_conversations.scope_kind: + 'journey' ─────────────────────────────────────────────

do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'comms_conversations_scope_kind_check'
      and pg_get_constraintdef(oid) not ilike '%''journey''%'
  ) then
    alter table public.comms_conversations drop constraint comms_conversations_scope_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comms_conversations_scope_kind_check') then
    alter table public.comms_conversations
      add constraint comms_conversations_scope_kind_check
      check (scope_kind is null or scope_kind in
        ('event','circle','hub','nexus','campaign','dispatch','booking','membership','journey'));
  end if;
end $$;

comment on column public.comms_conversations.scope_kind is
  'ADR-827 scope spine: the lane this conversation belongs to (event/circle/hub/nexus/campaign/dispatch/booking/membership/journey). Narrows WITHIN the space_id tenancy lane, never replaces it. NULL = unscoped (platform- or space-general).';

-- ── contact_interactions.scope_kind: + 'journey' ────────────────────────────────────────────

do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'contact_interactions_scope_kind_check'
      and pg_get_constraintdef(oid) not ilike '%''journey''%'
  ) then
    alter table public.contact_interactions drop constraint contact_interactions_scope_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_interactions_scope_kind_check') then
    alter table public.contact_interactions
      add constraint contact_interactions_scope_kind_check
      check (scope_kind is null or scope_kind in
        ('event','circle','hub','nexus','campaign','dispatch','booking','membership','journey'));
  end if;
end $$;

comment on column public.contact_interactions.scope_kind is
  'ADR-827 scope spine: the lane this touch belongs to (event/circle/hub/nexus/campaign/dispatch/booking/membership/journey). Narrows WITHIN the space_id tenancy lane, never replaces it. NULL = unscoped.';
