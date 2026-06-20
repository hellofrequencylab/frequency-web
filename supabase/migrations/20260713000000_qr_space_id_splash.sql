-- Per-Space QR + SPLASH: scope managed codes to a Space and let a code carry a SPLASH landing
-- (ENTITY-SPACES-BUILD §C, Phase 2 "QR studio per space"). Two additive columns on the existing
-- qr_codes table (created in 20260605010000_qr_codes_dynamic_links.sql; later columns added by the
-- 20260605* / 20260609030000 migrations):
--   * space_id  -- the Space (tenant) a code belongs to. Every space-scoped read/write filters by it,
--     so a caller for Space A never sees Space B's codes (lib/qr/space-codes.ts). FK -> spaces(id)
--     on delete cascade: a Space's codes die with the Space.
--   * splash    -- an optional jsonb landing page the /q/<slug> resolver renders (or redirects via its
--     primary CTA) instead of a bare redirect, when present. A small CONSTRAINED block shape (heading
--     + blurb + image + up to 5 links), normalized + validated app-side by lib/qr/splash.ts before it
--     is stored (NOT a Puck block tree). NULL = no splash (the code keeps its existing redirect
--     behavior, unchanged).
--
-- This is the REVERSIBLE EXPAND half (the §4.12 expand -> migrate -> contract approach, the same as
-- 20260711020000_object_space_id.sql): add a NULLABLE space_id so nothing existing breaks, then
-- BACKFILL every existing row to the ROOT space (the legacy single-tenant codes belong to the
-- Frequency app itself, the seeded root space), then add a leading-column index. space_id is left
-- NULLABLE on purpose (interim, the ADR-321/331 pattern): the CONTRACT half (NOT NULL + RLS) is a
-- later migration once dual-write + backfill are confirmed in prod.
--
-- THE PER-PLAN CODE CAP IS ENFORCED IN APP CODE, NOT IN THE DB. createSpaceCode (lib/qr/space-codes.ts)
-- reads the Space's plan and refuses a create that would exceed the plan's cap. There is deliberately
-- NO DB constraint / trigger for the cap: the cap is a product policy (it changes with plans, never a
-- migration), and the existing qr_codes RLS already denies all client writes (every code write goes
-- through the gated service-role server actions), so the app layer is the right authority (P5).
--
-- ACCESS MODEL is unchanged: qr_codes already has RLS enabled with owner-scoped client policies
-- (20260608140000_rls_qr_codes.sql) plus the service-role admin client for managed/space codes. The
-- new columns add no client policy; space-scoped reads/writes go through the service-role helpers in
-- lib/qr/space-codes.ts (gated on canEditProfile), so the tenancy boundary is app-authoritative.
--
-- House style (matches 20260711020000_object_space_id.sql): additive + idempotent, expand-only
-- (nothing dropped or made NOT NULL), applied to production via the Supabase SQL Editor;
-- lib/database.types.ts is regenerated separately and the helpers reach space_id/splash with untyped
-- casts until then (the codebase pattern for not-yet-typed columns, ADR-246). This file is the
-- canonical record. SAFE to re-run.
--
-- APPLY ORDER: depends only on the spaces table (20260619000000_spaces_tenancy.sql) and qr_codes
-- (20260605010000_qr_codes_dynamic_links.sql), both already applied. Timestamped after the Phase 0
-- object-ownership migration so the apply order reads top-to-bottom. Apply once; re-running is a no-op.

-- ── 1. space_id: the Space a code belongs to (the tenancy axis) ──────────────────────────────────
alter table public.qr_codes
  add column if not exists space_id uuid references public.spaces(id) on delete cascade;

comment on column public.qr_codes.space_id is
  'The Space (tenant) this managed code belongs to (ENTITY-SPACES-BUILD Phase 2). Every space-scoped read/write filters by it (lib/qr/space-codes.ts) so Space A never sees Space B''s codes. Backfilled to the root space for the legacy single-tenant codes; owner_profile_id/created_by stay the authorship axis. NULLABLE interim (ADR-321/331 pattern); the contract migration sets NOT NULL + RLS. on delete cascade: a Space''s codes die with the Space.';

-- ── 2. splash: the optional constrained landing-page jsonb ───────────────────────────────────────
alter table public.qr_codes
  add column if not exists splash jsonb;

comment on column public.qr_codes.splash is
  'Optional SPLASH landing (ENTITY-SPACES-BUILD Phase 2): a small CONSTRAINED block shape (heading + blurb + image + up to 5 links) the /q/<slug> resolver renders, or redirects via its primary CTA, instead of a bare redirect. Normalized + validated app-side by lib/qr/splash.ts before storage (NOT a Puck block tree). NULL = no splash (the code keeps its normal redirect).';

-- ── 3. Backfill every existing code -> the ROOT space ────────────────────────────────────────────
-- The legacy single-tenant codes are the Frequency app itself, which is the seeded root space
-- (type = 'root', exactly one -- 20260619000000_spaces_tenancy.sql). Resolving the root by type is
-- portable (no hardcoded id). Idempotent: only rows still missing a space_id are touched.
update public.qr_codes q
set space_id = (select id from public.spaces where type = 'root' order by created_at asc limit 1)
where q.space_id is null;

-- ── 4. Leading-column index: space-scoped reads filter by space_id first, then order by created_at ──
-- qr_codes has created_at (20260605010000_qr_codes_dynamic_links.sql), so index (space_id, created_at)
-- with space_id LEADING (the Supabase RLS-performance rule for composite indexes).
create index if not exists qr_codes_space_created_idx
  on public.qr_codes (space_id, created_at desc);
