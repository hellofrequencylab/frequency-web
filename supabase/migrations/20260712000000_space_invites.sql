-- space_invites: invite a teammate to a Space by email (ENTITY-SPACES-SYSTEM §3.2, the team layer).
-- Today only the Space OWNER is auto-seated (spaces.owner_profile_id) and there is no way to add a
-- second person; this table is the missing seam. A Space OWNER (or admin) creates a PENDING invite
-- for an email at a role; the invitee accepts via a tokened link, which seats them in space_members
-- (lib/spaces/invites.ts -> addSpaceMember). One LIVE invite per email per Space.
--
--   role   ∈ viewer | editor | moderator | admin   (the seated role; mirrors the ladder in
--                                                    lib/spaces/membership.ts SPACE_ROLES). Default
--                                                    'editor' (the common "add a teammate" case).
--   status ∈ pending | accepted | revoked           (pending = outstanding; accepted = seated;
--                                                    revoked = the owner withdrew it before accept)
--
-- token is a single-use, unguessable secret carried in the accept link (/spaces/invite/<token>).
-- expires_at defaults to 14 days out (a stale link cannot be redeemed). invited_by is the actor who
-- created it (audit). The partial unique index (space_id, lower(email)) WHERE status='pending' keeps
-- exactly one LIVE invite per email per Space, so re-inviting refreshes rather than piling up.
--
-- RLS (TO authenticated): NO client policies. Every read/write goes through the service-role admin
-- client in the server actions (lib/spaces/invites.ts), behind app-code authz — exactly like
-- space_members (20260711010000_space_members.sql) and the CRM tables. Email sending is OUT OF SCOPE
-- for now: the owner surface shows the link/token to share by hand; delivery is a later, additive step.
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the repo's
-- migration-history baseline predates `db push` being safe here — see docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; lib/spaces/invites.ts reaches the table with
-- untyped casts until then (the codebase pattern for not-yet-typed tables, ADR-246). This file is the
-- canonical record. SAFE to re-run.

-- ── The table ────────────────────────────────────────────────────────────────────────────
create table if not exists public.space_invites (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor'
                check (role in ('viewer', 'editor', 'moderator', 'admin')),
  token       text not null unique,
  invited_by  uuid references public.profiles(id),
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked')),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.space_invites is
  'Email invites to a Space (ENTITY-SPACES-SYSTEM §3.2). role ∈ viewer|editor|moderator|admin (the seated role); status ∈ pending|accepted|revoked. token is the single-use accept-link secret; one LIVE invite per (space_id, lower(email)) via the partial unique index. Writes are service-role only via lib/spaces/invites.ts. Accepting seats the invitee in space_members.';
comment on column public.space_invites.email is
  'The invitee email (matched to a profile on accept). Compared case-insensitively via the partial unique index.';
comment on column public.space_invites.token is
  'Single-use, unguessable secret carried in the accept link (/spaces/invite/<token>).';
comment on column public.space_invites.role is
  'The space_members role the invitee is seated at on accept (ascending ladder: viewer < editor < moderator < admin).';
comment on column public.space_invites.status is
  'pending = outstanding; accepted = the invitee was seated; revoked = the owner withdrew it before accept.';

-- The leading-column index for the tenant filter (the owner pending-invite list filters space_id).
create index if not exists space_invites_space_idx on public.space_invites (space_id);
-- The accept path looks the invite up by its token (unique already creates an index; this is explicit
-- per the build spec and harmless / idempotent).
create index if not exists space_invites_token_idx on public.space_invites (token);

-- One LIVE invite per email per Space: a partial unique on (space_id, lower(email)) for pending rows
-- only, so re-inviting the same email REFRESHES the live invite (the app reads-then-updates the
-- pending row; this index is the race backstop) while accepted / revoked history rows never collide.
create unique index if not exists space_invites_one_pending_per_email
  on public.space_invites (space_id, lower(email))
  where status = 'pending';

-- ── RLS: service-role only (no client policies, like space_members) ───────────────────────
alter table public.space_invites enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for `authenticated`: every read/write goes through the
-- service-role admin client in the server actions (lib/spaces/invites.ts), behind app-code authz.
-- RLS is enabled so the table is locked to the service role by default (RLS-on, zero policies = no
-- client access), exactly like space_members (20260711010000_space_members.sql) and the CRM tables.
