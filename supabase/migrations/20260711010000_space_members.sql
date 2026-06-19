-- space_members: per-Space membership + roles (ENTITY-SPACES-BUILD §0, Epic 0.2; ENTITY-SPACES-
-- SYSTEM §3.2 / §4.2). Who belongs to a Space, with what role, independent per Space — a person's
-- role in Space A is unrelated to their role in Space B. An owner can grant a colleague admin of
-- THEIR Space without making them a global staff member (the key isolation win; the global staff
-- axis web_role stays separate and locked, ADR-208).
--
--   role   ∈ viewer | editor | moderator | admin   (ascending authority; mirrors the ladder in
--                                                    lib/spaces/membership.ts SPACE_ROLES)
--   status ∈ active | invited | suspended           (invited = an outstanding invite not yet
--                                                    accepted; suspended = retained for history,
--                                                    excluded from authority)
--
-- unique(space_id, profile_id): one membership row per (Space, person). invited_by is the actor
-- who added/invited them (audit). The Space's OWNER is spaces.owner_profile_id — owners need no
-- row here; getSpaceCapabilities (lib/spaces/entitlements.ts) folds owner + member role together.
--
-- RLS (TO authenticated, the §4.1 isolation rules): a member may READ their OWN rows; a Space
-- ADMIN may read their Space's rows. WRITES are service-role only (server actions —
-- addSpaceMember/updateSpaceMemberRole/removeSpaceMember in lib/spaces/membership.ts — behind
-- app-authz, kept server-mediated like the CRM tables). The auth/tenant subqueries are wrapped in
-- (select …) so they run ONCE per statement, not per row (Supabase RLS performance rule).
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the
-- repo's migration-history baseline predates `db push` being safe here — see docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; lib/spaces/membership.ts reaches the table with
-- untyped casts until then (the codebase pattern for not-yet-typed tables, ADR-246). This file is
-- the canonical record. SAFE to re-run.

-- ── The table ────────────────────────────────────────────────────────────────────────────
create table if not exists public.space_members (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'viewer'
                check (role in ('viewer', 'editor', 'moderator', 'admin')),
  status      text not null default 'active'
                check (status in ('active', 'invited', 'suspended')),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (space_id, profile_id)
);

comment on table public.space_members is
  'Per-Space membership + roles (ENTITY-SPACES-SYSTEM §3.2). role ∈ viewer|editor|moderator|admin (ascending); status ∈ active|invited|suspended. One row per (space_id, profile_id). The Space owner is spaces.owner_profile_id (no row needed). Writes are service-role only via lib/spaces/membership.ts.';

-- The leading-column index for the tenant filter (every read filters space_id first).
create index if not exists space_members_space_idx on public.space_members (space_id);
-- "Which spaces is this person a member of" — the per-profile lookup (getSpaceMembership).
create index if not exists space_members_profile_idx on public.space_members (profile_id);

-- ── RLS: member-reads-own + admin-reads-space; writes service-role only ──────────────────
alter table public.space_members enable row level security;

-- A member may read their OWN membership rows (across any space they belong to).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'space_members'
      and policyname = 'space_members_read_own'
  ) then
    create policy space_members_read_own on public.space_members
      for select to authenticated
      using ((select auth.uid()) = profile_id);
  end if;
end $$;

-- A Space ADMIN (an active 'admin' member of the SAME space) may read that space's rows.
-- The subquery is wrapped in (select …) so it is evaluated once per statement, not per row.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'space_members'
      and policyname = 'space_members_read_for_space_admin'
  ) then
    create policy space_members_read_for_space_admin on public.space_members
      for select to authenticated
      using (
        space_id in (
          select sm.space_id from public.space_members sm
          where sm.profile_id = (select auth.uid())
            and sm.role = 'admin'
            and sm.status = 'active'
        )
      );
  end if;
end $$;

-- No INSERT/UPDATE/DELETE policies: every write goes through the service-role admin client in
-- the server actions (lib/spaces/membership.ts), behind app-code authz — exactly like the CRM
-- tables (20260605060000_crm_pipeline.sql) and the rest of the operator surface.
