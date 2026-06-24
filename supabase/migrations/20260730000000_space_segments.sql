-- Saved audience SEGMENTS for Space campaigns (ADR-380). A segment is a saved, named audience
-- definition a Space owner can reuse across campaigns. The `definition` jsonb stores an
-- AudienceFilter-shaped object (lib/spaces/audiences.ts): today { tag, consent } and, by reference,
-- a segment never references another segment. resolveAudience(spaceId, { segmentId }) loads the
-- stored definition and resolves it through the EXISTING tag logic, so a segment adds no new resolve
-- path, only a saved one.
--
-- ACCESS MODEL (mirrors client_notes / space_email / space_bookings): the table stays service-role
-- only (RLS ENABLED, NO client policies), reached ONLY through the gated server actions in
-- lib/spaces/segments.ts + lib/spaces/segments-actions.ts (canEditProfile, space_id-scoped). The
-- server is the authority for "which space" and "what may this caller do" (P5). Every read filters
-- space_id first and is fail-safe; a single-row read ALSO filters space_id so a cross-space id leaks
-- nothing. Never exposed cross-space.
--
-- House style (matches crm_space_id_client_notes.sql / space_email.sql): additive + idempotent,
-- applied to production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately
-- and the seam reaches this table with untyped casts until then (ADR-246). This file is the canonical
-- record. SAFE to re-run. No em or en dashes in any copy here.

create table if not exists public.space_segments (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  definition  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.space_segments is
  'Saved, named audience definitions for Space campaigns (ADR-380). definition is an AudienceFilter-shaped jsonb (tag / consent). space_id-scoped and fail-closed: RLS is ENABLED with NO policies, so the ONLY access path is the gated server actions in lib/spaces/segments.ts (service-role admin client, canEditProfile). Never exposed cross-space.';
comment on column public.space_segments.space_id is
  'The Space that owns this segment. Every read/write filters space_id, so a segment is never visible to another Space.';
comment on column public.space_segments.name is 'Display name for the segment. Trimmed + length-capped on write by the segments helpers.';
comment on column public.space_segments.definition is
  'An AudienceFilter-shaped object (lib/spaces/audiences.ts): { tag?, consent? }. resolveAudience({ segmentId }) loads this and resolves through the existing tag logic. A segment never references another segment.';

-- Per-space list (newest first). space_id leads, since every read filters space_id first.
create index if not exists space_segments_space_created_idx
  on public.space_segments (space_id, created_at desc);

-- RLS: enabled, NO client policies (all access via the service-role admin client). Exactly like
-- client_notes / space_bookings / space_memberships: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies ALL direct client access, so the only path is the gated server actions. The owner
-- reads/writes only their own Space's segments (canEditProfile, space_id-scoped) through the seam.
alter table public.space_segments enable row level security;

-- Rollback: drop table public.space_segments;  -- drops its index + RLS with it.
