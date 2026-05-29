-- Phase 3 (docs/ENGAGEMENT-ARCHITECTURE.md): the append-only engagement event
-- ledger — the SOURCE → LEDGER → RULES spine.
--
-- Every reward-earning action — web activity, completed tasks, and (soon) QR
-- scans, NFC bumps, geo/ghost-node captures — lands here EXACTLY ONCE. The
-- existing TS rules engine (processGamificationEvent) runs on first insert. This
-- table adds persistence, idempotency, audit, and a home for physical sources.
--
-- ADDITIVE: the current gamification system keeps working unchanged. After
-- applying, regenerate types: `npx supabase gen types typescript --linked > lib/database.types.ts`.

create table if not exists public.engagement_events (
  id                uuid primary key default gen_random_uuid(),
  -- Caller key that makes recording exactly-once (retried scans / double taps
  -- can't double-award). e.g. 'qr:<node>:<profile>:<yyyymmdd>' or a request uuid.
  idempotency_key   text not null,
  -- The adapter that produced it: web | task | qr | nfc | geo | p2p | system.
  source            text not null,
  -- Maps to the rules-engine event type (post_create, event_attend, task_complete…).
  event_type        text not null,
  actor_profile_id  uuid references public.profiles(id) on delete set null,
  -- Per-source detail (node id, location, peer profile, …).
  context           jsonb not null default '{}'::jsonb,
  -- Set by the verifier for sources needing server-side checks (geo/nfc/qr).
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);

create unique index if not exists engagement_events_idempotency_key_uniq
  on public.engagement_events (idempotency_key);
create index if not exists engagement_events_actor_idx
  on public.engagement_events (actor_profile_id, created_at desc);
create index if not exists engagement_events_type_idx
  on public.engagement_events (event_type, created_at desc);

alter table public.engagement_events enable row level security;

-- Members may read their OWN ledger entries. All writes go through the service
-- role (server-side recordEngagementEvent), so there is intentionally no
-- insert/update/delete policy — clients can never forge an event.
create policy "engagement_events: read own"
  on public.engagement_events for select
  using (
    actor_profile_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );

comment on table public.engagement_events is
  'Append-only engagement/gamification ledger. idempotency_key = exactly-once; source = adapter (web/task/qr/nfc/geo/p2p). Rules + rewards run on first insert (lib/engagement/events.ts). See docs/ENGAGEMENT-ARCHITECTURE.md.';
