-- Per-Space EMAIL ENGAGEMENT: opens / clicks / replies (the READ side of Marketing analytics +
-- Community Resonance member detail). The delivery ledger (outreach_sends, 20260714000000_space_email.sql)
-- already records SENT / DELIVERED / BOUNCED / COMPLAINED / SUPPRESSED. This adds the missing
-- ENGAGEMENT axis: a per-event log of a recipient OPENING an email (tracking pixel), CLICKING a link
-- (redirect endpoint), or REPLYING (inbound-email webhook). lib/spaces/email-analytics.ts reads it to
-- compute open/click rates + per-contact engagement; lib/spaces/email-tracking.ts is the only writer.
--
-- FAIL-SAFE + ADDITIVE: a tracking failure must NEVER block or corrupt a send. This table is written
-- best-effort AFTER the email is handed to the provider; a missing row just means an untracked event,
-- never a broken send. No existing table/column is altered.
--
-- ACCESS MODEL (mirrors outreach_sends / space_bookings / space_memberships): the table is SERVICE-ROLE
-- ONLY. RLS is enabled with NO client policies, so the only path in is the gated server code in
-- lib/spaces/email-tracking.ts (writes) + lib/spaces/email-analytics.ts (reads, canEditProfile-gated).
-- The public tracking endpoints resolve an opaque HMAC token to a send row before writing; they never
-- touch this table directly from the client.
--
-- House style (matches space_email.sql): additive + idempotent (IF NOT EXISTS / guarded drops), applied
-- to production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately and the code
-- reaches this table with untyped casts until then (ADR-246). SAFE to re-run. No em or en dashes here.

-- ── space_email_events: one row per engagement event on a Space send ────────────────────────────
-- kind is the event: 'open' (pixel loaded), 'click' (a tracked link followed; url carries the original
-- destination), or 'reply' (an inbound email matched back to a send). send_id links to the specific
-- outreach_sends row so analytics can count DISTINCT-per-send opens/clicks (one person reloading an
-- email many times counts once). ON DELETE CASCADE on both FKs so removing a Space or a send removes
-- its events. contact_email is the lowercased recipient address (denormalized for the per-contact read).
create table if not exists public.space_email_events (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  send_id       uuid references public.outreach_sends(id) on delete cascade,
  contact_email text,
  kind          text not null check (kind in ('open', 'click', 'reply')),
  url           text,
  created_at    timestamptz not null default now()
);

comment on table public.space_email_events is
  'Per-Space email ENGAGEMENT event log (opens / clicks / replies). The read side of Marketing analytics + Community Resonance member detail. Written best-effort by lib/spaces/email-tracking.ts AFTER a send is handed to the provider (a tracking failure never blocks the send). send_id links to the specific outreach_sends row so opens/clicks count DISTINCT per send. Service-role only via lib/spaces/email-tracking.ts + lib/spaces/email-analytics.ts.';
comment on column public.space_email_events.send_id is
  'The outreach_sends row this event belongs to (the specific email that was opened/clicked/replied to). ON DELETE CASCADE. NULLABLE only for defensive tolerance; the writer always sets it.';
comment on column public.space_email_events.kind is
  'open (tracking pixel loaded) | click (a tracked link followed) | reply (an inbound email matched back to a send).';
comment on column public.space_email_events.url is
  'For a click event, the ORIGINAL destination URL the recipient followed (http/https only, validated before store). NULL for open/reply.';
comment on column public.space_email_events.contact_email is
  'The lowercased recipient address, denormalized from the send row so the per-contact engagement read does not need a join.';

-- Per-space engagement rollups over a window (the Marketing dashboard rates): space_id + kind lead,
-- newest first.
create index if not exists space_email_events_space_kind_created_idx
  on public.space_email_events (space_id, kind, created_at desc);
-- Distinct-per-send counting + the send-detail lookup.
create index if not exists space_email_events_send_idx
  on public.space_email_events (send_id);
-- Per-contact engagement (the member detail): resolve a person's events within a Space by address.
create index if not exists space_email_events_space_email_idx
  on public.space_email_events (space_id, lower(contact_email));

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ─────────────
-- Exactly like outreach_sends: enabling RLS with no policy denies ALL direct client access, so the
-- only path to space_email_events is the service-role server code. Idempotent.
alter table public.space_email_events enable row level security;
