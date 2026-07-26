-- THE SCOPE SPINE, write side (ADR-827 ruling 1 / CRM-EVERYWHERE-BUILD-PLAN Phase 0.1 + 0.4).
--
-- First-class `scope_kind` / `scope_id` on the two comms system-of-record tables —
-- `comms_conversations` (the ticketed conversation spine) and `contact_interactions` (the person
-- timeline) — so every communication becomes queryable by the LANE it belongs to (an event admin
-- reads that event's comms only; the platform Resonance CRM reads everything). The pair mirrors the
-- house polymorphic convention (`subject_kind`/`subject_id`, `events.scope_type`/`scope_id`): a
-- jsonb-only scope can't be CHECK-constrained or lane-read with a plain indexed eq(), and a join
-- table models a many-to-many we don't have.
--
-- SCOPE NARROWS WITHIN THE TENANCY LANE, NEVER REPLACES IT (plan invariant 1, audit 2026-07-25):
-- `space_id` keeps its exact tenancy semantics on both tables. A scoped row's space_id must still
-- equal the scope owner's lane; scope is a FILTER inside that lane, not a second tenancy axis.
-- Event/circle/hub/nexus lane reads stay service-role behind their capability gates (app-gated) —
-- this migration adds NO RLS authorization system and changes NO policy: both tables' existing
-- policies are untouched, and the new columns simply ride along on rows those policies already
-- govern (all operator writes were already service-role).
--
-- Vocabulary (the plan's Phase 0.1 ruling, plus 'hub'/'nexus' for the Guide/Mentor downlines the
-- ADR-827 second addendum put in v1): event · circle · hub · nexus · campaign · dispatch ·
-- booking · membership. scope_id is a bare uuid, POLYMORPHIC by design (no FK — it points into
-- events/circles/hubs/nexuses/campaigns/dispatches/bookings/membership-tiers depending on kind),
-- exactly like subject_id.
--
-- Also lands `contact_interactions.engagement_event_id` — the hard link from a timeline touch to
-- the site engagement event that triggered it (the "every message names the website event it was
-- tied to" ruling; The Path's read side resolves the badge from it).
--
-- ADDITIVE + IDEMPOTENT (safe to re-run: add column if not exists / do-block constraints /
-- create index if not exists / null-guarded backfill updates). The backfill uses plain UPDATEs —
-- both tables are small at this stage, so no batching or aggressive locking is needed. Write-side
-- only: the read-side lane filters (WorkspaceFilter / ListInteractionsFilter scope-eq) are a later
-- phase. After applying, regenerate types (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- Until then the seams reach the columns through the existing untyped admin-client casts.

-- ── comms_conversations: the conversation's scope ────────────────────────────────────────────────

alter table public.comms_conversations
  add column if not exists scope_kind text,
  add column if not exists scope_id   uuid;

comment on column public.comms_conversations.scope_kind is
  'ADR-827 scope spine: the lane this conversation belongs to (event/circle/hub/nexus/campaign/dispatch/booking/membership). Narrows WITHIN the space_id tenancy lane, never replaces it. NULL = unscoped (platform- or space-general).';
comment on column public.comms_conversations.scope_id is
  'ADR-827 scope spine: the scoped entity''s id (polymorphic by scope_kind, no FK — mirrors subject_id). Paired with scope_kind: both null or both set.';

-- Vocabulary + paired-null guards (idempotent adds; the app also validates fail-safe).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comms_conversations_scope_kind_check') then
    alter table public.comms_conversations
      add constraint comms_conversations_scope_kind_check
      check (scope_kind is null or scope_kind in
        ('event','circle','hub','nexus','campaign','dispatch','booking','membership'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comms_conversations_scope_paired_check') then
    alter table public.comms_conversations
      add constraint comms_conversations_scope_paired_check
      check ((scope_kind is null) = (scope_id is null));
  end if;
end $$;

-- The lane read the event/circle/hub/nexus surfaces will run: eq(scope_kind, scope_id) ordered by
-- activity. Partial — unscoped rows (the overwhelming majority) cost nothing.
create index if not exists comms_conversations_scope_idx
  on public.comms_conversations (scope_kind, scope_id, last_activity_at desc)
  where scope_kind is not null;

-- ── contact_interactions: the touch's scope + its triggering site event ─────────────────────────

alter table public.contact_interactions
  add column if not exists scope_kind          text,
  add column if not exists scope_id            uuid,
  add column if not exists engagement_event_id uuid references public.engagement_events(id) on delete set null;

comment on column public.contact_interactions.scope_kind is
  'ADR-827 scope spine: the lane this touch belongs to (event/circle/hub/nexus/campaign/dispatch/booking/membership). Narrows WITHIN the space_id tenancy lane, never replaces it. NULL = unscoped.';
comment on column public.contact_interactions.scope_id is
  'ADR-827 scope spine: the scoped entity''s id (polymorphic by scope_kind, no FK — mirrors subject_id). Paired with scope_kind: both null or both set.';
comment on column public.contact_interactions.engagement_event_id is
  'ADR-827: the engagement_events ledger row this touch was triggered by (the site event The Path names). on delete set null — losing the ledger row never deletes the touch.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contact_interactions_scope_kind_check') then
    alter table public.contact_interactions
      add constraint contact_interactions_scope_kind_check
      check (scope_kind is null or scope_kind in
        ('event','circle','hub','nexus','campaign','dispatch','booking','membership'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_interactions_scope_paired_check') then
    alter table public.contact_interactions
      add constraint contact_interactions_scope_paired_check
      check ((scope_kind is null) = (scope_id is null));
  end if;
end $$;

-- The scoped timeline read (newest first), partial like the conversations index above.
create index if not exists contact_interactions_scope_idx
  on public.contact_interactions (scope_kind, scope_id, occurred_at desc)
  where scope_kind is not null;
-- The "touches for this site event" join The Path's badge resolution runs.
create index if not exists contact_interactions_engagement_event_idx
  on public.contact_interactions (engagement_event_id)
  where engagement_event_id is not null;

-- ── Backfill from the legacy metadata conventions (plan 0.4: guarded per source, nullable forever) ──
--
-- Scope has ridden in `metadata` jsonb until now. Each block below maps ONE established convention
-- to first-class columns, guards the id with a uuid-shape check (a malformed value stays metadata-
-- only rather than failing the cast), and only touches rows still unscoped — so a re-run, or a run
-- after the app has started dual-writing, is a no-op for already-stamped rows. The legacy metadata
-- keys are KEPT (dual-write contract): nothing reading metadata breaks.

-- contact_interactions: event touches (event reminder cron + RSVP confirmation SMS legs).
update public.contact_interactions
   set scope_kind = 'event', scope_id = (metadata->>'event_id')::uuid
 where scope_kind is null
   and metadata->>'kind' in ('event_reminder','event_rsvp_confirmation')
   and metadata->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- contact_interactions: booking touches (Space booking placed / cancelled, camelCase bookingId).
update public.contact_interactions
   set scope_kind = 'booking', scope_id = (metadata->>'bookingId')::uuid
 where scope_kind is null
   and metadata->>'kind' in ('booking','booking_cancel')
   and metadata->>'bookingId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- contact_interactions: membership touches (join / waitlist / promote / cancel, camelCase tierId).
-- NOTE: 'ticket_rsvp'/'ticket_rsvp_cancel' also carry a tierId but a Space ticket tier has no scope
-- vocabulary entry — those rows stay space-lane only (deliberate; see the ADR).
update public.contact_interactions
   set scope_kind = 'membership', scope_id = (metadata->>'tierId')::uuid
 where scope_kind is null
   and metadata->>'kind' in ('membership_join','membership_waitlist','membership_promote','membership_cancel')
   and metadata->>'tierId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- contact_interactions: campaign sends (Space outreach + Email Studio logging, snake_case campaign_id).
update public.contact_interactions
   set scope_kind = 'campaign', scope_id = (metadata->>'campaign_id')::uuid
 where scope_kind is null
   and metadata->>'campaign_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- comms_conversations: campaign conversation-mode threads (Email Studio reply_mode='conversation'
-- stamps metadata.campaign_id at open).
update public.comms_conversations
   set scope_kind = 'campaign', scope_id = (metadata->>'campaign_id')::uuid
 where scope_kind is null
   and metadata->>'campaign_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- comms_conversations: broadcast/dispatch-born threads (the workspace already reads
-- metadata.broadcast_id / broadcastId as a thread's origin badge).
update public.comms_conversations
   set scope_kind = 'dispatch', scope_id = (coalesce(metadata->>'broadcast_id', metadata->>'broadcastId'))::uuid
 where scope_kind is null
   and coalesce(metadata->>'broadcast_id', metadata->>'broadcastId')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
