-- Reusable EMAIL TEMPLATES for Space campaigns (ADR-380). A template is a saved, named subject + body
-- a Space owner can reuse to PREFILL the campaign composer. It stores plain text exactly as the
-- composer holds it (subject + body); loading a template only prefills the composer state, it does not
-- send. Sibling of the saved-segments migration (20260730000000_space_segments.sql).
--
-- ACCESS MODEL (mirrors client_notes / space_email / space_bookings): the table stays service-role
-- only (RLS ENABLED, NO client policies), reached ONLY through the gated server actions in
-- lib/spaces/email-templates.ts + lib/spaces/email-templates-actions.ts (canEditProfile,
-- space_id-scoped). Every read filters space_id first and is fail-safe; a single-row read ALSO filters
-- space_id so a cross-space id leaks nothing. Never exposed cross-space.
--
-- House style (matches crm_space_id_client_notes.sql / space_email.sql): additive + idempotent,
-- applied to production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately
-- and the seam reaches this table with untyped casts until then (ADR-246). This file is the canonical
-- record. SAFE to re-run. No em or en dashes in any copy here.

create table if not exists public.space_email_templates (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  subject     text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.space_email_templates is
  'Reusable named subject + body templates for Space campaigns (ADR-380). Plain text, exactly as the composer holds it. Loading a template prefills the composer; it never sends. space_id-scoped and fail-closed: RLS is ENABLED with NO policies, so the ONLY access path is the gated server actions in lib/spaces/email-templates.ts (service-role admin client, canEditProfile). Never exposed cross-space.';
comment on column public.space_email_templates.space_id is
  'The Space that owns this template. Every read/write filters space_id, so a template is never visible to another Space.';
comment on column public.space_email_templates.name is 'Display name for the template. Trimmed + length-capped on write by the email-template helpers.';
comment on column public.space_email_templates.subject is 'The saved subject line (plain text), length-capped on write. May be empty.';
comment on column public.space_email_templates.body is 'The saved message body (plain text; blank lines become paragraphs at send), length-capped on write. May be empty.';

-- Per-space list (newest first). space_id leads, since every read filters space_id first.
create index if not exists space_email_templates_space_created_idx
  on public.space_email_templates (space_id, created_at desc);

-- RLS: enabled, NO client policies (all access via the service-role admin client). Exactly like
-- client_notes / space_bookings / space_memberships: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies ALL direct client access, so the only path is the gated server actions. The owner
-- reads/writes only their own Space's templates (canEditProfile, space_id-scoped) through the seam.
alter table public.space_email_templates enable row level security;

-- Rollback: drop table public.space_email_templates;  -- drops its index + RLS with it.
