-- space_nonprofit_verifications: the 501(c)(3) verification flow behind the Non Profit plan (ADR-552,
-- AUDIT #6). Non Profit is the verified-501(c)(3) sibling of Business: the SAME full Business depth,
-- discounted per licensed seat, but gated behind a human review of the organization's tax status. This
-- table records a Space owner's verification REQUEST (their EIN + legal org name) and the operator's
-- decision on it. Approval is what marks the Space eligible for the discounted Non Profit plan; the
-- plan/entitlement grant itself runs through the existing plan-set path (setSpacePlan in
-- lib/pricing/space-plan.ts), so this table is the REVIEW record, not a second source of the plan.
--
-- ACCESS MODEL (mirrors space_ticket_* / space_memberships and the commerce service-role-write pattern):
-- RLS is ENABLED. A Space owner/admin may READ their own Space's verification rows and INSERT a pending
-- submission (the is_space_admin SECURITY DEFINER helper, 20260818000000, folds owner + active admin
-- member). There are NO client UPDATE/DELETE policies: every REVIEW (approve/reject, status change, the
-- plan grant) goes through the service-role admin client in lib/spaces/nonprofit-verification.ts, gated
-- server-side (staff/janitor). The server is the authority (P5, ADR-331/334/338).
--
-- House style (matches space_tickets.sql): additive + idempotent, applied to production via the Supabase
-- SQL Editor; lib/database.types.ts is regenerated separately, and lib/spaces/nonprofit-verification.ts
-- reaches this table with untyped casts until then (the codebase pattern for not-yet-typed tables,
-- ADR-246). This file is the canonical record. SAFE to re-run.

-- ── space_nonprofit_verifications: one 501(c)(3) verification request + its decision ─────────────
-- ein is the org's Employer Identification Number (stored as the 9 digits, no dashes; the app
-- normalizes on the way in). org_legal_name is the legal entity name as it appears on the IRS
-- determination. status walks pending -> verified | rejected. note carries the reviewer's reason (used
-- on a rejection so the owner knows what to fix). submitted_by / reviewed_by are profile ids for the
-- audit trail; submitted_at / reviewed_at time-stamp each side.
create table if not exists public.space_nonprofit_verifications (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  ein             text,
  org_legal_name  text,
  status          text not null default 'pending'
                    check (status in ('pending', 'verified', 'rejected')),
  note            text,
  submitted_by    uuid references public.profiles(id),
  submitted_at    timestamptz not null default now(),
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.space_nonprofit_verifications is
  'A Space owner''s 501(c)(3) verification request + the operator decision on it (ADR-552, AUDIT #6). Approval marks the Space eligible for the discounted Non Profit plan; the plan grant itself runs through setSpacePlan (the existing plan-set path). Owner may read own + insert a pending row (RLS); reviews are service-role only via lib/spaces/nonprofit-verification.ts.';

comment on column public.space_nonprofit_verifications.ein is 'The org Employer Identification Number, stored as the 9 digits (no dashes; normalized by the app).';
comment on column public.space_nonprofit_verifications.org_legal_name is 'The legal entity name as it appears on the IRS 501(c)(3) determination.';
comment on column public.space_nonprofit_verifications.status is 'pending = awaiting review; verified = approved (Non Profit plan granted via setSpacePlan); rejected = declined (see note).';
comment on column public.space_nonprofit_verifications.note is 'Reviewer reason, shown to the owner on a rejection so they know what to correct.';

-- The tenant filter + the admin queue scan (list by status).
create index if not exists space_nonprofit_verifications_space_status_idx
  on public.space_nonprofit_verifications (space_id, status);

-- ONE-ACTIVE GUARD: at most one NON-rejected (pending or verified) verification per Space. A rejected
-- row is excluded, so a Space that was declined may resubmit; a Space cannot stack two pending requests
-- or hold a duplicate verified record. This is the DB-level last line behind the server-side
-- "already submitted" pre-check in submitNonprofitVerification.
create unique index if not exists space_nonprofit_verifications_one_active_per_space
  on public.space_nonprofit_verifications (space_id)
  where status <> 'rejected';

-- ── RLS: owner reads own + inserts a pending request; reviews are service-role only ─────────────
-- Enable RLS, then grant exactly two client policies:
--   • SELECT: a Space owner/admin reads their own Space's verification rows (is_space_admin helper).
--   • INSERT: a Space owner/admin submits a new PENDING request for their own Space, stamped with their
--     own profile id (get_my_profile_id). No forging another Space's row, no self-approving (status is
--     pinned to 'pending' in the check).
-- There is deliberately NO UPDATE/DELETE policy: every approve/reject flows through the service-role
-- admin client (which bypasses RLS) in the gated server helpers, so a client can never mark itself
-- verified. The app ALSO writes the insert via the admin client (gated on canManage) for defense in
-- depth; the INSERT policy keeps the owner path honest even if that ever changes.
alter table public.space_nonprofit_verifications enable row level security;

drop policy if exists space_nonprofit_verifications_owner_read on public.space_nonprofit_verifications;
create policy space_nonprofit_verifications_owner_read
  on public.space_nonprofit_verifications
  for select to authenticated
  using (public.is_space_admin(space_id));

drop policy if exists space_nonprofit_verifications_owner_insert on public.space_nonprofit_verifications;
create policy space_nonprofit_verifications_owner_insert
  on public.space_nonprofit_verifications
  for insert to authenticated
  with check (
    public.is_space_admin(space_id)
    and status = 'pending'
    and submitted_by = public.get_my_profile_id()
  );
