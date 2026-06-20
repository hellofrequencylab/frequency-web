-- space_programs + space_enrollments: ENROLLMENT for the Coaching role (ENTITY-SPACES-SYSTEM §2.7
-- "Coaching academy", MASTER-PLAN item ADMIN-02). This is the v1 of that deep feature and the
-- Coaching analog of the Business memberships pair (20260711070000_space_memberships): an owner
-- defines ONE program (name, description, schedule text, start/end dates, capacity), a member
-- enrolls in it, the owner sees who enrolled. Two service-role tables, scoped by space_id, isolated
-- per Space.
--
-- v1 IS NOT BILLING. A program has no price and enrolling takes NO payment. The enroll surface frames
-- this honestly (CONTENT-VOICE skeptic test): enrolling reserves a seat now; paid enrollment is a
-- later phase. This mirrors memberships v1 (ADR-327) exactly: ship the owner data + UI layer with no
-- money, ready for Phase 4 to turn on.
--
-- DEFERRED to Phase 4 (NOT modeled here): paid enrollment / Stripe billing, per-cohort scheduling
-- depth (sessions, a calendar), curriculum module gating, waitlists. Adding any is additive (a
-- payments table + columns), never a refactor (P4). A program is ONE definition per Space in v1
-- (one cohort at a time); multiple concurrent cohorts are a later additive expansion (drop the
-- one-program-per-space unique index and add a cohort label), not a migration churn.
--
-- ACCESS MODEL (mirrors space_membership_tiers / space_memberships): RLS is enabled TO authenticated
-- with NO client read/write policies at all. EVERY read + write goes through the gated server actions
-- in lib/spaces/enroll.ts using the service-role admin client (which bypasses RLS). The server is the
-- authority for "which space" and "what may this caller do here" (P5):
--   • setSpaceProgram / listSpaceEnrollments are gated on canEditProfile (owner / admin / editor).
--   • getSpaceProgram returns the published program (public-readable via the server component).
--   • enrollInProgram records one enrollment for any authenticated member; the partial unique index
--     below is the last-line guard against two active enrollments for the same member in one Space.
--   • cancelEnrollment is allowed for the member who enrolled or a space admin.
--
-- House style (matches space_memberships.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor; lib/database.types.ts is regenerated separately, and lib/spaces/enroll.ts
-- reaches these tables with untyped casts until then (the codebase pattern for not-yet-typed tables,
-- ADR-246). This file is the canonical record. SAFE to re-run. NOT applied by this change.

-- ── space_programs: the ONE program/cohort an owner publishes per Space ─────────────────────────
-- One row per Space (the partial unique index below enforces one program per space_id in v1). name +
-- description are the program copy a member reads; schedule is free text describing when it runs (a
-- structured calendar is a later phase); starts_on / ends_on are optional dates; capacity is an
-- optional seat cap (0/NULL = no cap) used by the enroll surface to show "seats left" and to refuse
-- an over-capacity enrollment. NO price column: v1 takes no payment.
create table if not exists public.space_programs (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  description  text,
  schedule     text,                                                    -- free-text "when it runs" (no calendar in v1)
  starts_on    date,
  ends_on      date,
  capacity     integer not null default 0 check (capacity >= 0),        -- 0 = no cap (DISPLAY + enroll guard, no money)
  is_published boolean not null default true,                           -- false = drafted (hidden from members)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.space_programs is
  'The ONE program/cohort a Coaching Space publishes (ENTITY-SPACES-SYSTEM §2.7, ADMIN-02 enroll v1). name/description/schedule/dates/capacity define it; there is NO price (v1 takes no payment, enrolling reserves a seat; paid enrollment is Phase 4). Writes are service-role only via setSpaceProgram (gated on canEditProfile). A partial unique index enforces one program per space_id in v1.';

comment on column public.space_programs.schedule is 'Free-text description of when the program runs (e.g. "Tuesdays 6pm, 8 weeks"). A structured calendar is a later phase.';
comment on column public.space_programs.capacity is 'Optional seat cap. 0 = no cap. Used to show "seats left" and to refuse an over-capacity enrollment. NOT a price (v1 takes no payment).';
comment on column public.space_programs.is_published is 'false = drafted: hidden from members (getSpaceProgram returns null), but kept so the owner can keep editing before opening enrollment.';

-- The tenant filter: every read of this table filters space_id first.
create index if not exists space_programs_space_idx on public.space_programs (space_id);

-- ONE-PROGRAM-PER-SPACE guard (v1): at most one program row per Space. Drop this index to support
-- multiple concurrent cohorts later (additive: add a cohort label + relax the constraint).
create unique index if not exists space_programs_one_per_space on public.space_programs (space_id);

-- ── space_enrollments: a member's enrollment in a Space's program ────────────────────────────────
-- One row per member-enrolls-in-program. status 'active' holds the enrollment; 'cancelled' ends it
-- (kept for history rather than deleted). The partial UNIQUE index below enforces at most ONE active
-- enrollment per (space_id, member_profile_id): a second enroll while already active is rejected and
-- enrollInProgram returns a friendly "already enrolled" message. A cancelled row does NOT block a
-- re-enroll. program_id references the space_programs row so the owner list can resolve the program
-- name even after a re-publish.
create table if not exists public.space_enrollments (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  program_id         uuid not null references public.space_programs(id) on delete cascade,
  member_profile_id  uuid not null references public.profiles(id),
  status             text not null default 'active'
                       check (status in ('active', 'cancelled')),
  enrolled_at        timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

comment on table public.space_enrollments is
  'A member''s enrollment in a Coaching Space program (ENTITY-SPACES-SYSTEM §2.7, ADMIN-02 enroll v1). status active holds the enrollment, cancelled ends it (kept for history). A partial unique index on (space_id, member_profile_id) WHERE status=active enforces one active enrollment per member per Space. v1 records the enrollment only; no charge is taken (paid enrollment is Phase 4). Writes are service-role only via enrollInProgram/cancelEnrollment in lib/spaces/enroll.ts.';

comment on column public.space_enrollments.status is 'active = the enrollment is live; cancelled = ended (row retained for history, does not block re-enrolling).';
comment on column public.space_enrollments.enrolled_at is 'When the member enrolled (v1 records the enrollment; no charge is taken).';

-- The tenant filter + the owner enrollment-list scan.
create index if not exists space_enrollments_space_idx on public.space_enrollments (space_id);
-- "Which enrollments does this member hold" (cancelEnrollment ownership + a member's own view).
create index if not exists space_enrollments_member_idx on public.space_enrollments (member_profile_id);

-- ONE-ACTIVE GUARD: at most one ACTIVE enrollment per (space_id, member_profile_id). A cancelled row
-- is excluded from the index, so a member who cancelled may re-enroll. This is the DB-level last line
-- of defense behind enrollInProgram's server-side "already enrolled" pre-check.
create unique index if not exists space_enrollments_one_active_per_member
  on public.space_enrollments (space_id, member_profile_id)
  where status = 'active';

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ────────────
-- Exactly like space_memberships / space_bookings: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies all direct client access, so the only path to these rows is the gated server actions
-- in lib/spaces/enroll.ts (the admin client bypasses RLS). This keeps the enrollment list owner-only
-- and the program writes server-authoritative.
alter table public.space_programs enable row level security;
alter table public.space_enrollments enable row level security;
