-- space_follows: the network-FOLLOW ledger (ENTITY-SPACES-BUILD §A.4). A signed-in member taps
-- "Follow" on a networked Space's profile and that intent persists here, so the relationship feeds
-- cross-space discovery (the "Following" filter on the /spaces directory) and, later, the feed.
-- This is the durable seam behind the FollowSpaceButton, which until now was a local toggle that
-- forgot the moment the page reloaded.
--
-- unique(space_id, follower_profile_id): one follow row per (Space, person) — following is a binary
-- relationship, not a count, so a re-follow is a no-op rather than a duplicate. follower_profile_id
-- is the member who follows; the Space's own members/owner are a SEPARATE relationship (space_members
-- / spaces.owner_profile_id) — a member can follow without joining, and join without following.
--
-- RLS (TO authenticated): NO client policies. Every read AND write goes through the service-role
-- admin client in lib/spaces/follows.ts (the server actions followSpace / unfollowSpace behind
-- getMyProfileId auth), kept server-mediated exactly like space_members (20260711010000) and the CRM
-- tables. Enabling RLS with no policy denies all direct client access by default (fail-closed).
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor (the repo's
-- migration-history baseline predates `db push` being safe here — see docs/WORKFLOW.md).
-- lib/database.types.ts is regenerated separately; lib/spaces/follows.ts reaches the table with
-- untyped casts until then (the codebase pattern for not-yet-typed tables, ADR-246). This file is
-- the canonical record. SAFE to re-run.

-- ── The table ────────────────────────────────────────────────────────────────────────────
create table if not exists public.space_follows (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null references public.spaces(id) on delete cascade,
  follower_profile_id uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  unique (space_id, follower_profile_id)
);

comment on table public.space_follows is
  'The network-follow ledger (ENTITY-SPACES-BUILD §A.4). One row per (space_id, follower_profile_id): a signed-in member follows a networked Space. Feeds the "Following" directory filter + later the feed. Distinct from space_members (membership). Writes are service-role only via lib/spaces/follows.ts.';

-- The leading-column index for "who follows this Space" (followerCount / the count read).
create index if not exists space_follows_space_idx on public.space_follows (space_id);
-- "Which spaces does this person follow" — the per-profile lookup the directory filter calls
-- (listFollowedSpaceIds).
create index if not exists space_follows_follower_idx on public.space_follows (follower_profile_id);

-- ── RLS: service-role only (no client policy) ─────────────────────────────────────────────
alter table public.space_follows enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies, by design: every read and write goes through the
-- service-role admin client in the server actions (lib/spaces/follows.ts), behind getMyProfileId
-- authz — exactly like space_members (20260711010000_space_members.sql) and the CRM tables. RLS is
-- ENABLED so direct client access (anon / authenticated) is denied by default (fail-closed).
