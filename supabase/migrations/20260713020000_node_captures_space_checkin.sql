-- Event Space check-in: space-scope the EXISTING nodes + captures (ENTITY-SPACES-BUILD §C, Phase 2,
-- "Event Space check-in: point a code at a check-in node (reuses nodes/captures, free)"). This does
-- NOT fork the scan pipeline: a check-in is an ordinary node capture (verify -> ledger -> captures
-- row -> reward), and the existing /n/<nodeId> claim path stays the one true scan flow. What this
-- migration adds is TENANCY: every node + capture can belong to a Space, so a Space owner can run a
-- door roster of who checked in at THEIR space, isolated from every other Space.
--
-- THREE additive, idempotent changes (expand step; no contract here, space_id stays nullable interim):
--   1. nodes.space_id     — which Space owns this node (nullable; existing rows backfill to root).
--   2. nodes.kind         — a small marker so a Space's CHECK-IN node is found again. Reusing the
--                           existing `type` column was rejected: lib/engagement/capture.ts maps
--                           nodes.type ('qr'|'nfc'|'ghost') to an engagement SOURCE, so overloading
--                           it would mis-route the reward currency. `kind` is an orthogonal, additive
--                           marker (default 'standard'; a Space check-in node is 'checkin') that the
--                           capture pipeline ignores. Strictly the one column needed, nothing more.
--   3. captures.space_id  — which Space a capture belongs to (nullable; existing rows backfill to root).
--
-- ACCESS MODEL (mirrors space_memberships / space_bookings): nodes + captures already enable RLS with
-- NO node-read client policy (secrets + ghost coordinates are sensitive) and service-role-only writes.
-- This migration changes none of that. The OWNER ROSTER reads through the gated server helpers in
-- lib/spaces/checkin.ts (service-role admin client, gated on canEditProfile per ADR-246/328/329); the
-- public scan-capture stays on the existing claim path. The server is the authority for "which space"
-- and "what may this caller do here" (P5): reads fail-safe (empty), writes fail-closed.
--
-- House style (matches 20260711070000_space_memberships.sql): additive + idempotent, applied to
-- production via the Supabase SQL Editor; lib/database.types.ts is regenerated separately, and
-- lib/spaces/checkin.ts reaches space_id/kind with untyped casts until then (ADR-246). This file is
-- the canonical record. SAFE to re-run. NOT applied by this change.

-- ── nodes: which Space owns the node + a check-in marker ─────────────────────────────────────────
alter table public.nodes add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.nodes add column if not exists kind text not null default 'standard';

comment on column public.nodes.space_id is
  'The Space (public.spaces) this node belongs to, for per-Space tenancy (ENTITY-SPACES-BUILD Phase 2). Nullable in the interim expand step; existing rows backfill to the root Space. A caller for Space A never reads Space B nodes (enforced in lib/spaces/checkin.ts).';
comment on column public.nodes.kind is
  'Orthogonal node marker, additive to `type`. ''standard'' is an ordinary engagement node; ''checkin'' marks a Space''s door check-in node (one per Space, found by ensureCheckinNode). The capture pipeline ignores `kind`; `type` still drives the engagement source + reward currency.';

-- ── captures: which Space a capture (a check-in) belongs to ──────────────────────────────────────
alter table public.captures add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.captures.space_id is
  'The Space (public.spaces) this capture belongs to, for per-Space tenancy (ENTITY-SPACES-BUILD Phase 2). Nullable interim; existing rows backfill to root. The Event Space check-in roster (listCheckins) reads captures for the Space''s check-in node, scoped by node linkage; this column carries the Space directly so a roster query never crosses tenants.';

-- ── Backfill existing rows to the root Space (the legacy single-tenant partition) ────────────────
-- The root Space behaves exactly as today; backfilling existing nodes/captures to it keeps every
-- current scan + capture answerable to a Space without changing behavior. Batched-friendly (a single
-- UPDATE here; the data set is small). NULL stays only on rows whose owning Space cannot be resolved
-- (none today, since root always exists), and the interim nullable column tolerates that.
update public.nodes
   set space_id = (select id from public.spaces where type = 'root' limit 1)
 where space_id is null;

update public.captures
   set space_id = (select id from public.spaces where type = 'root' limit 1)
 where space_id is null;

-- ── Leading-column (space_id, ...) indexes: the tenant filter is always first ─────────────────────
-- The roster scan is "this Space's check-in node, newest captures first": (space_id) on nodes finds
-- the Space's check-in node; (space_id, captured_at desc) on captures pages the roster.
create index if not exists nodes_space_idx on public.nodes (space_id);
create index if not exists captures_space_captured_idx on public.captures (space_id, captured_at desc);
