-- CRM overhaul, Phase 0 (ADR-372 · docs/CRM-OVERHAUL.md §1.1): the ONE CRM interaction timeline.
--
-- `contact_interactions` is the dedicated, owner- and (optionally) Space-scoped record of every
-- touch with a person: one row per touch, every channel. It is FED BY the `engagement_events`
-- backbone and the comms paths (Resend / Twilio webhooks, manual notes, crm_activities) through one
-- adapter seam (lib/crm/interactions.ts) — it is NOT `engagement_events` itself, which fires reward
-- rules on first insert (processGamificationEvent) and is RLS-scoped "read own" to the ACTOR. Mixing
-- a "sent an email to a contact" row into that ledger would mis-fire rewards and its actor-RLS does
-- not model "the owner sees their contacts' history". Reward rules do NOT run here.
--
-- ADDITIVE + idempotent (safe to re-run). After applying, regenerate types:
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- Until then the seam reaches the table untyped (ADR-246). Rollback note at the bottom.

create table if not exists public.contact_interactions (
  id                uuid primary key default gen_random_uuid(),
  -- Exactly-once dedupe for events folded in from the backbone / provider webhooks (an email
  -- 'opened' can be delivered more than once). NULL for ad-hoc rows (manual notes): a unique index
  -- treats NULLs as distinct, so unlimited keyless rows coexist while non-null keys dedupe.
  idempotency_key   text,
  -- The timeline OWNER: the member whose contact book this touch belongs to. The owner-scoped read
  -- policy keys on it. Required.
  owner_profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- WHICH person the touch concerns, polymorphic across the three stitched identity tables (ADR-130):
  -- the shared hub contact, a private capture, or a member. No single FK by design (polymorphic),
  -- mirroring notifications.reference_type / reference_id.
  subject_kind      text not null check (subject_kind in ('contact','network_contact','profile')),
  subject_id        uuid not null,
  -- Optional Studio / per-Space scope. NULL = the personal CRM timeline.
  space_id          uuid references public.spaces(id) on delete cascade,
  -- The channel + direction of the touch.
  channel           text not null
                      check (channel in ('email','sms','call','in_person','event','note','system')),
  direction         text not null default 'internal'
                      check (direction in ('inbound','outbound','internal')),
  -- Human-facing one-line summary + optional full body.
  summary           text,
  body              text,
  -- Provenance + per-channel detail (provider message ids, event_id, open/click, peer profile, …).
  metadata          jsonb not null default '{}'::jsonb,
  -- The adapter that produced the row (audit + dedupe origin).
  source            text not null default 'manual'
                      check (source in ('manual','engagement','resend','twilio','crm_activity','ai','system')),
  -- When the touch HAPPENED (may predate the row, e.g. a backfilled import) vs. when it was recorded.
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Exactly-once for folded events. A plain unique index: Postgres treats NULLs as DISTINCT, so keyless
-- manual rows never collide while non-null keys dedupe (and ON CONFLICT (idempotency_key) can infer it).
create unique index if not exists contact_interactions_idem_uniq
  on public.contact_interactions (idempotency_key);
-- The owner timeline (newest first).
create index if not exists contact_interactions_owner_idx
  on public.contact_interactions (owner_profile_id, occurred_at desc);
-- The per-person timeline.
create index if not exists contact_interactions_subject_idx
  on public.contact_interactions (subject_kind, subject_id, occurred_at desc);
-- The per-Space (Studio) timeline.
create index if not exists contact_interactions_space_idx
  on public.contact_interactions (space_id, occurred_at desc) where space_id is not null;

alter table public.contact_interactions enable row level security;

-- The OWNER may read their own timeline. `auth.uid()` is wrapped in `(select …)` so Postgres
-- evaluates it once per query (initplan), matching the repo-wide RLS pattern (ADR-365). ALL writes go
-- through the service role (the lib/crm/interactions.ts seam, behind app-authz), so there is
-- intentionally NO insert/update/delete policy and NO Space-read policy: Studio reads are
-- server-mediated and gated by spaceFunctionAccess, exactly like crm_deals / crm_activities /
-- client_notes. A member can never forge a row, and a private network_contact touch (owner-only)
-- never leaks to staff or the graph.
drop policy if exists "contact_interactions: read own" on public.contact_interactions;
create policy "contact_interactions: read own"
  on public.contact_interactions for select
  using (
    owner_profile_id in (
      select id from public.profiles where auth_user_id = (select auth.uid())
    )
  );

comment on table public.contact_interactions is
  'The one CRM interaction timeline (ADR-372). One row per touch (channel/direction), owner- and optionally Space-scoped. Fed by the engagement_events backbone + comms paths (Resend/Twilio webhooks, notes, crm_activities) via lib/crm/interactions.ts. Reward rules do NOT run here. See docs/CRM-OVERHAUL.md.';

-- Rollback: drop table public.contact_interactions;  -- drops its indexes + policy with it.
