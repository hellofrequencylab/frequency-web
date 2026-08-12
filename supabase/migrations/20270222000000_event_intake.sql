-- ============================================================================
-- EVENT INTAKE: the draft-first staging record for the EVENT SEEDER (ADR-989).
--
-- The admin counterpart to the Business Seeder, for events. Events already owned both
-- halves of the raw material and neither one could be staged for review:
--   * app/(main)/admin/import/  parses a WhatsApp group export into events + housing and
--     then wrote NOTHING at all (an explicit dry run with no writer wired).
--   * app/(main)/events/scan/   does vision OCR on a flyer and yields a rich ExtractedEvent.
-- This table is where both now land, so an operator reviews a draft BEFORE anything is
-- written to the events table.
--
-- ONE table, service-role only:
--   event_intake - one row per staged event, all content in jsonb: the inputs (which door
--   it came through and the raw source text), the raw sources, the manifest-shaped EVENT
--   DRAFT the review board renders, and the per-field provenance LEDGER.
--
-- MIRRORS business_intake (20261022000000) column for column and status for status; the
-- only shape change is the materialized target, which is an EVENT here rather than a Space.
-- listing_intake (20261137000000) is the same mirror for the listing verticals.
--
-- ACCESS MODEL: SERVICE-ROLE ONLY. RLS is ENABLED with NO client policies, so the ONLY
-- access path is the gated server code (lib/events/seed/*, admin client). An intake row can
-- hold third-party contact details lifted out of a private group chat by an AI classifier,
-- with nobody's consent yet, so it must never be world- or member-readable. Enabling RLS
-- with no policy denies ALL direct client access; the deliberate service-role-only posture
-- is recorded in scripts/rls-deny-all.txt. The default grants are revoked at the bottom
-- (ADR-964): a grant held back only by RLS is one policy mistake away from being live.
--
-- House style (matches business_intake): PURELY ADDITIVE + idempotent. It creates one new
-- table, its two indexes, and its RLS. It ALTERs and DROPs nothing, so applying it cannot
-- disturb anything already running. lib/database.types.ts is regenerated separately and the
-- seam reaches this table with narrow untyped casts until then (ADR-246). SAFE to re-run.
-- No em or en dashes in any copy here.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.event_intake;
-- ============================================================================

create table if not exists public.event_intake (
  id              uuid primary key default gen_random_uuid(),

  -- The operator who staged this event (getMyProfileId at intake).
  created_by      uuid not null references public.profiles(id) on delete cascade,

  -- Which front door produced this row. 'operator' = the Event Seeder (the only mode today).
  -- Free-text (no enum) so a new mode needs no type change; the code gates writes to the
  -- known set, exactly like business_intake.mode.
  mode            text not null default 'operator',

  -- The pipeline status machine: intake -> researching -> review -> applied, with failed as
  -- a recoverable side-state. IDENTICAL to business_intake; the one status machine lives in
  -- lib/importer/intake.ts (canTransition) and both seeders import it. Free-text, code-gated.
  -- A WhatsApp stage lands straight in 'review' (the classifier already ran upstream).
  status          text not null default 'intake',

  -- EventIntakeInputs (lib/events/seed/intake.ts): which door (whatsapp | scan | paste), the
  -- raw source excerpt the draft was read from, the chat message refs, the image filenames
  -- posted alongside it, and consent { isDemo }. isDemo is true for every seeded event and
  -- decides the publish posture: a seeded event materializes as an events row with
  -- status='draft' (unlisted, not in any catalog) until an operator flips it live.
  inputs          jsonb not null default '{}'::jsonb,

  -- The raw harvested source payloads (the chat message block, the pasted flyer text, the
  -- poster scan result). Doubles as the cache, so a re-read of the draft costs no new AI call.
  raw_sources     jsonb not null default '[]'::jsonb,

  -- The EVENT DRAFT: a record keyed by the EVENT_MANIFEST field paths
  -- (lib/studio/entities/event.ts), which are the same paths as ExtractedEvent / EventDetails
  -- (lib/events/types.ts). The review board renders it through the Studio kernel
  -- (buildFieldModel), and the apply hands it to the existing event writer.
  draft           jsonb not null default '{}'::jsonb,

  -- ProvenanceLedger (lib/studio/kernel/ledger.ts): Record<fieldPath, LedgerEntry[]> where
  -- each entry carries { snippet, confidence, kind: fact|inferred|generated, verifiedBy }.
  -- An event is the host's own gathering rather than a researched third-party fact, so the
  -- event manifest declares verify:'none' and NO field is commercial: nothing here can block
  -- an apply. The ledger's job on this table is HONESTY, not gating: it records that a value
  -- was read out of a chat message by a model and how sure the model was, so the board can
  -- mark it and the operator can confirm it.
  ledger          jsonb not null default '{}'::jsonb,

  -- Running USD spend for THIS intake. Reserved for symmetry with business_intake: the
  -- classification spend is metered upstream by the importer today, so this stays 0.
  budget_spent    numeric not null default 0,

  -- The materialized event. NULL until Apply writes it. Apply is keyed by this id for
  -- idempotency, so a double-approve never creates a second event.
  target_event_id uuid references public.events(id) on delete set null,

  applied_at      timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Hot read: the operator review board lists rows by status, newest first.
create index if not exists event_intake_status_idx
  on public.event_intake (status, created_at desc);

-- Reverse lookup: from a materialized event back to the intake that seeded it (provenance
-- audit, re-apply). Also the FK covering index for target_event_id.
create index if not exists event_intake_target_event_idx
  on public.event_intake (target_event_id);

-- The list view is bound to the operator (created_by), so cover that read too. This is also
-- the FK covering index for created_by.
create index if not exists event_intake_created_by_idx
  on public.event_intake (created_by, updated_at desc);

-- FAIL-CLOSED: RLS enabled, NO policies. Only the gated server code (service-role admin
-- client, lib/events/seed/*) may touch this table. Direct client access (anon or authed) is
-- denied on every row.
alter table public.event_intake enable row level security;

-- Close the default grants too (ADR-964). RLS-on-no-policy already denies anon and
-- authenticated (neither bypasses RLS), so this changes no result today; it removes the
-- grant that a future stray policy would otherwise switch on. service_role is not revoked
-- from, so every real caller is untouched.
revoke all on table public.event_intake from anon, authenticated;

comment on table public.event_intake is
  'The draft-first staging record for the Event Seeder (ADR-989). One row per staged event, holding inputs + raw_sources + the manifest-shaped event draft + a per-field provenance ledger, so nothing reaches the events table until Apply. Apply materializes through the existing event writer as an events row with status=draft (an unlisted demo) until an operator publishes it. Service-role only, fail-closed: RLS ENABLED with NO policies, the only access path is the gated server code in lib/events/seed/* (admin client). Can hold third-party contact details lifted from a private group chat, so never exposed to clients. Mirrors business_intake.';
